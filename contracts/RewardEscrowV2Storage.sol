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
        bool initialized; // stores whether the entry was initialized in this contract or should be read from fallback
        uint32 endTime;
        uint216 escrowAmount;
    }

    // accounts => vesting entrees
    mapping(address => mapping(uint => StorageEntry)) internal _vestingSchedules;

    // accounts => entry ids
    mapping(address => uint[]) internal _accountVestingEntryIds;

    // An account's total escrow SNX balance (still to vest)
    mapping(address => uint) internal _totalEscrowedAccountBalance;

    // An account's total vested rewards (vested already)
    mapping(address => uint) internal _totalVestedAccountBalance;

    // The total remaining escrow balance of contract
    uint internal _totalEscrowedBalance;

    // Counter for new vesting entry ids.
    uint public nextEntryId;

    // accounts => cached stats from previous contract
    mapping(address => bool) internal _fallbackStatsCached;

    // accounts => cached numEntries from previous contract
    mapping(address => uint) internal _fallbackNumEntriesCache;

    // previous rewards escrow contract
    IRewardEscrowV2Frozen public fallbackRewardEscrow;

    // id starting from which the new entries are stored in this contact only
    // this is a precaution against a case in which somehow entries are added in the frozen contract
    uint public firstNonFallbackId;

    // interface view
    bytes32 public constant CONTRACT_NAME = "RewardEscrowV2Storage";

    /* ========== Modifier ========== */

    modifier withFallback() {
        require(address(fallbackRewardEscrow) != address(0), "not initialized");
        _;
    }

    modifier withCached(address account) {
        _cacheFallbackAccountStats(account);
        _;
    }

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
        returns (VestingEntries.VestingEntry memory)
    {
        // read stored entry
        StorageEntry memory stored = _vestingSchedules[account][entryId];
        // return new if initialized, otherwise read from fallback
        // fallbackId is used to prevent reading from old contract in case it was mutated (despite the assumption
        // that its mutations are going to be disabled)
        if (stored.initialized || entryId >= firstNonFallbackId) {
            // convert to previous data size format
            return VestingEntries.VestingEntry({endTime: stored.endTime, escrowAmount: stored.escrowAmount});
        } else {
            return fallbackRewardEscrow.vestingSchedules(account, entryId);
        }
    }

    function accountVestingEntryIDs(address account, uint index) public view withFallback returns (uint) {
        uint fallbackNumEntries = _fallbackNumEntries(account);
        // this assumes no new entries can be created in the old contract
        if (index < fallbackNumEntries) {
            return fallbackRewardEscrow.accountVestingEntryIDs(account, index);
        } else {
            return _accountVestingEntryIds[account][index - fallbackNumEntries];
        }
    }

    function totalEscrowedBalance() public view returns (uint) {
        return _totalEscrowedBalance;
    }

    function totalEscrowedAccountBalance(address account) public view withFallback returns (uint) {
        return
            _fallbackStatsCached[account]
                ? _totalEscrowedAccountBalance[account]
                : fallbackRewardEscrow.totalEscrowedAccountBalance(account);
    }

    function totalVestedAccountBalance(address account) public view withFallback returns (uint) {
        return
            _fallbackStatsCached[account]
                ? _totalVestedAccountBalance[account]
                : fallbackRewardEscrow.totalVestedAccountBalance(account);
    }

    /// The number of vesting dates in an account's schedule.
    function numVestingEntries(address account) public view withFallback returns (uint) {
        /// assumes no enties can be written in frozen contract
        return _fallbackNumEntries(account) + _accountVestingEntryIds[account].length;
    }

    /* ========== INTERNAL VIEWS ========== */

    function _fallbackNumEntries(address account) internal view returns (uint) {
        return
            _fallbackStatsCached[account]
                ? _fallbackNumEntriesCache[account]
                : fallbackRewardEscrow.numVestingEntries(account);
    }

    /* ========== MUTATIVE FUNCTIONS ========== */

    /// zeros out a single entry
    /// note withCached(account) is not needed here since it operates on a specific entry, and non aggregate
    /// views are used
    function setZeroAmount(address account, uint entryId) public withFallback onlyAssociatedContract {
        // load storage entry
        StorageEntry storage stored = _vestingSchedules[account][entryId];
        if (stored.initialized == false) {
            // update endTime from fallback if this is first time this entry is written in this contract
            stored.endTime = uint32(fallbackRewardEscrow.vestingSchedules(account, entryId).endTime);
        }
        stored.initialized = true;
        stored.escrowAmount = 0;
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
        withCached(account)
        returns (
            uint total,
            uint endIndex,
            uint lastEntryTime
        )
    {
        require(targetAmount > 0, "targetAmount is zero");

        uint numIds = numVestingEntries(account);
        require(numIds > 0, "no entries to iterate");
        require(startIndex < numIds, "startIndex too high");

        uint entryID;
        uint i;
        VestingEntries.VestingEntry memory entry;
        for (i = startIndex; i < numIds; i++) {
            entryID = accountVestingEntryIDs(account, i);
            entry = vestingSchedules(account, entryID);

            // skip vested
            if (entry.escrowAmount > 0) {
                total = total.add(entry.escrowAmount);

                // set to zero
                setZeroAmount(account, entryID);

                if (total >= targetAmount) {
                    break;
                }
            }
        }
        i = i == numIds ? i - 1 : i; // i was incremented one extra time if there was no break
        return (total, i, entry.endTime);
    }

    function updateEscrowAccountBalance(address account, int delta)
        external
        withFallback
        onlyAssociatedContract
        withCached(account)
    {
        // add / subtract to previous balance
        int total = int(totalEscrowedAccountBalance(account)).add(delta);
        require(total >= 0, "updateEscrowAccountBalance: balance must be positive");
        _totalEscrowedAccountBalance[account] = uint(total);
        // update the global total
        updateTotalEscrowedBalance(delta);
    }

    function updateVestedAccountBalance(address account, int delta)
        external
        withFallback
        onlyAssociatedContract
        withCached(account)
    {
        // add / subtract to previous balance
        int total = int(totalVestedAccountBalance(account)).add(delta);
        require(total >= 0, "updateVestedAccountBalance: balance must be positive");
        _totalVestedAccountBalance[account] = uint(total);
    }

    /// this method is unused in contracts (because updateEscrowAccountBalance uses it), but it is here
    /// for completeness, in case a fix to one of these values is needed (but not the other)
    function updateTotalEscrowedBalance(int delta) public withFallback onlyAssociatedContract {
        int total = int(totalEscrowedBalance()).add(delta);
        require(total >= 0, "updateTotalEscrowedBalance: balance must be positive");
        _totalEscrowedBalance = uint(total);
    }

    /// Append entry for an account
    /// This doesn't need withCached(account) since it operates on a single entry
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
            initialized: true,
            endTime: uint32(entry.endTime),
            escrowAmount: uint216(entry.escrowAmount)
        });

        // append entryId to list of entries for account
        _accountVestingEntryIds[account].push(entryId);

        // Increment the next entry id.
        nextEntryId++;

        return entryId;
    }

    /* ========== INTERNAL MUTATIVE ========== */

    // cache the stats of the account from previous contract
    function _cacheFallbackAccountStats(address account) internal {
        if (!_fallbackStatsCached[account]) {
            _fallbackStatsCached[account] = true;
            _fallbackNumEntriesCache[account] = fallbackRewardEscrow.numVestingEntries(account);
            _totalEscrowedAccountBalance[account] = fallbackRewardEscrow.totalEscrowedAccountBalance(account);
            _totalVestedAccountBalance[account] = fallbackRewardEscrow.totalVestedAccountBalance(account);
        }
    }
}
