pragma solidity ^0.8.8;

interface IFuturesMarketManager {
    function markets(uint index, uint pageSize) external view returns (address[] memory);

    function numMarkets() external view returns (uint);

    function allMarkets() external view returns (address[] memory);

    function marketForAsset(bytes32 asset) external view returns (address);

    function marketsForAssets(bytes32[] calldata assets) external view returns (address[] memory);

    function totalDebt() external view returns (uint debt, bool isInvalid);
}
