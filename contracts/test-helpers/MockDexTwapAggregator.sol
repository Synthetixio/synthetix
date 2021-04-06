pragma solidity ^0.5.16;
pragma experimental ABIEncoderV2;

import "openzeppelin-solidity-2.3.0/contracts/math/Math.sol";
import "../interfaces/IDexTwapAggregator.sol";
import "../interfaces/IERC20.sol";
import "../SafeDecimalMath.sol";

contract MockDexTwapAggregator is IDexTwapAggregator {
    using SafeDecimalMath for uint;

    uint public twapRate;
    uint public spotRate;
    uint public clRate;
    bool public assetToAssetShouldRevert;

    function assetToAsset(
        address tokenIn,
        uint amountIn,
        address,
        uint
    ) external view returns (QuoteParams memory q) {
        if (assetToAssetShouldRevert) {
            revert("assetToAsset reverted");
        }

        uint inDecimals = IERC20(tokenIn).decimals();

        // Output with tokenOut's decimals; assume input is given with tokenIn's decimals
        // and rates are given with tokenOut's decimals
        uint twapOutput = (twapRate * amountIn) / 10**inDecimals;
        uint spotOutput = (spotRate * amountIn) / 10**inDecimals;
        uint clOutput = (clRate * amountIn) / 10**inDecimals;

        q.amountOut = twapOutput;
        q.sTWAP = twapOutput;
        q.uTWAP = twapOutput;

        q.currentOut = spotOutput;
        q.sCUR = spotOutput;
        q.uCUR = spotOutput;

        q.cl = clOutput;

        q.quoteOut = Math.min(Math.min(q.amountOut, q.currentOut), q.cl);
    }

    // Rates should be specified with output token's decimals
    function setAssetToAssetRates(
        uint _twapRate,
        uint _spotRate,
        uint _clRate
    ) external {
        twapRate = _twapRate;
        spotRate = _spotRate;
        clRate = _clRate;
    }

    function setAssetToAssetShouldRevert(bool _shouldRevert) external {
        assetToAssetShouldRevert = _shouldRevert;
    }
}
