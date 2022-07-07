pragma solidity ^0.5.16;

interface IPerpsV2Settings {
    struct Parameters {
        uint baseFee;
        uint baseFeeNextPrice;
        uint nextPriceConfirmWindow;
        uint maxLeverage;
        uint maxSingleSideValueUSD;
        uint maxFundingRate;
        uint skewScaleUSD;
    }

    function baseFee(bytes32 _marketKey) external view returns (uint);

    function baseFeeNextPrice(bytes32 _marketKey) external view returns (uint);

    function nextPriceConfirmWindow(bytes32 _marketKey) external view returns (uint);

    function maxLeverage(bytes32 _marketKey) external view returns (uint);

    function maxSingleSideValueUSD(bytes32 _marketKey) external view returns (uint);

    function maxFundingRate(bytes32 _marketKey) external view returns (uint);

    function skewScaleUSD(bytes32 _marketKey) external view returns (uint);

    function parameters(bytes32 _marketKey)
        external
        view
        returns (
            uint _baseFee,
            uint _baseFeeNextPrice,
            uint _nextPriceConfirmWindow,
            uint _maxLeverage,
            uint _maxSingleSideValueUSD,
            uint _maxFundingRate,
            uint _skewScaleUSD
        );

    function minKeeperFee() external view returns (uint);

    function liquidationFeeRatio() external view returns (uint);

    function liquidationBufferRatio() external view returns (uint);

    function minInitialMargin() external view returns (uint);
}
