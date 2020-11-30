pragma solidity >=0.4.24;
pragma experimental ABIEncoderV2;


library VestingEntries {
    struct VestingEntry {
        uint64 endTime;
        uint64 duration;
        uint64 lastVested;
        uint256 escrowAmount;
        uint256 remainingAmount;
    }
}


interface IRewardEscrowV2 {
    // Views
    function balanceOf(address account) external view returns (uint);

    function numVestingEntries(address account) external view returns (uint);

    function totalEscrowedAccountBalance(address account) external view returns (uint);

    function totalVestedAccountBalance(address account) external view returns (uint);

    // Mutative functions
    function appendVestingEntry(
        address account,
        uint quantity,
        uint duration
    ) external;

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
        VestingEntries.VestingEntry[] calldata vestingEntries
    ) external;

    // Return amount of SNX transfered to SynthetixBridgeToOptimism deposit contract
    function burnForMigration(address account, uint[] calldata entryIDs)
        external
        returns (uint256 escrowedAccountBalance, VestingEntries.VestingEntry[] memory vestingEntries);
}
