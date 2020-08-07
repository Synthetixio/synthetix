pragma solidity ^0.5.16;

// Inheritance
import "./Owned.sol";
import "./Pausable.sol";
import "./Proxyable.sol";
import "./SelfDestructible.sol";

// Internal references
import "./interfaces/ISynthetix.sol";
import "./interfaces/IAddressResolver.sol";


contract LimitOrders is Owned, Proxyable, SelfDestructible, Pausable {
    /* ========== TYPES ========== */

    struct LimitOrder {
        address payable submitter;
        bytes32 sourceCurrencyKey;
        uint256 sourceAmount;
        bytes32 destinationCurrencyKey;
        uint256 minDestinationAmount;
        uint256 weiDeposit;
        uint256 executionFee;
    }

    /* ========== STATE VARIABLES ========== */

    IAddressResolver public addressResolverProxy;

    uint256 public orderCount;
    bytes32 internal constant CONTRACT_SYNTHETIX = "Synthetix";

    mapping(uint256 => LimitOrder) public orders;

    /* ========== CONSTRUCTOR ========== */

    constructor(
        address payable _proxy,
        address _owner,
        address _resolver
    ) public Owned(_owner) SelfDestructible() Proxyable(_proxy) {
        addressResolverProxy = IAddressResolver(_resolver);
    }

    /* ========== VIEW FUNCTIONS ========== */

    function _synthetix() internal view returns (ISynthetix) {
        return ISynthetix(addressResolverProxy.requireAndGetAddress(CONTRACT_SYNTHETIX, "Missing Synthetix address"));
    }

    /* ========== MUTATIVE FUNCTIONS ========== */

    function newOrder(
        bytes32 sourceCurrencyKey,
        uint sourceAmount,
        bytes32 destinationCurrencyKey,
        uint minDestinationAmount,
        uint executionFee
    ) public payable notPaused returns (uint) {
        require(sourceAmount > 0, "sourceAmount should be greater than 0");
        require(minDestinationAmount > 0, "minDestinationAmount should be greater than 0");
        require(msg.value > executionFee, "wei deposit must be larger than executionFee");
        orderCount++;
        orders[orderCount] = LimitOrder(
            msg.sender,
            sourceCurrencyKey,
            sourceAmount,
            destinationCurrencyKey,
            minDestinationAmount,
            msg.value,
            executionFee
        );
        emit Order(
            orderCount,
            msg.sender,
            sourceCurrencyKey,
            sourceAmount,
            destinationCurrencyKey,
            minDestinationAmount,
            executionFee,
            msg.value
        );
        return orderCount;
    }

    function cancelOrder(uint orderID) public {
        require(orderID <= orderCount, "Order does not exist");
        LimitOrder storage order = orders[orderID];
        require(order.submitter == msg.sender, "Order already executed or cancelled");
        msg.sender.transfer(order.weiDeposit);
        delete orders[orderID];
        emit Cancel(orderID);
    }

    function executeOrder(uint orderID) public notPaused {
        ISynthetix synthetix = _synthetix();
        uint gasUsed = gasleft();
        require(orderID <= orderCount, "Order does not exist");
        LimitOrder storage order = orders[orderID];
        require(order.submitter != address(0), "Order already executed or cancelled");
        uint destinationAmount = synthetix.exchangeOnBehalf(
            order.submitter,
            order.sourceCurrencyKey,
            order.sourceAmount,
            order.destinationCurrencyKey
        );
        require(destinationAmount >= order.minDestinationAmount, "target price not reached");
        emit Execute(orderID, order.submitter, msg.sender);
        gasUsed -= gasleft();
        uint refund = ((gasUsed + 32231) * tx.gasprice) + order.executionFee; // magic number generated using tests
        require(order.weiDeposit >= refund, "Insufficient weiDeposit");
        order.submitter.transfer(order.weiDeposit - refund);
        delete orders[orderID];
        msg.sender.transfer(refund);
    }

    event Order(
        uint indexed orderID,
        address indexed submitter,
        bytes32 sourceCurrencyKey,
        uint sourceAmount,
        bytes32 destinationCurrencyKey,
        uint minDestinationAmount,
        uint executionFee,
        uint weiDeposit
    );
    event Cancel(uint indexed orderID);
    event Execute(uint indexed orderID, address indexed submitter, address executer);
}
