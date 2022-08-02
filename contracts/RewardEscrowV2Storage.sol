pragma solidity ^0.5.16;
pragma experimental ABIEncoderV2;

// interface for vesting entries
import "./RewardEscrowV2Frozen/IRewardEscrowV2Frozen.sol";

// interface
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

    // cheaper storage for L1 compared to original struct, only used for storage
    // original struct still used in interface for backwards compatibility
    struct StorageEntry {
        uint32 endTime;
        uint224 escrowAmount;
    }

    /// INTERNAL storage

    // accounts => vesting entries
    mapping(address => mapping(uint => StorageEntry)) internal _vestingSchedules;

    // accounts => entry ids
    mapping(address => uint[]) internal _accountVestingEntryIds;

    // accounts => cache of entry counts in fallback contract
    // this as an int in order to be able to store ZERO_PLACEHOLDER to only cache once
    mapping(address => int) internal _fallbackCounts;

    // account's total escrow SNX balance (still to vest)
    // this as an int in order to be able to store ZERO_PLACEHOLDER to prevent reading stale values
    mapping(address => int) internal _totalEscrowedAccountBalance;

    // account's total vested rewards (vested already)
    // this as an int in order to be able to store ZERO_PLACEHOLDER to prevent reading stale values
    mapping(address => int) internal _totalVestedAccountBalance;

    // The total remaining escrow balance of contract
    uint internal _totalEscrowedBalance;

    /// PUBLIC storage

    // Counter for new vesting entry ids.
    uint public nextEntryId;

    // id starting from which the new entries are stored in this contact only (and don't need to be read from fallback)
    uint public firstNonFallbackId;

    // -1 wei is a zero value placeholder in the read-through storage.
    // needed to prevent writing zeros and reading stale values (0 is used to mean uninitialized)
    // The alternative of explicit flags introduces its own set problems of ensuring they are written and read
    // correctly (in addition to the values themselves). It adds code complexity, and gas costs, which when optimized
    // lead to added coupling between different variables and even more complexity and potential for mistakenly
    // invalidating or not invalidating the cache.
    int internal constant ZERO_PLACEHOLDER = -1;

    // previous rewards escrow contract
    IRewardEscrowV2Frozen public fallbackRewardEscrow;

    // interface view
    bytes32 public constant CONTRACT_NAME = "RewardEscrowV2Storage";

    /* ========== CONSTRUCTOR ========== */

    constructor(address _owner, address _associatedContract) public Owned(_owner) State(_associatedContract) {}

    /// this can happen only once and assumes that IRewardEscrowV2Frozen is in fact Frozen both in code and in
    /// data(!!) with most mutative methods reverting (e.g. due to blocked transfers)
    function setFallbackRewardEscrow(IRewardEscrowV2Frozen _fallbackRewardEscrow) external onlyOwner {
        require(address(fallbackRewardEscrow) == address(0), "already set");
        require(address(_fallbackRewardEscrow) != address(0), "cannot be zero address");

        fallbackRewardEscrow = _fallbackRewardEscrow;
        nextEntryId = _fallbackRewardEscrow.nextEntryId();
        firstNonFallbackId = nextEntryId;

        // carry over previous balance tracking
        _totalEscrowedBalance = fallbackRewardEscrow.totalEscrowedBalance();
    }

    /* ========== VIEWS ========== */

    function vestingSchedules(address account, uint entryId)
        public
        view
        withFallback
        returns (VestingEntries.VestingEntry memory entry)
    {
        bool needFallback;
        // get local entry, and the flag for reading from fallback
        (entry, needFallback) = _localEntryAndNeedFallback(account, entryId);
        return needFallback ? fallbackRewardEscrow.vestingSchedules(account, entryId) : entry;
    }

    function accountVestingEntryIDs(address account, uint index) public view withFallback returns (uint) {
        uint fallbackCount = _fallbackNumVestingEntries(account);

        // this assumes no new entries can be created in the old contract
        // any added entries in the old contract after this value is cached will be ignored
        if (index < fallbackCount) {
            return fallbackRewardEscrow.accountVestingEntryIDs(account, index);
        } else {
            return _accountVestingEntryIds[account][index - fallbackCount];
        }
    }

    function totalEscrowedBalance() public view withFallback returns (uint) {
        return _totalEscrowedBalance;
    }

    function totalEscrowedAccountBalance(address account) public view withFallback returns (uint) {
        // this as an int in order to be able to store ZERO_PLACEHOLDER which is -1
        int v = _totalEscrowedAccountBalance[account];

        // 0 should never be stored to prevent reading stale value from fallback
        if (v == 0) {
            return fallbackRewardEscrow.totalEscrowedAccountBalance(account);
        } else {
            return uint(_readWithZeroPlaceholder(v));
        }
    }

    function totalVestedAccountBalance(address account) public view withFallback returns (uint) {
        // this as an int in order to be able to store ZERO_PLACEHOLDER which is -1
        int v = _totalVestedAccountBalance[account];

        // 0 should never be stored to prevent reading stale value from fallback
        if (v == 0) {
            return fallbackRewardEscrow.totalVestedAccountBalance(account);
        } else {
            return uint(_readWithZeroPlaceholder(v));
        }
    }

    /// The number of vesting dates in an account's schedule.
    function numVestingEntries(address account) public view withFallback returns (uint) {
        /// assumes no enties can be written in frozen contract
        return _fallbackNumVestingEntries(account) + _accountVestingEntryIds[account].length;
    }

    /// get an array of vesting schedules including their entryIDs
    /// this combines values from both contracts by combining the entryIDs using getAccountVestingEntryIDs
    /// and then using fallback's getVestingSchedules and reading local entries to build the correct array.
    /// the purpose of this method is to be a more gas efficient alternative to getting many entries and their IDs
    /// by requiring caller to make a single external call here, and also making fewer external calls (using only array
    /// based external calls to fallback instead of single entry based calls).
    function getVestingSchedules(
        address account,
        uint startIndex,
        uint pageSize
    ) public view withFallback returns (VestingEntries.VestingEntryWithID[] memory) {
        uint endIndex = startIndex + pageSize;

        // If index starts after the endIndex return no results
        if (endIndex <= startIndex) {
            return new VestingEntries.VestingEntryWithID[](0);
        }

        {
            // If the page extends past the end of the numVestingEntries truncate it.
            uint numEntries = numVestingEntries(account);
            if (endIndex > numEntries) {
                endIndex = numEntries;
            }
        }

        uint n = endIndex - startIndex;
        uint entryID;

        // get the fallback schedules
        // !!! these entries may contain stale data and _localEntryAndNeedFallback is used in the loop to invalidate them
        VestingEntries.VestingEntryWithID[] memory fallBackSchedules =
            fallbackRewardEscrow.getVestingSchedules(account, startIndex, pageSize);

        // results array
        VestingEntries.VestingEntryWithID[] memory vestingEntries = new VestingEntries.VestingEntryWithID[](n);
        // variables used in loop
        VestingEntries.VestingEntry memory entry;

        uint numFallbackEntriesTotal = _fallbackNumVestingEntries(account);
        // the first index of relevant entryID in new contract is either 0 if anything is being read from
        // the old contract, or the startIndex if nothing is being read from the old contract
        uint nonFallbackStartIndex = fallBackSchedules.length > 0 ? 0 : startIndex;
        for (uint i; i < n; i++) {
            // if this is on old contract
            if (i < fallBackSchedules.length) {
                // get the ID from the returned schedules (the IDs cannot be stale, only the amount can)
                entryID = fallBackSchedules[i].entryID;

                // get local entry, and the flag for reading from fallback
                bool needFallback;
                (entry, needFallback) = _localEntryAndNeedFallback(account, entryID);

                // set the return values
                vestingEntries[i].entryID = entryID;
                // take the fallback value if needed, otherwise use the local entry
                if (needFallback) {
                    vestingEntries[i].endTime = fallBackSchedules[i].endTime;
                    vestingEntries[i].escrowAmount = fallBackSchedules[i].escrowAmount;
                } else {
                    vestingEntries[i].endTime = entry.endTime;
                    vestingEntries[i].escrowAmount = entry.escrowAmount;
                }
            } else {
                // otherwise it is in the current contract, so get it directly from storage
                entryID = _accountVestingEntryIds[account][nonFallbackStartIndex + (i - numFallbackEntriesTotal)];

                // get local entry, and the flag for reading from fallback
                (entry, ) = _localEntryAndNeedFallback(account, entryID);

                // set the return values
                vestingEntries[i].entryID = entryID;
                vestingEntries[i].endTime = entry.endTime;
                vestingEntries[i].escrowAmount = entry.escrowAmount;
            }
        }
        return vestingEntries;
    }

    /* ========== INTERNAL VIEWS ========== */

    function _fallbackNumVestingEntries(address account) internal view returns (uint) {
        // cache is used here to prevent external calls during looping
        int v = _fallbackCounts[account];
        if (v == 0) {
            // uninitialized
            return fallbackRewardEscrow.numVestingEntries(account);
        } else {
            return uint(_readWithZeroPlaceholder(v));
        }
    }

    // this is a helper method since this logic is used in two places
    function _localEntryAndNeedFallback(address account, uint entryId)
        internal
        view
        returns (VestingEntries.VestingEntry memory entry, bool needFallback)
    {
        // read stored entry
        StorageEntry memory stored = _vestingSchedules[account][entryId];
        // convert to previous data size format
        entry = VestingEntries.VestingEntry({endTime: stored.endTime, escrowAmount: stored.escrowAmount});
        // fallback read is needed if this entryId was created in the old contract and wasn't written locally
        // this assumes that no new entries can be created with endTime = 0 (checked during addVestingEntry)
        needFallback = entryId < firstNonFallbackId && entry.endTime == 0;
    }

    /* ========== MUTATIVE FUNCTIONS ========== */

    /// zeros out a single entry
    function setZeroAmount(address account, uint entryId) public withFallback onlyAssociatedContract {
        // load storage entry
        StorageEntry storage storedEntry = _vestingSchedules[account][entryId];
        // endTime is used for cache invalidation
        uint endTime = storedEntry.endTime;
        // update endTime from fallback if this is first time this entry is written in this contract
        if (endTime == 0) {
            // entry should be in fallback, otherwise it would have endTime or be uninitialized
            endTime = fallbackRewardEscrow.vestingSchedules(account, entryId).endTime;
        }
        _setZeroAmountWithEndTime(account, entryId, endTime);
    }

    /// zero out multiple entries in order of accountVestingEntryIDs until target is reached (or entries exhausted)
    /// @param account: account
    /// @param startIndex: index into accountVestingEntryIDs to start with. NOT an entryID.
    /// @param targetAmount: amount to try and reach during the iteration, once the amount it reached (and passed)
    ///     the iteration stops
    /// @return total: total sum reached, may different from targetAmount (higher if sum is a bit more), lower
    ///     if target wasn't reached reaching the length of the array
    function setZeroAmountUntilTarget(
        address account,
        uint startIndex,
        uint targetAmount
    )
        external
        withFallback
        onlyAssociatedContract
        returns (
            uint total,
            uint endIndex,
            uint lastEntryTime
        )
    {
        require(targetAmount > 0, "targetAmount is zero");

        // store the count to reduce external calls in accountVestingEntryIDs
        _cacheFallbackIDCount(account);

        uint numIds = numVestingEntries(account);
        require(numIds > 0, "no entries to iterate");
        require(startIndex < numIds, "startIndex too high");

        uint i;
        VestingEntries.VestingEntryWithID[] memory schedules = getVestingSchedules(account, startIndex, numIds - startIndex);
        VestingEntries.VestingEntryWithID memory entry;
        for (i = startIndex; i < numIds; i++) {
            entry = schedules[i - startIndex];

            // skip vested
            if (entry.escrowAmount > 0) {
                total = total.add(entry.escrowAmount);

                // set to zero, endTime is correct because vestingSchedules will use fallback if needed
                _setZeroAmountWithEndTime(account, entry.entryID, entry.endTime);

                if (total >= targetAmount) {
                    break;
                }
            }
        }
        i = i == numIds ? i - 1 : i; // i was incremented one extra time if there was no break
        return (total, i, entry.endTime);
    }

    /// zeros out a single entry in local contract
    function _setZeroAmount(
        address account,
        uint entryId,
        uint endTime
    ) internal {
        // load storage entry
        StorageEntry storage storedEntry = _vestingSchedules[account][entryId];
        // Impossible edge-case: checking that prevTime is not zero (in which case the entry will be
        // read from fallback again). A zero endTime with non-zero amount is not possible in the old contract
        // but it's better to check just for completeness still, and write current timestamp (vestable).
        storedEntry.endTime = uint32(endTime != 0 ? endTime : block.timestamp);
        storedEntry.escrowAmount = 0;
    }

    function updateEscrowAccountBalance(address account, int delta) external withFallback onlyAssociatedContract {
        // add / subtract to previous balance
        int total = int(totalEscrowedAccountBalance(account)).add(delta);
        require(total >= 0, "updateEscrowAccountBalance: balance must be positive");
        // zero value must never be written, because it is used to signal uninitialized
        //  writing an actual 0 will result in stale value being read from fallback
        _totalEscrowedAccountBalance[account] = _writeWithZeroPlaceholder(total);

        // update the global total
        updateTotalEscrowedBalance(delta);
    }

    function updateVestedAccountBalance(address account, int delta) external withFallback onlyAssociatedContract {
        // add / subtract to previous balance
        int total = int(totalVestedAccountBalance(account)).add(delta);
        require(total >= 0, "updateVestedAccountBalance: balance must be positive");
        // zero value must never be written, because it is used to signal uninitialized
        //  writing an actual 0 will result in stale value being read from fallback
        _totalVestedAccountBalance[account] = _writeWithZeroPlaceholder(total);
    }

    /// this method is unused in contracts (because updateEscrowAccountBalance uses it), but it is here
    /// for completeness, in case a fix to one of these values is needed (but not the other)
    function updateTotalEscrowedBalance(int delta) public withFallback onlyAssociatedContract {
        int total = int(totalEscrowedBalance()).add(delta);
        require(total >= 0, "updateTotalEscrowedBalance: balance must be positive");
        _totalEscrowedBalance = uint(total);
    }

    /// append entry for an account
    function addVestingEntry(address account, VestingEntries.VestingEntry calldata entry)
        external
        withFallback
        onlyAssociatedContract
        returns (uint)
    {
        // zero time is used as read-miss flag in this contract
        require(entry.endTime != 0, "vesting target time zero");

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

    /* ========== INTERNAL MUTATIVE ========== */

    /// zeros out a single entry in local contract with provided time while ensuring
    /// that endTime is not being stored as zero if it passed as zero
    function _setZeroAmountWithEndTime(
        address account,
        uint entryId,
        uint endTime
    ) internal {
        // load storage entry
        StorageEntry storage storedEntry = _vestingSchedules[account][entryId];
        // Impossible edge-case: checking that endTime is not zero (in which case the entry will be
        // read from fallback again). A zero endTime with non-zero amount is not possible in the old contract
        // but it's better to check just for completeness still, and write current timestamp (vestable).
        storedEntry.endTime = uint32(endTime != 0 ? endTime : block.timestamp);
        storedEntry.escrowAmount = 0;
    }

    /// this caching is done to prevent repeatedly calling the old contract for number of entries
    /// during looping
    function _cacheFallbackIDCount(address account) internal {
        int fallbackCount = _fallbackCounts[account];
        if (fallbackCount == 0) {
            fallbackCount = int(fallbackRewardEscrow.numVestingEntries(account));
            // cache the value but don't write zero
            _fallbackCounts[account] = _writeWithZeroPlaceholder(fallbackCount);
        }
    }

    /* ========== HELPER ========== */

    function _writeWithZeroPlaceholder(int v) internal pure returns (int) {
        // 0 is uninitialized value, so a special value is used to store an actual 0 (that is initialized)
        return v == 0 ? ZERO_PLACEHOLDER : v;
    }

    function _readWithZeroPlaceholder(int v) internal pure returns (int) {
        // 0 is uninitialized value, so a special value is used to store an actual 0 (that is initialized)
        return v == ZERO_PLACEHOLDER ? 0 : v;
    }

    /* ========== Modifier ========== */

    modifier withFallback() {
        require(address(fallbackRewardEscrow) != address(0), "fallback not set");
        _;
    }
}
