pragma solidity ^0.5.16;

interface IFuturesMarketSettings {
    function getTakerFee(bytes32 _baseAsset) external view returns (uint);

    function getMakerFee(bytes32 _baseAsset) external view returns (uint);

    function getMaxLeverage(bytes32 _baseAsset) external view returns (uint);

    function getMaxMarketValue(bytes32 _baseAsset) external view returns (uint);

    function getMaxFundingRate(bytes32 _baseAsset) external view returns (uint);

    function getMaxFundingRateSkew(bytes32 _baseAsset) external view returns (uint);

    function getMaxFundingRateDelta(bytes32 _baseAsset) external view returns (uint);

    function getAllParameters(bytes32 _baseAsset)
        external
        view
        returns (
            uint takerFee,
            uint makerFee,
            uint maxLeverage,
            uint maxMarketValue,
            uint maxFundingRate,
            uint maxFundingRateSkew,
            uint maxFundingRateDelta
        );
}
