pragma solidity ^0.5.16;

import "../interfaces/IDexPriceAggregator.sol";
import "../interfaces/IERC20.sol";
import "../SafeDecimalMath.sol";

import "hardhat/console.sol";

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

        uint inDecimals = IERC20(tokenIn).decimals();
        uint outDecimals = IERC20(tokenOut).decimals();

        console.log("exchange %s %s", tokenIn, rates[tokenIn]);

        // Output with tokenOut's decimals; assume input is given with tokenIn's decimals
        // and rates are given with tokenOut's decimals
        return (rates[tokenIn] * (amountIn)) / (rates[tokenOut]);
        // return (rates[tokenIn] * (amountIn * 10**inDecimals)) / (rates[tokenOut] * 10**outDecimals);
        // something like: (sourceAmount.mul(10**uint(sourceEquivalent.decimals()))).div(SafeDecimalMath.unit());
    }

    // Rate should be specified with output token's decimals
    function setAssetToAssetRate(address _asset, uint _rate) external {
        console.log("set %s %s", _asset, _rate);
        rates[_asset] = _rate;
    }

    function setAssetToAssetShouldRevert(bool _shouldRevert) external {
        assetToAssetShouldRevert = _shouldRevert;
    }
}
