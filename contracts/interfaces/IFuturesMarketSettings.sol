pragma solidity ^0.5.16;

interface IFuturesMarketSettings {
    function takerFee(bytes32 _baseAsset) external view returns (uint);

    function makerFee(bytes32 _baseAsset) external view returns (uint);

    function maxLeverage(bytes32 _baseAsset) external view returns (uint);

    function maxMarketValue(bytes32 _baseAsset) external view returns (uint);

    function maxFundingRate(bytes32 _baseAsset) external view returns (uint);

    function maxFundingRateSkew(bytes32 _baseAsset) external view returns (uint);

    function maxFundingRateDelta(bytes32 _baseAsset) external view returns (uint);

    function allParameters(bytes32 _baseAsset)
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

    function futuresLiquidationFee() external view returns (uint);

    function futuresMinInitialMargin() external view returns (uint);
}
