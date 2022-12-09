pragma solidity ^0.5.16;
pragma experimental ABIEncoderV2;

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
import "./interfaces/ISystemStatus.sol";

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
    bytes32 private constant CONTRACT_SYNTHETIX = "Synthetix";
    bytes32 private constant CONTRACT_SYSTEM_STATUS = "SystemStatus";

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

    function _synthetixERC20() internal view returns (IERC20) {
        return IERC20(requireAndGetAddress(CONTRACT_SYNTHETIX));
    }

    function _systemStatus() internal view returns (ISystemStatus) {
        return ISystemStatus(requireAndGetAddress(CONTRACT_SYSTEM_STATUS));
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
        bytes32[] memory newAddresses = new bytes32[](7);
        newAddresses[0] = CONTRACT_EXT_MESSENGER;
        newAddresses[1] = CONTRACT_OVM_DEBT_MIGRATOR_ON_OPTIMISM;
        newAddresses[2] = CONTRACT_ISSUER;
        newAddresses[3] = CONTRACT_LIQUIDATOR_REWARDS;
        newAddresses[4] = CONTRACT_SYNTHETIX_BRIDGE_TO_OPTIMISM;
        newAddresses[5] = CONTRACT_SYNTHETIX_DEBT_SHARE;
        newAddresses[6] = CONTRACT_SYSTEM_STATUS;
        addresses = combineArrays(existingAddresses, newAddresses);
    }

    /* ========== MUTATIVE ========== */

    function migrateToL2(address account) external {
        require(msg.sender == account, "Must be the account owner");
        _migrateToL2(account);
    }

    function migrateToL2OnBehalf(address account) external onlyOwner {
        _migrateToL2(account);
    }

    function _migrateToL2(address _account) internal {
        _systemStatus().requireSystemActive();

        // important: this has to happen before any updates to user's debt shares
        _liquidatorRewards().updateEntry(_account);
        _liquidatorRewards().getReward(_account);

        // remove all SDS
        ISynthetixDebtShare sds = _synthetixDebtShare();
        uint _amountOfDebtShares = sds.balanceOf(_account);
        if (_amountOfDebtShares > 0) {
            _issuer().modifyDebtSharesForMigration(_account, _amountOfDebtShares);
        }

        // Deposit the user's non-escrowed SNX to L2.
        // TODO: prioritize the largest 25 escrow entries to save gas and optimize c-ratio.
        // Another tx may be required to migrate the user's remaining escrow entries.
        uint _spotBalance = _synthetixERC20().balanceOf(_account);
        uint256[][] memory sortedEntryIds;
        _synthetixBridgeToOptimism().depositAndMigrateEscrow(_spotBalance, sortedEntryIds);

        // require zeroed balances
        require(_synthetixERC20().balanceOf(_account) == 0, "SNX balance is not zero");
        require(_liquidatorRewards().earned(_account) == 0, "Earned balance is not zero");
        require(_synthetixDebtShare().balanceOf(_account) == 0, "Debt share balance is not zero");

        // create the data payload to be relayed on L2
        IIssuer issuer;
        bytes memory _payload =
            abi.encodeWithSelector(issuer.modifyDebtSharesForMigration.selector, _account, _amountOfDebtShares);

        // send message to L2 to finalize the migration
        IDebtMigrator debtMigratorOnOptimism;
        bytes memory messageData =
            abi.encodeWithSelector(debtMigratorOnOptimism.finalizeMigration.selector, _account, _payload);
        _messenger().sendMessage(_debtMigratorOnOptimism(), messageData, _getCrossDomainGasLimit(0)); // passing zero will use the system setting default

        emit MigrationInitiated(_account);
    }

    // ========== EVENTS ==========

    event MigrationInitiated(address indexed account);
}
