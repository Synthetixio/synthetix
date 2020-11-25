pragma solidity >=0.4.24;
pragma experimental ABIEncoderV2;


interface IRewardEscrowV2 {
    struct VestingEntry {
        uint64 endTime;
        uint64 duration;
        uint64 lastVested;
        uint256 escrowAmount;
        uint256 remainingAmount;
    }

    // Views
    function balanceOf(address account) external view returns (uint);

    function numVestingEntries(address account) external view returns (uint);

    function totalEscrowedAccountBalance(address account) external view returns (uint);

    function totalVestedAccountBalance(address account) external view returns (uint);

    function getVestingScheduleEntry(address account, uint index) external view returns (uint[2] memory);

    // Mutative functions
    function appendVestingEntry(address account, uint quantity) external;

    function vest(address account) external;

    function migrateVestingSchedule(address _addressToMigrate) external;

    function migrateAccountEscrowBalances(
        address[] calldata accounts,
        uint256[] calldata escrowBalances,
        uint256[] calldata vestedBalances
    ) external;

    // Account Merging
    function startMergingWindow() external;

    function nominateAccountToMerge(address account) external;

    // L2 Migration
    function importVestingEntries(
        address account,
        uint256 escrowedAmount,
        uint64[] calldata vestingTimstamps,
        uint64[] calldata durations,
        uint64[] calldata lastVested,
        uint256[] calldata escrowAmounts,
        uint256[] calldata remainingAmounts
    ) external;

    // Return amount of SNX transfered to SynthetixBridgeToOptimism deposit contract
    function burnForMigration(address account, uint[] calldata entryIDs)
        external
        returns (uint256 escrowedAccountBalance, VestingEntry[] memory vestingEntries);
}
