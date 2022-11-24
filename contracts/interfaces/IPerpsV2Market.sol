pragma solidity ^0.5.16;

import "./IPerpsV2MarketBaseTypes.sol";

interface IPerpsV2Market {
    /* ========== FUNCTION INTERFACE ========== */

    /* ---------- Market Operations ---------- */

    function recomputeFunding() external returns (uint lastIndex);

    function transferMargin(int marginDelta) external;

    function withdrawAllMargin() external;

    function modifyPosition(int sizeDelta, uint priceImpactDelta) external;

    function modifyPositionWithTracking(
        int sizeDelta,
        uint priceImpactDelta,
        bytes32 trackingCode
    ) external;

    function closePosition(uint priceImpactDelta) external;

    function closePositionWithTracking(uint priceImpactDelta, bytes32 trackingCode) external;

    function liquidatePosition(address account) external;
}
