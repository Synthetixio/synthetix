pragma solidity >=0.4.24;
pragma experimental ABIEncoderV2;

// interface for vesting entries
import "./IRewardEscrowV2Frozen.sol";

interface IRewardEscrowV2Storage {
    /// Views
    function numVestingEntries(address account) external view returns (uint);

    function totalEscrowedAccountBalance(address account) external view returns (uint);

    function totalVestedAccountBalance(address account) external view returns (uint);

    function totalEscrowedBalance() external view returns (uint);

    function nextEntryId() external view returns (uint);

    function vestingSchedules(address account, uint256 entryId) external view returns (VestingEntries.VestingEntry memory);

    function accountVestingEntryIDs(address account, uint256 index) external view returns (uint);

    /// Mutative
    function cacheFallbackIDCount(address account) external;

    function setEntryZeroAmount(address account, uint entryId) external;

    function setTotalEscrowedAccountBalance(address account, uint amount) external;

    function setTotalVestedAccountBalance(address account, uint amount) external;

    function setTotalEscrowedBalance(uint amount) external;

    function addVestingEntry(address account, VestingEntries.VestingEntry calldata entry) external returns (uint);
}

interface IRewardEscrowV2 {
    // Views
    function balanceOf(address account) external view returns (uint);

    function numVestingEntries(address account) external view returns (uint);

    function totalEscrowedAccountBalance(address account) external view returns (uint);

    function totalVestedAccountBalance(address account) external view returns (uint);

    function nextEntryId() external view returns (uint);

    function vestingSchedules(address account, uint256 entryId) external view returns (VestingEntries.VestingEntry memory);

    function accountVestingEntryIDs(address account, uint256 index) external view returns (uint);

    function getVestingQuantity(address account, uint256[] calldata entryIDs) external view returns (uint);

    function getVestingSchedules(
        address account,
        uint256 index,
        uint256 pageSize
    ) external view returns (VestingEntries.VestingEntryWithID[] memory);

    function getAccountVestingEntryIDs(
        address account,
        uint256 index,
        uint256 pageSize
    ) external view returns (uint256[] memory);

    function getVestingEntryClaimable(address account, uint256 entryID) external view returns (uint);

    function getVestingEntry(address account, uint256 entryID) external view returns (uint64, uint256);

    // Mutative functions
    function vest(uint256[] calldata entryIDs) external;

    function vestFor(address account, uint256[] calldata entryIDs) external;

    function createEscrowEntry(
        address beneficiary,
        uint256 deposit,
        uint256 duration
    ) external;

    function appendVestingEntry(
        address account,
        uint256 quantity,
        uint256 duration
    ) external;

    function migrateVestingSchedule(address _addressToMigrate) external;

    function migrateAccountEscrowBalances(
        address[] calldata accounts,
        uint256[] calldata escrowBalances,
        uint256[] calldata vestedBalances
    ) external;

    // Account Merging
    function startMergingWindow() external;

    function mergeAccount(address from, uint256[] calldata entryIDs) external;

    function nominateAccountToMerge(address account) external;

    function accountMergingIsOpen() external view returns (bool);

    // L2 Migration
    function importVestingEntries(
        address account,
        uint256 escrowedAmount,
        VestingEntries.VestingEntry[] calldata vestingEntries
    ) external;

    // Return amount of SNX transfered to SynthetixBridgeToOptimism deposit contract
    function burnForMigration(address account, uint256[] calldata entryIDs)
        external
        returns (uint256 escrowedAccountBalance, VestingEntries.VestingEntry[] memory vestingEntries);

    // revoke entries for liquidations (access controlled to Synthetix)
    function revokeFrom(
        address account,
        address recipient,
        uint targetAmount,
        uint startIndex
    ) external;
}
