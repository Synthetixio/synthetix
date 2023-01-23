pragma solidity ^0.5.16;
pragma experimental ABIEncoderV2;

import "./IPerpsV2MarketBaseTypes.sol";

interface IPerpsV2MarketDelayedIntent {
    function closeDelayedOrder(IPerpsV2MarketBaseTypes.OrderType orderType) external;

    function submitOrder(
        IPerpsV2MarketBaseTypes.OrderType orderType,
        int sizeDelta,
        uint priceImpactDelta,
        uint desiredTimeDelta,
        bytes32 trackingCode
    ) external;

    // Legacy. Attention integrators: This function will be removed soon
    function submitDelayedOrder(
        int sizeDelta,
        uint priceImpactDelta,
        uint desiredTimeDelta
    ) external;

    // Legacy. Attention integrators: This function will be removed soon
    function submitDelayedOrderWithTracking(
        int sizeDelta,
        uint priceImpactDelta,
        uint desiredTimeDelta,
        bytes32 trackingCode
    ) external;

    // Legacy. Attention integrators: This function will be removed soon
    function submitOffchainDelayedOrder(int sizeDelta, uint priceImpactDelta) external;

    // Legacy. Attention integrators: This function will be removed soon
    function submitOffchainDelayedOrderWithTracking(
        int sizeDelta,
        uint priceImpactDelta,
        bytes32 trackingCode
    ) external;
}
