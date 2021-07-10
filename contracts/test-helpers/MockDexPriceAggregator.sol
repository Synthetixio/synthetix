pragma solidity ^0.5.16;

import "openzeppelin-solidity-2.3.0/contracts/math/Math.sol";
import "../interfaces/IDexPriceAggregator.sol";
import "../interfaces/IERC20.sol";
import "../SafeDecimalMath.sol";

contract MockDexPriceAggregator is IDexPriceAggregator {
    using SafeDecimalMath for uint;

    uint public rate;
    bool public assetToAssetShouldRevert;

    function assetToAsset(
        address tokenIn,
        uint amountIn,
        address,
        uint
    ) external view returns (uint amountOut) {
        if (assetToAssetShouldRevert) {
            revert("mock assetToAsset() reverted");
        }

        uint inDecimals = IERC20(tokenIn).decimals();

        // Output with tokenOut's decimals; assume input is given with tokenIn's decimals
        // and rates are given with tokenOut's decimals
        return (rate * amountIn) / 10**inDecimals;
    }

    // Rate should be specified with output token's decimals
    function setAssetToAssetRate(uint _rate) external {
        rate = _rate;
    }

    function setAssetToAssetShouldRevert(bool _shouldRevert) external {
        assetToAssetShouldRevert = _shouldRevert;
    }
}
