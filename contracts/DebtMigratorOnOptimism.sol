pragma solidity ^0.5.16;
pragma experimental ABIEncoderV2;

// Inheritance
import "./Owned.sol";
import "./MixinResolver.sol";
import "./interfaces/IDebtMigrator.sol";

// Libraries
import "openzeppelin-solidity-2.3.0/contracts/token/ERC20/SafeERC20.sol";

// Internal references
import "./interfaces/IRewardEscrowV2.sol";
import "@eth-optimism/contracts/iOVM/bridge/messaging/iAbs_BaseCrossDomainMessenger.sol";

contract DebtMigratorOnOptimism is MixinResolver, Owned, IDebtMigrator {
    using SafeERC20 for IERC20;

    bytes32 public constant CONTRACT_NAME = "DebtMigratorOnOptimism";

    /* ========== ADDRESS RESOLVER CONFIGURATION ========== */

    bytes32 private constant CONTRACT_EXT_MESSENGER = "ext:Messenger";
    bytes32 private constant CONTRACT_BASE_DEBT_MIGRATOR_ON_ETHEREUM = "base:DebtMigratorOnEthereum";
    bytes32 private constant CONTRACT_ISSUER = "Issuer";
    bytes32 private constant CONTRACT_REWARD_ESCROW_V2 = "RewardEscrowV2";
    bytes32 private constant CONTRACT_SYNTHETIX = "Synthetix";

    /* ========== CONSTRUCTOR ============ */

    constructor(address _owner, address _resolver) public Owned(_owner) MixinResolver(_resolver) {}

    /* ========== VIEWS ========== */

    function resolverAddressesRequired() public view returns (bytes32[] memory addresses) {
        addresses = new bytes32[](5);
        addresses[0] = CONTRACT_EXT_MESSENGER;
        addresses[1] = CONTRACT_BASE_DEBT_MIGRATOR_ON_ETHEREUM;
        addresses[2] = CONTRACT_ISSUER;
        addresses[3] = CONTRACT_REWARD_ESCROW_V2;
        addresses[4] = CONTRACT_SYNTHETIX;
    }

    function _messenger() private view returns (iAbs_BaseCrossDomainMessenger) {
        return iAbs_BaseCrossDomainMessenger(requireAndGetAddress(CONTRACT_EXT_MESSENGER));
    }

    function _debtMigratorOnEthereum() private view returns (address) {
        return requireAndGetAddress(CONTRACT_BASE_DEBT_MIGRATOR_ON_ETHEREUM);
    }

    function _issuer() private view returns (address) {
        return requireAndGetAddress(CONTRACT_ISSUER);
    }

    function _rewardEscrowV2() internal view returns (address) {
        return requireAndGetAddress(CONTRACT_REWARD_ESCROW_V2);
    }

    function _synthetixERC20() internal view returns (IERC20) {
        return IERC20(requireAndGetAddress(CONTRACT_SYNTHETIX));
    }

    /* ========== MUTATIVE ============ */

    function _finalizeDebt(bytes memory _debtPayload) private {
        address target = _issuer(); // target is the Issuer contract on Optimism.

        // solhint-disable avoid-low-level-calls
        (bool success, bytes memory result) = target.call(_debtPayload);
        require(success, string(abi.encode("finalize debt call failed:", result)));
    }

    function _finalizeEscrow(bytes memory _escrowPayload) private {
        address target = _rewardEscrowV2(); // target is the RewardEscrowV2 contract on Optimism.

        // solhint-disable avoid-low-level-calls
        (bool success, bytes memory result) = target.call(_escrowPayload);
        require(success, string(abi.encode("finalize escrow call failed:", result)));
    }

    /* ========== MODIFIERS ============ */

    function _onlyAllowMessengerAndL1DebtMigrator() internal view {
        iAbs_BaseCrossDomainMessenger messenger = _messenger();

        require(msg.sender == address(messenger), "Sender is not the messenger");
        require(messenger.xDomainMessageSender() == _debtMigratorOnEthereum(), "L1 sender is not the debt migrator");
    }

    modifier onlyMessengerAndL1DebtMigrator() {
        _onlyAllowMessengerAndL1DebtMigrator();
        _;
    }

    /* ========== EXTERNAL ========== */

    function finalizeDebtMigration(
        address account,
        uint debtSharesMigrated,
        uint escrowMigrated,
        uint liquidSnxMigrated,
        bytes calldata debtPayload,
        bytes calldata escrowPayload
    ) external onlyMessengerAndL1DebtMigrator {
        _finalizeDebt(debtPayload);

        if (escrowMigrated > 0) {
            // Make sure to approve the creation of the escrow entry.
            _synthetixERC20().approve(address(_rewardEscrowV2()), escrowMigrated);
            _finalizeEscrow(escrowPayload);
        }

        if (liquidSnxMigrated > 0) {
            _synthetixERC20().transfer(account, liquidSnxMigrated);
        }

        emit MigrationFinalized(account, debtSharesMigrated, escrowMigrated, liquidSnxMigrated);
    }

    /* ========== EVENTS ========== */

    event MigrationFinalized(
        address indexed account,
        uint totalDebtSharesMigrated,
        uint totalEscrowMigrated,
        uint totalLiquidBalanceMigrated
    );
}
