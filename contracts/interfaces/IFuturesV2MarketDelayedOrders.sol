pragma solidity ^0.5.16;

interface IFuturesV2MarketDelayedOrders {
    function submitDelayedOrder(int sizeDelta, uint desiredTimeDelta) external;

    function submitDelayedOrderWithTracking(
        int sizeDelta,
        uint desiredTimeDelta,
        bytes32 trackingCode
    ) external;

    function cancelDelayedOrder(address account) external;

    function executeDelayedOrder(address account) external;
}
