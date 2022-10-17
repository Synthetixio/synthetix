pragma solidity ^0.5.16;
pragma experimental ABIEncoderV2;

interface IPerpsV2MarketPythOrders {
    function submitOffchainDelayedOrder(int sizeDelta, bytes[] calldata priceUpdateData) external payable;

    function submitOffchainDelayedOrderWithTracking(
        int sizeDelta,
        bytes32 trackingCode,
        bytes[] calldata priceUpdateData
    ) external payable;

    function cancelOffchainDelayedOrder(address account, bytes[] calldata priceUpdateData) external payable;

    function executeOffchainDelayedOrder(address account, bytes[] calldata priceUpdateData) external payable;
}
