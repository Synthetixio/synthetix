pragma solidity ^0.5.16;
pragma experimental ABIEncoderV2;

import "openzeppelin-solidity-2.3.0/contracts/token/ERC20/SafeERC20.sol";
import "./SafeDecimalMath.sol";

// Inheritance
import "./Owned.sol";
import "./MixinResolver.sol";
import "./MixinSystemSettings.sol";

// Internal references
import "./interfaces/IDebtMigrator.sol";
import "./interfaces/IIssuer.sol";
import "./interfaces/ILiquidator.sol";
import "./interfaces/ILiquidatorRewards.sol";
import "./interfaces/IRewardEscrowV2.sol";
import "./interfaces/ISynthetixBridgeToOptimism.sol";
import "./interfaces/ISynthetixDebtShare.sol";
import "./interfaces/ISynthetix.sol";
import "./interfaces/ISystemStatus.sol";

import "@eth-optimism/contracts/iOVM/bridge/messaging/iAbs_BaseCrossDomainMessenger.sol";

contract DebtMigratorOnEthereum is MixinSystemSettings, Owned {
    using SafeERC20 for IERC20;
    using SafeMath for uint;
    using SafeDecimalMath for uint;

    bytes32 public constant CONTRACT_NAME = "DebtMigratorOnEthereum";

    /* ========== ADDRESS RESOLVER CONFIGURATION ========== */

    bytes32 private constant CONTRACT_EXT_MESSENGER = "ext:Messenger";
    bytes32 private constant CONTRACT_OVM_DEBT_MIGRATOR_ON_OPTIMISM = "ovm:DebtMigratorOnOptimism";
    bytes32 private constant CONTRACT_ISSUER = "Issuer";
    bytes32 private constant CONTRACT_LIQUIDATOR = "Liquidator";
    bytes32 private constant CONTRACT_LIQUIDATOR_REWARDS = "LiquidatorRewards";
    bytes32 private constant CONTRACT_REWARD_ESCROW_V2 = "RewardEscrowV2";
    bytes32 private constant CONTRACT_SYNTHETIX_BRIDGE_TO_OPTIMISM = "SynthetixBridgeToOptimism";
    bytes32 private constant CONTRACT_SYNTHETIX_DEBT_SHARE = "SynthetixDebtShare";
    bytes32 private constant CONTRACT_SYNTHETIX = "Synthetix";
    bytes32 private constant CONTRACT_SYSTEM_STATUS = "SystemStatus";

    /* ========== CONSTRUCTOR ========== */

    constructor(address _owner, address _resolver) public Owned(_owner) MixinSystemSettings(_resolver) {}

    /* ========== VIEWS ============ */

    function _messenger() private view returns (iAbs_BaseCrossDomainMessenger) {
        return iAbs_BaseCrossDomainMessenger(requireAndGetAddress(CONTRACT_EXT_MESSENGER));
    }

    function _debtMigratorOnOptimism() private view returns (address) {
        return requireAndGetAddress(CONTRACT_OVM_DEBT_MIGRATOR_ON_OPTIMISM);
    }

    function _issuer() internal view returns (IIssuer) {
        return IIssuer(requireAndGetAddress(CONTRACT_ISSUER));
    }

    function _liquidator() internal view returns (ILiquidator) {
        return ILiquidator(requireAndGetAddress(CONTRACT_LIQUIDATOR));
    }

    function _liquidatorRewards() internal view returns (ILiquidatorRewards) {
        return ILiquidatorRewards(requireAndGetAddress(CONTRACT_LIQUIDATOR_REWARDS));
    }

    function _rewardEscrowV2() internal view returns (IRewardEscrowV2) {
        return IRewardEscrowV2(requireAndGetAddress(CONTRACT_REWARD_ESCROW_V2));
    }

    function _synthetixBridgeToOptimism() internal view returns (ISynthetixBridgeToOptimism) {
        return ISynthetixBridgeToOptimism(requireAndGetAddress(CONTRACT_SYNTHETIX_BRIDGE_TO_OPTIMISM));
    }

    function _synthetixDebtShare() internal view returns (ISynthetixDebtShare) {
        return ISynthetixDebtShare(requireAndGetAddress(CONTRACT_SYNTHETIX_DEBT_SHARE));
    }

    function _systemStatus() internal view returns (ISystemStatus) {
        return ISystemStatus(requireAndGetAddress(CONTRACT_SYSTEM_STATUS));
    }

    function _synthetixERC20() internal view returns (IERC20) {
        return IERC20(requireAndGetAddress(CONTRACT_SYNTHETIX));
    }

    function _getCrossDomainGasLimit(uint32 crossDomainGasLimit) private view returns (uint32) {
        // Use specified crossDomainGasLimit if specified value is not zero.
        // otherwise use the default in SystemSettings.
        return
            crossDomainGasLimit != 0
                ? crossDomainGasLimit
                : uint32(getCrossDomainMessageGasLimit(CrossDomainMessageGasLimits.Relay));
    }

    function _getMaxEscrowDuration(address account) private view returns (uint duration) {
        uint numOfEntries = _rewardEscrowV2().numVestingEntries(account);
        uint latestEntryId = _rewardEscrowV2().accountVestingEntryIDs(account, numOfEntries.sub(1));
        (uint endTime, ) = _rewardEscrowV2().getVestingEntry(account, latestEntryId);
        duration = now < endTime ? (endTime - now) : 2 weeks;
        return duration;
    }

    function resolverAddressesRequired() public view returns (bytes32[] memory addresses) {
        bytes32[] memory existingAddresses = MixinSystemSettings.resolverAddressesRequired();
        bytes32[] memory newAddresses = new bytes32[](10);
        newAddresses[0] = CONTRACT_EXT_MESSENGER;
        newAddresses[1] = CONTRACT_OVM_DEBT_MIGRATOR_ON_OPTIMISM;
        newAddresses[2] = CONTRACT_ISSUER;
        newAddresses[3] = CONTRACT_LIQUIDATOR;
        newAddresses[4] = CONTRACT_LIQUIDATOR_REWARDS;
        newAddresses[5] = CONTRACT_REWARD_ESCROW_V2;
        newAddresses[6] = CONTRACT_SYNTHETIX_BRIDGE_TO_OPTIMISM;
        newAddresses[7] = CONTRACT_SYNTHETIX_DEBT_SHARE;
        newAddresses[8] = CONTRACT_SYNTHETIX;
        newAddresses[9] = CONTRACT_SYSTEM_STATUS;
        addresses = combineArrays(existingAddresses, newAddresses);
    }

    /* ========== MUTATIVE ========== */

    // Ideally, the account should call vest on their escrow before invoking the debt migration to L2.
    function migrateDebt(address account) public systemActive {
        require(msg.sender == account, "Must be the account owner");
        _migrateDebt(account);
    }

    function _migrateDebt(address _account) internal {
        // Require the account to not be flagged or open for liquidation
        require(!_liquidator().isLiquidationOpen(_account, false), "Cannot migrate if open for liquidation");

        // Important: this has to happen before any updates to user's debt shares
        _liquidatorRewards().getReward(_account);

        // First, remove all debt shares on L1
        ISynthetixDebtShare sds = _synthetixDebtShare();
        uint totalDebtShares = sds.balanceOf(_account);
        require(totalDebtShares > 0, "No debt to migrate");
        _issuer().modifyDebtSharesForMigration(_account, totalDebtShares);

        // Deposit all of the liquid & revoked escrowed SNX to the migrator on L2
        (uint totalEscrowRevoked, uint totalLiquidBalance) =
            ISynthetix(requireAndGetAddress(CONTRACT_SYNTHETIX)).migrateAccountBalances(_account);
        uint totalAmountToDeposit = totalLiquidBalance.add(totalEscrowRevoked);

        require(totalAmountToDeposit > 0, "Cannot migrate zero balances");
        require(
            resolver.getAddress(CONTRACT_OVM_DEBT_MIGRATOR_ON_OPTIMISM) != address(0),
            "Debt Migrator On Optimism not set"
        );

        _synthetixERC20().approve(address(_synthetixBridgeToOptimism()), totalAmountToDeposit);
        _synthetixBridgeToOptimism().depositTo(_debtMigratorOnOptimism(), totalAmountToDeposit);

        // Require all zeroed balances
        require(_synthetixDebtShare().balanceOf(_account) == 0, "Debt share balance is not zero");
        require(_synthetixERC20().balanceOf(_account) == 0, "SNX balance is not zero");
        require(_rewardEscrowV2().balanceOf(_account) == 0, "Escrow balanace is not zero");
        require(_liquidatorRewards().earned(_account) == 0, "Earned balance is not zero");

        // Create the data payloads to be relayed on L2
        IIssuer issuer;
        bytes memory _debtPayload =
            abi.encodeWithSelector(issuer.modifyDebtSharesForMigration.selector, _account, totalDebtShares);

        IRewardEscrowV2 rewardEscrow;
        bytes memory _escrowPayload =
            abi.encodeWithSelector(
                rewardEscrow.createEscrowEntry.selector,
                _account,
                totalEscrowRevoked,
                _getMaxEscrowDuration(_account)
            );

        // Send a message with the debt & escrow payloads to L2 to finalize the migration
        IDebtMigrator debtMigratorOnOptimism;
        bytes memory messageData =
            abi.encodeWithSelector(
                debtMigratorOnOptimism.finalizeDebtMigration.selector,
                _account,
                totalDebtShares,
                totalEscrowRevoked,
                totalLiquidBalance,
                _debtPayload,
                _escrowPayload
            );
        _messenger().sendMessage(_debtMigratorOnOptimism(), messageData, _getCrossDomainGasLimit(0)); // passing zero will use the system setting default

        emit MigrationInitiated(_account, totalDebtShares, totalEscrowRevoked, totalLiquidBalance);
    }

    /* ========= MODIFIERS ========= */

    modifier systemActive() {
        _systemActive();
        _;
    }

    function _systemActive() private view {
        _systemStatus().requireSystemActive();
    }

    /* ========== EVENTS ========== */

    event MigrationInitiated(
        address indexed account,
        uint totalDebtSharesMigrated,
        uint totalEscrowMigrated,
        uint totalLiquidBalanceMigrated
    );

    event EscrowMigrationDurationUpdated(uint escrowMigrationDuration);
}
