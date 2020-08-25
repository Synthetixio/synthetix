pragma solidity ^0.5.16;

// Inheritance
import "./Owned.sol";
import "./MixinResolver.sol";

// Internal references
import "./interfaces/IGasTankState.sol";
import "./interfaces/ISystemStatus.sol";
import "./interfaces/ISystemSettings.sol";
import "./interfaces/IDelegateApprovals.sol";
import "./interfaces/IExchangeRates.sol";


contract GasTank is Owned, MixinResolver {
    /* ========== STATE VARIABLES ========== */

    mapping(address => bool) public allowance;
    /* ---------- Address Resolver Configuration ---------- */

    bytes32 internal constant CONTRACT_GASTANKSTATE = "GasTankState";
    bytes32 internal constant CONTRACT_SYSTEMSTATUS = "SystemStatus";
    bytes32 internal constant CONTRACT_SYSTEMSETTINGS = "SystemSettings";
    bytes32 internal constant CONTRACT_DELEGATEAPPROVALS = "DelegateApprovals";
    bytes32 internal constant CONTRACT_EXCHANGERATES = "ExchangeRates";

    bytes32[24] internal addressesToCache = [
        CONTRACT_GASTANKSTATE,
        CONTRACT_SYSTEMSTATUS,
        CONTRACT_SYSTEMSETTINGS,
        CONTRACT_DELEGATEAPPROVALS,
        CONTRACT_EXCHANGERATES
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

    function _delegateApprovals() internal view returns (IDelegateApprovals) {
        return IDelegateApprovals(requireAndGetAddress(CONTRACT_DELEGATEAPPROVALS, "Missing DelegateApprovals address"));
    }

    function _exchangeRates() internal view returns (IExchangeRates) {
        return IExchangeRates(requireAndGetAddress(CONTRACT_EXCHANGERATES, "Missing ExchangeRates address"));
    }

    /* ---------- GasTank Information ---------- */

    function isApprovedContract(bytes32 _contractName) external view returns (bool isApproved) {
        return allowance[requireAndGetAddress(_contractName, "Missing contract address")] == true;
    }

    function balanceOf(address _account) external view returns (uint balance) {
        return _gasTankState().balanceOf(_account);
    }

    function maxGasPriceOf(address _account) external view returns (uint maxGasPriceWei) {
        return _gasTankState().maxGasPriceOf(_account);
    }

    function currentGasPrice() external view returns (uint currentGasPriceWei) {
        return _exchangeRates().rateForCurrency("fastGasPrice");
    }

    function currentEtherPrice() external view returns (uint currentEtherPriceWei) {
        return _exchangeRates().rateForCurrency("ETH");
    }

    function executionCost(uint _gas) external view returns (uint etherCost) {}

    /* ========== MUTATIVE FUNCTIONS ========== */

    function approveContract(bytes32 _contractName, bool _approve) external onlyOwner {
        address contractName = requireAndGetAddress(_contractName, "Missing contract address");
        allowance[contractName] = _approve;
    }

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
