pragma solidity ^0.5.16;
pragma experimental ABIEncoderV2;

// Inheritance
import "./Owned.sol";
import "./MixinResolver.sol";
import "./RewardEscrowV2StorageMixin.sol";
import "./LimitedSetup.sol";
import "./interfaces/IRewardEscrowV2.sol";

// Libraries
import "./SafeDecimalMath.sol";

// Internal references
import "./interfaces/IERC20.sol";
import "./interfaces/IFeePool.sol";
import "./interfaces/ISynthetix.sol";
import "./interfaces/IIssuer.sol";

// https://docs.synthetix.io/contracts/RewardEscrow
contract BaseRewardEscrowV2 is Owned, IRewardEscrowV2, LimitedSetup(8 weeks), MixinResolver, RewardEscrowV2StorageMixin {
    using SafeMath for uint;
    using SafeDecimalMath for uint;

    /* Mapping of nominated address to recieve account merging */
    mapping(address => address) public nominatedReceiver;

    /* Max escrow duration */
    uint public max_duration = 2 * 52 weeks; // Default max 2 years duration

    /* Max account merging duration */
    uint public maxAccountMergingDuration = 4 weeks; // Default 4 weeks is max

    /* ========== ACCOUNT MERGING CONFIGURATION ========== */

    uint public accountMergingDuration = 1 weeks;

    uint public accountMergingStartTime;

    /* ========== ADDRESS RESOLVER CONFIGURATION ========== */

    bytes32 private constant CONTRACT_SYNTHETIX = "Synthetix";
    bytes32 private constant CONTRACT_ISSUER = "Issuer";
    bytes32 private constant CONTRACT_FEEPOOL = "FeePool";

    /* ========== CONSTRUCTOR ========== */

    constructor(
        address _owner,
        address _resolver,
        IRewardEscrowV2Frozen _previousEscrow
    ) public Owned(_owner) MixinResolver(_resolver) RewardEscrowV2StorageMixin(_previousEscrow) {}

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
        return totalEscrowedAccountBalance(account);
    }

    /**
     * @notice Get a particular schedule entry for an account.
     * @return The vesting entry object and rate per second emission.
     */
    function getVestingEntry(address account, uint256 entryID) external view returns (uint64 endTime, uint256 escrowAmount) {
        endTime = vestingSchedules(account, entryID).endTime;
        escrowAmount = vestingSchedules(account, entryID).escrowAmount;
    }

    function getVestingSchedules(
        address account,
        uint256 index,
        uint256 pageSize
    ) external view returns (VestingEntries.VestingEntryWithID[] memory) {
        uint256 endIndex = index + pageSize;

        // If index starts after the endIndex return no results
        if (endIndex <= index) {
            return new VestingEntries.VestingEntryWithID[](0);
        }

        // If the page extends past the end of the accountVestingEntryIDs, truncate it.
        if (endIndex > numVestingEntries(account)) {
            endIndex = numVestingEntries(account);
        }

        uint256 n = endIndex - index;
        VestingEntries.VestingEntryWithID[] memory vestingEntries = new VestingEntries.VestingEntryWithID[](n);
        for (uint256 i; i < n; i++) {
            uint256 entryID = accountVestingEntryIDs(account, i + index);

            VestingEntries.VestingEntry memory entry = vestingSchedules(account, entryID);

            vestingEntries[i] = VestingEntries.VestingEntryWithID({
                endTime: uint64(entry.endTime),
                escrowAmount: entry.escrowAmount,
                entryID: entryID
            });
        }
        return vestingEntries;
    }

    function getAccountVestingEntryIDs(
        address account,
        uint256 index,
        uint256 pageSize
    ) external view returns (uint256[] memory) {
        uint256 endIndex = index + pageSize;

        // If the page extends past the end of the accountVestingEntryIDs, truncate it.
        if (endIndex > numVestingEntries(account)) {
            endIndex = numVestingEntries(account);
        }
        if (endIndex <= index) {
            return new uint256[](0);
        }

        uint256 n = endIndex - index;
        uint256[] memory page = new uint256[](n);
        for (uint256 i; i < n; i++) {
            page[i] = accountVestingEntryIDs(account, i + index);
        }
        return page;
    }

    function getVestingQuantity(address account, uint256[] calldata entryIDs) external view returns (uint total) {
        for (uint i = 0; i < entryIDs.length; i++) {
            VestingEntries.VestingEntry memory entry = vestingSchedules(account, entryIDs[i]);

            /* Skip entry if escrowAmount == 0 */
            if (entry.escrowAmount != 0) {
                uint256 quantity = _claimableAmount(entry);

                /* add quantity to total */
                total = total.add(quantity);
            }
        }
    }

    function getVestingEntryClaimable(address account, uint256 entryID) external view returns (uint) {
        VestingEntries.VestingEntry memory entry = vestingSchedules(account, entryID);
        return _claimableAmount(entry);
    }

    function _claimableAmount(VestingEntries.VestingEntry memory _entry) internal view returns (uint256) {
        uint256 quantity;
        if (_entry.escrowAmount != 0) {
            /* Escrow amounts claimable if block.timestamp equal to or after entry endTime */
            quantity = block.timestamp >= _entry.endTime ? _entry.escrowAmount : 0;
        }
        return quantity;
    }

    /* ========== MUTATIVE FUNCTIONS ========== */

    /**
     * Vest escrowed amounts that are claimable
     * Allows users to vest their vesting entries based on msg.sender
     */
    function vest(uint256[] calldata entryIDs) external {
        vestFor(msg.sender, entryIDs);
    }

    /// public method to vest any accounts vesting entries
    function vestFor(address account, uint256[] memory entryIDs) public {
        uint256 total;
        for (uint i = 0; i < entryIDs.length; i++) {
            VestingEntries.VestingEntry memory entry = vestingSchedules(account, entryIDs[i]);

            /* Skip entry if escrowAmount == 0 already vested */
            if (entry.escrowAmount != 0) {
                uint256 quantity = _claimableAmount(entry);

                /* update entry to remove escrowAmount */
                if (quantity > 0) {
                    _storeEntryZeroAmount(account, entryIDs[i]);
                }

                /* add quantity to total */
                total = total.add(quantity);
            }
        }

        /* Transfer vested tokens. Will revert if total > totalEscrowedAccountBalance */
        if (total != 0) {
            _transferTokens(account, account, total);
            // update total vested
            _storeTotalVestedAccountBalance(account, totalVestedAccountBalance(account).add(total));
            emit Vested(account, block.timestamp, total);
        }
    }

    /// method for revoking vesting entries regardless of schedule to be used for liquidations
    /// access controlled to only Synthetix contract
    /// @param account: account
    /// @param recipient: account to transfer the revoked tokens to
    /// @param targetAmount: amount of SNX to revoke, when this amount is reached, not more entries are revoked
    /// @param startIndex: index into accountVestingEntryIDs[account] to start iterating from
    function revokeFrom(
        address account,
        address recipient,
        uint targetAmount,
        uint startIndex
    ) external onlySynthetix {
        require(account != address(0), "account not set");
        require(recipient != address(0), "recipient not set");
        require(targetAmount > 0, "targetAmount is zero");

        uint numIds = numVestingEntries(account);
        require(startIndex < numIds, "startIndex too high");

        uint total;
        uint entryID;
        uint amount;
        for (uint i = startIndex; i < numIds; i++) {
            entryID = accountVestingEntryIDs(account, i);
            VestingEntries.VestingEntry memory entry = vestingSchedules(account, entryID);

            // skip vested
            if (entry.escrowAmount > 0) {
                amount = entry.escrowAmount;

                // add to total
                total = total.add(amount);
                emit Revoked(account, entryID, amount);

                // set to zero
                _storeEntryZeroAmount(account, entryID);

                if (total >= targetAmount) {
                    if (total > targetAmount) {
                        // only take the precise amount needed by adding a new entry
                        // with the difference from total
                        uint refund = total.sub(targetAmount);
                        _storeVestingEntry(
                            account,
                            VestingEntries.VestingEntry({endTime: entry.endTime, escrowAmount: refund})
                        );
                    }
                    // exit the loop
                    break;
                }
            }
        }

        // check total is indeed enough, the caller should have checked, but better make sure
        // this shouldn't be possible since the caller contract should only call this
        // if there's enough in escrow to
        require(total >= targetAmount, "entries sum less than target");

        _transferTokens(account, recipient, targetAmount);
    }

    /**
     * @notice Create an escrow entry to lock SNX for a given duration in seconds
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

    function _appendVestingEntry(
        address account,
        uint256 quantity,
        uint256 duration
    ) internal {
        /* No empty or already-passed vesting entries allowed. */
        require(quantity != 0, "Quantity cannot be zero");
        require(duration > 0 && duration <= max_duration, "Cannot escrow with 0 duration OR above max_duration");

        /* There must be enough balance in the contract to provide for the vesting entry. */
        _storeTotalEscrowedBalance(totalEscrowedBalance().add(quantity));

        require(
            totalEscrowedBalance() <= IERC20(address(synthetix())).balanceOf(address(this)),
            "Must be enough balance in the contract to provide for the vesting entry"
        );

        /* Escrow the tokens for duration. */
        uint endTime = block.timestamp + duration;

        /* Add quantity to account's escrowed balance */
        _storeTotalEscrowedAccountBalance(account, totalEscrowedAccountBalance(account).add(quantity));

        // store vesting entry
        uint entryID =
            _storeVestingEntry(account, VestingEntries.VestingEntry({endTime: uint64(endTime), escrowAmount: quantity}));

        emit VestingEntryCreated(account, block.timestamp, quantity, duration, entryID);
    }

    /// remove tokens from vesting aggregates and transfer them to recipient
    function _transferTokens(
        address removeFrom,
        address transferTo,
        uint256 amount
    ) internal {
        _updateAggregateBalancesForDelta(removeFrom, -int(amount));
        IERC20(address(synthetix())).transfer(transferTo, amount);
    }

    function _updateAggregateBalancesForDelta(address account, int delta) internal {
        if (delta < 0) {
            uint reduce = uint(-delta);
            // Reverts if amount being vested is greater than the account's existing totalEscrowedAccountBalance
            _storeTotalEscrowedBalance(totalEscrowedBalance().sub(reduce));
            // update escrowed
            _storeTotalEscrowedAccountBalance(account, totalEscrowedAccountBalance(account).sub(reduce));
        } else if (delta > 0) {
            uint increase = uint(delta);
            _storeTotalEscrowedBalance(totalEscrowedBalance().add(increase));
            // update escrowed
            _storeTotalEscrowedAccountBalance(account, totalEscrowedAccountBalance(account).add(increase));
        }
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
        require(duration <= maxAccountMergingDuration, "exceeds max merging duration");
        accountMergingDuration = duration;
        emit AccountMergingDurationUpdated(duration);
    }

    function setMaxAccountMergingWindow(uint256 duration) external onlyOwner {
        maxAccountMergingDuration = duration;
        emit MaxAccountMergingDurationUpdated(duration);
    }

    function setMaxEscrowDuration(uint256 duration) external onlyOwner {
        max_duration = duration;
        emit MaxEscrowDurationUpdated(duration);
    }

    /* Nominate an account to merge escrow and vesting schedule */
    function nominateAccountToMerge(address account) external {
        require(account != msg.sender, "Cannot nominate own account to merge");
        require(accountMergingIsOpen(), "Account merging has ended");
        require(issuer().debtBalanceOf(msg.sender, "sUSD") == 0, "Cannot merge accounts with debt");
        nominatedReceiver[msg.sender] = account;
        emit NominateAccountToMerge(msg.sender, account);
    }

    function mergeAccount(address from, uint256[] calldata entryIDs) external {
        require(accountMergingIsOpen(), "Account merging has ended");
        require(issuer().debtBalanceOf(from, "sUSD") == 0, "Cannot merge accounts with debt");
        require(nominatedReceiver[from] == msg.sender, "Address is not nominated to merge");
        address to = msg.sender;

        uint256 totalEscrowAmountMerged;
        for (uint i = 0; i < entryIDs.length; i++) {
            // retrieve entry
            VestingEntries.VestingEntry memory entry = vestingSchedules(from, entryIDs[i]);

            /* ignore vesting entries with zero escrowAmount */
            if (entry.escrowAmount != 0) {
                // set previous entry amount to zero
                _storeEntryZeroAmount(from, entryIDs[i]);

                // append new entry for recipient, the new entry will have new entryID
                _storeVestingEntry(to, entry);

                /* Add the escrowAmount of entry to the totalEscrowAmountMerged */
                totalEscrowAmountMerged = totalEscrowAmountMerged.add(entry.escrowAmount);
            }
        }

        // remove from old account
        _updateAggregateBalancesForDelta(from, -int(totalEscrowAmountMerged));
        // add to recipient account
        _updateAggregateBalancesForDelta(to, int(totalEscrowAmountMerged));

        emit AccountMerged(from, to, totalEscrowAmountMerged, entryIDs, block.timestamp);
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

    /* ========== MODIFIERS ========== */
    modifier onlyFeePool() {
        require(msg.sender == address(feePool()), "Only the FeePool can perform this action");
        _;
    }

    modifier onlySynthetix() {
        require(msg.sender == address(synthetix()), "Only Synthetix");
        _;
    }

    /* ========== EVENTS ========== */
    event Vested(address indexed beneficiary, uint time, uint value);
    event VestingEntryCreated(address indexed beneficiary, uint time, uint value, uint duration, uint entryID);
    event MaxEscrowDurationUpdated(uint newDuration);
    event MaxAccountMergingDurationUpdated(uint newDuration);
    event AccountMergingDurationUpdated(uint newDuration);
    event AccountMergingStarted(uint time, uint endTime);
    event AccountMerged(
        address indexed accountToMerge,
        address destinationAddress,
        uint escrowAmountMerged,
        uint[] entryIDs,
        uint time
    );
    event NominateAccountToMerge(address indexed account, address destination);
    event Revoked(address indexed account, uint entryID, uint escrowAmount);
}
