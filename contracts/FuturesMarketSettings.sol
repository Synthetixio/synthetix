pragma solidity ^0.5.16;

// Inheritance
import "./Owned.sol";
import "./MixinFuturesMarketSettings.sol";

// Internal references
import "./interfaces/IFuturesMarketSettings.sol";

// https://docs.synthetix.io/contracts/source/contracts/FuturesMarketSettings
contract FuturesMarketSettings is Owned, MixinFuturesMarketSettings, IFuturesMarketSettings {
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

    /* ========== CONSTRUCTOR ========== */

    constructor(address _owner, address _resolver) public Owned(_owner) MixinFuturesMarketSettings(_resolver) {}

    /* ========== VIEWS ========== */

    /* ========== INTERNAL FUNCTIONS ========== */

    function _setParameter(
        bytes32 _baseAsset,
        bytes32 key,
        uint value
    ) internal {
        flexibleStorage().setUIntValue(SETTING_CONTRACT_NAME, keccak256(abi.encodePacked(_baseAsset, key)), value);
        emit ParameterUpdated(_baseAsset, key, value);
    }

    /* ---------- Getters ---------- */

    /* ========== MUTATIVE FUNCTIONS ========== */

    function takerFee(bytes32 _baseAsset) external view returns (uint) {
        return getTakerFee(_baseAsset);
    }

    function makerFee(bytes32 _baseAsset) public view returns (uint) {
        return getMakerFee(_baseAsset);
    }

    function maxLeverage(bytes32 _baseAsset) public view returns (uint) {
        return getMaxLeverage(_baseAsset);
    }

    function maxMarketValue(bytes32 _baseAsset) public view returns (uint) {
        return getMaxMarketValue(_baseAsset);
    }

    function maxFundingRate(bytes32 _baseAsset) public view returns (uint) {
        return getMaxFundingRate(_baseAsset);
    }

    function maxFundingRateSkew(bytes32 _baseAsset) public view returns (uint) {
        return getMaxFundingRateSkew(_baseAsset);
    }

    function maxFundingRateDelta(bytes32 _baseAsset) public view returns (uint) {
        return getMaxFundingRateDelta(_baseAsset);
    }

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
        )
    {
        _takerFee = getTakerFee(_baseAsset);
        _makerFee = getMakerFee(_baseAsset);
        _maxLeverage = getMaxLeverage(_baseAsset);
        _maxMarketValue = getMaxMarketValue(_baseAsset);
        _maxFundingRate = getMaxFundingRate(_baseAsset);
        _maxFundingRateSkew = getMaxFundingRateSkew(_baseAsset);
        _maxFundingRateDelta = getMaxFundingRateDelta(_baseAsset);
    }

    function futuresLiquidationFee() external view returns (uint) {
        return getFuturesLiquidationFee();
    }

    function futuresMinInitialMargin() external view returns (uint) {
        return getFuturesMinInitialMargin();
    }

    /* ---------- Setters ---------- */

    function setTakerFee(bytes32 _baseAsset, uint _takerFee) public onlyOwner {
        require(_takerFee <= 1 ether, "taker fee greater than 1");
        _setParameter(_baseAsset, PARAMETER_TAKER_FEE, _takerFee);
    }

    function setMakerFee(bytes32 _baseAsset, uint _makerFee) public onlyOwner {
        require(_makerFee <= 1 ether, "maker fee greater than 1");
        _setParameter(_baseAsset, PARAMETER_MAKER_FEE, _makerFee);
    }

    function setMaxLeverage(bytes32 _baseAsset, uint _maxLeverage) public onlyOwner {
        _setParameter(_baseAsset, PARAMETER_MAX_LEVERAGE, _maxLeverage);
    }

    function setMaxMarketValue(bytes32 _baseAsset, uint _maxMarketValue) public onlyOwner {
        _setParameter(_baseAsset, PARAMETER_MAX_MARKET_VALUE, _maxMarketValue);
    }

    function setMaxFundingRate(bytes32 _baseAsset, uint _maxFundingRate) public onlyOwner {
        _setParameter(_baseAsset, PARAMETER_MAX_FUNDING_RATE, _maxFundingRate);
    }

    function setMaxFundingRateSkew(bytes32 _baseAsset, uint _maxFundingRateSkew) public onlyOwner {
        _setParameter(_baseAsset, PARAMETER_MAX_FUNDING_RATE_SKEW, _maxFundingRateSkew);
    }

    function setMaxFundingRateDelta(bytes32 _baseAsset, uint _maxFundingRateDelta) public onlyOwner {
        _setParameter(_baseAsset, PARAMETER_MAX_FUNDING_RATE_DELTA, _maxFundingRateDelta);
    }

    function setAllParameters(
        bytes32 _baseAsset,
        uint _takerFee,
        uint _makerFee,
        uint _maxLeverage,
        uint _maxMarketValue,
        uint _maxFundingRate,
        uint _maxFundingRateSkew,
        uint _maxFundingRateDelta
    ) external onlyOwner {
        setTakerFee(_baseAsset, _takerFee);
        setMakerFee(_baseAsset, _makerFee);
        setMaxLeverage(_baseAsset, _maxLeverage);
        setMaxMarketValue(_baseAsset, _maxMarketValue);
        setMaxFundingRate(_baseAsset, _maxFundingRate);
        setMaxFundingRateSkew(_baseAsset, _maxFundingRateSkew);
        setMaxFundingRateDelta(_baseAsset, _maxFundingRateDelta);
    }

    function setFuturesLiquidationFee(uint _sUSD) external onlyOwner {
        require(_sUSD <= getFuturesMinInitialMargin(), "fee is greater than min margin");
        flexibleStorage().setUIntValue(SETTING_CONTRACT_NAME, SETTING_FUTURES_LIQUIDATION_FEE, _sUSD);
        emit FuturesLiquidationFeeUpdated(_sUSD);
    }

    function setFuturesMinInitialMargin(uint _minMargin) external onlyOwner {
        require(getFuturesLiquidationFee() <= _minMargin, "fee is greater than min margin");
        flexibleStorage().setUIntValue(SETTING_CONTRACT_NAME, SETTING_FUTURES_MIN_INITIAL_MARGIN, _minMargin);
        emit FuturesMinInitialMarginUpdated(_minMargin);
    }

    /* ========== EVENTS ========== */

    event ParameterUpdated(bytes32 indexed asset, bytes32 indexed parameter, uint value);
    event FuturesLiquidationFeeUpdated(uint sUSD);
    event FuturesMinInitialMarginUpdated(uint minMargin);
}
