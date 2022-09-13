pragma solidity ^0.5.16;

import "./IFuturesV2MarketBaseTypes.sol";

interface IFuturesV2Market {
    /* ========== FUNCTION INTERFACE ========== */

    /* ---------- Market Operations ---------- */

    function recomputeFunding() external returns (uint lastIndex);

    function transferMargin(int marginDelta) external;

    function withdrawAllMargin() external;

    function modifyPosition(int sizeDelta) external;

    function modifyPositionWithTracking(int sizeDelta, bytes32 trackingCode) external;

    function submitNextPriceOrder(int sizeDelta) external;

    function submitNextPriceOrderWithTracking(int sizeDelta, bytes32 trackingCode) external;

    function cancelNextPriceOrder(address account) external;

    function executeNextPriceOrder(address account) external;

    function closePosition() external;

    function closePositionWithTracking(bytes32 trackingCode) external;

    function liquidatePosition(address account) external;
}
