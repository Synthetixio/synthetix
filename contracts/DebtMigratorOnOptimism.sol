pragma solidity ^0.5.16;
pragma experimental ABIEncoderV2;

// Inheritance
import "./BaseDebtMigrator.sol";
import "./interfaces/IDebtMigrator.sol";

contract DebtMigratorOnOptimism is BaseDebtMigrator, IDebtMigrator {
    /* ========== ADDRESS RESOLVER CONFIGURATION ========== */
    bytes32 private constant CONTRACT_BASE_DEBT_MIGRATOR_ON_ETHEREUM = "base:DebtMigratorOnEthereum";

    bytes32 private constant DEBT_TRANSFER_NAMESPACE = "DebtTransfer";
    bytes32 private constant DEBT_TRANSFER_RECV = "Recv";

    function CONTRACT_NAME() public pure returns (bytes32) {
        return "DebtMigratorOnOptimism";
    }

    /* ========== CONSTRUCTOR ============ */

    constructor(address _owner, address _resolver) public BaseDebtMigrator(_owner, _resolver) {}

    /* ========== VIEWS ========== */

    function resolverAddressesRequired() public view returns (bytes32[] memory addresses) {
        bytes32[] memory existingAddresses = BaseDebtMigrator.resolverAddressesRequired();
        bytes32[] memory newAddresses = new bytes32[](1);
        newAddresses[0] = CONTRACT_BASE_DEBT_MIGRATOR_ON_ETHEREUM;
        addresses = combineArrays(existingAddresses, newAddresses);
    }

    function debtTransferReceived() external view returns (uint) {
        bytes32 debtAmountKey = keccak256(abi.encodePacked(DEBT_TRANSFER_NAMESPACE, DEBT_TRANSFER_RECV, sUSD));
        uint currentDebtInUSD = flexibleStorage().getUIntValue(CONTRACT_NAME(), debtAmountKey);
        return currentDebtInUSD;
    }

    function debtSharesReceived() external view returns (uint) {
        bytes32 debtSharesKey = keccak256(abi.encodePacked(DEBT_TRANSFER_NAMESPACE, DEBT_TRANSFER_RECV, SDS));
        uint currentDebtShares = flexibleStorage().getUIntValue(CONTRACT_NAME(), debtSharesKey);
        return currentDebtShares;
    }

    function _debtMigratorOnEthereum() private view returns (address) {
        return requireAndGetAddress(CONTRACT_BASE_DEBT_MIGRATOR_ON_ETHEREUM);
    }

    function _counterpart() internal view returns (address) {
        return _debtMigratorOnEthereum();
    }

    function onlyAllowFromCounterpart() internal view {
        // ensure function only callable from the L2 bridge via messenger (aka relayer)
        iAbs_BaseCrossDomainMessenger _messenger = _messenger();
        require(msg.sender == address(_messenger), "Only the relayer can call this");
        require(_messenger.xDomainMessageSender() == _counterpart(), "Only a counterpart migrator can invoke");
    }

    /* ========== MUTATIVE ============ */

    function _finalizeDebt(bytes memory _debtPayload) private {
        address target = address(_issuer()); // target is the Issuer contract on Optimism.

        // solhint-disable avoid-low-level-calls
        (bool success, bytes memory result) = target.call(_debtPayload);
        require(success, string(abi.encode("finalize debt call failed:", result)));
    }

    function _finalizeEscrow(bytes memory _escrowPayload) private {
        address target = address(_rewardEscrowV2()); // target is the RewardEscrowV2 contract on Optimism.

        // solhint-disable avoid-low-level-calls
        (bool success, bytes memory result) = target.call(_escrowPayload);
        require(success, string(abi.encode("finalize escrow call failed:", result)));
    }

    /* ========== MODIFIERS ============ */

    function _onlyAllowFromCounterpart() internal view {
        iAbs_BaseCrossDomainMessenger messenger = _messenger();
        require(msg.sender == address(messenger), "Sender is not the messenger");
        require(messenger.xDomainMessageSender() == _debtMigratorOnEthereum(), "L1 sender is not the debt migrator");
    }

    modifier onlyCounterpart() {
        _onlyAllowFromCounterpart();
        _;
    }

    /* ========== EXTERNAL ========== */

    function finalizeDebtMigration(
        address account,
        uint debtAmountMigrated,
        uint debtSharesMigrated,
        uint escrowMigrated,
        uint liquidSnxMigrated,
        bytes calldata debtPayload,
        bytes calldata escrowPayload
    ) external onlyCounterpart {
        _incrementDebtTransferCounter(DEBT_TRANSFER_RECV, debtAmountMigrated, debtSharesMigrated);
        _finalizeDebt(debtPayload);

        if (escrowMigrated > 0) {
            // Make sure to approve the creation of the escrow entry.
            _synthetixERC20().approve(address(_rewardEscrowV2()), escrowMigrated);
            _finalizeEscrow(escrowPayload);
        }

        if (liquidSnxMigrated > 0) {
            _synthetixERC20().transfer(account, liquidSnxMigrated);
        }

        emit MigrationFinalized(account, debtAmountMigrated, debtSharesMigrated, escrowMigrated, liquidSnxMigrated);
    }

    /* ========== EVENTS ========== */

    event MigrationFinalized(
        address indexed account,
        uint totalDebtAmountMigrated,
        uint totalDebtSharesMigrated,
        uint totalEscrowMigrated,
        uint totalLiquidBalanceMigrated
    );
}
