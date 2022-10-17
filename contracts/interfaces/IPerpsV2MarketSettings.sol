pragma solidity ^0.5.16;
pragma experimental ABIEncoderV2;

interface IPerpsV2MarketSettings {
    struct Parameters {
        uint takerFee;
        uint makerFee;
        uint takerFeeDelayedOrder;
        uint makerFeeDelayedOrder;
        uint nextPriceConfirmWindow;
        uint delayedOrderConfirmWindow;
        uint maxLeverage;
        uint maxMarketValueUSD;
        uint maxFundingRate;
        uint skewScaleUSD;
        uint minDelayTimeDelta;
        uint maxDelayTimeDelta;
    }

    function takerFee(bytes32 _marketKey) external view returns (uint);

    function makerFee(bytes32 _marketKey) external view returns (uint);

    function takerFeeDelayedOrder(bytes32 _marketKey) external view returns (uint);

    function makerFeeDelayedOrder(bytes32 _marketKey) external view returns (uint);

    function takerFeeOffchainDelayedOrder(bytes32 _marketKey) external view returns (uint);

    function makerFeeOffchainDelayedOrder(bytes32 _marketKey) external view returns (uint);

    function nextPriceConfirmWindow(bytes32 _marketKey) external view returns (uint);

    function delayedOrderConfirmWindow(bytes32 _marketKey) external view returns (uint);

    function offchainDelayedOrderConfirmWindow(bytes32 _marketKey) external view returns (uint);

    function maxLeverage(bytes32 _marketKey) external view returns (uint);

    function maxMarketValueUSD(bytes32 _marketKey) external view returns (uint);

    function maxFundingRate(bytes32 _marketKey) external view returns (uint);

    function skewScaleUSD(bytes32 _marketKey) external view returns (uint);

    function minDelayTimeDelta(bytes32 _marketKey) external view returns (uint);

    function maxDelayTimeDelta(bytes32 _marketKey) external view returns (uint);

    function parameters(bytes32 _marketKey) external view returns (Parameters memory);

    function minKeeperFee() external view returns (uint);

    function liquidationFeeRatio() external view returns (uint);

    function liquidationBufferRatio() external view returns (uint);

    function minInitialMargin() external view returns (uint);
}
