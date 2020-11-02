pragma solidity ^0.5.16;

// Inheritance
import "./Owned.sol";
import "./MixinResolver.sol";
import "./MixinSystemSettings.sol";
import "openzeppelin-solidity-2.3.0/contracts/utils/ReentrancyGuard.sol";

// Libraries
import "./SafeDecimalMath.sol";

// Internal references
import "./interfaces/ISystemStatus.sol";
import "./interfaces/ISystemSettings.sol";
import "./interfaces/IDelegateApprovals.sol";
import "./interfaces/IExchangeRates.sol";
import "./interfaces/IGasTank.sol";

// https://docs.synthetix.io/contracts/source/contracts/GasTank
contract GasTank is Owned, MixinResolver, ReentrancyGuard, MixinSystemSettings, IGasTank {
    /* ========== LIBRARIES ========== */

    using SafeMath for uint;
    using SafeDecimalMath for uint;
    /* ========== STATE VARIABLES ========== */

    /*
        This value matches the required gas to execute the SpendGas function. It is added to the total gas spent
        so keepers are fully refunded.
     */
    uint public constant PAYGAS_COST = 116148;
    mapping(address => bool) public approved;

    bytes32 public constant CONTRACT_NAME = "GasTank";
    bytes32 public constant DEPOSIT = "DEPOSIT";
    bytes32 public constant MAX_GAS_PRICE = "MAX_GAS_PRICE";

    /* ---------- Address Resolver Configuration ---------- */

    bytes32 internal constant CONTRACT_SYSTEMSTATUS = "SystemStatus";
    bytes32 internal constant CONTRACT_DELEGATEAPPROVALS = "DelegateApprovals";
    bytes32 internal constant CONTRACT_EXCHANGERATES = "ExchangeRates";

    bytes32[24] internal addressesToCache = [CONTRACT_SYSTEMSTATUS, CONTRACT_DELEGATEAPPROVALS, CONTRACT_EXCHANGERATES];

    /* ========== CONSTRUCTOR ========== */

    constructor(address _owner, address _resolver)
        public
        Owned(_owner)
        MixinResolver(_resolver, addressesToCache)
        MixinSystemSettings()
    {}

    /* ========== VIEWS ========== */

    /* ---------- Related Contracts ---------- */

    function _systemStatus() internal view returns (ISystemStatus) {
        return ISystemStatus(requireAndGetAddress(CONTRACT_SYSTEMSTATUS, "Missing SystemStatus address"));
    }

    function _delegateApprovals() internal view returns (IDelegateApprovals) {
        return IDelegateApprovals(requireAndGetAddress(CONTRACT_DELEGATEAPPROVALS, "Missing DelegateApprovals address"));
    }

    function _exchangeRates() internal view returns (IExchangeRates) {
        return IExchangeRates(requireAndGetAddress(CONTRACT_EXCHANGERATES, "Missing ExchangeRates address"));
    }

    /* ---------- GasTank Information ---------- */

    function keeperFee() external view returns (uint fee) {
        return getKeeperFee();
    }

    function _toPayable(address _address) internal pure returns (address payable) {
        return address(uint160(_address));
    }

    function balanceOf(address _account) public view returns (uint balance) {
        return flexibleStorage().getUIntValue(CONTRACT_NAME, keccak256(abi.encodePacked(DEPOSIT, _account)));
    }

    function maxGasPriceOf(address _account) public view returns (uint maxGasPriceWei) {
        return flexibleStorage().getUIntValue(CONTRACT_NAME, keccak256(abi.encodePacked(MAX_GAS_PRICE, _account)));
    }

    function currentGasPrice() public view returns (uint currentGasPriceWei) {
        return _exchangeRates().rateForCurrency("fastGasPrice");
    }

    function currentEtherPrice() public view returns (uint currentGasPriceWei) {
        return _exchangeRates().rateForCurrency("ETH");
    }

    function executionCost(uint _gas) public view returns (uint etherCost) {
        return _executionCost(_gas, currentGasPrice());
    }

    function _executionCost(uint _gas, uint _gasPrice) internal view returns (uint etherCost) {
        uint totalGasCost = (_gas.add(PAYGAS_COST)).mul(_gasPrice);
        uint keeperFeeCost = getKeeperFee().divideDecimal(currentEtherPrice());
        return totalGasCost.add(keeperFeeCost);
    }

    /* ========== MUTATIVE FUNCTIONS ========== */

    function _setDepositBalance(address _account, uint _amount) internal {
        flexibleStorage().setUIntValue(CONTRACT_NAME, keccak256(abi.encodePacked(DEPOSIT, _account)), _amount);
    }

    function _depositEther(address _account, uint _amount) internal {
        require(_amount > 0, "Deposit must be greater than 0");
        _setDepositBalance(_account, _amount);
        emit EtherDeposited(msg.sender, _account, _amount);
    }

    function _withdrawEther(
        address _account,
        address payable _recipient,
        uint _amount
    ) internal nonReentrant {
        require(_amount > 0, "Withdrawal amount must be greater than 0");
        _setDepositBalance(_account, balanceOf(_account).sub(_amount));
        (bool success, ) = _recipient.call.value(_amount)("");
        require(success, "Withdrawal failed");
        emit EtherWithdrawn(_account, _recipient, _amount);
    }

    function _setMaxGasPrice(address _account, uint _gasPrice) internal {
        require(_gasPrice > 0, "Gas Price must be greater than 0");
        flexibleStorage().setUIntValue(CONTRACT_NAME, keccak256(abi.encodePacked(MAX_GAS_PRICE, _account)), _gasPrice);
        emit MaxGasPriceSet(_account, _gasPrice);
    }

    function approveContract(bytes32 _contractName, bool _approve) external onlyOwner {
        address contractAddress = resolver.requireAndGetAddress(_contractName, "Missing contract address");
        approved[contractAddress] = _approve;
        emit ContractApproved(_contractName, _approve);
    }

    function depositEtherOnBehalf(address _account) external payable {
        require(_delegateApprovals().canManageGasTankFor(_account, msg.sender), "Not approved to act on behalf");
        _depositEther(_account, msg.value);
    }

    function depositEther() external payable {
        _depositEther(msg.sender, msg.value);
    }

    function withdrawEtherOnBehalf(
        address _account,
        address payable _recipient,
        uint _amount
    ) external payable {
        require(_delegateApprovals().canManageGasTankFor(_account, msg.sender), "Not approved to act on behalf");
        _withdrawEther(_account, _recipient, _amount);
    }

    function withdrawEther(uint _amount) external payable {
        _withdrawEther(msg.sender, msg.sender, _amount);
    }

    function setMaxGasPriceOnBehalf(address _account, uint _maxGasPriceWei) external {
        require(_delegateApprovals().canManageGasTankFor(_account, msg.sender), "Not approved to act on behalf");
        _setMaxGasPrice(_account, _maxGasPriceWei);
    }

    function setMaxGasPrice(uint _maxGasPriceWei) external {
        _setMaxGasPrice(msg.sender, _maxGasPriceWei);
    }

    function payGas(
        address _spender,
        address payable _recipient,
        uint _gas
    ) external nonReentrant returns (uint) {
        require(approved[msg.sender], "Contract is not approved");
        uint gasPrice = currentGasPrice();
        require(tx.gasprice >= gasPrice, "Gas price is too low");
        uint etherSpent = _executionCost(_gas, gasPrice);
        uint maxGasPriceForSpender = maxGasPriceOf(_spender);
        if (maxGasPriceForSpender > 0) {
            require(tx.gasprice <= maxGasPriceForSpender, "Spender gas price limit is reached");
        }
        _setDepositBalance(_spender, balanceOf(_spender).sub(etherSpent));
        (bool success, ) = _recipient.call.value(etherSpent)("");
        require(success, "Refund failed");
        emit EtherSpent(_spender, _recipient, etherSpent, tx.gasprice);
        return etherSpent;
    }

    /* ========== EVENTS ========== */

    event ContractApproved(bytes32 contractName, bool approved);
    event EtherDeposited(address indexed spender, address indexed recipient, uint value);
    event EtherWithdrawn(address indexed spender, address payable indexed recipient, uint value);
    event EtherSpent(address indexed spender, address payable indexed recipient, uint value, uint gasPrice);
    event MaxGasPriceSet(address indexed account, uint maxGasPriceWei);
}
