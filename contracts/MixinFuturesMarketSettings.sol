pragma solidity ^0.5.16;

import "./MixinResolver.sol";

// Internal references
import "./interfaces/IFlexibleStorage.sol";

// https://docs.synthetix.io/contracts/source/contracts/MixinFuturesMarketSettings
contract MixinFuturesMarketSettings is MixinResolver {
    /* ========== CONSTANTS ========== */

    bytes32 internal constant SETTING_CONTRACT_NAME = "FuturesMarketSettings";

    /* ---------- Parameter Names ---------- */

    // Per-market settings
    bytes32 internal constant PARAMETER_TAKER_FEE = "takerFee";
    bytes32 internal constant PARAMETER_MAKER_FEE = "makerFee";
    bytes32 internal constant PARAMETER_TAKER_FEE_NEXT_PRICE = "takerFeeNextPrice";
    bytes32 internal constant PARAMETER_MAKER_FEE_NEXT_PRICE = "makerFeeNextPrice";
    bytes32 internal constant PARAMETER_NEXT_PRICE_CONFIRM_WINDOW = "nextPriceConfirmWindow";
    bytes32 internal constant PARAMETER_MAX_LEVERAGE = "maxLeverage";
    bytes32 internal constant PARAMETER_MAX_MARKET_VALUE = "maxMarketValueUSD";
    bytes32 internal constant PARAMETER_MAX_FUNDING_RATE = "maxFundingRate";
    bytes32 internal constant PARAMETER_MIN_SKEW_SCALE = "skewScaleUSD";
    bytes32 internal constant PARAMETER_MAX_FUNDING_RATE_DELTA = "maxFundingRateDelta";

    // Global settings
    // minimum liquidation fee payable to liquidator
    bytes32 internal constant SETTING_MIN_KEEPER_FEE = "futuresMinKeeperFee";
    // liquidation fee basis points payed to liquidator
    bytes32 internal constant SETTING_LIQUIDATION_FEE_RATIO = "futuresLiquidationFeeRatio";
    // liquidation buffer to prevent negative margin upon liquidation
    bytes32 internal constant SETTING_LIQUIDATION_BUFFER_RATIO = "futuresLiquidationBufferRatio";
    bytes32 internal constant SETTING_MIN_INITIAL_MARGIN = "futuresMinInitialMargin";

    /* ---------- Address Resolver Configuration ---------- */

    bytes32 internal constant CONTRACT_FLEXIBLESTORAGE = "FlexibleStorage";

    /* ========== CONSTRUCTOR ========== */

    constructor(address _resolver) internal MixinResolver(_resolver) {}

    /* ========== VIEWS ========== */

    function resolverAddressesRequired() public view returns (bytes32[] memory addresses) {
        addresses = new bytes32[](1);
        addresses[0] = CONTRACT_FLEXIBLESTORAGE;
    }

    function _flexibleStorage() internal view returns (IFlexibleStorage) {
        return IFlexibleStorage(requireAndGetAddress(CONTRACT_FLEXIBLESTORAGE));
    }

    /* ---------- Internals ---------- */

    function _parameter(bytes32 _baseAsset, bytes32 key) internal view returns (uint value) {
        return _flexibleStorage().getUIntValue(SETTING_CONTRACT_NAME, keccak256(abi.encodePacked(_baseAsset, key)));
    }

    function _takerFee(bytes32 _baseAsset) internal view returns (uint) {
        return _parameter(_baseAsset, PARAMETER_TAKER_FEE);
    }

    function _makerFee(bytes32 _baseAsset) internal view returns (uint) {
        return _parameter(_baseAsset, PARAMETER_MAKER_FEE);
    }

    function _takerFeeNextPrice(bytes32 _baseAsset) internal view returns (uint) {
        return _parameter(_baseAsset, PARAMETER_TAKER_FEE_NEXT_PRICE);
    }

    function _makerFeeNextPrice(bytes32 _baseAsset) internal view returns (uint) {
        return _parameter(_baseAsset, PARAMETER_MAKER_FEE_NEXT_PRICE);
    }

    function _nextPriceConfirmWindow(bytes32 _baseAsset) internal view returns (uint) {
        return _parameter(_baseAsset, PARAMETER_NEXT_PRICE_CONFIRM_WINDOW);
    }

    function _maxLeverage(bytes32 _baseAsset) internal view returns (uint) {
        return _parameter(_baseAsset, PARAMETER_MAX_LEVERAGE);
    }

    function _maxMarketValueUSD(bytes32 _baseAsset) internal view returns (uint) {
        return _parameter(_baseAsset, PARAMETER_MAX_MARKET_VALUE);
    }

    function _skewScaleUSD(bytes32 _baseAsset) internal view returns (uint) {
        return _parameter(_baseAsset, PARAMETER_MIN_SKEW_SCALE);
    }

    function _maxFundingRate(bytes32 _baseAsset) internal view returns (uint) {
        return _parameter(_baseAsset, PARAMETER_MAX_FUNDING_RATE);
    }

    function _maxFundingRateDelta(bytes32 _baseAsset) internal view returns (uint) {
        return _parameter(_baseAsset, PARAMETER_MAX_FUNDING_RATE_DELTA);
    }

    function _parameters(bytes32 _baseAsset)
        internal
        view
        returns (
            uint takerFee,
            uint makerFee,
            uint takerFeeNextPrice,
            uint makerFeeNextPrice,
            uint nextPriceConfirmWindow,
            uint maxLeverage,
            uint maxMarketValueUSD,
            uint maxFundingRate,
            uint skewScaleUSD,
            uint maxFundingRateDelta
        )
    {
        takerFee = _takerFee(_baseAsset);
        makerFee = _makerFee(_baseAsset);
        takerFeeNextPrice = _takerFeeNextPrice(_baseAsset);
        makerFeeNextPrice = _makerFeeNextPrice(_baseAsset);
        nextPriceConfirmWindow = _nextPriceConfirmWindow(_baseAsset);
        maxLeverage = _maxLeverage(_baseAsset);
        maxMarketValueUSD = _maxMarketValueUSD(_baseAsset);
        maxFundingRate = _maxFundingRate(_baseAsset);
        skewScaleUSD = _skewScaleUSD(_baseAsset);
        maxFundingRateDelta = _maxFundingRateDelta(_baseAsset);
    }

    function _minKeeperFee() internal view returns (uint) {
        return _flexibleStorage().getUIntValue(SETTING_CONTRACT_NAME, SETTING_MIN_KEEPER_FEE);
    }

    function _liquidationFeeRatio() internal view returns (uint) {
        return _flexibleStorage().getUIntValue(SETTING_CONTRACT_NAME, SETTING_LIQUIDATION_FEE_RATIO);
    }

    function _liquidationBufferRatio() internal view returns (uint) {
        return _flexibleStorage().getUIntValue(SETTING_CONTRACT_NAME, SETTING_LIQUIDATION_BUFFER_RATIO);
    }

    function _minInitialMargin() internal view returns (uint) {
        return _flexibleStorage().getUIntValue(SETTING_CONTRACT_NAME, SETTING_MIN_INITIAL_MARGIN);
    }
}
