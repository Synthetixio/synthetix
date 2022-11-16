pragma solidity ^0.5.16;

interface IPerpsV2MarketDelayedOrders {
    function submitDelayedOrder(int sizeDelta, uint slippage, uint desiredTimeDelta) external;

    function submitDelayedOrderWithTracking(
        int sizeDelta,
        uint slippage,
        uint desiredTimeDelta,
        bytes32 trackingCode
    ) external;

    function cancelDelayedOrder(address account) external;

    function executeDelayedOrder(address account) external;
}
