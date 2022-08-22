pragma solidity ^0.5.16;
pragma experimental ABIEncoderV2;

// Inheritance
import "./Owned.sol";
import "./PerpsConfigGettersV2Mixin.sol";

// Internal references
import "./interfaces/IPerpsInterfacesV2.sol";

/**
 Updates long term storage FlexibleStorage with configuration values (that are used by other perps contract
 via the PerpsConfigGettersV2Mixin).

 Contract interactions:
 - to FlexibleStorage: update config values
 - to PerpsEngineV2: recompute funding when config values that impact funding are changed

 User interactions:
 - from owner: all mutative methods

 Inheritance:
 - PerpsConfigGettersV2Mixin: constants, getter methods
 - Owner: ownership

 This is a separate mixin because it can be separated for ease of development and testing.
 However it still should be part of the manager because:
 1. It's both owner controlled and has privileged (mutative) access to engine.
 2. Updating the market configuration is part of managing the markets, and separating the
    two aspects (configs and marketKeys registry) doesn't make sense because than questions of "can an unconfigured
    market be added to manager?" Or "can a market not added in manager have its funding recomputed?" have
    no good answers.
*/
contract PerpsManagerV2ConfigSettersMixin is Owned, PerpsConfigGettersV2Mixin, IPerpsConfigSettersV2, IPerpsTypesV2 {
    /* ========== EVENTS ========== */
    event ParameterUpdated(bytes32 indexed marketKey, bytes32 indexed parameter, uint value);
    event MinKeeperFeeUpdated(uint sUSD);
    event LiquidationFeeRatioUpdated(uint bps);
    event LiquidationBufferRatioUpdated(uint bps);
    event MinInitialMarginUpdated(uint minMargin);

    /* ========== CONSTANTS ========== */

    bytes32 internal constant CONTRACT_PERPSENGINEV2 = "PerpsEngineV2";

    /* ========== CONSTRUCTOR ========== */

    constructor(address _owner, address _resolver) public Owned(_owner) PerpsConfigGettersV2Mixin(_resolver) {}

    /* ========== EXTERNAL VIEWS ========== */

    function resolverAddressesRequired() public view returns (bytes32[] memory addresses) {
        bytes32[] memory existingAddresses = PerpsConfigGettersV2Mixin.resolverAddressesRequired();
        bytes32[] memory newAddresses = new bytes32[](1);
        newAddresses[0] = CONTRACT_PERPSENGINEV2;
        addresses = combineArrays(existingAddresses, newAddresses);
    }

    /// The static fee charged when opening a position
    function baseFee(bytes32 marketKey) external view returns (uint) {
        return _baseFee(marketKey);
    }

    /// The fee charged when opening a position using next price mechanism.
    function baseFeeNextPrice(bytes32 marketKey) external view returns (uint) {
        return _baseFeeNextPrice(marketKey);
    }

    /// The number of price update rounds during which confirming next-price is allowed
    function nextPriceConfirmWindow(bytes32 marketKey) external view returns (uint) {
        return _nextPriceConfirmWindow(marketKey);
    }

    /// The maximum allowable leverage in a market.
    function maxLeverage(bytes32 marketKey) external view returns (uint) {
        return _maxLeverage(marketKey);
    }

    /// The maximum allowable notional value on each side of a market.
    function maxSingleSideValueUSD(bytes32 marketKey) external view returns (uint) {
        return _maxSingleSideValueUSD(marketKey);
    }

    /// The maximum possible funding rate per day charged by a market.
    function maxFundingRate(bytes32 marketKey) external view returns (uint) {
        return _maxFundingRate(marketKey);
    }

    /// The skew level at which the max funding rate will be charged.
    function skewScaleUSD(bytes32 marketKey) external view returns (uint) {
        return _skewScaleUSD(marketKey);
    }

    /// all the per-market config values in one struct
    function marketConfig(bytes32 marketKey) external view returns (MarketConfig memory) {
        return
            MarketConfig({
                baseFee: _baseFee(marketKey),
                baseFeeNextPrice: _baseFeeNextPrice(marketKey),
                nextPriceConfirmWindow: _nextPriceConfirmWindow(marketKey),
                maxLeverage: _maxLeverage(marketKey),
                maxSingleSideValueUSD: _maxSingleSideValueUSD(marketKey),
                maxFundingRate: _maxFundingRate(marketKey),
                skewScaleUSD: _skewScaleUSD(marketKey)
            });
    }

    /// The minimum amount of sUSD paid to a keeper for a successful keeper operation.
    /// This quantity must be no greater than `minInitialMargin`.
    function minKeeperFee() external view returns (uint) {
        return _minKeeperFee();
    }

    /// Liquidation fee (as ratio, 18 decimals) paid to liquidator.
    /// Use together with minKeeperFee() to calculate the actual fee paid.
    function liquidationFeeRatio() external view returns (uint) {
        return _liquidationFeeRatio();
    }

    /// Liquidation price buffer (as ratio, 18 decimals) to prevent negative margin on liquidation.
    function liquidationBufferRatio() external view returns (uint) {
        return _liquidationBufferRatio();
    }

    /// The minimum margin required to open a position.
    /// This quantity must be no less than `minKeeperFee`.
    function minInitialMargin() external view returns (uint) {
        return _minInitialMargin();
    }

    /* ========== INTERNAL VIEWS ========== */

    function _perpsEngineV2Mutative() internal view returns (IPerpsEngineV2Internal) {
        return IPerpsEngineV2Internal(requireAndGetAddress(CONTRACT_PERPSENGINEV2));
    }

    /* ========== EXTERNAL MUTATIVE ========== */

    function setBaseFee(bytes32 marketKey, uint _baseFee) public onlyOwner {
        require(_baseFee <= 1e18, "Base fee greater than 1");
        _setParameter(marketKey, PARAMETER_BASE_FEE, _baseFee);
    }

    function setBaseFeeNextPrice(bytes32 marketKey, uint _baseFeeNextPrice) public onlyOwner {
        require(_baseFeeNextPrice <= 1e18, "Base fee greater than 1");
        _setParameter(marketKey, PARAMETER_BASE_FEE_NEXT_PRICE, _baseFeeNextPrice);
    }

    function setNextPriceConfirmWindow(bytes32 marketKey, uint _nextPriceConfirmWindow) public onlyOwner {
        _setParameter(marketKey, PARAMETER_NEXT_PRICE_CONFIRM_WINDOW, _nextPriceConfirmWindow);
    }

    function setMaxLeverage(bytes32 marketKey, uint _maxLeverage) public onlyOwner {
        _setParameter(marketKey, PARAMETER_MAX_LEVERAGE, _maxLeverage);
    }

    function setMaxSingleSideValueUSD(bytes32 marketKey, uint _maxSingleSideValueUSD) public onlyOwner {
        _setParameter(marketKey, PARAMETER_MAX_SINGLE_SIDE_VALUE, _maxSingleSideValueUSD);
    }

    function setMaxFundingRate(bytes32 marketKey, uint _maxFundingRate) public onlyOwner {
        _recomputeFunding(marketKey);
        _setParameter(marketKey, PARAMETER_MAX_FUNDING_RATE, _maxFundingRate);
    }

    function setSkewScaleUSD(bytes32 marketKey, uint _skewScaleUSD) public onlyOwner {
        require(_skewScaleUSD > 0, "Cannot set skew scale 0");
        _recomputeFunding(marketKey);
        _setParameter(marketKey, PARAMETER_MIN_SKEW_SCALE, _skewScaleUSD);
    }

    function setMarketConfig(
        bytes32 marketKey,
        uint _baseFee,
        uint _baseFeeNextPrice,
        uint _nextPriceConfirmWindow,
        uint _maxLeverage,
        uint _maxSingleSideValueUSD,
        uint _maxFundingRate,
        uint _skewScaleUSD
    ) external onlyOwner {
        setBaseFee(marketKey, _baseFee);
        setBaseFeeNextPrice(marketKey, _baseFeeNextPrice);
        setNextPriceConfirmWindow(marketKey, _nextPriceConfirmWindow);
        setMaxLeverage(marketKey, _maxLeverage);
        setMaxSingleSideValueUSD(marketKey, _maxSingleSideValueUSD);
        setMaxFundingRate(marketKey, _maxFundingRate);
        setSkewScaleUSD(marketKey, _skewScaleUSD);
    }

    function setMinKeeperFee(uint _sUSD) external onlyOwner {
        require(_sUSD <= _minInitialMargin(), "Min margin < liquidation fee");
        _flexibleStorage().setUIntValue(SETTING_CONTRACT_NAME, SETTING_MIN_KEEPER_FEE, _sUSD);
        emit MinKeeperFeeUpdated(_sUSD);
    }

    function setLiquidationFeeRatio(uint _ratio) external onlyOwner {
        _flexibleStorage().setUIntValue(SETTING_CONTRACT_NAME, SETTING_LIQUIDATION_FEE_RATIO, _ratio);
        emit LiquidationFeeRatioUpdated(_ratio);
    }

    function setLiquidationBufferRatio(uint _ratio) external onlyOwner {
        _flexibleStorage().setUIntValue(SETTING_CONTRACT_NAME, SETTING_LIQUIDATION_BUFFER_RATIO, _ratio);
        emit LiquidationBufferRatioUpdated(_ratio);
    }

    function setMinInitialMargin(uint _minMargin) external onlyOwner {
        require(_minKeeperFee() <= _minMargin, "Min margin < liquidation fee");
        _flexibleStorage().setUIntValue(SETTING_CONTRACT_NAME, SETTING_MIN_INITIAL_MARGIN, _minMargin);
        emit MinInitialMarginUpdated(_minMargin);
    }

    /* ========== INTERNAL MUTATIVE ========== */

    function _setParameter(
        bytes32 marketKey,
        bytes32 key,
        uint value
    ) internal {
        _flexibleStorage().setUIntValue(SETTING_CONTRACT_NAME, keccak256(abi.encodePacked(marketKey, key)), value);
        emit ParameterUpdated(marketKey, key, value);
    }

    // Before altering parameters relevant to funding rates, outstanding funding on the underlying market
    // should be recomputed, otherwise already-accrued but unrecorded funding in the market can change.
    function _recomputeFunding(bytes32 marketKey) internal {
        _perpsEngineV2Mutative().recomputeFunding(marketKey);
    }
}
