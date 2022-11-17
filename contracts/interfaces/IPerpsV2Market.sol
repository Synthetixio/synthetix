pragma solidity ^0.5.16;

import "./IPerpsV2MarketBaseTypes.sol";

interface IPerpsV2Market {
    /* ========== FUNCTION INTERFACE ========== */

    /* ---------- Market Operations ---------- */

    function recomputeFunding() external returns (uint lastIndex);

    function transferMargin(int marginDelta) external;

    function withdrawAllMargin() external;

    function modifyPosition(int sizeDelta, uint slippage) external;

    function modifyPositionWithTracking(
        int sizeDelta,
        uint slippage,
        bytes32 trackingCode
    ) external;

    function closePosition() external;

    function closePositionWithTracking(bytes32 trackingCode) external;

    function liquidatePosition(address account) external;
}
