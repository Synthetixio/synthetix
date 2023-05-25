pragma solidity ^0.5.16;

import "./IPerpsV2MarketBaseTypes.sol";

interface IPerpsV2MarketLiquidate {
    /* ========== FUNCTION INTERFACE ========== */

    /* ---------- Market Operations ---------- */

    function flagPosition(address account) external;

    function liquidatePosition(address account) external;

    function forceLiquidatePosition(address account) external;
}
