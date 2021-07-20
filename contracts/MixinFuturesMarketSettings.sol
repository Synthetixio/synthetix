pragma solidity ^0.5.16;

import "./MixinResolver.sol";

// Internal references
import "./interfaces/IFlexibleStorage.sol";

// https://docs.synthetix.io/contracts/source/contracts/MixinFuturesMarketSettings
contract MixinFuturesMarketSettings is MixinResolver {
    bytes32 internal constant SETTING_CONTRACT_NAME = "FuturesMarketSettings";

    /* ========== CONSTANTS ========== */

    /* ---------- Parameter Names ---------- */

    // Per-market settings
    bytes32 internal constant PARAMETER_TAKER_FEE = "takerFee";
    bytes32 internal constant PARAMETER_MAKER_FEE = "makerFee";
    bytes32 internal constant PARAMETER_MAX_LEVERAGE = "maxLeverage";
    bytes32 internal constant PARAMETER_MAX_MARKET_VALUE = "maxMarketValue";
    bytes32 internal constant PARAMETER_MAX_FUNDING_RATE = "maxFundingRate";
    bytes32 internal constant PARAMETER_MAX_FUNDING_RATE_SKEW = "maxFundingRateSkew";
    bytes32 internal constant PARAMETER_MAX_FUNDING_RATE_DELTA = "maxFundingRateDelta";

    // Global settings
    bytes32 internal constant SETTING_LIQUIDATION_FEE = "futuresLiquidationFee";
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

    function _maxLeverage(bytes32 _baseAsset) internal view returns (uint) {
        return _parameter(_baseAsset, PARAMETER_MAX_LEVERAGE);
    }

    function _maxMarketValue(bytes32 _baseAsset) internal view returns (uint) {
        return _parameter(_baseAsset, PARAMETER_MAX_MARKET_VALUE);
    }

    function _maxFundingRate(bytes32 _baseAsset) internal view returns (uint) {
        return _parameter(_baseAsset, PARAMETER_MAX_FUNDING_RATE);
    }

    function _maxFundingRateSkew(bytes32 _baseAsset) internal view returns (uint) {
        return _parameter(_baseAsset, PARAMETER_MAX_FUNDING_RATE_SKEW);
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
            uint maxLeverage,
            uint maxMarketValue,
            uint maxFundingRate,
            uint maxFundingRateSkew,
            uint maxFundingRateDelta
        )
    {
        takerFee = _takerFee(_baseAsset);
        makerFee = _makerFee(_baseAsset);
        maxLeverage = _maxLeverage(_baseAsset);
        maxMarketValue = _maxMarketValue(_baseAsset);
        maxFundingRate = _maxFundingRate(_baseAsset);
        maxFundingRateSkew = _maxFundingRateSkew(_baseAsset);
        maxFundingRateDelta = _maxFundingRateDelta(_baseAsset);
    }

    function _liquidationFee() internal view returns (uint) {
        return _flexibleStorage().getUIntValue(SETTING_CONTRACT_NAME, SETTING_LIQUIDATION_FEE);
    }

    function _minInitialMargin() internal view returns (uint) {
        return _flexibleStorage().getUIntValue(SETTING_CONTRACT_NAME, SETTING_MIN_INITIAL_MARGIN);
    }
}
