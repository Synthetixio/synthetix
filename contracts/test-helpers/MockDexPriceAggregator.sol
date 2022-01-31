pragma solidity ^0.5.16;

import "../interfaces/IDexPriceAggregator.sol";
import "../interfaces/IERC20.sol";
import "../SafeDecimalMath.sol";

contract MockDexPriceAggregator is IDexPriceAggregator {
    using SafeDecimalMath for uint;

    mapping(address => uint) public rates;
    bool public assetToAssetShouldRevert;

    function assetToAsset(
        address tokenIn,
        uint amountIn,
        address tokenOut,
        uint
    ) external view returns (uint amountOut) {
        if (assetToAssetShouldRevert) {
            revert("mock assetToAsset() reverted");
        }
        // Assumes equivalent decimals on in and out tokens
        return (rates[tokenIn] * (amountIn)) / (rates[tokenOut]);
    }

    // Rate should be specified with output token's decimals
    function setAssetToAssetRate(address _asset, uint _rate) external {
        rates[_asset] = _rate;
    }

    function setAssetToAssetShouldRevert(bool _shouldRevert) external {
        assetToAssetShouldRevert = _shouldRevert;
    }
}
