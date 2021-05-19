pragma solidity ^0.5.16;

interface IDexTwapAggregator {
    function assetToAsset(
        address tokenIn,
        uint amountIn,
        address tokenOut,
        uint twapPeriod
    ) external view returns (uint amountOut);
}
