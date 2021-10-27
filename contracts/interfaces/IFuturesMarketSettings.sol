pragma solidity ^0.5.16;

interface IFuturesMarketSettings {
    struct Parameters {
        uint takerFee;
        uint makerFee;
        uint closureFee;
        uint maxLeverage;
        uint maxMarketValueUSD;
        uint maxFundingRate;
        uint skewScaleUSD;
        uint maxFundingRateDelta;
    }

    function takerFee(bytes32 _baseAsset) external view returns (uint);

    function makerFee(bytes32 _baseAsset) external view returns (uint);

    function closureFee(bytes32 _baseAsset) external view returns (uint);

    function maxLeverage(bytes32 _baseAsset) external view returns (uint);

    function maxMarketValueUSD(bytes32 _baseAsset) external view returns (uint);

    function maxFundingRate(bytes32 _baseAsset) external view returns (uint);

    function skewScaleUSD(bytes32 _baseAsset) external view returns (uint);

    function maxFundingRateDelta(bytes32 _baseAsset) external view returns (uint);

    function parameters(bytes32 _baseAsset)
        external
        view
        returns (
            uint _takerFee,
            uint _makerFee,
            uint _closureFee,
            uint _maxLeverage,
            uint _maxMarketValueUSD,
            uint _maxFundingRate,
            uint _skewScaleUSD,
            uint _maxFundingRateDelta
        );

    function minLiquidationFee() external view returns (uint);

    function liquidationFeeBPs() external view returns (uint);

    function liquidationBufferBPs() external view returns (uint);

    function minInitialMargin() external view returns (uint);
}
