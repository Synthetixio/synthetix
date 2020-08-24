pragma solidity ^0.5.16;

// Inheritance
import "./Owned.sol";
import "./MixinResolver.sol";

// Internal references
import "./interfaces/IGasTankState.sol";
import "./interfaces/ISystemStatus.sol";
import "./interfaces/ISystemSettings.sol";
import "./interfaces/IDelegateApprovals.sol";


contract GasTank is Owned, MixinResolver {
    /* ========== STATE VARIABLES ========== */

    /* ---------- Address Resolver Configuration ---------- */

    bytes32 internal constant CONTRACT_GASTANKSTATE = "GasTankState";
    bytes32 internal constant CONTRACT_SYSTEMSTATUS = "SystemStatus";
    bytes32 internal constant CONTRACT_SYSTEMSETTINGS = "SystemSettings";
    bytes32 internal constant CONTRACT_DELEGATEAPPROVALS = "DelegateApprovals";

    bytes32[24] internal addressesToCache = [
        CONTRACT_GASTANKSTATE,
        CONTRACT_SYSTEMSTATUS,
        CONTRACT_SYSTEMSETTINGS,
        CONTRACT_DELEGATEAPPROVALS
    ];

    /* ========== CONSTRUCTOR ========== */

    constructor(address _owner, address _resolver) public Owned(_owner) MixinResolver(_resolver, addressesToCache) {}

    /* ========== VIEWS ========== */

    /* ---------- Related Contracts ---------- */

    function _gasTankState() internal view returns (IGasTankState) {
        return IGasTankState(requireAndGetAddress(CONTRACT_GASTANKSTATE, "Missing GasTankState address"));
    }

    function _systemStatus() internal view returns (ISystemStatus) {
        return ISystemStatus(requireAndGetAddress(CONTRACT_SYSTEMSTATUS, "Missing SystemStatus address"));
    }

    function _systemSettings() internal view returns (ISystemSettings) {
        return ISystemSettings(requireAndGetAddress(CONTRACT_SYSTEMSETTINGS, "Missing SystemSettings address"));
    }

    function delegateApprovals() internal view returns (IDelegateApprovals) {
        return IDelegateApprovals(requireAndGetAddress(CONTRACT_DELEGATEAPPROVALS, "Missing DelegateApprovals address"));
    }

    /* ---------- GasTank Information ---------- */

    function isApprovedContract(bytes32 _contractName) external returns (bool isApproved) {}

    function balanceOf(address _account) external view returns (uint balance) {}

    function maxGasPriceOf(address _account) external view returns (uint maxGasPriceWei) {}

    function currentGasPrice() external view returns (uint currentGasPriceWei) {}

    function currentEtherPrice() external view returns (uint currentEtherPriceWei) {}

    function executionCost(uint _gas) external view returns (uint etherCost) {}

    /* ========== MUTATIVE FUNCTIONS ========== */

    function approveContract(bytes32 _contractName, bool _approve) external {}

    function depositEtherOnBehalf(address _account, uint _value) external payable {}

    function depositEther(uint _value) external payable {}

    function withdrawEtherOnBehalf(
        address _account,
        address payable _recipient,
        uint _value
    ) external {}

    function withdrawEther(address payable _recipient, uint _value) external {}

    function setMaxGasPriceOnBehalf(address _account, uint _maxGasPriceWei) external {}

    function setMaxGasPrice(uint _maxGasPriceWei) external {}

    function payGas(
        address _spender,
        address payable _recipient,
        uint _gas
    ) external returns (uint etherSpent) {}

    /* ========== EVENTS ========== */

    event ContractApproved(bytes32 contractName, bool approved);
    event EtherDeposited(address payable indexed spender, uint value);
    event EtherWithdrawn(address indexed spender, address payable indexed recipient, uint value);
    event EtherSpent(address indexed spender, address payable indexed recipient, uint value, uint gasPrice);
    event MaxGasPriceSet(address indexed account, uint maxGasPriceWei);
}
