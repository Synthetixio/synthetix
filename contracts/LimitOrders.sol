pragma solidity ^0.5.16;

// Inheritance
import "./Owned.sol";
import "./Pausable.sol";
import "./Proxyable.sol";
import "./SelfDestructible.sol";
import "./MixinResolver.sol";

// Internal references
import "./interfaces/ISynthetix.sol";
import "./interfaces/IAddressResolver.sol";
import "./interfaces/ILimitOrdersState.sol";

import "@nomiclabs/buidler/console.sol";


contract LimitOrders is Owned, Proxyable, SelfDestructible, Pausable, MixinResolver {
    /* ========== STATE VARIABLES ========== */

    bytes32 internal constant CONTRACT_SYNTHETIX = "Synthetix";
    bytes32 internal constant CONTRACT_LIMITORDERSSTATE = "LimitOrdersState";
    bytes32[24] private addressesToCache = [CONTRACT_SYNTHETIX, CONTRACT_LIMITORDERSSTATE];

    /* ========== CONSTRUCTOR ========== */

    constructor(
        address payable _proxy,
        address _owner,
        address _resolver
    ) public Owned(_owner) Proxyable(_proxy) SelfDestructible() Pausable() MixinResolver(_resolver, addressesToCache) {}

    /* ========== VIEW FUNCTIONS ========== */

    function _synthetix() internal view returns (ISynthetix) {
        return ISynthetix(resolver.requireAndGetAddress(CONTRACT_SYNTHETIX, "Missing Synthetix address"));
    }

    function _limitOrdersState() internal view returns (ILimitOrdersState) {
        return
            ILimitOrdersState(resolver.requireAndGetAddress(CONTRACT_LIMITORDERSSTATE, "Missing LimitOrderState address"));
    }

    function _toPayable(address _address) internal pure returns (address payable) {
        return address(uint160(_address));
    }

    function _getOrder(uint orderID) internal view returns (ILimitOrdersState.LimitOrder memory) {
        (
            address submitter,
            bytes32 sourceCurrencyKey,
            uint sourceAmount,
            bytes32 destinationCurrencyKey,
            uint minDestinationAmount,
            uint executionFee
        ) = _limitOrdersState().getOrder(orderID);

        return
            ILimitOrdersState.LimitOrder({
                submitter: _toPayable(submitter),
                sourceCurrencyKey: sourceCurrencyKey,
                sourceAmount: sourceAmount,
                destinationCurrencyKey: destinationCurrencyKey,
                minDestinationAmount: minDestinationAmount,
                executionFee: executionFee
            });
    }

    function getLatestID() public view returns (uint) {
        return _limitOrdersState().getLatestID();
    }

    function getOrder(uint _orderID)
        public
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
        return _limitOrdersState().getOrder(_orderID);
    }

    function getDepositAmount(address _address) public view returns (uint) {
        return _limitOrdersState().getDepositAmount(_address);
    }

    /* ========== MUTATIVE FUNCTIONS ========== */

    function makeDeposit() public payable {
        require(msg.value > 0, "ETH deposit must be greater than 0");
        address payable limitOrdersState = _toPayable(address(_limitOrdersState()));
        limitOrdersState.transfer(msg.value);
        _limitOrdersState().addDeposit(messageSender, msg.value);
        emitDepositMade(messageSender, msg.value);
    }

    function withdrawDeposit() public {
        uint depositAmount;
        depositAmount = _limitOrdersState().removeDeposit(messageSender);
        _toPayable(messageSender).transfer(depositAmount);
        emitDepositWithdrawn(messageSender, depositAmount);
    }

    function createOrder(
        bytes32 _sourceCurrencyKey,
        uint _sourceAmount,
        bytes32 _destinationCurrencyKey,
        uint _minDestinationAmount,
        uint _executionFee
    ) public notPaused optionalProxy returns (uint) {
        require(_sourceAmount > 0, "sourceAmount should be greater than 0");
        require(_minDestinationAmount > 0, "minDestinationAmount should be greater than 0");
        uint latestID;
        latestID = _limitOrdersState().storeOrder(
            messageSender,
            _sourceCurrencyKey,
            _sourceAmount,
            _destinationCurrencyKey,
            _minDestinationAmount,
            _executionFee
        );

        emitOrderCreated(
            latestID,
            messageSender,
            _sourceCurrencyKey,
            _sourceAmount,
            _destinationCurrencyKey,
            _minDestinationAmount,
            _executionFee
        );
        return latestID;
    }

    function cancelOrder(uint _orderID) public optionalProxy {
        _limitOrdersState().deleteOrder(_orderID, messageSender);
        emitOrderCancelled(_orderID);
    }

    function executeOrder(uint _orderID) public notPaused {
        uint gasUsed = gasleft();
        ISynthetix synthetix = _synthetix();
        ILimitOrdersState.LimitOrder memory limitOrder = _getOrder(_orderID);
        require(limitOrder.submitter != address(0), "Order already executed or cancelled");
        uint destinationAmount = synthetix.exchangeOnBehalf(
            limitOrder.submitter,
            limitOrder.sourceCurrencyKey,
            limitOrder.sourceAmount,
            limitOrder.destinationCurrencyKey
        );
        require(destinationAmount >= limitOrder.minDestinationAmount, "target price not reached");
        gasUsed -= gasleft();
        uint refundAmount = gasUsed * tx.gasprice + limitOrder.executionFee;
        _limitOrdersState().deleteOrderAndRefund(_orderID, messageSender, refundAmount);
        _toPayable(messageSender).transfer(refundAmount);
        emitOrderExecuted(_orderID, limitOrder.submitter, messageSender, refundAmount);
    }

    /* ========== EVENTS ========== */

    function addressToBytes32(address input) internal pure returns (bytes32) {
        return bytes32(uint(uint160(input)));
    }

    function uintToBytes32(uint input) internal pure returns (bytes32) {
        return bytes32(uint(uint160(input)));
    }

    event DepositMade(address indexed submitter, uint amount);
    bytes32 private constant DEPOSITMADE_SIG = keccak256("DepositMade(address,uint)");

    function emitDepositMade(address submitter, uint amount) internal {
        proxy._emit(abi.encode(amount), 2, DEPOSITMADE_SIG, addressToBytes32(submitter), 0, 0);
    }

    event DepositWithdrawn(address indexed submitter, uint amount);
    bytes32 private constant DEPOSITWITHDRAWN_SIG = keccak256("DepositWithdrawn(address,uint)");

    function emitDepositWithdrawn(address submitter, uint amount) internal {
        proxy._emit(abi.encode(amount), 2, DEPOSITWITHDRAWN_SIG, addressToBytes32(submitter), 0, 0);
    }

    event OrderCreated(
        uint indexed orderID,
        address indexed submitter,
        bytes32 sourceCurrencyKey,
        uint sourceAmount,
        bytes32 destinationCurrencyKey,
        uint minDestinationAmount,
        uint executionFee
    );
    bytes32 private constant ORDERCREATED_SIG = keccak256("OrderCreated(uint,address,bytes32,uint,bytes32,uint,uint)");

    function emitOrderCreated(
        uint orderID,
        address submitter,
        bytes32 sourceCurrencyKey,
        uint sourceAmount,
        bytes32 destinationCurrencyKey,
        uint minDestinationAmount,
        uint executionFee
    ) internal {
        proxy._emit(
            abi.encode(sourceCurrencyKey, sourceAmount, destinationCurrencyKey, minDestinationAmount, executionFee),
            3,
            ORDERCREATED_SIG,
            uintToBytes32(orderID),
            addressToBytes32(submitter),
            0
        );
    }

    event OrderCancelled(uint indexed orderID);
    bytes32 private constant ORDERCANCELLED_SIG = keccak256("OrderCancelled(uint)");

    function emitOrderCancelled(uint orderID) internal {
        proxy._emit(abi.encode(), 2, ORDERCANCELLED_SIG, uintToBytes32(orderID), 0, 0);
    }

    event OrderExecuted(uint indexed orderID, address indexed submitter, address executer, uint refundAmount);
    bytes32 private constant ORDEREXECUTED_SIG = keccak256("OrderExecuted(uint,address,address, uint)");

    function emitOrderExecuted(
        uint orderID,
        address submitter,
        address executer,
        uint refundAmount
    ) internal {
        proxy._emit(
            abi.encode(executer, refundAmount),
            3,
            ORDEREXECUTED_SIG,
            uintToBytes32(orderID),
            addressToBytes32(submitter),
            0
        );
    }
}
