pragma solidity ^0.5.16;
pragma experimental ABIEncoderV2;

import "./MixinResolver.sol";

// Internal references
import "./interfaces/IFlexibleStorage.sol";

// https://docs.synthetix.io/contracts/source/contracts/MixinPerpsV2MarketSettings
contract MixinPerpsV2MarketSettings is MixinResolver {
    /* ========== CONSTANTS ========== */

    bytes32 internal constant SETTING_CONTRACT_NAME = "PerpsV2MarketSettings";

    /* ---------- Parameter Names ---------- */

    // Per-market settings
    bytes32 internal constant PARAMETER_TAKER_FEE = "takerFee";
    bytes32 internal constant PARAMETER_MAKER_FEE = "makerFee";
    bytes32 internal constant PARAMETER_TAKER_FEE_DELAYED_ORDER = "takerFeeDelayedOrder";
    bytes32 internal constant PARAMETER_MAKER_FEE_DELAYED_ORDER = "makerFeeDelayedOrder";
    bytes32 internal constant PARAMETER_TAKER_FEE_OFFCHAIN_DELAYED_ORDER = "takerFeeOffchainDelayedOrder";
    bytes32 internal constant PARAMETER_MAKER_FEE_OFFCHAIN_DELAYED_ORDER = "makerFeeOffchainDelayedOrder";
    bytes32 internal constant PARAMETER_NEXT_PRICE_CONFIRM_WINDOW = "nextPriceConfirmWindow";
    bytes32 internal constant PARAMETER_DELAYED_ORDER_CONFIRM_WINDOW = "delayedOrderConfirmWindow";
    bytes32 internal constant PARAMETER_OFFCHAIN_DELAYED_ORDER_MIN_AGE = "offchainDelayedOrderMinAge";
    bytes32 internal constant PARAMETER_OFFCHAIN_DELAYED_ORDER_MAX_AGE = "offchainDelayedOrderMaxAge";
    bytes32 internal constant PARAMETER_MAX_LEVERAGE = "maxLeverage";
    bytes32 internal constant PARAMETER_MAX_MARKET_VALUE = "maxMarketValueUSD";
    bytes32 internal constant PARAMETER_MAX_FUNDING_RATE = "maxFundingRate";
    bytes32 internal constant PARAMETER_MIN_SKEW_SCALE = "skewScaleUSD";
    bytes32 internal constant PARAMETER_MIN_DELAY_TIME_DELTA = "minDelayTimeDelta";
    bytes32 internal constant PARAMETER_MAX_DELAY_TIME_DELTA = "maxDelayTimeDelta";

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

    function _parameter(bytes32 _marketKey, bytes32 key) internal view returns (uint value) {
        return _flexibleStorage().getUIntValue(SETTING_CONTRACT_NAME, keccak256(abi.encodePacked(_marketKey, key)));
    }

    function _takerFee(bytes32 _marketKey) internal view returns (uint) {
        return _parameter(_marketKey, PARAMETER_TAKER_FEE);
    }

    function _makerFee(bytes32 _marketKey) internal view returns (uint) {
        return _parameter(_marketKey, PARAMETER_MAKER_FEE);
    }

    function _takerFeeDelayedOrder(bytes32 _marketKey) internal view returns (uint) {
        return _parameter(_marketKey, PARAMETER_TAKER_FEE_DELAYED_ORDER);
    }

    function _makerFeeDelayedOrder(bytes32 _marketKey) internal view returns (uint) {
        return _parameter(_marketKey, PARAMETER_MAKER_FEE_DELAYED_ORDER);
    }

    function _takerFeeOffchainDelayedOrder(bytes32 _marketKey) internal view returns (uint) {
        return _parameter(_marketKey, PARAMETER_TAKER_FEE_OFFCHAIN_DELAYED_ORDER);
    }

    function _makerFeeOffchainDelayedOrder(bytes32 _marketKey) internal view returns (uint) {
        return _parameter(_marketKey, PARAMETER_MAKER_FEE_OFFCHAIN_DELAYED_ORDER);
    }

    function _nextPriceConfirmWindow(bytes32 _marketKey) internal view returns (uint) {
        return _parameter(_marketKey, PARAMETER_NEXT_PRICE_CONFIRM_WINDOW);
    }

    function _delayedOrderConfirmWindow(bytes32 _marketKey) internal view returns (uint) {
        return _parameter(_marketKey, PARAMETER_DELAYED_ORDER_CONFIRM_WINDOW);
    }

    function _offchainDelayedOrderMinAge(bytes32 _marketKey) internal view returns (uint) {
        return _parameter(_marketKey, PARAMETER_OFFCHAIN_DELAYED_ORDER_MIN_AGE);
    }

    function _offchainDelayedOrderMaxAge(bytes32 _marketKey) internal view returns (uint) {
        return _parameter(_marketKey, PARAMETER_OFFCHAIN_DELAYED_ORDER_MAX_AGE);
    }

    function _maxLeverage(bytes32 _marketKey) internal view returns (uint) {
        return _parameter(_marketKey, PARAMETER_MAX_LEVERAGE);
    }

    function _maxMarketValueUSD(bytes32 _marketKey) internal view returns (uint) {
        return _parameter(_marketKey, PARAMETER_MAX_MARKET_VALUE);
    }

    function _skewScaleUSD(bytes32 _marketKey) internal view returns (uint) {
        return _parameter(_marketKey, PARAMETER_MIN_SKEW_SCALE);
    }

    function _maxFundingRate(bytes32 _marketKey) internal view returns (uint) {
        return _parameter(_marketKey, PARAMETER_MAX_FUNDING_RATE);
    }

    function _minDelayTimeDelta(bytes32 _marketKey) internal view returns (uint) {
        return _parameter(_marketKey, PARAMETER_MIN_DELAY_TIME_DELTA);
    }

    function _maxDelayTimeDelta(bytes32 _marketKey) internal view returns (uint) {
        return _parameter(_marketKey, PARAMETER_MAX_DELAY_TIME_DELTA);
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
