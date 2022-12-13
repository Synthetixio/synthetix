pragma solidity >=0.4.24;
pragma experimental ABIEncoderV2;

interface IDebtMigrator {
    function migrateToL2OnBehalf(address account, uint256[][] calldata entryIDs) external;

    function migrateToL2(address account, uint256[][] calldata entryIDs) external;

    function finalizeMigration(address account, bytes calldata payload) external;
}
