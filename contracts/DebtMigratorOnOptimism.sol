pragma solidity ^0.5.16;

// Inheritance
import "./Owned.sol";
import "./MixinResolver.sol";

// Internal references
import "./interfaces/IERC20.sol";

contract DebtMigrator {
    bytes32 public constant CONTRACT_NAME = "DebtMigratorOnOptimism";

    constructor(address _owner, address _resolver) public Owned(_owner) MixinResolver(_resolver) {}

    function finalizeMigration() external onlyMigrator {
        // TODO: decode the payload and get account
        // mint SDS
        // issuer().mintDebtSharesForMigration();
        // emit MigrationFinalized(account);
    }

    // ========== EVENTS ==========

    event MigrationFinalized(address indexed account);
}
