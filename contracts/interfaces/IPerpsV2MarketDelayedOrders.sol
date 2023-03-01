pragma solidity ^0.5.16;

interface IPerpsV2MarketDelayedOrders {
    function submitDelayedOrder(
        int sizeDelta,
        uint desiredTimeDelta,
        uint desiredFillPrice
    ) external;

    function submitDelayedOrderWithTracking(
        int sizeDelta,
        uint desiredTimeDelta,
        uint desiredFillPrice,
        bytes32 trackingCode
    ) external;

    function cancelDelayedOrder(address account) external;

    function executeDelayedOrder(address account) external;
}
