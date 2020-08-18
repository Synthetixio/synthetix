pragma solidity ^0.5.16;

// Inheritance
import "./Owned.sol";
import "./MixinResolver.sol";

// Libraries
import "./SafeDecimalMath.sol";

// Internal references
import "./interfaces/ILimitOrdersState.sol";
import "./interfaces/IAddressResolver.sol";

import "@nomiclabs/buidler/console.sol";


contract LimitOrdersState is Owned, MixinResolver, ILimitOrdersState {
    /* ========== LIBRARIES ========== */

    using SafeMath for uint;
    using SafeDecimalMath for uint;

    /* ========== STATE VARIABLES ========== */

    bytes32 internal constant CONTRACT_LIMITORDERS = "LimitOrders";
    bytes32[24] private addressesToCache = [CONTRACT_LIMITORDERS];

    uint public latestID;
    address[] public depositors;
    mapping(uint => LimitOrder) public orders;
    mapping(address => uint) public deposits;

    /* ========== CONSTRUCTOR ========== */

    constructor(address _owner, address _resolver) public Owned(_owner) MixinResolver(_resolver, addressesToCache) {}

    /* ========== VIEW FUNCTIONS ========== */

    function _toPayable(address _address) internal pure returns (address payable) {
        return address(uint160(_address));
    }

    function _limitOrders() internal view returns (address) {
        return resolver.requireAndGetAddress(CONTRACT_LIMITORDERS, "Missing LimitOrders address");
    }

    function getLatestID() external view returns (uint) {
        return latestID;
    }

    function getOrder(uint _orderID)
        external
        view
        returns (
            address submitter,
            bytes32 sourceCurrencyKey,
            uint sourceAmount,
            bytes32 destinationCurrencyKey,
            uint minDestinationAmount,
            uint executionFee
        )
    {
        LimitOrder memory order = orders[_orderID];
        return (
            order.submitter,
            order.sourceCurrencyKey,
            order.sourceAmount,
            order.destinationCurrencyKey,
            order.minDestinationAmount,
            order.executionFee
        );
    }

    function getDepositAmount(address _address) external view returns (uint) {
        return deposits[_address];
    }

    /* ========== MUTATIVE FUNCTIONS ========== */

    function addDeposit(address _submitter, uint _value) external onlyLimitOrders {
        deposits[_submitter] = deposits[_submitter].add(_value);
        emit DepositAdded(_submitter, _value);
    }

    function removeDeposit(address _submitter) external onlyLimitOrders returns (uint) {
        uint amount = deposits[_submitter];
        require(amount > 0, "Must have a deposit with positive balance");
        delete deposits[_submitter];
        msg.sender.transfer(amount);
        emit DepositWithdrawn(_submitter, amount);
        return amount;
    }

    function _storeOrder(
        address _submitter,
        bytes32 _sourceCurrencyKey,
        uint _sourceAmount,
        bytes32 _destinationCurrencyKey,
        uint _minDestinationAmount,
        uint _executionFee
    ) internal returns (uint) {
        latestID++;
        orders[latestID] = LimitOrder(
            _submitter,
            _sourceCurrencyKey,
            _sourceAmount,
            _destinationCurrencyKey,
            _minDestinationAmount,
            _executionFee
        );
        emit OrderStored(
            latestID,
            _submitter,
            _sourceCurrencyKey,
            _sourceAmount,
            _destinationCurrencyKey,
            _minDestinationAmount,
            _executionFee
        );
        return latestID;
    }

    function storeOrder(
        address _submitter,
        bytes32 _sourceCurrencyKey,
        uint _sourceAmount,
        bytes32 _destinationCurrencyKey,
        uint _minDestinationAmount,
        uint _executionFee
    ) external payable onlyLimitOrders returns (uint) {
        return
            _storeOrder(
                _submitter,
                _sourceCurrencyKey,
                _sourceAmount,
                _destinationCurrencyKey,
                _minDestinationAmount,
                _executionFee
            );
    }

    function _deleteOrder(uint _orderID, address _submitter) internal {
        LimitOrder memory order = orders[_orderID];
        require(order.submitter != address(0), "Order already executed or cancelled");
        require(order.submitter == _submitter, "Sender must be the order submitter");
        delete orders[_orderID];
        emit OrderDeleted(_orderID);
    }

    function deleteOrder(uint _orderID, address _submitter) external onlyLimitOrders {
        _deleteOrder(_orderID, _submitter);
    }

    function deleteOrderAndRefund(
        uint _orderID,
        address _submitter,
        uint _refundAmount
    ) external onlyLimitOrders {
        uint balance = deposits[_submitter];
        require(balance >= _refundAmount, "Deposit balance is too low");
        _deleteOrder(_orderID, _submitter);
        deposits[_submitter].sub(_refundAmount);
        msg.sender.transfer(_refundAmount);
    }

    function migrateOrders(LimitOrdersState receivingState, uint[] calldata _orderIDs) external onlyOwner {
        uint numOrders = _orderIDs.length;
        if (numOrders == 0) {
            return;
        }

        LimitOrder[] memory ordersToMigrate;
        uint[] memory balancesToMigrate;

        for (uint i = 0; i < numOrders; i++) {
            LimitOrder memory order = orders[i];
            delete orders[i];
            ordersToMigrate[i] = order;
        }
        receivingState.receiveOrders(ordersToMigrate);

        for (uint i = 0; i < depositors.length; i++) {
            address depositor = depositors[i];
            uint balance = deposits[depositor];
            delete depositors[i];
            delete deposits[depositor];
            balancesToMigrate[i] = balance;
            _toPayable(address(receivingState)).transfer(balance);
        }
        receivingState.receiveDeposits(depositors, balancesToMigrate);
    }

    function receiveOrders(LimitOrder[] calldata _orders) external onlyOwner {
        for (uint i = 0; i < _orders.length; i++) {
            orders[i] = _orders[i];
        }
    }

    function receiveDeposits(address[] calldata _depositors, uint[] calldata _balances) external onlyOwner {
        require(_depositors.length == _balances.length, "Length mismatch");

        for (uint i = 0; i < _depositors.length; i++) {
            address depositor = _depositors[i];
            depositors[i] = depositor;
            deposits[depositor] = _balances[i];
        }
    }

    /* ========== MODIFIERS ========== */

    modifier onlyLimitOrders {
        require(msg.sender == _limitOrders(), "Only the LimitOrders contract can perform this action");
        _;
    }

    /* ========== EVENTS ========== */

    event DepositAdded(address indexed submitter, uint amount);

    event DepositWithdrawn(address indexed submitter, uint amount);

    event OrderStored(
        uint indexed orderID,
        address indexed submitter,
        bytes32 sourceCurrencyKey,
        uint sourceAmount,
        bytes32 destinationCurrencyKey,
        uint minDestinationAmount,
        uint executionFee
    );

    event OrderDeleted(uint indexed orderID);

    event OrderImported(uint indexed orderID);

    event DepositImported(address indexed account, uint balance);
}
