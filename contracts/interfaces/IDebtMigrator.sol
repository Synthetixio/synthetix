pragma solidity >=0.4.24;
pragma experimental ABIEncoderV2;

interface IDebtMigrator {
    function migrateDebt(address account) external;

    function finalizeDebtMigration(address account, bytes calldata payload) external;
}
