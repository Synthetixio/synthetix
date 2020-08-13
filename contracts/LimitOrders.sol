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

    function _getOrder(uint orderID) internal view returns (ILimitOrdersState.LimitOrder memory) {
        (
            address submitter,
            bytes32 sourceCurrencyKey,
            uint256 sourceAmount,
            bytes32 destinationCurrencyKey,
            uint256 minDestinationAmount,
            uint256 weiDeposit,
            uint256 executionFee
        ) = _limitOrdersState().getOrder(orderID);

        return
            ILimitOrdersState.LimitOrder({
                submitter: address(uint160(submitter)),
                sourceCurrencyKey: sourceCurrencyKey,
                sourceAmount: sourceAmount,
                destinationCurrencyKey: destinationCurrencyKey,
                minDestinationAmount: minDestinationAmount,
                weiDeposit: weiDeposit,
                executionFee: executionFee
            });
    }

    function getLatestID() public view returns (uint) {
        _limitOrdersState().getLatestID();
    }

    /* ========== MUTATIVE FUNCTIONS ========== */

    function createOrder(
        bytes32 _sourceCurrencyKey,
        uint _sourceAmount,
        bytes32 _destinationCurrencyKey,
        uint _minDestinationAmount,
        uint _executionFee
    ) public payable notPaused returns (uint) {
        require(_sourceAmount > 0, "sourceAmount should be greater than 0");
        require(_minDestinationAmount > 0, "minDestinationAmount should be greater than 0");
        require(msg.value > _executionFee, "wei deposit must be larger than executionFee");
        uint latestID;
        latestID = _limitOrdersState().storeOrder(
            messageSender,
            _sourceCurrencyKey,
            _sourceAmount,
            _destinationCurrencyKey,
            _minDestinationAmount,
            msg.value,
            _executionFee
        );

        emitOrderCreated(
            latestID,
            messageSender,
            _sourceCurrencyKey,
            _sourceAmount,
            _destinationCurrencyKey,
            _minDestinationAmount,
            msg.value,
            _executionFee
        );
        return latestID;
    }

    function cancelOrder(uint _orderID) public {
        address payable sender = address(uint160(messageSender));
        uint refundAmount = _limitOrdersState().deleteOrder(_orderID, messageSender);
        sender.transfer(refundAmount);
        emitOrderCancelled(_orderID);
    }

    function executeOrder(uint _orderID) public notPaused {
        ISynthetix synthetix = _synthetix();
        ILimitOrdersState limitOrdersState = _limitOrdersState();
        uint latestOrderID = limitOrdersState.getLatestID();
        require(_orderID <= latestOrderID, "Order does not exist");
        ILimitOrdersState.LimitOrder memory limitOrder = _getOrder(_orderID);
        require(limitOrder.submitter != address(0), "Order already executed or cancelled");
        uint destinationAmount = synthetix.exchangeOnBehalf(
            limitOrder.submitter,
            limitOrder.sourceCurrencyKey,
            limitOrder.sourceAmount,
            limitOrder.destinationCurrencyKey
        );
        require(destinationAmount >= limitOrder.minDestinationAmount, "target price not reached");
        _limitOrdersState().deleteOrder(_orderID, messageSender);
        emitOrderExecuted(_orderID, limitOrder.submitter, messageSender);
    }

    // function executeOrder(uint orderID) public notPaused {
    //     ISynthetix synthetix = _synthetix();
    //     uint gasUsed = gasleft();
    //     require(orderID <= latestID, "Order does not exist");
    //     LimitOrder storage order = orders[orderID];
    //     require(order.submitter != address(0), "Order already executed or cancelled");
    //     uint destinationAmount = synthetix.exchangeOnBehalf(
    //         order.submitter,
    //         order.sourceCurrencyKey,
    //         order.sourceAmount,
    //         order.destinationCurrencyKey
    //     );
    //     require(destinationAmount >= order.minDestinationAmount, "target price not reached");
    //     emit Execute(orderID, order.submitter, messageSender);
    //     gasUsed -= gasleft();
    //     uint refund = ((gasUsed + 32231) * tx.gasprice) + order.executionFee; // magic number generated using tests
    //     require(order.weiDeposit >= refund, "Insufficient weiDeposit");
    //     order.submitter.transfer(order.weiDeposit - refund);
    //     delete orders[orderID];
    //     messageSender.transfer(refund);
    // }

    /* ========== EVENTS ========== */
    function addressToBytes32(address input) internal pure returns (bytes32) {
        return bytes32(uint256(uint160(input)));
    }

    function uintToBytes32(uint input) internal pure returns (bytes32) {
        return bytes32(uint256(uint160(input)));
    }

    event OrderCreated(
        uint indexed orderID,
        address indexed submitter,
        bytes32 sourceCurrencyKey,
        uint sourceAmount,
        bytes32 destinationCurrencyKey,
        uint minDestinationAmount,
        uint weiDeposit,
        uint executionFee
    );
    bytes32 private constant ORDERCREATED_SIG = keccak256("OrderCreated(uint,address,bytes32,uint,bytes32,uint,uint,uint)");

    function emitOrderCreated(
        uint orderID,
        address submitter,
        bytes32 sourceCurrencyKey,
        uint sourceAmount,
        bytes32 destinationCurrencyKey,
        uint minDestinationAmount,
        uint weiDeposit,
        uint executionFee
    ) internal {
        proxy._emit(
            abi.encode(
                sourceCurrencyKey,
                sourceAmount,
                destinationCurrencyKey,
                minDestinationAmount,
                weiDeposit,
                executionFee
            ),
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

    event OrderExecuted(uint indexed orderID, address indexed submitter, address executer);
    bytes32 private constant ORDEREXECUTED_SIG = keccak256("OrderExecuted(uint,address,address)");

    function emitOrderExecuted(
        uint orderID,
        address submitter,
        address executer
    ) internal {
        proxy._emit(abi.encode(executer), 3, ORDEREXECUTED_SIG, uintToBytes32(orderID), addressToBytes32(submitter), 0);
    }
}
