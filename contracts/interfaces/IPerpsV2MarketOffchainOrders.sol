pragma solidity ^0.5.16;
pragma experimental ABIEncoderV2;

interface IPerpsV2MarketOffchainOrders {
    function submitOffchainDelayedOrder(int sizeDelta, uint priceImpactDelta) external;

    function submitOffchainDelayedOrderWithTracking(
        int sizeDelta,
        uint priceImpactDelta,
        bytes32 trackingCode
    ) external;

    function cancelOffchainDelayedOrder(address account) external;

    function executeOffchainDelayedOrder(address account, bytes[] calldata priceUpdateData) external payable;
}
