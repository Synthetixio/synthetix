pragma solidity ^0.5.16;

// Inheritance
import "./Owned.sol";
import "./MixinSystemSettings.sol";

// Internal references
import "./interfaces/IERC20.sol";
import "./interfaces/IDebtMigrator.sol";
import "./interfaces/IIssuer.sol";

import "./interfaces/ILiquidatorRewards.sol";

import "./interfaces/ISynthetixBridgeToOptimism.sol";
import "./interfaces/ISynthetixDebtShare.sol";

import "@eth-optimism/contracts/iOVM/bridge/messaging/iAbs_BaseCrossDomainMessenger.sol";

contract DebtMigratorOnEthereum is MixinSystemSettings, Owned {
    bytes32 public constant CONTRACT_NAME = "DebtMigratorOnEthereum";

    /* ========== ADDRESS RESOLVER CONFIGURATION ========== */

    bytes32 private constant CONTRACT_EXT_MESSENGER = "ext:Messenger";
    bytes32 private constant CONTRACT_OVM_DEBT_MIGRATOR_ON_OPTIMISM = "ovm:DebtMigratorOnOptimism";
    bytes32 private constant CONTRACT_ISSUER = "Issuer";
    bytes32 private constant CONTRACT_LIQUIDATOR_REWARDS = "LiquidatorRewards";
    bytes32 private constant CONTRACT_SYNTHETIX_BRIDGE_TO_OPTIMISM = "SynthetixBridgeToOptimism";
    bytes32 private constant CONTRACT_SYNTHETIX_DEBT_SHARE = "SynthetixDebtShare";

    /* ========== CONSTRUCTOR ========== */

    constructor(address _owner, address _resolver) public Owned(_owner) MixinSystemSettings(_resolver) {}

    /* ========== INTERNALS ============ */

    function _messenger() private view returns (iAbs_BaseCrossDomainMessenger) {
        return iAbs_BaseCrossDomainMessenger(requireAndGetAddress(CONTRACT_EXT_MESSENGER));
    }

    function _debtMigratorOnOptimism() private view returns (address) {
        return requireAndGetAddress(CONTRACT_OVM_DEBT_MIGRATOR_ON_OPTIMISM);
    }

    function _issuer() internal view returns (IIssuer) {
        return IIssuer(requireAndGetAddress(CONTRACT_ISSUER));
    }

    function _liquidatorRewards() internal view returns (ILiquidatorRewards) {
        return ILiquidatorRewards(requireAndGetAddress(CONTRACT_LIQUIDATOR_REWARDS));
    }

    function _synthetixBridgeToOptimism() internal view returns (ISynthetixBridgeToOptimism) {
        return ISynthetixBridgeToOptimism(requireAndGetAddress(CONTRACT_SYNTHETIX_BRIDGE_TO_OPTIMISM));
    }

    function _synthetixDebtShare() internal view returns (ISynthetixDebtShare) {
        return ISynthetixDebtShare(requireAndGetAddress(CONTRACT_SYNTHETIX_DEBT_SHARE));
    }

    function _getCrossDomainGasLimit(uint32 crossDomainGasLimit) private view returns (uint32) {
        // Use specified crossDomainGasLimit if specified value is not zero.
        // otherwise use the default in SystemSettings.
        return
            crossDomainGasLimit != 0
                ? crossDomainGasLimit
                : uint32(getCrossDomainMessageGasLimit(CrossDomainMessageGasLimits.Relay));
    }

    /* ========== VIEWS ========== */

    function resolverAddressesRequired() public view returns (bytes32[] memory addresses) {
        bytes32[] memory existingAddresses = MixinSystemSettings.resolverAddressesRequired();
        bytes32[] memory newAddresses = new bytes32[](2);
        newAddresses[0] = CONTRACT_EXT_MESSENGER;
        newAddresses[1] = CONTRACT_OVM_DEBT_MIGRATOR_ON_OPTIMISM;
        addresses = combineArrays(existingAddresses, newAddresses);
    }

    /* ========== MUTATIVE ========== */

    function migrateEntireAccount(address account) external {
        require(msg.sender == account, "Must be the account owner");
        _migrateEntireAccount(account);
    }

    function migrateEntireAccountOnBehalf(address account) external onlyOwner {
        _migrateEntireAccount(account);
    }

    function _migrateEntireAccount(address _account) internal {
        // require system active

        // important: this has to happen before any updates to user's debt shares
        _liquidatorRewards().updateEntry(_account);
        _liquidatorRewards().getReward(_account);

        // remove all SDS
        ISynthetixDebtShare sds = _synthetixDebtShare();
        uint _amount = sds.balanceOf(_account);
        _issuer().modifyDebtSharesForMigration(_account, _amount);

        // require zeroed balances
        require(_liquidatorRewards().earned(_account) == 0, "Earned balance is not zero");
        require(_synthetixDebtShare().balanceOf(_account) == 0, "Debt share balance is not zero");

        // create the data payload to be relayed on L2
        IIssuer issuer;
        bytes memory payload = abi.encodeWithSelector(issuer.modifyDebtSharesForMigration.selector, _account, _amount);

        // send message to L2 to finalize the migration
        IDebtMigrator debtMigratorOnOptimism;
        bytes memory messageData =
            abi.encodeWithSelector(debtMigratorOnOptimism.finalizeMigration.selector, address(_issuer()), payload);
        _messenger().sendMessage(_debtMigratorOnOptimism(), messageData, _getCrossDomainGasLimit(0)); // passing zero will use the system setting default

        emit MigrationInitiated(_account);
    }

    // ========== EVENTS ==========

    event MigrationInitiated(address indexed account);
}
