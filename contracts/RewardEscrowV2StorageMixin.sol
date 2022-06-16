pragma solidity ^0.5.16;
pragma experimental ABIEncoderV2;

// interface for vesting entries
import "./interfaces/IRewardEscrowV2Frozen.sol";

/// A mixin for reading and writing to/from storage while falling back to values from
/// previous RewardEscrowV2 contract.
/// Ideally this should be its own contract so that logic on top of this can be upgraded more easily
contract RewardEscrowV2StorageMixin {
    // cheaper storage for L1
    struct StorageEntry {
        uint32 endTime;
        uint224 escrowAmount;
    }

    mapping(address => mapping(uint => StorageEntry)) internal _vestingSchedules;

    mapping(address => uint[]) internal _accountVestingEntryIDs;

    /*Counter for new vesting entry ids. */
    uint public nextEntryId;

    /* An account's total escrowed synthetix balance to save recomputing this for fee extraction purposes. */
    mapping(address => uint) internal _totalEscrowedAccountBalance;

    /* An account's total vested reward synthetix. */
    mapping(address => uint) internal _totalVestedAccountBalance;

    /* The total remaining escrowed balance, for verifying the actual synthetix balance of this contract against. */
    uint internal _totalEscrowedBalance;

    // id starting from which the new entries are stored in this contact only (and don't need to be read from fallback)
    uint public fallbackId;

    // 1 wei is a zero value placeholder in the read-through storage.
    // needed to prevent writing zeros and reading stale values (0 is used to mean uninitialized)
    uint internal constant ZERO_PLACEHOLDER = 1;

    IRewardEscrowV2Frozen public fallbackRewardEscrow;

    /* ========== CONSTRUCTOR ========== */

    /// this assumes that IRewardEscrowV2Frozen is in fact Frozen both in code and in data(!!) with all
    /// mutative methods reverting (e.g. due to blocked transfers)
    constructor(IRewardEscrowV2Frozen _previousEscrow) public {
        fallbackRewardEscrow = _previousEscrow;
        nextEntryId = _previousEscrow.nextEntryId();
        fallbackId = nextEntryId;

        // carry over previous balance tracking
        _totalEscrowedBalance = fallbackRewardEscrow.totalEscrowedBalance();
    }

    /* ========== VIEWS ========== */

    function vestingSchedules(address account, uint entryId) public view returns (VestingEntries.VestingEntry memory entry) {
        // read stored entry
        StorageEntry storage stored = _vestingSchedules[account][entryId];
        entry = VestingEntries.VestingEntry({endTime: stored.endTime, escrowAmount: stored.escrowAmount});
        // read from fallback if this entryID was created in the old contract and wasn't written locally
        // this assumes that no new entries can be created with endTime = 0 (kinda defeats the purpose of vesting)
        if (entryId < fallbackId && entry.endTime == 0) {
            entry = fallbackRewardEscrow.vestingSchedules(account, entryId);
        }
        return entry;
    }

    function accountVestingEntryIDs(address account, uint index) public view returns (uint) {
        uint fallbackCount = fallbackRewardEscrow.numVestingEntries(account);

        // this assumes no new entries can be created in the old contract
        if (index < fallbackCount) {
            return fallbackRewardEscrow.accountVestingEntryIDs(account, index);
        } else {
            return _accountVestingEntryIDs[account][index - fallbackCount];
        }
    }

    function totalEscrowedBalance() public view returns (uint) {
        // this method is just to prevent direct access to storage from logic methods
        // to reduce bugs (and maybe allow refactoring into separate storage contract)
        return _totalEscrowedBalance;
    }

    function totalEscrowedAccountBalance(address account) public view returns (uint) {
        uint v = _totalEscrowedAccountBalance[account];

        // 0 should never be stored to prevent reading stale value from fallback
        if (v == 0) {
            return fallbackRewardEscrow.totalEscrowedAccountBalance(account);
        } else {
            return v == ZERO_PLACEHOLDER ? 0 : v;
        }
    }

    function totalVestedAccountBalance(address account) public view returns (uint) {
        uint v = _totalVestedAccountBalance[account];

        // 0 should never be stored to prevent reading stale value from fallback
        if (v == 0) {
            return fallbackRewardEscrow.totalVestedAccountBalance(account);
        } else {
            return v == ZERO_PLACEHOLDER ? 0 : v;
        }
    }

    /// The number of vesting dates in an account's schedule.
    function numVestingEntries(address account) public view returns (uint) {
        /// assumes no enties can be written in frozen contract
        return fallbackRewardEscrow.numVestingEntries(account) + _accountVestingEntryIDs[account].length;
    }

    /* ========== MUTATIVE FUNCTIONS ========== */

    function _storeEntryAmount(
        address account,
        uint entryID,
        uint amount
    ) internal {
        // read the current value (possibly from fallback)
        VestingEntries.VestingEntry memory prevEntry = vestingSchedules(account, entryID);
        // load storage entry
        StorageEntry storage storedEntry = _vestingSchedules[account][entryID];
        // update endTime from fallback if this is first time this entry is written in this contract
        if (storedEntry.endTime != uint32(prevEntry.endTime)) {
            storedEntry.endTime = uint32(prevEntry.endTime);
        }
        // update amount if needed
        if (storedEntry.escrowAmount != uint224(amount)) {
            storedEntry.escrowAmount = uint224(amount);
        }
        // TODO: consider improving gas usage of revoking / vesting by using boolean / binary arrays as 0 marks
    }

    function _storeTotalEscrowedAccountBalance(address account, uint amount) internal {
        if (amount == 0) {
            // zero value must never be written, because it is used to signal uninitialized
            //  writing an actual 0 will result in stale value being read form fallback
            amount = ZERO_PLACEHOLDER; // place holder value to prevent writing 0
        }
        _totalEscrowedAccountBalance[account] = amount;
    }

    function _storeTotalVestedAccountBalance(address account, uint amount) internal {
        if (amount == 0) {
            // zero value must never be written, because it is used to signal uninitialized
            //  writing an actual 0 will result in stale value being read form fallback
            amount = ZERO_PLACEHOLDER; // place holder value to prevent writing 0
        }
        _totalVestedAccountBalance[account] = amount;
    }

    function _storeTotalEscrowedBalance(uint amount) internal {
        // this is just to keep the storage read / write interface clean so that
        // all storage read / write methods can be part of a single mixin / contract and logic
        // is separate. This should allow at the very least fewer bugs if using as a mixin, or easy
        // upgradability if refactoring as a separate contract.
        _totalEscrowedBalance = amount;
    }

    /// append entry for an account
    function _storeVestingEntry(address account, VestingEntries.VestingEntry memory entry) internal returns (uint) {
        uint entryID = nextEntryId;
        // since this is a completely new entry, it's safe to write it directly without checking fallback data
        _vestingSchedules[account][entryID] = StorageEntry({
            endTime: uint32(entry.endTime),
            escrowAmount: uint224(entry.escrowAmount)
        });

        // append entryID to list of entries for account
        _accountVestingEntryIDs[account].push(entryID);

        // Increment the next entry id.
        nextEntryId++;

        return entryID;
    }
}
