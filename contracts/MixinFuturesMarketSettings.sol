pragma solidity ^0.5.16;

import "./MixinResolver.sol";

// Internal references
import "./interfaces/IFlexibleStorage.sol";

// https://docs.synthetix.io/contracts/source/contracts/mixinsystemsettings
contract MixinFuturesMarketSettings is MixinResolver {
    bytes32 internal constant SETTING_CONTRACT_NAME = "FuturesMarketSettings";

    /* ========== STATE VARIABLES ========== */

    /* ---------- Address Resolver Configuration ---------- */

    bytes32 internal constant CONTRACT_FUTURES_MARKET_MANAGER = "FuturesMarketManager";

    /* ---------- Parameter Names ---------- */

    bytes32 internal constant PARAMETER_TAKER_FEE = "takerFee";
    bytes32 internal constant PARAMETER_MAKER_FEE = "makerFee";
    bytes32 internal constant PARAMETER_MAX_LEVERAGE = "maxLeverage";
    bytes32 internal constant PARAMETER_MAX_MARKET_VALUE = "maxMarketValue";
    bytes32 internal constant PARAMETER_MAX_FUNDING_RATE = "maxFundingRate";
    bytes32 internal constant PARAMETER_MAX_FUNDING_RATE_SKEW = "maxFundingRateSkew";
    bytes32 internal constant PARAMETER_MAX_FUNDING_RATE_DELTA = "maxFundingRateDelta";

    bytes32 internal constant CONTRACT_FLEXIBLESTORAGE = "FlexibleStorage";

    constructor(address _resolver) internal {}

    function resolverAddressesRequired() public view returns (bytes32[] memory addresses) {
        addresses = new bytes32[](1);
        addresses[0] = CONTRACT_FLEXIBLESTORAGE;
    }

    function flexibleStorage() internal view returns (IFlexibleStorage) {
        return IFlexibleStorage(requireAndGetAddress(CONTRACT_FLEXIBLESTORAGE));
    }

    function _getParameter(bytes32 _baseAsset, bytes32 key) internal view returns (uint value) {
        value = flexibleStorage().getUIntValue(SETTING_CONTRACT_NAME, keccak256(abi.encodePacked(_baseAsset, key)));
    }

    /* ---------- Getters ---------- */

    function getTakerFee(bytes32 _baseAsset) internal view returns (uint) {
        return _getParameter(_baseAsset, PARAMETER_TAKER_FEE);
    }

    function getMakerFee(bytes32 _baseAsset) internal view returns (uint) {
        return _getParameter(_baseAsset, PARAMETER_MAKER_FEE);
    }

    function getMaxLeverage(bytes32 _baseAsset) internal view returns (uint) {
        return _getParameter(_baseAsset, PARAMETER_MAX_LEVERAGE);
    }

    function getMaxMarketValue(bytes32 _baseAsset) internal view returns (uint) {
        return _getParameter(_baseAsset, PARAMETER_MAX_MARKET_VALUE);
    }

    function getMaxFundingRate(bytes32 _baseAsset) internal view returns (uint) {
        return _getParameter(_baseAsset, PARAMETER_MAX_FUNDING_RATE);
    }

    function getMaxFundingRateSkew(bytes32 _baseAsset) internal view returns (uint) {
        return _getParameter(_baseAsset, PARAMETER_MAX_FUNDING_RATE_SKEW);
    }

    function getMaxFundingRateDelta(bytes32 _baseAsset) internal view returns (uint) {
        return _getParameter(_baseAsset, PARAMETER_MAX_FUNDING_RATE_DELTA);
    }

    function getAllParameters(bytes32 _baseAsset)
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
        takerFee = getTakerFee(_baseAsset);
        makerFee = getMakerFee(_baseAsset);
        maxLeverage = getMaxLeverage(_baseAsset);
        maxMarketValue = getMaxMarketValue(_baseAsset);
        maxFundingRate = getMaxFundingRate(_baseAsset);
        maxFundingRateSkew = getMaxFundingRateSkew(_baseAsset);
        maxFundingRateDelta = getMaxFundingRateDelta(_baseAsset);
    }
}
