pragma solidity ^0.5.16;
pragma experimental ABIEncoderV2;

// Inheritance
import "./Owned.sol";
import "./MixinResolver.sol";
import "./interfaces/IDebtMigrator.sol";
import "./interfaces/IRewardEscrowV2.sol";

// Internal references
import "@eth-optimism/contracts/iOVM/bridge/messaging/iAbs_BaseCrossDomainMessenger.sol";

contract DebtMigratorOnOptimism is MixinResolver, Owned {
    bytes32 public constant CONTRACT_NAME = "DebtMigratorOnOptimism";

    /* ========== ADDRESS RESOLVER CONFIGURATION ========== */

    bytes32 private constant CONTRACT_EXT_MESSENGER = "ext:Messenger";
    bytes32 private constant CONTRACT_BASE_DEBT_MIGRATOR_ON_ETHEREUM = "base:DebtMigratorOnEthereum";
    bytes32 private constant CONTRACT_ISSUER = "Issuer";
    bytes32 private constant CONTRACT_REWARD_ESCROW_V2 = "RewardEscrowV2";

    /* ========== CONSTRUCTOR ============ */

    constructor(address _owner, address _resolver) public Owned(_owner) MixinResolver(_resolver) {}

    /* ========== INTERNALS ============ */

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

    /* ========== VIEWS ========== */

    function resolverAddressesRequired() public view returns (bytes32[] memory addresses) {
        addresses = new bytes32[](2);
        addresses[0] = CONTRACT_EXT_MESSENGER;
        addresses[1] = CONTRACT_BASE_DEBT_MIGRATOR_ON_ETHEREUM;
    }

    /* ========== EXTERNAL ========== */

    function finalizeDebtMigration(
        address account,
        bytes calldata debtPayload,
        bytes calldata escrowPayload
    ) external onlyMessengerAndL1DebtMigrator {
        _finalizeDebt(debtPayload);
        _finalizeEscrow(escrowPayload);

        emit MigrationFinalized(account);
    }

    /* ========== EVENTS ========== */

    event MigrationFinalized(address indexed account);
}
