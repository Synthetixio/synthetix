pragma solidity ^0.5.16;

// Inheritance
import "./Owned.sol";
import "./MixinResolver.sol";

// Internal references
import "./interfaces/IERC20.sol";

// TODO: for deployment
// 1. add to deploy-core
// 2. "connect" the migrators on L1/L2 using the address resolver (see OP bridges)
contract DebtMigrator is Owned {
    bytes32 public constant CONTRACT_NAME = "DebtMigratorOnEthereum";

    // bytes32 internal constant CONTRACT_SYNTH_SUSD = "SynthsUSD";
    // bytes32 internal constant CONTRACT_FEEPOOL = "FeePool";

    /* ========== CONSTRUCTOR ========== */
    constructor(address _owner, address _resolver) public Owned(_owner) MixinResolver(_resolver) {}

    // function resolverAddressesRequired() public view returns (bytes32[] memory addresses) {
    //     addresses = new bytes32[](3);
    //     addresses[0] = CONTRACT_SYNTH_SUSD;
    //     addresses[1] = CONTRACT_FLEXIBLESTORAGE;
    //     addresses[2] = CONTRACT_FEEPOOL;
    // }

    // /* ========== INTERNAL VIEWS ========== */
    // function synthsUSD() internal view returns (IERC20) {
    //     return IERC20(requireAndGetAddress(CONTRACT_SYNTH_SUSD));
    // }

    // Mutatative functions

    function migrateEntireAccount(address account) external {
        require(msg.sender == account, "Must be owner");
        _migrateEntireAccount(account);
    }

    function migrateEntireAccountOnBehalf(address account) external onlyOwner {}

    function _migrateEntireAccount(address account) internal {
        address targets = [address(debtMigrator), address(debtMigrator)];

        // burn SDS
        issuer().burnDebtSharesForMigration();

        // claim liquidation rewards
        liquidationRewards.getReward();

        // create message payloads
        bytes memory escrowMessageData =
            abi.encodeWithSelector(
                synthetixBridgeToOptimism.depositAndMigrateEscrow.selector,
                currencyKey,
                destination,
                amount
            );

        bytes memory recvMessageData = abi.encodeWithSelector(this.finalizeMigration.selector, amount);

        // require debt balance 0, snx balance 0, escrow 0, liq rewards 0, etc.

        Relay.initiateRelayBatch(targets, [escrowMessageData, recvMessageData]);

        // require success

        emit MigrationInitialized(account);
    }

    // ========== EVENTS ==========

    event MigrationInitialized(address indexed account);
}
