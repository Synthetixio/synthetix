pragma solidity ^0.5.16;

// Inheritance
import "./Owned.sol";
import "./MixinSystemSettings.sol";
import "./MixinFuturesMarketSettings.sol";
import "./interfaces/IFuturesMarketSettings.sol";

// Internal references
import "./interfaces/IFuturesMarket.sol";
import "./interfaces/IFuturesMarketManager.sol";

// https://docs.synthetix.io/contracts/source/contracts/FuturesMarketSettings
contract FuturesMarketSettings is Owned, MixinSystemSettings, MixinFuturesMarketSettings, IFuturesMarketSettings {
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

    /* ---------- External Contracts ---------- */

    function resolverAddressesRequired() public view returns (bytes32[] memory addresses) {
        bytes32[] memory existingAddresses = MixinSystemSettings.resolverAddressesRequired();
        bytes32[] memory newAddresses = new bytes32[](1);
        newAddresses[0] = CONTRACT_FUTURES_MARKET_MANAGER;
        addresses = combineArrays(existingAddresses, newAddresses);
    }

    function futuresMarketManager() internal view returns (IFuturesMarketManager) {
        return IFuturesMarketManager(requireAndGetAddress(CONTRACT_FUTURES_MARKET_MANAGER));
    }

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

    /* ---------- Setters ---------- */

    function setTakerFee(bytes32 _baseAsset, uint _takerFee) external onlyOwner {
        require(_takerFee <= 1 ether, "taker fee greater than 1");
        _setParameter(_baseAsset, PARAMETER_TAKER_FEE, _takerFee);
    }

    function setMakerFee(bytes32 _baseAsset, uint _makerFee) external onlyOwner {
        require(_makerFee <= 1 ether, "maker fee greater than 1");
        _setParameter(_baseAsset, PARAMETER_MAKER_FEE, _makerFee);
    }

    function setMaxLeverage(bytes32 _baseAsset, uint _maxLeverage) external onlyOwner {
        _setParameter(_baseAsset, PARAMETER_MAX_LEVERAGE, _maxLeverage);
    }

    function setMaxMarketValue(bytes32 _baseAsset, uint _maxMarketValue) external onlyOwner {
        _setParameter(_baseAsset, PARAMETER_MAX_MARKET_VALUE, _maxMarketValue);
    }

    function setMaxFundingRate(bytes32 _baseAsset, uint _maxFundingRate) external onlyOwner {
        _setParameter(_baseAsset, PARAMETER_MAX_FUNDING_RATE, _maxFundingRate);
    }

    function setMaxFundingRateSkew(bytes32 _baseAsset, uint _maxFundingRateSkew) external onlyOwner {
        _setParameter(_baseAsset, PARAMETER_MAX_FUNDING_RATE_SKEW, _maxFundingRateSkew);
    }

    function setMaxFundingRateDelta(bytes32 _baseAsset, uint _maxFundingRateDelta) external onlyOwner {
        _setParameter(_baseAsset, PARAMETER_MAX_FUNDING_RATE_DELTA, _maxFundingRateDelta);
    }

    /* ========== EVENTS ========== */

    event ParameterUpdated(bytes32 indexed asset, bytes32 indexed parameter, uint value);
}
