pragma solidity ^0.5.16;
pragma experimental ABIEncoderV2;

interface IDexTwapAggregator {
    struct QuoteParams {
        uint quoteOut; // Aggregated output
        uint amountOut; // Aggregated TWAP output
        uint currentOut; // Aggregated spot output
        uint sTWAP;
        uint uTWAP;
        uint sCUR;
        uint uCUR;
        uint cl;
    }

    function assetToAsset(
        address tokenIn,
        uint amountIn,
        address tokenOut,
        uint granularity
    ) external view returns (QuoteParams memory q);
}
