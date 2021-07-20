pragma solidity ^0.5.16;

interface IFuturesMarketSettings {
    struct Parameters {
        uint takerFee;
        uint makerFee;
        uint maxLeverage;
        uint maxMarketValue;
        uint maxFundingRate;
        uint maxFundingRateSkew;
        uint maxFundingRateDelta;
    }

    function takerFee(bytes32 _baseAsset) external view returns (uint);

    function makerFee(bytes32 _baseAsset) external view returns (uint);

    function maxLeverage(bytes32 _baseAsset) external view returns (uint);

    function maxMarketValue(bytes32 _baseAsset) external view returns (uint);

    function maxFundingRate(bytes32 _baseAsset) external view returns (uint);

    function maxFundingRateSkew(bytes32 _baseAsset) external view returns (uint);

    function maxFundingRateDelta(bytes32 _baseAsset) external view returns (uint);

    function parameters(bytes32 _baseAsset)
        external
        view
        returns (
            uint _takerFee,
            uint _makerFee,
            uint _maxLeverage,
            uint _maxMarketValue,
            uint _maxFundingRate,
            uint _maxFundingRateSkew,
            uint _maxFundingRateDelta
        );

    function liquidationFee() external view returns (uint);

    function minInitialMargin() external view returns (uint);
}
