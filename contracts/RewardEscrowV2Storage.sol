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

    // cheaper storage for L1
    struct StorageEntry {
        uint32 endTime;
        uint224 escrowAmount;
    }

    // Storage of zeroed out storage ranges that allows bypassing writing and reading from
    // stored individual entries.
    // This can be done if entryIds for each account are monotonically increasing, so if a zeroed out range is stored
    // subsequent reads from this range can be short-circuited using this data.
    // Entry IDs in THIS contract are guaranteed to be monotonically increasing (due to only being appended)
    // Entry IDS is the FALLBACK contract are in some cases non-monotonic, so a check for this property is
    // performed and its result is also stored in this struct.
    struct ZerosRange {
        bool fallbackMonotonicChecked;
        bool fallbackMonotonic;
        uint32 endIndexFallback;
        uint32 endIdFallback;
        uint64 endIndex; // leave more room for indices of new contract
        uint64 endId; // leave more room for ids of new contract
    }

    // per account short-circuit zero-ranges structs
    mapping(address => ZerosRange) internal _zerosRanges;

    // accounts => vesting entrees
    mapping(address => mapping(uint => StorageEntry)) internal _vestingSchedules;

    // accounts => entry ids
    mapping(address => uint[]) internal _accountVestingEntryIds;

    // accounts => cache of entry counts in fallback contract
    mapping(address => int) internal _fallbackCounts;

    // Counter for new vesting entry ids.
    uint public nextEntryId;

    // An account's total escrow synthetix balance (still to vest)
    // this as an int in order to be able to store ZERO_PLACEHOLDER
    mapping(address => int) internal _totalEscrowedAccountBalance;

    // An account's total vested rewards (vested already)
    // this as an int in order to be able to store ZERO_PLACEHOLDER
    mapping(address => int) internal _totalVestedAccountBalance;

    // The total remaining escrow balance of contract
    uint internal _totalEscrowedBalance;

    // id starting from which the new entries are stored in this contact only (and don't need to be read from fallback)
    uint public fallbackId;

    // -1 wei is a zero value placeholder in the read-through storage.
    // needed to prevent writing zeros and reading stale values (0 is used to mean uninitialized)
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
        fallbackId = nextEntryId;

        // carry over previous balance tracking
        _totalEscrowedBalance = fallbackRewardEscrow.totalEscrowedBalance();
    }

    /* ========== VIEWS ========== */

    /// read the entries without applying the ZerosRange short-circuit override
    /// this is public as a precaution in case of a bug in the short-circuit logic (in case using this
    /// can help mitigate such an issue in the upgradable calling contract)
    function vestingSchedulesNoShortCircuit(address account, uint entryId)
        public
        view
        initialized
        returns (VestingEntries.VestingEntry memory entry)
    {
        // read stored entry
        StorageEntry memory stored = _vestingSchedules[account][entryId];
        // convert to previous data size format
        entry = VestingEntries.VestingEntry({endTime: stored.endTime, escrowAmount: stored.escrowAmount});
        // read from fallback if this entryId was created in the old contract and wasn't written locally
        // this assumes that no new entries can be created with endTime = 0 (kinda defeats the purpose of vesting)
        if (entryId < fallbackId && entry.endTime == 0) {
            entry = fallbackRewardEscrow.vestingSchedules(account, entryId);
        }
        return entry;
    }

    function vestingSchedules(address account, uint entryId) public view returns (VestingEntries.VestingEntry memory entry) {
        // read the entry (this is needed even if short-circuit is applied to return the correct endTime)
        entry = vestingSchedulesNoShortCircuit(account, entryId);

        // check zeros range short-circuit
        ZerosRange memory zeroRange = _zerosRanges[account];

        if (_entryInZeroRange(entryId, zeroRange, fallbackId)) {
            entry.escrowAmount = 0;
        }
        return entry;
    }

    function accountVestingEntryIDs(address account, uint index) public view initialized returns (uint) {
        uint fallbackCount = _fallbackNumVestingEntries(account);

        // this assumes no new entries can be created in the old contract
        if (index < fallbackCount) {
            return fallbackRewardEscrow.accountVestingEntryIDs(account, index);
        } else {
            return _accountVestingEntryIds[account][index - fallbackCount];
        }
    }

    function totalEscrowedBalance() public view returns (uint) {
        return _totalEscrowedBalance;
    }

    function totalEscrowedAccountBalance(address account) public view initialized returns (uint) {
        // this as an int in order to be able to store ZERO_PLACEHOLDER which is -1
        int v = _totalEscrowedAccountBalance[account];

        // 0 should never be stored to prevent reading stale value from fallback
        if (v == 0) {
            return fallbackRewardEscrow.totalEscrowedAccountBalance(account);
        } else {
            return v == ZERO_PLACEHOLDER ? 0 : uint(v);
        }
    }

    function totalVestedAccountBalance(address account) public view initialized returns (uint) {
        // this as an int in order to be able to store ZERO_PLACEHOLDER which is -1
        int v = _totalVestedAccountBalance[account];

        // 0 should never be stored to prevent reading stale value from fallback
        if (v == 0) {
            return fallbackRewardEscrow.totalVestedAccountBalance(account);
        } else {
            return v == ZERO_PLACEHOLDER ? 0 : uint(v);
        }
    }

    function getAccountVestingEntryIDs(
        address account,
        uint startIndex,
        uint pageSize
    ) public view initialized returns (uint[] memory) {
        uint endIndex = startIndex + pageSize;

        // If the page extends past the end of the accountVestingEntryIDs, truncate it.
        uint numEntries = numVestingEntries(account);
        if (endIndex > numEntries) {
            endIndex = numEntries;
        }
        if (endIndex <= startIndex) {
            return new uint[](0);
        }

        uint[] memory fallbackEntries;
        uint[] memory nonFallbackEntries;
        uint numFallbackEntries = _fallbackNumVestingEntries(account);
        if (startIndex < numFallbackEntries) {
            // get the entryIds from fallback with startIndex
            fallbackEntries = fallbackRewardEscrow.getAccountVestingEntryIDs(account, startIndex, pageSize);
            // get the entryIds from this contract from the start
            nonFallbackEntries = getAccountVestingEntryIDsNoFallback(account, 0, pageSize);
        } else {
            fallbackEntries = new uint[](0);
            uint startIndexNoFallback = startIndex.sub(numFallbackEntries);
            // get the entriIds from this contract with correct offset
            nonFallbackEntries = getAccountVestingEntryIDsNoFallback(account, startIndexNoFallback, pageSize);
        }

        // combine arrays
        uint n = fallbackEntries.length + nonFallbackEntries.length;
        uint[] memory page = new uint[](n);
        for (uint i; i < n; i++) {
            if (i < fallbackEntries.length) {
                page[i] = fallbackEntries[i];
            } else {
                page[i] = nonFallbackEntries[i - fallbackEntries.length];
            }
        }
        return page;
    }

    /// The number of vesting dates in an account's schedule.
    function numVestingEntries(address account) public view initialized returns (uint) {
        /// assumes no enties can be written in frozen contract
        return _fallbackNumVestingEntries(account) + _accountVestingEntryIds[account].length;
    }

    /* ========== INTERNAL VIEWS ========== */

    function _entryInZeroRange(
        uint entryId,
        ZerosRange memory zeroRange,
        uint _fallbackId
    ) internal pure returns (bool) {
        // within this contract's range + within zeroed range
        bool inZeroRangeThisContract = (entryId >= _fallbackId && entryId <= zeroRange.endId);
        // within fallback range + within fallback zeroed range + fallback ids are monotonic (redundant)
        bool inZeroRangeFallback =
            (entryId < _fallbackId && zeroRange.fallbackMonotonic && entryId <= zeroRange.endIdFallback);
        return (inZeroRangeThisContract || inZeroRangeFallback);
    }

    function _fallbackNumVestingEntries(address account) internal view returns (uint) {
        // cache is used here to prevent external calls during looping
        int v = _fallbackCounts[account];
        if (v == 0) {
            // uninitialized
            return fallbackRewardEscrow.numVestingEntries(account);
        } else {
            return v == ZERO_PLACEHOLDER ? 0 : uint(v);
        }
    }

    /// ids in accountVestingEntryIds should be monotonic unless they were merged
    /// this check is useful if revoking a large amount of entries - so that storing a whole
    /// range as zeroed can be done to save gas
    function _fallbackIdsMonotonic(address account) internal view returns (bool) {
        uint numIds = _fallbackNumVestingEntries(account);
        if (numIds <= 1) {
            return true; // a single ID is monotonic
        }
        uint[] memory entryIds = fallbackRewardEscrow.getAccountVestingEntryIDs(account, 0, numIds);
        // start from second id
        for (uint i = 1; i < numIds; i++) {
            if (entryIds[i] < entryIds[i - 1]) {
                return false;
            }
        }
        return true;
    }

    function getAccountVestingEntryIDsNoFallback(
        address account,
        uint index,
        uint pageSize
    ) internal view returns (uint[] memory) {
        uint endIndex = index + pageSize;

        // If the page extends past the end of the accountVestingEntryIDs, truncate it.
        uint numEntries = _accountVestingEntryIds[account].length;
        if (endIndex > numEntries) {
            endIndex = numEntries;
        }
        if (endIndex <= index) {
            return new uint[](0);
        }

        uint n = endIndex - index;
        uint[] memory page = new uint[](n);
        for (uint i; i < n; i++) {
            page[i] = _accountVestingEntryIds[account][i + index];
        }
        return page;
    }

    /* ========== MUTATIVE FUNCTIONS ========== */

    /// zeros out a single entry in storage
    function setZeroAmount(address account, uint entryId) public initialized onlyAssociatedContract {
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

    /// zero out multiple entries in order of accountVestingEntryIDs until target is reached (or entries exhausted)
    /// @param account: account
    /// @param targetAmount: amount to try and reach during the iteration, once the amount it reached (and passed)
    ///     the iteration stops
    /// @return total: total sum reached, may different from targetAmount (higher if sum is a bit more), lower
    ///     if target wasn't reached reaching the length of the array
    function setZeroAmountUntilTarget(address account, uint targetAmount)
        external
        initialized
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
        uint numIdsFallback = _fallbackNumVestingEntries(account);
        require(numIds > 0, "no entries to iterate");

        // load zeros-range storage data
        ZerosRange memory zeroRange = _zerosRanges[account];

        // start from non zeroed entries or 0
        uint startIndex = zeroRange.endIndex > zeroRange.endIndexFallback ? zeroRange.endIndex : zeroRange.endIndexFallback;

        // scan and zero out fallback range if starting in its range
        if (startIndex < numIdsFallback) {
            (total, endIndex, lastEntryTime) = _fallbackSetZeroAmountUntilTarget(
                account,
                targetAmount,
                startIndex,
                numIdsFallback.sub(1) // entry to parent if block ensures it's not zero
            );
        }

        // scan new (non-fallback) range if target not reached and there are non-fallback entries
        if (total < targetAmount && numIds > numIdsFallback) {
            // fallback wasn't enough, we need to find the endIndex in new entries
            uint totalZeroedNonFallback;
            (totalZeroedNonFallback, endIndex, lastEntryTime) = _nonFallbackSetZeroAmountUntilTarget(
                account,
                targetAmount.sub(total), // only the remaining sum
                numIdsFallback, // start from entries in this contract
                numIds.sub(1) // will be at least one due to if
            );
            // update total
            total = total.add(totalZeroedNonFallback);
        }

        return (total, endIndex, lastEntryTime);
    }

    function updateEscrowAccountBalance(address account, int delta) external initialized onlyAssociatedContract {
        // add / subtract to previous balance
        int total = int(totalEscrowedAccountBalance(account)).add(delta);
        require(total >= 0, "updateEscrowAccountBalance: balance must be positive");
        if (total == 0) {
            // zero value must never be written, because it is used to signal uninitialized
            // writing an actual 0 will result in stale value being read from fallback
            _totalEscrowedAccountBalance[account] = ZERO_PLACEHOLDER; // place holder value to prevent writing 0
        } else {
            _totalEscrowedAccountBalance[account] = total;
        }

        // update the global total
        updateTotalEscrowedBalance(delta);
    }

    function updateVestedAccountBalance(address account, int delta) external initialized onlyAssociatedContract {
        // add / subtract to previous balance
        int total = int(totalVestedAccountBalance(account)).add(delta);
        require(total >= 0, "updateVestedAccountBalance: balance must be positive");
        if (total == 0) {
            // zero value must never be written, because it is used to signal uninitialized
            //  writing an actual 0 will result in stale value being read from fallback
            _totalVestedAccountBalance[account] = ZERO_PLACEHOLDER; // place holder value to prevent writing 0
        } else {
            _totalVestedAccountBalance[account] = total;
        }
    }

    /// this method is unused in contracts (because updateEscrowAccountBalance uses it), but it is here
    /// for completeness, in case a fix to one of these values is needed (but not the other)
    function updateTotalEscrowedBalance(int delta) public initialized onlyAssociatedContract {
        int total = int(totalEscrowedBalance()).add(delta);
        require(total >= 0, "updateTotalEscrowedBalance: balance must be positive");
        _totalEscrowedBalance = uint(total);
    }

    /// append entry for an account
    function addVestingEntry(address account, VestingEntries.VestingEntry calldata entry)
        external
        initialized
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

    /* ========== INTERNAL ========== */

    function _cacheFallbackIDCount(address account) internal {
        int fallbackCount = _fallbackCounts[account];
        if (fallbackCount == 0) {
            fallbackCount = int(fallbackRewardEscrow.numVestingEntries(account));
            // cache the value but don't write zero
            if (fallbackCount == 0) {
                // zero value should not be written, because it is used to signal uninitialized
                // writing an actual 0 will result repeatedly querying fallback
                _fallbackCounts[account] = ZERO_PLACEHOLDER; // place holder value to prevent writing 0
            } else {
                _fallbackCounts[account] = fallbackCount; // finite and small so doesn't require SafeCast
            }
        }
    }

    /// sets zeros either efficiently (using ZeroRange) or non efficiently (per entry) for the fallback entries
    function _fallbackSetZeroAmountUntilTarget(
        address account,
        uint targetAmount,
        uint startIndex,
        uint maxIndex
    )
        internal
        returns (
            uint total,
            uint endIndex,
            uint lastEntryTime
        )
    {
        // load zeros-range storage data
        ZerosRange storage zeroRange = _zerosRanges[account];

        // check if we can be efficient here if not checked previously for this account
        if (!zeroRange.fallbackMonotonicChecked) {
            // check and record result
            zeroRange.fallbackMonotonic = _fallbackIdsMonotonic(account);
            // store the fact we checked this already for next time
            zeroRange.fallbackMonotonicChecked = true;
        }

        if (zeroRange.fallbackMonotonic) {
            uint lastEntryId;
            // store the short-circuit limits indeces and entryIds
            (total, endIndex, lastEntryTime, lastEntryId) = _scanSumAndZero(
                account,
                targetAmount,
                startIndex,
                maxIndex,
                false // don't store individually, we're in efficient mode
            );
            zeroRange.endIndexFallback = uint32(endIndex);
            zeroRange.endIdFallback = uint32(lastEntryId);
        } else {
            // store the zeros individually if fallback is NOT monotonic
            (total, endIndex, lastEntryTime, ) = _scanSumAndZero(
                account,
                targetAmount,
                startIndex,
                maxIndex,
                true // store individually
            );
        }
        return (total, endIndex, lastEntryTime);
    }

    /// sets zeros efficiently (using ZeroRange) for the entries in this contract
    function _nonFallbackSetZeroAmountUntilTarget(
        address account,
        uint targetAmount,
        uint startIndex,
        uint maxIndex
    )
        internal
        returns (
            uint total,
            uint endIndex,
            uint lastEntryTime
        )
    {
        // load zeros-range storage data
        ZerosRange storage zeroRange = _zerosRanges[account];

        uint lastEntryId;
        (total, endIndex, lastEntryTime, lastEntryId) = _scanSumAndZero(
            account,
            targetAmount, // we got part from fallback entries
            startIndex, // start from current contract's ids
            maxIndex,
            false // no need to store the zeros
        );
        // update to latest endIndex
        zeroRange.endIndex = uint64(endIndex);
        zeroRange.endId = uint64(lastEntryId);
        return (total, endIndex, lastEntryTime);
    }

    /// utility function to scan and sum entries for an account in order to set them to zero
    /// either in storage, or without setting them to zero in storage (and using the ZeroRange short-circuit data)
    function _scanSumAndZero(
        address account,
        uint targetAmount,
        uint startIndex,
        uint maxIndex,
        bool storeAmount
    )
        internal
        returns (
            uint total,
            uint endIndex,
            uint lastEntryId,
            uint lastEntryTime
        )
    {
        VestingEntries.VestingEntry memory entry;
        uint i;
        uint entryID;
        uint[] memory entryIds = getAccountVestingEntryIDs(account, startIndex, maxIndex - startIndex + 1);
        for (i = startIndex; i <= maxIndex; i++) {
            entryID = entryIds[i - startIndex];

            // if we're looping over the entries, means that they fall out of zeros range
            // checking ZeroRange for these entries can be skipped to save gas
            entry = vestingSchedulesNoShortCircuit(account, entryID);

            // skip vested
            if (entry.escrowAmount > 0) {
                // add to total
                total = total.add(entry.escrowAmount);

                // set to zero ONLY if store flag is true (otherwise the caller is using the short-circuit storage)
                if (storeAmount) {
                    setZeroAmount(account, entryID);
                }

                if (total >= targetAmount) {
                    // exit the loop
                    break;
                }
            }
        }
        i = i <= maxIndex ? i : maxIndex; // i was incremented one extra time if there was no break
        return (total, i, entry.endTime, entryID);
    }

    /* ========== Modifier ========== */

    modifier initialized() {
        require(address(fallbackRewardEscrow) != address(0), "not initialized");
        _;
    }
}
