pragma solidity >=0.4.24;
pragma experimental ABIEncoderV2;

interface IDebtMigrator {
    function finalizeDebtMigration(
        address account,
        uint debtAmountMigrated,
        uint debtSharesMigrated,
        uint escrowMigrated,
        uint liquidSnxMigrated,
        bytes calldata debtPayload,
        bytes calldata escrowPayload
    ) external;
}
