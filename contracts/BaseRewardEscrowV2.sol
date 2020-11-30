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

    uint internal constant TIME_INDEX = 0;
    uint internal constant QUANTITY_INDEX = 1;

    uint public accountMergingDuration = 24 hours;

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

    function ratePerSecond(address account, uint256 entryID) public view {
        // Retrieve the vesting entry on
        // Calculate the rate of emission for entry based on escrowAmount / duration seconds
        // entry.escrowAmount.divideDecimalRound(duration);
    }

    function getLengthOfEntries(address account) external view returns (uint) {
        return accountVestingEntryIDs[account].length;
    }

    function vestingScheduleMigrationPending(address account) public view returns (bool) {
        return totalEscrowedAccountBalance[account] > 0 && _numVestingEntries(account) == 0;
    }

    /* ========== MUTATIVE FUNCTIONS ========== */

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

        emit VestingEntryCreated(account, now, quantity, duration);
    }

    function _importVestingEntry(address account, VestingEntries.VestingEntry memory entry) internal {
        uint entryID = nextEntryId;
        vestingSchedules[account][entryID] = entry;

        // append entryID to list of entries for account
        accountVestingEntryIDs[account].push(entryID);

        /* Increment the next entry id. */
        nextEntryId = nextEntryId.add(1);
    }

    function _numVestingEntries(address account) internal view returns (uint) {
        return accountVestingEntryIDs[account].length;
    }

    /* ========== MODIFIERS ========== */
    modifier onlyFeePool() {
        require(msg.sender == address(feePool()), "Only the FeePool contracts can perform this action");
        _;
    }

    /* ========== EVENTS ========== */
    event Vested(address indexed beneficiary, uint time, uint value);

    event VestingEntryCreated(address indexed beneficiary, uint time, uint value, uint duration);
}
