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
import "./interfaces/IIssuer.sol";

import "@nomiclabs/buidler/console.sol";


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
    mapping(address => address) public nominatedReceiver;

    /* The total remaining escrowed balance, for verifying the actual synthetix balance of this contract against. */
    uint256 public totalEscrowedBalance;

    /* Max escrow duration */
    uint public MAX_DURATION = 2 * 52 weeks; // Default max 2 years duration

    /* ========== OLD ESCROW LOOKUP ========== */

    uint internal constant TIME_INDEX = 0;
    uint internal constant QUANTITY_INDEX = 1;

    /* ========== ACCOUNT MERGING CONFIGURATION ========== */

    uint public accountMergingDuration = 1 weeks;

    uint public accountMergingStartTime;

    /* Limit vesting entries to disallow unbounded iteration over vesting schedules.
     * There are 5 years of the supply schedule */
    uint public constant MAX_VESTING_ENTRIES = 52 * 5;

    /* ========== ADDRESS RESOLVER CONFIGURATION ========== */

    bytes32 private constant CONTRACT_SYNTHETIX = "Synthetix";
    bytes32 private constant CONTRACT_ISSUER = "Issuer";
    bytes32 private constant CONTRACT_FEEPOOL = "FeePool";

    /* ========== CONSTRUCTOR ========== */

    constructor(address _owner, address _resolver) public Owned(_owner) MixinResolver(_resolver) {
        nextEntryId = 1;
    }

    /* ========== VIEWS ======================= */

    function feePool() internal view returns (IFeePool) {
        return IFeePool(requireAndGetAddress(CONTRACT_FEEPOOL));
    }

    function synthetix() internal view returns (ISynthetix) {
        return ISynthetix(requireAndGetAddress(CONTRACT_SYNTHETIX));
    }

    function issuer() internal view returns (IIssuer) {
        return IIssuer(requireAndGetAddress(CONTRACT_ISSUER));
    }

    function _notImplemented() internal pure {
        revert("Cannot be run on this layer");
    }

    /* ========== VIEW FUNCTIONS ========== */

    // Note: use public visibility so that it can be invoked in a subclass
    function resolverAddressesRequired() public view returns (bytes32[] memory addresses) {
        addresses = new bytes32[](3);
        addresses[0] = CONTRACT_SYNTHETIX;
        addresses[1] = CONTRACT_FEEPOOL;
        addresses[2] = CONTRACT_ISSUER;
    }

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

    /**
     * @notice Get a particular schedule entry for an account.
     * @return The vesting entry object and rate per second emission.
     */
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

    function getVestingSchedules(
        address account,
        uint256 index,
        uint256 pageSize
    ) external view returns (VestingEntries.VestingEntry[] memory) {
        uint256 endIndex = index + pageSize;

        // If index starts after the endIndex return no results
        if (endIndex <= index) {
            return new VestingEntries.VestingEntry[](0);
        }

        // If the page extends past the end of the accountVestingEntryIDs, truncate it.
        if (endIndex > accountVestingEntryIDs[account].length) {
            endIndex = accountVestingEntryIDs[account].length;
        }

        uint256 n = endIndex - index;
        VestingEntries.VestingEntry[] memory vestingEntries = new VestingEntries.VestingEntry[](n);
        for (uint256 i; i < n; i++) {
            uint256 entryID = accountVestingEntryIDs[account][i + index];
            vestingEntries[i] = vestingSchedules[account][entryID];
        }
        return vestingEntries;
    }

    /* rate of escrow emission per second */
    function ratePerSecond(address account, uint256 entryID) external view returns (uint256) {
        /* Retrieve the vesting entry */
        VestingEntries.VestingEntry memory entry = vestingSchedules[account][entryID];
        return _ratePerSecond(entry);
    }

    /* returns the rate per second based on escrow amount divided by duration  */
    function _ratePerSecond(VestingEntries.VestingEntry memory _entry) internal pure returns (uint256) {
        return _entry.escrowAmount.div(_entry.duration);
    }

    function getVestingQuantity(address account, uint256[] calldata entryIDs) external view returns (uint total) {
        for (uint i = 0; i < entryIDs.length; i++) {
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

    function vest(uint256[] calldata entryIDs) external {
        uint256 total;
        for (uint i = 0; i < entryIDs.length; i++) {
            VestingEntries.VestingEntry storage entry = vestingSchedules[msg.sender][entryIDs[i]];

            /* Skip entry if remainingAmount == 0 */
            if (entry.remainingAmount != 0) {
                uint256 quantity = _claimableAmount(entry);

                /* update entry */
                entry.remainingAmount = entry.remainingAmount.sub(quantity);
                entry.lastVested = uint64(block.timestamp);

                /* add quantity to total */
                total = total.add(quantity);
            }
        }

        /* Transfer vested tokens. Will revert if total > totalEscrowedAccountBalance */
        if (total != 0) {
            _transferVestedTokens(msg.sender, total);
        }
    }

    function _claimableAmount(VestingEntries.VestingEntry memory _entry) internal view returns (uint256 quantity) {
        /* Return if remaining Amount is 0 */
        if (_entry.remainingAmount != 0) {
            /* Remaining amounts claimable if block.timestamp equal to or after entry endTime */
            if (block.timestamp >= _entry.endTime) return _entry.remainingAmount;

            /* Get the amount vesting for the entry */
            uint256 timeSinceLastVested = _timeSinceLastVested(_entry);
            uint256 quantityEmitted = timeSinceLastVested.mul(_ratePerSecond(_entry));

            /* cap quantity to the remaining amount in vesting entry */
            quantity = _entry.remainingAmount <= quantityEmitted ? _entry.remainingAmount : quantityEmitted;
        }
    }

    function timeSinceLastVested(address account, uint256 entryID) external view returns (uint256 delta) {
        return _timeSinceLastVested(vestingSchedules[account][entryID]);
    }

    /**
     * Calculate the time in seconds between `block.timestamp` and lastVested
     * Returns seconds since lastVested and if the end time is after `block.timestamp`
     * it will be the delta of the current `block.timestamp` - lastVested
     */
    function _timeSinceLastVested(VestingEntries.VestingEntry memory _entry) internal view returns (uint256 delta) {
        uint256 lastVestingTimestamp = _entry.lastVested > 0 ? _entry.lastVested : _entry.endTime - _entry.duration;

        delta = block.timestamp < _entry.endTime
            ? block.timestamp - lastVestingTimestamp
            : _entry.endTime - lastVestingTimestamp;
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
        emit Vested(_account, block.timestamp, _amount);
    }

    function _reduceAccountEscrowBalances(address _account, uint256 _amount) internal {
        // Reverts if amount being vested is greater than the account's existing totalEscrowedAccountBalance
        totalEscrowedBalance = totalEscrowedBalance.sub(_amount);
        totalEscrowedAccountBalance[_account] = totalEscrowedAccountBalance[_account].sub(_amount);
    }

    /* ========== ACCOUNT MERGING ========== */

    function accountMergingIsOpen() public view returns (bool) {
        return accountMergingStartTime.add(accountMergingDuration) > block.timestamp;
    }

    function startMergingWindow() external onlyOwner {
        accountMergingStartTime = block.timestamp;
        emit AccountMergingStarted(accountMergingStartTime, accountMergingStartTime.add(accountMergingDuration));
    }

    function setAccountMergingDuration(uint256 duration) external onlyOwner {
        // TODO - some checks to ensure not above max
        accountMergingDuration = duration;
        emit AccountMergingDurationUpdated(duration);
    }

    function setMaxEscrowDuration(uint256 duration) external onlyOwner {
        MAX_DURATION = duration;
        emit MaxEscrowDurationUpdated(duration);
    }

    /* Nominate an account to merge escrow and vesting schedule */
    function nominateAccountToMerge(address account) external {
        require(accountMergingIsOpen(), "Account merging has ended");
        require(issuer().debtBalanceOf(msg.sender, "sUSD") == 0, "Cannot merge accounts with debt");
        nominatedReceiver[msg.sender] = account;
        emit NominateAccountToMerge(msg.sender, account);
    }

    function mergeAccount(address accountToMerge, uint256[] calldata entryIDs) external {
        require(accountMergingIsOpen(), "Account merging has ended");
        require(issuer().debtBalanceOf(accountToMerge, "sUSD") == 0, "Cannot merge accounts with debt");
        require(nominatedReceiver[accountToMerge] == msg.sender, "Address is not nominated to merge");

        for (uint i = 0; i < entryIDs.length; i++) {
            // retrieve entries
            // VestingEntries.VestingEntry memory entry = vestingSchedules[accountToMerge][entryIDs[i]];
        }
        // delete totalEscrowedAccountBalance for merged account
        // delete totalVestedAccountBalance for merged acctoun
        // delete nominatedReceiver once merged
    }

    /* ========== MIGRATION OLD ESCROW ========== */

    function migrateVestingSchedule(address) external {
        _notImplemented();
    }

    function migrateAccountEscrowBalances(
        address[] calldata,
        uint256[] calldata,
        uint256[] calldata
    ) external {
        _notImplemented();
    }

    /* ========== L2 MIGRATION ========== */

    function burnForMigration(address, uint[] calldata) external returns (uint256, VestingEntries.VestingEntry[] memory) {
        _notImplemented();
    }

    function importVestingEntries(
        address,
        uint256,
        VestingEntries.VestingEntry[] calldata
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
        require(duration > 0 && duration < MAX_DURATION, "Cannot escrow with 0 duration OR above MAX_DURATION");

        /* Escrow quantity needs to be larger than duration as ratePerSecond division will result in 0 if less */
        require(quantity > duration, "Escrow quantity less than duration");

        /* There must be enough balance in the contract to provide for the vesting entry. */
        totalEscrowedBalance = totalEscrowedBalance.add(quantity);

        require(
            totalEscrowedBalance <= IERC20(address(synthetix())).balanceOf(address(this)),
            "Must be enough balance in the contract to provide for the vesting entry"
        );

        /* Escrow the tokens for duration. */
        uint endTime = block.timestamp + duration;

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

        emit VestingEntryCreated(account, block.timestamp, quantity, duration, entryID);
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
        require(msg.sender == address(feePool()), "Only the FeePool can perform this action");
        _;
    }

    /* ========== EVENTS ========== */
    event Vested(address indexed beneficiary, uint time, uint value);
    event VestingEntryCreated(address indexed beneficiary, uint time, uint value, uint duration, uint entryID);
    event MaxEscrowDurationUpdated(uint newDuration);
    event AccountMergingDurationUpdated(uint newDuration);
    event AccountMergingStarted(uint time, uint endTime);
    event NominateAccountToMerge(address indexed account, address destination);
}
