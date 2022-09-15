pragma solidity >=0.4.24;
pragma experimental ABIEncoderV2;

interface IDebtMigrator {
    function migrateEntireAccountOnBehalf(address account) external;

    function migrateEntireAccount(address account) external;

    function finalizeMigration(
        address account,
        address target,
        bytes calldata payload
    ) external;
}
