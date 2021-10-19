pragma solidity ^0.8.4;

// Empty contract for ether collateral placeholder for OVM
// https://docs.synthetix.io/contracts/source/contracts/emptyethercollateral

import "./interfaces/IFuturesMarketManager.sol";

contract EmptyFuturesMarketManager is IFuturesMarketManager {
    function markets(uint index, uint pageSize) external view returns (address[] memory markets) {
        index;
        pageSize;
        return markets;
    }

    function numMarkets() external view returns (uint) {
        return 0;
    }

    function allMarkets() external view returns (address[] memory markets) {
        return markets;
    }

    function marketForAsset(bytes32 asset) external view returns (address) {
        asset;
        return address(0);
    }

    function marketsForAssets(bytes32[] calldata assets) external view returns (address[] memory markets) {
        assets;
        return markets;
    }

    function totalDebt() external view returns (uint debt, bool isInvalid) {
        return (0, false);
    }
}
