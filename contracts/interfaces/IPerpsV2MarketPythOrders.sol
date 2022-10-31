pragma solidity ^0.5.16;
pragma experimental ABIEncoderV2;

interface IPerpsV2MarketPythOrders {
    function submitOffchainDelayedOrder(int sizeDelta) external;

    function submitOffchainDelayedOrderWithTracking(int sizeDelta, bytes32 trackingCode) external;

    function executeOffchainDelayedOrder(address account, bytes[] calldata priceUpdateData) external payable;
}
