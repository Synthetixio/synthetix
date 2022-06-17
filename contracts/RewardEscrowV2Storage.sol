pragma solidity ^0.5.16;
pragma experimental ABIEncoderV2;

// interface for vesting entries
import "./interfaces/IRewardEscrowV2.sol";

// libraries
import "./SignedSafeMath.sol";
import "openzeppelin-solidity-2.3.0/contracts/math/SafeMath.sol";

// inheritance
import "./State.sol";

/// A contract for reading and writing to/from storage while falling back to values from
/// previous RewardEscrowV2 contract.
contract RewardEscrowV2Storage is IRewardEscrowV2Storage, State {
    using SafeMath for uint;
    using SignedSafeMath for int;

    // cheaper storage for L1
    struct StorageEntry {
        uint32 endTime;
        uint224 escrowAmount;
    }

    mapping(address => mapping(uint => StorageEntry)) internal _vestingSchedules;

    mapping(address => uint[]) internal _accountVestingEntryIds;

    mapping(address => uint) internal _fallbackCounts;

    /*Counter for new vesting entry ids. */
    uint public nextEntryId;

    /* An account's total escrowed synthetix balance to save recomputing this for fee extraction purposes. */
    mapping(address => int) internal _totalEscrowedAccountBalance;

    /* An account's total vested reward synthetix. */
    mapping(address => int) internal _totalVestedAccountBalance;

    /* The total remaining escrowed balance, for verifying the actual synthetix balance of this contract against. */
    uint internal _totalEscrowedBalance;

    // id starting from which the new entries are stored in this contact only (and don't need to be read from fallback)
    uint public fallbackId;

    // -1 wei is a zero value placeholder in the read-through storage.
    // needed to prevent writing zeros and reading stale values (0 is used to mean uninitialized)
    int internal constant ZERO_PLACEHOLDER = -1;

    IRewardEscrowV2Frozen public fallbackRewardEscrow;

    bytes32 public constant CONTRACT_NAME = "RewardEscrowV2Storage";

    /* ========== CONSTRUCTOR ========== */

    /// this assumes that IRewardEscrowV2Frozen is in fact Frozen both in code and in data(!!) with all
    /// mutative methods reverting (e.g. due to blocked transfers)
    constructor(
        address _owner,
        address _associatedContract,
        IRewardEscrowV2Frozen _previousEscrow
    ) public Owned(_owner) State(_associatedContract) {
        fallbackRewardEscrow = _previousEscrow;
        nextEntryId = _previousEscrow.nextEntryId();
        fallbackId = nextEntryId;

        // carry over previous balance tracking
        _totalEscrowedBalance = fallbackRewardEscrow.totalEscrowedBalance();
    }

    /* ========== VIEWS ========== */

    function vestingSchedules(address account, uint entryId) public view returns (VestingEntries.VestingEntry memory entry) {
        // read stored entry
        StorageEntry memory stored = _vestingSchedules[account][entryId];
        entry = VestingEntries.VestingEntry({endTime: stored.endTime, escrowAmount: stored.escrowAmount});
        // read from fallback if this entryId was created in the old contract and wasn't written locally
        // this assumes that no new entries can be created with endTime = 0 (kinda defeats the purpose of vesting)
        if (entryId < fallbackId && entry.endTime == 0) {
            entry = fallbackRewardEscrow.vestingSchedules(account, entryId);
        }
        return entry;
    }

    function accountVestingEntryIDs(address account, uint index) public view returns (uint) {
        uint fallbackCount = _fallbackCounts[account];
        if (fallbackCount == 0) {
            // uninitialized
            fallbackCount = fallbackRewardEscrow.numVestingEntries(account);
        }

        // this assumes no new entries can be created in the old contract
        if (index < fallbackCount) {
            return fallbackRewardEscrow.accountVestingEntryIDs(account, index);
        } else {
            return _accountVestingEntryIds[account][index - fallbackCount];
        }
    }

    function totalEscrowedBalance() public view returns (uint) {
        // this method is just to prevent direct access to storage from logic methods
        // to reduce bugs (and maybe allow refactoring into separate storage contract)
        return _totalEscrowedBalance;
    }

    function totalEscrowedAccountBalance(address account) public view returns (uint) {
        // this as an int in order to be able to store ZERO_PLACEHOLDER which is -1
        int v = _totalEscrowedAccountBalance[account];

        // 0 should never be stored to prevent reading stale value from fallback
        if (v == 0) {
            return fallbackRewardEscrow.totalEscrowedAccountBalance(account);
        } else {
            return v == ZERO_PLACEHOLDER ? 0 : uint(v);
        }
    }

    function totalVestedAccountBalance(address account) public view returns (uint) {
        // this as an int in order to be able to store ZERO_PLACEHOLDER which is -1
        int v = _totalVestedAccountBalance[account];

        // 0 should never be stored to prevent reading stale value from fallback
        if (v == 0) {
            return fallbackRewardEscrow.totalVestedAccountBalance(account);
        } else {
            return v == ZERO_PLACEHOLDER ? 0 : uint(v);
        }
    }

    /// The number of vesting dates in an account's schedule.
    function numVestingEntries(address account) public view returns (uint) {
        /// assumes no enties can be written in frozen contract
        return fallbackRewardEscrow.numVestingEntries(account) + _accountVestingEntryIds[account].length;
    }

    /* ========== MUTATIVE FUNCTIONS ========== */

    /// zeros out a single entry
    function setEntryZeroAmount(address account, uint entryId) public onlyAssociatedContract {
        // load storage entry
        StorageEntry storage storedEntry = _vestingSchedules[account][entryId];
        // update endTime from fallback if this is first time this entry is written in this contract
        if (storedEntry.endTime == 0) {
            // entry should be in fallback, otherwise it would have endTime or be uninitialized
            storedEntry.endTime = uint32(fallbackRewardEscrow.vestingSchedules(account, entryId).endTime);
            // storedEntry.escrowAmount is already 0, since it's uninitialized
        } else {
            storedEntry.escrowAmount = 0;
        }
    }

    /// zero out multiple entries in order until target is reached (or entries exhausted)
    function setZerosUntilTarget(
        address account,
        uint startIndex,
        uint targetAmount
    )
        external
        onlyAssociatedContract
        returns (
            uint total,
            uint endIndex,
            uint lastEntryTime
        )
    {
        require(targetAmount > 0, "targetAmount is zero");

        uint numIds = numVestingEntries(account);
        require(startIndex < numIds, "startIndex too high");

        uint total;
        uint entryID;
        uint i;
        VestingEntries.VestingEntry memory entry;
        // store the count to reduce external calls in accountVestingEntryIDs
        _cacheFallbackIDCount(account);
        for (i = startIndex; i < numIds; i++) {
            entryID = accountVestingEntryIDs(account, i);
            entry = vestingSchedules(account, entryID);

            // skip vested
            if (entry.escrowAmount > 0) {
                total = total.add(entry.escrowAmount);

                // set to zero
                setEntryZeroAmount(account, entryID);

                if (total >= targetAmount) {
                    break;
                }
            }
        }
        return (total, i, entry.endTime);
    }

    function updateEscrowAccountBalance(address account, int delta) external onlyAssociatedContract {
        // add / subtract to previous balance
        int total = int(totalEscrowedAccountBalance(account)).add(delta);
        require(total >= 0, "balance must be positive");
        if (total == 0) {
            // zero value must never be written, because it is used to signal uninitialized
            // writing an actual 0 will result in stale value being read form fallback
            _totalEscrowedAccountBalance[account] = ZERO_PLACEHOLDER; // place holder value to prevent writing 0
        } else {
            _totalEscrowedAccountBalance[account] = total;
        }

        // update the global total
        updateTotalEscrowedBalance(delta);
    }

    function updateVestedAccountBalance(address account, int delta) external onlyAssociatedContract {
        // add / subtract to previous balance
        int total = int(totalVestedAccountBalance(account)).add(delta);
        require(total >= 0, "balance must be positive");
        if (total == 0) {
            // zero value must never be written, because it is used to signal uninitialized
            //  writing an actual 0 will result in stale value being read form fallback
            _totalVestedAccountBalance[account] = ZERO_PLACEHOLDER; // place holder value to prevent writing 0
        } else {
            _totalVestedAccountBalance[account] = total;
        }
    }

    function updateTotalEscrowedBalance(int delta) public onlyAssociatedContract {
        // this is just to keep the storage read / write interface clean so that
        // all storage read / write methods can be part of a single mixin / contract and logic
        // is separate. This should allow at the very least fewer bugs if using as a mixin, or easy
        // upgradability if refactoring as a separate contract.
        int total = int(totalEscrowedBalance()).add(delta);
        require(total >= 0, "balance must be positive");
        _totalEscrowedBalance = uint(total);
    }

    /// append entry for an account
    function addVestingEntry(address account, VestingEntries.VestingEntry calldata entry)
        external
        onlyAssociatedContract
        returns (uint)
    {
        uint entryId = nextEntryId;
        // since this is a completely new entry, it's safe to write it directly without checking fallback data
        _vestingSchedules[account][entryId] = StorageEntry({
            endTime: uint32(entry.endTime),
            escrowAmount: uint224(entry.escrowAmount)
        });

        // append entryId to list of entries for account
        _accountVestingEntryIds[account].push(entryId);

        // Increment the next entry id.
        nextEntryId++;

        return entryId;
    }

    /* ========== INTERNAL ========== */

    function _cacheFallbackIDCount(address account) internal {
        uint fallbackCount = _fallbackCounts[account];
        if (fallbackCount == 0) {
            fallbackCount = fallbackRewardEscrow.numVestingEntries(account);
            // store to reduce calls in accountVestingEntryIDs
            _fallbackCounts[account] = fallbackCount;
        }
    }
}
