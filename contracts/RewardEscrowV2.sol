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
contract RewardEscrowV2 is Owned, IRewardEscrowV2, LimitedSetup(4 weeks), MixinResolver {
    using SafeMath for uint;

    struct VestingEntry {
        uint64 endTime;
        uint64 duration;
        uint64 lastVested;
        uint256 escrowAmount;
        uint256 remainingAmount;
    }

    mapping(address => mapping(uint256 => VestingEntry)) public vestingSchedules;

    mapping(address => uint256[]) public accountVestingEntryIDs;

    /*Counter for new vesting entry ids. */
    uint256 public nextEntryId;

    /* An account's total escrowed synthetix balance to save recomputing this for fee extraction purposes. */
    mapping(address => uint256) public totalEscrowedAccountBalance;

    /* An account's total vested reward synthetix. */
    mapping(address => uint256) public totalVestedAccountBalance;

    /* Mapping of nominated address to recieve account merging */
    mapping(address => address) public nominatedReciever;

    /* The total remaining escrowed balance, for verifying the actual synthetix balance of this contract against. */
    uint public totalEscrowedBalance;

    uint public accountMergingDuration = 24 hours;

    uint public accountMergingEndTime;

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
        nextEntryId = 1;
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
        return accountVestingEntryIDs[account].length;
    }

    /**
     * @notice The number of vesting dates in an account's schedule.
     */
    function numVestingEntries(address account) external view returns (uint) {
        return accountVestingEntryIDs[account].length;
    }

    function ratePerSecond(address account, uint256 entryID) public view {
        // Retrieve the vesting entry on
        // Calculate the rate of emission for entry based on escrowAmount / duration seconds
        // entry.escrowAmount.divideDecimalRound(duration);
    }

    function getLengthOfEntries(address account) external view returns (uint) {
        return accountVestingEntryIDs[account].length;
    }

    /* ========== MUTATIVE FUNCTIONS ========== */

    function _appendVestingEntry(
        address account,
        uint quantity,
        uint duration
    ) internal {
        /* No empty or already-passed vesting entries allowed. */
        require(quantity != 0, "Quantity cannot be zero");

        /* There must be enough balance in the contract to provide for the vesting entry. */
        totalEscrowedBalance = totalEscrowedBalance.add(quantity);
        require(
            totalEscrowedBalance <= IERC20(address(synthetix())).balanceOf(address(this)),
            "Must be enough balance in the contract to provide for the vesting entry"
        );

        /* Escrow the tokens for duration. */
        uint endTime = now + duration;

        /* Add quantity to account's escrowed balance */
        totalEscrowedAccountBalance[account] = totalEscrowedAccountBalance[account].add(quantity);

        uint entryID = nextEntryId;
        vestingSchedules[account][entryID] = VestingEntry({
            endTime: uint64(endTime),
            duration: uint64(duration),
            lastVested: 0,
            escrowAmount: quantity,
            remainingAmount: quantity
        });

        accountVestingEntryIDs[account].push(entryID);

        /* Increment the next entry id. */
        nextEntryId = nextEntryId.add(1);

        emit VestingEntryCreated(account, now, quantity, duration);
    }

    function _importVestingEntry(
        address account,
        uint256 escrowAmount,
        uint256 remainingAmount,
        uint64 vestingTimestamp,
        uint64 duration,
        uint64 lastVested
    ) internal {
        /* No empty vesting entries allowed. */
        require(escrowAmount != 0, "Quantity cannot be zero");

        uint entryID = nextEntryId;
        vestingSchedules[account][entryID] = VestingEntry({
            endTime: vestingTimestamp,
            duration: duration,
            lastVested: lastVested,
            escrowAmount: escrowAmount,
            remainingAmount: remainingAmount
        });

        // append entryID to list of entries for account
        accountVestingEntryIDs[account].push(entryID);

        /* Increment the next entry id. */
        nextEntryId = nextEntryId.add(1);
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
    function appendVestingEntry(
        address account,
        uint quantity,
        uint duration
    ) external onlyFeePool {
        _appendVestingEntry(account, quantity, duration);
    }

    // TODO - Vesting no longer assumes that the vestingSchedules list is sorted, requires index to be passed in to vest.

    function _transferVestedTokens(address _account, uint256 _amount) internal {
        _reduceAccountEscrowBalances(_account, _amount);
        totalVestedAccountBalance[_account] = totalVestedAccountBalance[_account].add(_amount);
        IERC20(address(synthetix())).transfer(_account, _amount);
        emit Vested(_account, now, _amount);
    }

    function _reduceAccountEscrowBalances(address _account, uint256 _amount) internal {
        totalEscrowedBalance = totalEscrowedBalance.sub(_amount);
        totalEscrowedAccountBalance[_account] = totalEscrowedAccountBalance[_account].sub(_amount);
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
        require(!vestingScheduleMigrationPending(account), "Escrow migration pending");

        nominatedReciever[msg.sender] = account;

        // emit account nominated as reciever
    }

    function mergeAccount(address accountToMerge) external {
        require(accountMergingEndTime < now, "Account merging has ended");
        require(accountMergingEndTime < now, "Account merging has ended");
        require(nominatedReciever[accountToMerge] == msg.sender, "Address is not nominated to merge");

        // delete totalEscrowedAccountBalance for merged account
        // delete totalVestedAccountBalance for merged acctoun
        // delete nominatedReciever once merged
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

        // TODO - consider using appendVestingEntry for appending vesting schedules
        uint remainingEntries = numEntries - vestedEntries;
        for (uint i = vestedEntries - 1; i < remainingEntries; i++) {
            // vestingSchedules[addressToMigrate].push([vestingSchedule[0], vestingSchedule[1]]);
        }

        // emit event account has migrated vesting entries across
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

        // TODO enable contract after migrating all account escrow balances, prevent adding vesting entries and vesting until all account escrow balances migrated.
    }

    function vestingScheduleMigrationPending(address account) public view returns (bool) {
        return totalEscrowedAccountBalance[account] > 0 && _numVestingEntries(account) == 0;
    }

    /* ========== L2 MIGRATION ========== */

    function burnForMigration(address account, uint[] calldata entryIDs)
        external
        onlySynthetixBridge
        returns (
            uint256 escrowedAccountBalance,
            uint64[] memory vestingTimestamps,
            uint64[] memory durations,
            uint64[] memory lastVested,
            uint256[] memory escrowAmounts,
            uint256[] memory remainingAmounts
        )
    {
        require(entryIDs.length > 0, "Entry IDs required");

        // check if account migrated on L1
        _checkEscrowMigrationPending(account);

        vestingTimestamps = new uint64[](entryIDs.length);
        durations = new uint64[](entryIDs.length);
        lastVested = new uint64[](entryIDs.length);
        escrowAmounts = new uint256[](entryIDs.length);
        remainingAmounts = new uint256[](entryIDs.length);

        for (uint i = 0; i < entryIDs.length; i++) {
            VestingEntry storage entry = vestingSchedules[account][entryIDs[i]];

            if (entry.remainingAmount > 0) {
                vestingTimestamps[i] = entry.endTime;
                durations[i] = entry.duration;
                lastVested[i] = entry.lastVested;
                escrowAmounts[i] = entry.escrowAmount;
                remainingAmounts[i] = entry.remainingAmount;

                escrowedAccountBalance = escrowedAccountBalance.add(entry.remainingAmount);

                /* Delete the vesting entry being migrated */
                delete vestingSchedules[account][entryIDs[i]];
            }
        }

        /* update account total escrow balances for migration
         *  transfer the escrowed SNX being migrated to the L2 deposit contract
         */
        if (escrowedAccountBalance > 0) {
            _reduceAccountEscrowBalances(account, escrowedAccountBalance);
            IERC20(address(synthetix())).transfer(synthetixBridgeToOptimism(), escrowedAccountBalance);
        }

        return (escrowedAccountBalance, vestingTimestamps, durations, lastVested, escrowAmounts, remainingAmounts);
    }

    function importVestingEntries(
        address account,
        uint256 escrowedAmount,
        uint64[] calldata vestingTimestamps,
        uint64[] calldata durations,
        uint64[] calldata lastVested,
        uint256[] calldata escrowAmounts,
        uint256[] calldata remainingAmounts
    ) external onlySynthetixBridgeToBase {
        // There must be enough balance in the contract to provide for the escrowed balance.
        totalEscrowedBalance = totalEscrowedBalance.add(escrowedAmount);
        require(
            totalEscrowedBalance <= IERC20(address(synthetix())).balanceOf(address(this)),
            "Insufficient balance in the contract to provide for escrowed balance"
        );

        for (uint i = 0; i < vestingTimestamps.length; i++) {
            _importVestingEntry(
                account,
                escrowAmounts[i],
                remainingAmounts[i],
                vestingTimestamps[i],
                durations[i],
                lastVested[i]
            );
        }

        // Record account escrowed balance
        totalEscrowedAccountBalance[account] = totalEscrowedAccountBalance[account].add(escrowedAmount);
    }

    function _checkEscrowMigrationPending(address account) internal view {
        require(!vestingScheduleMigrationPending(account), "Escrow migration pending");
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

    event VestingEntryCreated(address indexed beneficiary, uint time, uint value, uint duration);
}
