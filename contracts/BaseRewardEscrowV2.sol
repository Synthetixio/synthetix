pragma solidity ^0.5.16;
pragma experimental ABIEncoderV2;

// Inheritance
import "./Owned.sol";
import "./MixinResolver.sol";
import "./LimitedSetup.sol";
import "./interfaces/IRewardEscrowV2.sol";

// Libraries
import "./SafeDecimalMath.sol";

// Internal references
import "./interfaces/IERC20.sol";
import "./interfaces/IFeePool.sol";
import "./interfaces/ISynthetix.sol";


// https://docs.synthetix.io/contracts/RewardEscrow
contract BaseRewardEscrowV2 is Owned, IRewardEscrowV2, LimitedSetup(4 weeks), MixinResolver {
    using SafeMath for uint;
    using SafeDecimalMath for uint;

    mapping(address => mapping(uint256 => VestingEntries.VestingEntry)) public vestingSchedules;

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

    /* Max escrow duration */
    uint public constant MAX_DURATION = 5 * 52 weeks;

    /* ========== OLD ESCROW LOOKUP ========== */

    uint internal constant TIME_INDEX = 0;
    uint internal constant QUANTITY_INDEX = 1;

    /* ========== ACCOUNT MERGING CONFIGURATION ========== */

    uint public accountMergingDuration = 48 hours;

    uint public accountMergingEndTime;

    /* Limit vesting entries to disallow unbounded iteration over vesting schedules.
     * There are 5 years of the supply schedule */
    uint public constant MAX_VESTING_ENTRIES = 52 * 5;

    /* ========== ADDRESS RESOLVER CONFIGURATION ========== */

    bytes32 private constant CONTRACT_SYNTHETIX = "Synthetix";
    bytes32 private constant CONTRACT_FEEPOOL = "FeePool";

    bytes32[24] private addressesToCache = [CONTRACT_SYNTHETIX, CONTRACT_FEEPOOL];

    /* ========== CONSTRUCTOR ========== */

    constructor(address _owner, address _resolver) public Owned(_owner) MixinResolver(_resolver, addressesToCache) {
        nextEntryId = 1;
    }

    /* ========== VIEWS ======================= */

    function feePool() internal view returns (IFeePool) {
        return IFeePool(requireAndGetAddress(CONTRACT_FEEPOOL, "Missing FeePool address"));
    }

    function synthetix() internal view returns (ISynthetix) {
        return ISynthetix(requireAndGetAddress(CONTRACT_SYNTHETIX, "Missing Synthetix address"));
    }

    function _notImplemented() internal pure {
        revert("Cannot be run on this layer");
    }

    /* ========== VIEW FUNCTIONS ========== */

    /**
     * @notice A simple alias to totalEscrowedAccountBalance: provides ERC20 balance integration.
     */
    function balanceOf(address account) public view returns (uint) {
        return totalEscrowedAccountBalance[account];
    }

    /**
     * @notice The number of vesting dates in an account's schedule.
     */
    function numVestingEntries(address account) external view returns (uint) {
        return accountVestingEntryIDs[account].length;
    }

    function getVestingEntry(address account, uint256 entryID)
        external
        view
        returns (
            uint64 endTime,
            uint64 duration,
            uint64 lastVested,
            uint256 escrowAmount,
            uint256 remainingAmount,
            uint256 ratePerSecond
        )
    {
        endTime = vestingSchedules[account][entryID].endTime;
        duration = vestingSchedules[account][entryID].duration;
        lastVested = vestingSchedules[account][entryID].lastVested;
        escrowAmount = vestingSchedules[account][entryID].escrowAmount;
        remainingAmount = vestingSchedules[account][entryID].remainingAmount;
        ratePerSecond = _ratePerSecond(vestingSchedules[account][entryID]);
    }

    /* rate of escrow emission per second */
    function ratePerSecond(address account, uint256 entryID) public view returns (uint256) {
        /* Retrieve the vesting entry */
        VestingEntries.VestingEntry memory entry = vestingSchedules[account][entryID];

        return _ratePerSecond(entry);
    }

    function _ratePerSecond(VestingEntries.VestingEntry memory _entry) internal pure returns (uint256) {
        /* Calculate the rate of emission for entry based on escrowAmount / duration seconds rounded */
        return _entry.escrowAmount.divideDecimalRound(_entry.duration);
    }

    function _numVestingEntries(address account) internal view returns (uint) {
        return accountVestingEntryIDs[account].length;
    }

    function getVestingQuantity(address account, uint256[] calldata entryIDs) external view returns (uint total) {
        for (uint i = 0; i < entryIDs.length - 1; i++) {
            VestingEntries.VestingEntry memory entry = vestingSchedules[account][entryIDs[i]];

            /* Skip entry if remainingAmount == 0 */
            if (entry.remainingAmount != 0) {
                uint256 quantity = _claimableAmount(entry);

                /* add quantity to total */
                total = total.add(quantity);
            }
        }
    }

    function getVestingEntryClaimable(address account, uint256 entryID) external view returns (uint) {
        VestingEntries.VestingEntry memory entry = vestingSchedules[account][entryID];
        return _claimableAmount(entry);
    }

    /* ========== MUTATIVE FUNCTIONS ========== */

    /**
     * Vest escrowed amounts that have been emitted
     * Public function allows any account to be vested by another account
     */

    function vest(address account, uint256[] calldata entryIDs) external {
        uint256 total;
        for (uint i = 0; i < entryIDs.length - 1; i++) {
            VestingEntries.VestingEntry storage entry = vestingSchedules[account][entryIDs[i]];

            /* Skip entry if remainingAmount == 0 */
            if (entry.remainingAmount != 0) {
                uint256 quantity = _claimableAmount(entry);

                /* update entry */
                entry.remainingAmount = entry.remainingAmount.sub(quantity);
                entry.lastVested = uint64(now);

                /* add quantity to total */
                total = total.add(quantity);
            }
        }

        /* Transfer vested tokens. Will revert if total > totalEscrowedAccountBalance */
        if (total != 0) {
            _transferVestedTokens(account, total);
        }
    }

    function _claimableAmount(VestingEntries.VestingEntry memory _entry) internal view returns (uint256 quantity) {
        /* Return if remaining Amount is 0 */
        if (_entry.remainingAmount != 0) {
            /* Get the amount vesting for the entry */
            uint256 delta = _deltaOf(uint256(_entry.endTime), uint256(_entry.lastVested));
            uint256 quantityEmitted = delta.multiplyDecimal(_ratePerSecond(_entry));

            /* cap quantity to the remaining amount in vesting entry */
            quantity = _entry.remainingAmount <= quantityEmitted ? _entry.remainingAmount : quantityEmitted;
        }
    }

    /**
     * Calculate the time in seconds between `block.timestamp` and lastVested
     * Returns seconds since lastVested and if the end time is after `block.timestamp`
     * it will be the delta of the end time - last vested
     */
    function _deltaOf(uint256 endTime, uint256 lastVested) internal view returns (uint256 delta) {
        return now < endTime ? now - lastVested : endTime - lastVested;
    }

    /**
     * @notice Create an escrow entry to lock SNX for given a given duration in seconds
     * @dev This call expects that the depositor (msg.sender) has already approved the Reward escrow contract
     to spend the the amount being escrowed.
     */
    function createEscrowEntry(
        address beneficiary,
        uint256 deposit,
        uint256 duration
    ) external {
        require(beneficiary != address(0), "Cannot create escrow with address(0)");

        /* Transfer SNX from msg.sender */
        require(IERC20(address(synthetix())).transferFrom(msg.sender, address(this), deposit), "token transfer failed");

        /* Append vesting entry for the beneficiary address */
        _appendVestingEntry(beneficiary, deposit, duration);
    }

    /**
     * @notice Add a new vesting entry at a given time and quantity to an account's schedule.
     * @dev A call to this should accompany a previous successful call to synthetix.transfer(rewardEscrow, amount),
     * to ensure that when the funds are withdrawn, there is enough balance.
     * @param account The account to append a new vesting entry to.
     * @param quantity The quantity of SNX that will be escrowed.
     * @param duration The duration that SNX will be emitted.
     */
    function appendVestingEntry(
        address account,
        uint256 quantity,
        uint256 duration
    ) external onlyFeePool {
        _appendVestingEntry(account, quantity, duration);
    }

    /* Transfer vested tokens and update totalEscrowedAccountBalance, totalVestedAccountBalance */
    function _transferVestedTokens(address _account, uint256 _amount) internal {
        _reduceAccountEscrowBalances(_account, _amount);
        totalVestedAccountBalance[_account] = totalVestedAccountBalance[_account].add(_amount);
        IERC20(address(synthetix())).transfer(_account, _amount);
        emit Vested(_account, now, _amount);
    }

    function _reduceAccountEscrowBalances(address _account, uint256 _amount) internal {
        // Reverts if amount being vested is greater than the account's existing totalEscrowedAccountBalance
        totalEscrowedBalance = totalEscrowedBalance.sub(_amount);
        totalEscrowedAccountBalance[_account] = totalEscrowedAccountBalance[_account].sub(_amount);
    }

    /* ========== ACCOUNT MERGING ========== */

    function startMergingWindow() external onlyOwner {
        accountMergingEndTime = now.add(accountMergingDuration);

        // emit account merging window start
    }

    function setAccountMergingDuration(uint256 duration) external onlyOwner {
        // TODO - some checks to ensure not above max

        accountMergingDuration = duration;
        // TODO - emit account merging duration updated
    }

    /* Nominate an account to merge escrow and vesting schedule */
    function nominateAccountToMerge(address account) external {
        require(accountMergingEndTime < now, "Account merging has ended");
        require(totalEscrowedAccountBalance[msg.sender] > 0, "Address escrow balance is 0");

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

    function migrateVestingSchedule(address addressToMigrate) external {
        _notImplemented();
    }

    function migrateAccountEscrowBalances(
        address[] calldata accounts,
        uint256[] calldata escrowBalances,
        uint256[] calldata vestedBalances
    ) external {
        _notImplemented();
    }

    /* ========== L2 MIGRATION ========== */

    function burnForMigration(address account, uint[] calldata entryIDs)
        external
        returns (uint256 escrowedAccountBalance, VestingEntries.VestingEntry[] memory vestingEntries)
    {
        _notImplemented();
    }

    function importVestingEntries(
        address account,
        uint256 escrowedAmount,
        VestingEntries.VestingEntry[] calldata vestingEntries
    ) external {
        _notImplemented();
    }

    /* ========== INTERNALS ========== */

    function _appendVestingEntry(
        address account,
        uint256 quantity,
        uint256 duration
    ) internal {
        /* No empty or already-passed vesting entries allowed. */
        require(quantity != 0, "Quantity cannot be zero");
        require(duration > 0 && duration < MAX_DURATION, "Cannot escrow with 0 duration || above MAX_DURATION");

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
        vestingSchedules[account][entryID] = VestingEntries.VestingEntry({
            endTime: uint64(endTime),
            duration: uint64(duration),
            lastVested: 0,
            escrowAmount: quantity,
            remainingAmount: quantity
        });

        accountVestingEntryIDs[account].push(entryID);

        /* Increment the next entry id. */
        nextEntryId = nextEntryId.add(1);

        emit VestingEntryCreated(account, now, quantity, duration, entryID);
    }

    function _importVestingEntry(address account, VestingEntries.VestingEntry memory entry) internal {
        uint entryID = nextEntryId;
        vestingSchedules[account][entryID] = entry;

        /* append entryID to list of entries for account */
        accountVestingEntryIDs[account].push(entryID);

        /* Increment the next entry id. */
        nextEntryId = nextEntryId.add(1);
    }

    /* ========== MODIFIERS ========== */
    modifier onlyFeePool() {
        require(msg.sender == address(feePool()), "Only the FeePool contracts can perform this action");
        _;
    }

    /* ========== EVENTS ========== */
    event Vested(address indexed beneficiary, uint time, uint value);

    event VestingEntryCreated(address indexed beneficiary, uint time, uint value, uint duration, uint entryID);
}
