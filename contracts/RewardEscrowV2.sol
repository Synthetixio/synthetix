pragma solidity ^0.5.16;

// Inheritance
import "./Owned.sol";
import "./MixinResolver.sol";
import "./LimitedSetup.sol";
import "./interfaces/IRewardEscrow.sol";
import "./interfaces/IRewardEscrowV2.sol";

// Libraries
import "./SafeDecimalMath.sol";

// Internal references
import "./interfaces/IERC20.sol";
import "./interfaces/IFeePool.sol";
import "./interfaces/ISynthetix.sol";


// https://docs.synthetix.io/contracts/RewardEscrow
contract RewardEscrowV2 is Owned, IRewardEscrowV2, LimitedSetup(2 weeks), MixinResolver {
    using SafeMath for uint;

    /* Mapping of account to unique key that owns the vesting entries
     * Enables account merging without reassigning all vestingSchedules to new address */
    mapping(address => uint) internal vestingSchedulesOwnerKey;

    // TODO - update account directly mapped to vestingSchedules to be an unique key that owns vesting schedules

    /* Lists of (timestamp, quantity) pairs per account, sorted in ascending time order.
     * These are the times at which each given quantity of SNX vests. */
    mapping(address => uint[2][]) public vestingSchedules;

    /* An account's total escrowed synthetix balance to save recomputing this for fee extraction purposes. */
    mapping(address => uint) public totalEscrowedAccountBalance;

    /* An account's total vested reward synthetix. */
    mapping(address => uint) public totalVestedAccountBalance;

    /* Mapping of accounts that have migrated vesting entries from the old reward escrow to the new reward escrow  */
    mapping(address => bool) public accountEscrowMigrated;

    /* Mapping of accounts that have migrated their escrowed snx to Optimism L2*/
    mapping(address => bool) public accountMigratedToOptimism;

    /* Mapping of nominated address to recieve account merging */
    mapping(address => address) public nominatedReciever;

    /* The total remaining escrowed balance, for verifying the actual synthetix balance of this contract against. */
    uint public totalEscrowedBalance;

    uint public accountMergingDuration = 24 hours;

    uint public accountMergingEndTime;

    uint internal constant TIME_INDEX = 0;
    uint internal constant QUANTITY_INDEX = 1;

    /* Limit vesting entries to disallow unbounded iteration over vesting schedules.
     * There are 5 years of the supply schedule */
    uint public constant MAX_VESTING_ENTRIES = 52 * 5;

    IRewardEscrow public oldRewardEscrow;

    /* ========== ADDRESS RESOLVER CONFIGURATION ========== */

    bytes32 private constant CONTRACT_SYNTHETIX = "Synthetix";
    bytes32 private constant CONTRACT_SYNTHETIX_BRIDGE_BASE = "SynthetixBridgeToBase";
    bytes32 private constant CONTRACT_SYNTHETIX_BRIDGE_OPTIMISM = "SynthetixBridgeToOptimism";
    bytes32 private constant CONTRACT_FEEPOOL = "FeePool";

    bytes32[24] private addressesToCache = [
        CONTRACT_SYNTHETIX_BRIDGE_BASE,
        CONTRACT_SYNTHETIX_BRIDGE_OPTIMISM,
        CONTRACT_SYNTHETIX,
        CONTRACT_FEEPOOL
    ];

    /* ========== CONSTRUCTOR ========== */

    constructor(address _owner, IRewardEscrow _oldRewardEscrow) public Owned(_owner) {
        oldRewardEscrow = _oldRewardEscrow;
    }

    /* ========== VIEWS ======================= */

    function synthetixBridgeToBase() internal view returns (address) {
        return requireAndGetAddress(CONTRACT_SYNTHETIX_BRIDGE_BASE, "Resolver is missing SynthetixBridgeToBase address");
    }

    function synthetixBridgeToOptimism() internal view returns (address) {
        return
            requireAndGetAddress(
                CONTRACT_SYNTHETIX_BRIDGE_OPTIMISM,
                "Resolver is missing SynthetixBridgeToOptimism address"
            );
    }

    function synthetix() internal view returns (ISynthetix) {
        return ISynthetix(requireAndGetAddress(CONTRACT_SYNTHETIX, "Missing Synthetix address"));
    }

    function feePool() internal view returns (IFeePool) {
        return IFeePool(requireAndGetAddress(CONTRACT_FEEPOOL, "Missing FeePool address"));
    }

    /* ========== SETTERS ========== */

    /* ========== VIEW FUNCTIONS ========== */

    /**
     * @notice A simple alias to totalEscrowedAccountBalance: provides ERC20 balance integration.
     */
    function balanceOf(address account) public view returns (uint) {
        return totalEscrowedAccountBalance[account];
    }

    function _numVestingEntries(address account) internal view returns (uint) {
        return vestingSchedules[account].length;
    }

    /**
     * @notice The number of vesting dates in an account's schedule.
     */
    function numVestingEntries(address account) external view returns (uint) {
        return vestingSchedules[account].length;
    }

    /**
     * @notice Get a particular schedule entry for an account.
     * @return A pair of uints: (timestamp, synthetix quantity).
     */
    function getVestingScheduleEntry(address account, uint index) public view returns (uint[2] memory) {
        return vestingSchedules[account][index];
    }

    /**
     * @notice Get the time at which a given schedule entry will vest.
     */
    function getVestingTime(address account, uint index) public view returns (uint) {
        return getVestingScheduleEntry(account, index)[TIME_INDEX];
    }

    /**
     * @notice Get the quantity of SNX associated with a given schedule entry.
     */
    function getVestingQuantity(address account, uint index) public view returns (uint) {
        return getVestingScheduleEntry(account, index)[QUANTITY_INDEX];
    }

    /**
     * @notice Obtain the index of the next schedule entry that will vest for a given user.
     */
    function getNextVestingIndex(address account) public view returns (uint) {
        uint len = _numVestingEntries(account);
        for (uint i = 0; i < len; i++) {
            if (getVestingTime(account, i) != 0) {
                return i;
            }
        }
        return len;
    }

    /**
     * @notice Obtain the next schedule entry that will vest for a given user.
     * @return A pair of uints: (timestamp, synthetix quantity). */
    function getNextVestingEntry(address account) public view returns (uint[2] memory) {
        uint index = getNextVestingIndex(account);
        if (index == _numVestingEntries(account)) {
            return [uint(0), 0];
        }
        return getVestingScheduleEntry(account, index);
    }

    /**
     * @notice Obtain the time at which the next schedule entry will vest for a given user.
     */
    function getNextVestingTime(address account) external view returns (uint) {
        return getNextVestingEntry(account)[TIME_INDEX];
    }

    /**
     * @notice Obtain the quantity which the next schedule entry will vest for a given user.
     */
    function getNextVestingQuantity(address account) external view returns (uint) {
        return getNextVestingEntry(account)[QUANTITY_INDEX];
    }

    /**
     * @notice return the full vesting schedule entries vest for a given user.
     * @dev For DApps to display the vesting schedule for the
     * inflationary supply over 5 years. Solidity cant return variable length arrays
     * so this is returning pairs of data. Vesting Time at [0] and quantity at [1] and so on
     */
    function checkAccountSchedule(address account) public view returns (uint[520] memory) {
        uint[520] memory _result;
        uint schedules = _numVestingEntries(account);
        for (uint i = 0; i < schedules; i++) {
            uint[2] memory pair = getVestingScheduleEntry(account, i);
            _result[i * 2] = pair[0];
            _result[i * 2 + 1] = pair[1];
        }
        return _result;
    }

    /* ========== MUTATIVE FUNCTIONS ========== */

    function _appendVestingEntry(address account, uint quantity) internal {
        /* No empty or already-passed vesting entries allowed. */
        require(quantity != 0, "Quantity cannot be zero");

        /* There must be enough balance in the contract to provide for the vesting entry. */
        totalEscrowedBalance = totalEscrowedBalance.add(quantity);
        require(
            totalEscrowedBalance <= IERC20(address(synthetix())).balanceOf(address(this)),
            "Must be enough balance in the contract to provide for the vesting entry"
        );

        /* Disallow arbitrarily long vesting schedules in light of the gas limit. */
        uint scheduleLength = vestingSchedules[account].length;
        require(scheduleLength <= MAX_VESTING_ENTRIES, "Vesting schedule is too long");

        /* Escrow the tokens for 1 year. */
        uint time = now + 52 weeks;

        if (scheduleLength == 0) {
            totalEscrowedAccountBalance[account] = quantity;
        } else {
            /* Disallow adding new vested SNX earlier than the last one.
             * Since entries are only appended, this means that no vesting date can be repeated. */
            require(
                getVestingTime(account, scheduleLength - 1) < time,
                "Cannot add new vested entries earlier than the last one"
            );
            totalEscrowedAccountBalance[account] = totalEscrowedAccountBalance[account].add(quantity);
        }

        vestingSchedules[account].push([time, quantity]);

        emit VestingEntryCreated(account, now, quantity);
    }

    /**
     * @notice Add a new vesting entry at a given time and quantity to an account's schedule.
     * @dev A call to this should accompany a previous successful call to synthetix.transfer(rewardEscrow, amount),
     * to ensure that when the funds are withdrawn, there is enough balance.
     * Note; although this function could technically be used to produce unbounded
     * arrays, it's only withinn the 4 year period of the weekly inflation schedule.
     * @param account The account to append a new vesting entry to.
     * @param quantity The quantity of SNX that will be escrowed.
     */
    function appendVestingEntry(address account, uint quantity) external onlyFeePool {
        _appendVestingEntry(account, quantity);
    }

    // TODO - Vesting no longer assumes that the vestingSchedules list is sorted, requires index to be passed in to vest.

    /**
     * @notice Allow a user to withdraw any SNX in their schedule that have vested.
     */
    function vest(address account) external {
        require(accountEscrowMigrated[account], "Escrow migration pending");

        uint numEntries = _numVestingEntries(msg.sender);
        uint total;
        for (uint i = 0; i < numEntries; i++) {
            uint time = getVestingTime(msg.sender, i);
            /* The list is sorted; when we reach the first future time, bail out. */
            if (time > now) {
                break;
            }
            uint qty = getVestingQuantity(msg.sender, i);
            if (qty > 0) {
                vestingSchedules[msg.sender][i] = [0, 0];
                total = total.add(qty);
            }
        }

        if (total != 0) {
            _transferVestedTokens(msg.sender, total);
        }
    }

    function _transferVestedTokens(address _account, uint256 _amount) internal {
        totalEscrowedBalance = totalEscrowedBalance.sub(_amount);
        totalEscrowedAccountBalance[_account] = totalEscrowedAccountBalance[_account].sub(_amount);
        totalVestedAccountBalance[_account] = totalVestedAccountBalance[_account].add(_amount);
        IERC20(address(synthetix())).transfer(_account, _amount);
        emit Vested(_account, now, _amount);
    }

    /* ========== ACCOUNT MERGING ========== */

    function startMergingWindow() external onlyOwner {
        accountMergingEndTime = now.add(accountMergingDuration);

        // emit account merging window start
    }

    function setAccountMergingDuration(uint duration) external onlyOwner {
        // some checks to ensure not above max

        accountMergingDuration = duration;
        // emit account merging duration updated
    }

    function nominateAccountToMerge(address account) external {
        require(accountMergingEndTime < now, "Account merging has ended");
        require(totalEscrowedAccountBalance[msg.sender] > 0, "Address escrow balance is 0");

        nominatedReciever[msg.sender] = account;

        // emit account nominated as reciever
    }

    function mergeAccount(address accountToMerge) external {

        // delete totalEscrowedAccountBalance for merged account
        // delete totalVestedAccountBalance for merged acctoun
    }

    /* ========== MIGRATION OLD ESCROW ========== */

    /* Function to allow any address to migrate vesting entries from previous reward escrow */
    function migrateVestingSchedule(address addressToMigrate) external {
        require(totalEscrowedAccountBalance[addressToMigrate] > 0, "Address escrow balance is 0");

        uint numEntries = oldRewardEscrow.numVestingEntries(addressToMigrate);

        // Calculate entries that can be vested and total vested to deduct from totalEscrowedAccountBalance
        (uint vestedEntries, uint totalVested) = _getVestedEntriesAndAmount(addressToMigrate, numEntries);

        // transfer vested tokens
        if (totalVested != 0) {
            _transferVestedTokens(addressToMigrate, totalVested);
        }

        // Vesting entries are sorted in order of oldest to newer entries.
        // Vested entries are not copied to new escrow

        // TODO - consider using appendVestingEntry for appending vesting schedules
        uint remainingEntries = numEntries - vestedEntries;
        for (uint i = vestedEntries - 1; i < remainingEntries; i++) {
            // vestingSchedules[addressToMigrate].push([vestingSchedule[0], vestingSchedule[1]]);
        }
    }

    function _getVestedEntriesAndAmount(address _account, uint _numEntries)
        internal
        view
        returns (uint vestedEntries, uint totalVestedAmount)
    {
        for (uint i = 0; i < _numEntries; i++) {
            // get existing vesting entry [time, quantity]
            uint[2] memory vestingSchedule = oldRewardEscrow.getVestingScheduleEntry(_account, i);
            /* The list is sorted on the old RewardEscrow; when we reach the first future time, bail out. */
            uint time = vestingSchedule[0];
            if (time > now) {
                break;
            }
            uint qty = vestingSchedule[1];
            if (qty > 0) {
                vestedEntries++;
                totalVestedAmount = totalVestedAmount.add(qty);
            }
        }
    }

    /* Migration for owner to migrate escrowed and vested account balances */
    function migrateAccountEscrowBalances(
        address[] calldata accounts,
        uint256[] calldata escrowBalances,
        uint256[] calldata vestedBalances
    ) external onlyOwner {
        require(accounts.length == escrowBalances.length, "Number of accounts and balances don't match");
        require(accounts.length == vestedBalances.length, "Number of accounts and vestedBalances don't match");

        // TODO - consider adding checks that there is enough balance in contract to provide for the totalEscrowedAccountbalance
        for (uint i = 0; i < accounts.length; i++) {
            totalEscrowedAccountBalance[accounts[i]] = escrowBalances[i];
            totalVestedAccountBalance[accounts[i]] = vestedBalances[i];
        }

        // TODO enable contract after migrating all account escrow balances, prevent adding vesting entries and vesting.
    }

    /* ========== L2 MIGRATION ========== */

    function burnForMigration(address account) external onlySynthetixBridge returns (uint64[52] memory, uint256[52] memory) {
        // check if account's totalEscrowedAccountBalance > 0 and any vesting entries
        // Check whether entries have been migrated, else read from old rewardEscrow
        // Vest any entries that can be vested already (More tha 12 months)
        // burn the totalEscrowedAccountBalance for account
        // sub totalEscrowedBalance
        // transfer the SNX to the L2 bridge
        // keep the totalVestedAccountBalance[account]
        // flag account has migrated to Optimism L2
        // Optional - delete the vesting entries to reclaim gas
        require(accountMigratedToOptimism[account] == false, "Account migrated already");

        uint256 escrowedAccountBalance = totalEscrowedAccountBalance[account];

        uint64[52] memory vestingTimstamps;
        uint256[52] memory vestingAmounts;

        if (escrowedAccountBalance > 0) {
            if (accountEscrowMigrated[account]) {
                // read from current contract for vesting escrow
                delete totalEscrowedAccountBalance[account];
            } else {
                // populate schedule from old escrow contract
            }
        }

        accountMigratedToOptimism[account] = true;

        // return timestamps and amounts for vesting
        return (vestingTimstamps, vestingAmounts);
    }

    function importVestingEntries(
        address account,
        uint64[] calldata timestamps,
        uint256[] calldata amounts
    ) external onlySynthetixBridgeToBase {
        require(amounts.length == timestamps.length, "Timestamps and amounts length don't match");

        uint256 escrowedBalance;

        // TODO - consider using appendVestingEntry for appending vesting schedules
        for (uint i = 0; i < amounts.length; i++) {
            vestingSchedules[account].push([timestamps[i], amounts[i]]);
            escrowedBalance = escrowedBalance.add(amounts[i]);
        }

        // There must be enough balance in the contract to provide for the escrowed balance.
        totalEscrowedBalance = totalEscrowedBalance.add(escrowedBalance);
        require(
            totalEscrowedBalance <= IERC20(address(synthetix())).balanceOf(address(this)),
            "Insufficient balance in the contract to provide for escrowed balance"
        );

        // Record account escrowed balance
        totalEscrowedAccountBalance[account] = totalEscrowedAccountBalance[account].add(escrowedBalance);
    }

    /* ========== MODIFIERS ========== */

    modifier onlyFeePool() {
        require(msg.sender == address(feePool()), "Only the FeePool contracts can perform this action");
        _;
    }

    modifier onlySynthetixBridge() {
        require(msg.sender == synthetixBridgeToOptimism(), "Can only be invoked by SynthetixBridgeToOptimism contract");
        _;
    }

    modifier onlySynthetixBridgeToBase() {
        require(msg.sender == synthetixBridgeToBase(), "Can only be invoked by SynthetixBridgeToBase contract");
        _;
    }

    /* ========== EVENTS ========== */
    event Vested(address indexed beneficiary, uint time, uint value);

    event VestingEntryCreated(address indexed beneficiary, uint time, uint value);
}
