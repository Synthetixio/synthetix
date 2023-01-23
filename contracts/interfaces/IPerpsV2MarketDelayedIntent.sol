pragma solidity ^0.5.16;
pragma experimental ABIEncoderV2;

import "./IPerpsV2MarketBaseTypes.sol";

interface IPerpsV2MarketDelayedIntent {
    function submitCloseOffchainDelayedOrderWithTracking(
        uint priceImpactDelta,
        bytes32 trackingCode
    ) external;

    function submitCloseDelayedOrderWithTracking(
        uint desiredTimeDelta,
        uint priceImpactDelta,
        bytes32 trackingCode
    ) external;

    function submitDelayedOrder(
        int sizeDelta,
        uint priceImpactDelta,
        uint desiredTimeDelta
    ) external;

    function submitDelayedOrderWithTracking(
        int sizeDelta,
        uint priceImpactDelta,
        uint desiredTimeDelta,
        bytes32 trackingCode
    ) external;

    function submitOffchainDelayedOrder(int sizeDelta, uint priceImpactDelta) external;

    function submitOffchainDelayedOrderWithTracking(
        int sizeDelta,
        uint priceImpactDelta,
        bytes32 trackingCode
    ) external;
}
