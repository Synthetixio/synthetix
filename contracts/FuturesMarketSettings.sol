pragma solidity ^0.8.4;

// Inheritance
import "./Owned.sol";
import "./MixinFuturesMarketSettings.sol";

// Internal references
import "./interfaces/IFuturesMarketSettings.sol";
import "./interfaces/IFuturesMarketManager.sol";
import "./interfaces/IFuturesMarket.sol";

// https://docs.synthetix.io/contracts/source/contracts/FuturesMarketSettings
contract FuturesMarketSettings is Owned, MixinFuturesMarketSettings, IFuturesMarketSettings {
    /* ========== CONSTANTS ========== */

    /* ---------- Address Resolver Configuration ---------- */

    bytes32 internal constant CONTRACT_FUTURES_MARKET_MANAGER = "FuturesMarketManager";

    /* ========== CONSTRUCTOR ========== */

    constructor(address _owner, address _resolver) public Owned(_owner) MixinFuturesMarketSettings(_resolver) {}

    /* ========== VIEWS ========== */

    function resolverAddressesRequired() public view returns (bytes32[] memory addresses) {
        bytes32[] memory existingAddresses = MixinFuturesMarketSettings.resolverAddressesRequired();
        bytes32[] memory newAddresses = new bytes32[](1);
        newAddresses[0] = CONTRACT_FUTURES_MARKET_MANAGER;
        addresses = combineArrays(existingAddresses, newAddresses);
    }

    function _futuresMarketManager() internal view returns (IFuturesMarketManager) {
        return IFuturesMarketManager(requireAndGetAddress(CONTRACT_FUTURES_MARKET_MANAGER));
    }

    /* ---------- Getters ---------- */

    /*
     * The fee charged when opening a position on the heavy side of a futures market.
     */
    function takerFee(bytes32 _baseAsset) external view returns (uint) {
        return _takerFee(_baseAsset);
    }

    /*
     * The fee charged when opening a position on the light side of a futures market.
     */
    function makerFee(bytes32 _baseAsset) public view returns (uint) {
        return _makerFee(_baseAsset);
    }

    /*
     * The fee charged when reducing the size of a position.
     */
    function closureFee(bytes32 _baseAsset) public view returns (uint) {
        return _closureFee(_baseAsset);
    }

    /*
     * The maximum allowable leverage in a market.
     */
    function maxLeverage(bytes32 _baseAsset) public view returns (uint) {
        return _maxLeverage(_baseAsset);
    }

    /*
     * The maximum allowable notional value on each side of a market.
     */
    function maxMarketValue(bytes32 _baseAsset) public view returns (uint) {
        return _maxMarketValue(_baseAsset);
    }

    /*
     * The maximum theoretical funding rate per day charged by a market.
     */
    function maxFundingRate(bytes32 _baseAsset) public view returns (uint) {
        return _maxFundingRate(_baseAsset);
    }

    /*
     * The skew level at which the max funding rate will be charged.
     */
    function minSkewScale(bytes32 _baseAsset) public view returns (uint) {
        return _minSkewScale(_baseAsset);
    }

    /*
     * The maximum speed that the funding rate can move per day.
     */
    function maxFundingRateDelta(bytes32 _baseAsset) public view returns (uint) {
        return _maxFundingRateDelta(_baseAsset);
    }

    function parameters(bytes32 _baseAsset)
        external
        view
        returns (
            uint _takerFee,
            uint _makerFee,
            uint _closureFee,
            uint _maxLeverage,
            uint _maxMarketValue,
            uint _maxFundingRate,
            uint _minSkewScale,
            uint _maxFundingRateDelta
        )
    {
        return _parameters(_baseAsset);
    }

    /*
     * The amount of sUSD paid to a liquidator when they successfully liquidate a position.
     * This quantity must be no greater than `minInitialMargin`.
     */
    function liquidationFee() external view returns (uint) {
        return _liquidationFee();
    }

    /*
     * The minimum margin required to open a position.
     * This quantity must be no less than `liquidationFee`.
     */
    function minInitialMargin() external view returns (uint) {
        return _minInitialMargin();
    }

    /* ========== MUTATIVE FUNCTIONS ========== */

    /* ---------- Setters --------- */

    function _setParameter(
        bytes32 _baseAsset,
        bytes32 key,
        uint value
    ) internal {
        _flexibleStorage().setUIntValue(SETTING_CONTRACT_NAME, keccak256(abi.encodePacked(_baseAsset, key)), value);
        emit ParameterUpdated(_baseAsset, key, value);
    }

    function setTakerFee(bytes32 _baseAsset, uint _takerFee) public onlyOwner {
        require(_takerFee <= 1e18, "taker fee greater than 1");
        _setParameter(_baseAsset, PARAMETER_TAKER_FEE, _takerFee);
    }

    function setMakerFee(bytes32 _baseAsset, uint _makerFee) public onlyOwner {
        require(_makerFee <= 1e18, "maker fee greater than 1");
        _setParameter(_baseAsset, PARAMETER_MAKER_FEE, _makerFee);
    }

    function setClosureFee(bytes32 _baseAsset, uint _closureFee) public onlyOwner {
        require(_closureFee <= 1e18, "closure fee greater than 1");
        _setParameter(_baseAsset, PARAMETER_CLOSURE_FEE, _closureFee);
    }

    function setMaxLeverage(bytes32 _baseAsset, uint _maxLeverage) public onlyOwner {
        _setParameter(_baseAsset, PARAMETER_MAX_LEVERAGE, _maxLeverage);
    }

    function setMaxMarketValue(bytes32 _baseAsset, uint _maxMarketValue) public onlyOwner {
        _setParameter(_baseAsset, PARAMETER_MAX_MARKET_VALUE, _maxMarketValue);
    }

    // Before altering parameters relevant to funding rates, outstanding funding on the underlying market
    // must be recomputed, otherwise already-accrued but unrealised funding in the market can change.

    function _recomputeFunding(bytes32 _baseAsset) internal {
        IFuturesMarket(_futuresMarketManager().marketForAsset(_baseAsset)).recomputeFunding();
    }

    function setMaxFundingRate(bytes32 _baseAsset, uint _maxFundingRate) public onlyOwner {
        _recomputeFunding(_baseAsset);
        _setParameter(_baseAsset, PARAMETER_MAX_FUNDING_RATE, _maxFundingRate);
    }

    function setMinSkewScale(bytes32 _baseAsset, uint _minSkewScale) public onlyOwner {
        _recomputeFunding(_baseAsset);
        _setParameter(_baseAsset, PARAMETER_MIN_SKEW_SCALE, _minSkewScale);
    }

    function setMaxFundingRateDelta(bytes32 _baseAsset, uint _maxFundingRateDelta) public onlyOwner {
        _recomputeFunding(_baseAsset);
        _setParameter(_baseAsset, PARAMETER_MAX_FUNDING_RATE_DELTA, _maxFundingRateDelta);
    }

    function setParameters(
        bytes32 _baseAsset,
        uint _takerFee,
        uint _makerFee,
        uint _closureFee,
        uint _maxLeverage,
        uint _maxMarketValue,
        uint _maxFundingRate,
        uint _minSkewScale,
        uint _maxFundingRateDelta
    ) external onlyOwner {
        _recomputeFunding(_baseAsset);
        setTakerFee(_baseAsset, _takerFee);
        setMakerFee(_baseAsset, _makerFee);
        setClosureFee(_baseAsset, _closureFee);
        setMaxLeverage(_baseAsset, _maxLeverage);
        setMaxMarketValue(_baseAsset, _maxMarketValue);
        setMaxFundingRate(_baseAsset, _maxFundingRate);
        setMinSkewScale(_baseAsset, _minSkewScale);
        setMaxFundingRateDelta(_baseAsset, _maxFundingRateDelta);
    }

    function setLiquidationFee(uint _sUSD) external onlyOwner {
        require(_sUSD <= _minInitialMargin(), "min margin < liquidation fee");
        _flexibleStorage().setUIntValue(SETTING_CONTRACT_NAME, SETTING_LIQUIDATION_FEE, _sUSD);
        emit LiquidationFeeUpdated(_sUSD);
    }

    function setMinInitialMargin(uint _minMargin) external onlyOwner {
        require(_liquidationFee() <= _minMargin, "min margin < liquidation fee");
        _flexibleStorage().setUIntValue(SETTING_CONTRACT_NAME, SETTING_MIN_INITIAL_MARGIN, _minMargin);
        emit MinInitialMarginUpdated(_minMargin);
    }

    /* ========== EVENTS ========== */

    event ParameterUpdated(bytes32 indexed asset, bytes32 indexed parameter, uint value);
    event LiquidationFeeUpdated(uint sUSD);
    event MinInitialMarginUpdated(uint minMargin);
}
