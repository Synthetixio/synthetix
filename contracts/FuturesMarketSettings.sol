pragma solidity ^0.5.16;

// Inheritance
import "./Owned.sol";
import "./MixinSystemSettings.sol";
import "./interfaces/IFuturesMarketSettings.sol";

// Internal references
import "./interfaces/IFuturesMarket.sol";

interface IFuturesMarketManagerForFuturesSettings {
    function marketForAsset(bytes32) external returns (address);
}

// https://docs.synthetix.io/contracts/source/contracts/futuresMarketSettings
contract FuturesMarketSettings is Owned, MixinSystemSettings, IFuturesMarketSettings {
    // TODO: Convert funding rate from daily to per-second
    struct Parameters {
        uint takerFee;
        uint makerFee;
        uint maxLeverage;
        uint maxMarketValue;
        uint maxFundingRate;
        uint maxFundingRateSkew;
        uint maxFundingRateDelta;
    }

    /* ========== STATE VARIABLES ========== */

    mapping(bytes32 => Parameters) public parameters;
    mapping(bytes32 => address) public markets;

    /* ---------- Address Resolver Configuration ---------- */
    bytes32 internal constant CONTRACT_FUTURESMARKETMANAGER = "FuturesMarketManager";

    /* ---------- Parameter Names ---------- */

    bytes32 internal constant PARAMETER_TAKERFEE = "takerFee";
    bytes32 internal constant PARAMETER_MAKERFEE = "makerFee";
    bytes32 internal constant PARAMETER_MAXLEVERAGE = "maxLeverage";
    bytes32 internal constant PARAMETER_MAXMARKETVALUE = "maxMarketValue";
    bytes32 internal constant PARAMETER_MAXFUNDINGRATE = "maxFundingRate";
    bytes32 internal constant PARAMETER_MAXFUNDINGRATESKEW = "maxFundingRateSkew";
    bytes32 internal constant PARAMETER_MAXFUNDINGRATEDELTA = "maxFundingRateDelta";

    /* ========== CONSTRUCTOR ========== */

    constructor(address _owner, address _resolver) public Owned(_owner) MixinSystemSettings(_resolver) {}

    /* ========== VIEWS ========== */

    /* ---------- External Contracts ---------- */

    function resolverAddressesRequired() public view returns (bytes32[] memory addresses) {
        bytes32[] memory existingAddresses = MixinSystemSettings.resolverAddressesRequired();
        bytes32[] memory newAddresses = new bytes32[](1);
        newAddresses[0] = CONTRACT_FUTURESMARKETMANAGER;
        addresses = combineArrays(existingAddresses, newAddresses);
    }

    function _manager() internal view returns (IFuturesMarketManagerForFuturesSettings) {
        return IFuturesMarketManagerForFuturesSettings(requireAndGetAddress(CONTRACT_FUTURESMARKETMANAGER));
    }

    /* ========== MUTATIVE FUNCTIONS ========== */

    /* ---------- Setters ---------- */

    function setTakerFee(bytes32 _baseAsset, uint _takerFee) external onlyOwner {
        require(_takerFee <= 1 ether, "taker fee greater than 1");
        parameters[_baseAsset].takerFee = _takerFee;
        emit ParameterUpdated(_baseAsset, PARAMETER_TAKERFEE, _takerFee);
    }

    function setMakerFee(bytes32 _baseAsset, uint _makerFee) external onlyOwner {
        require(_makerFee <= 1 ether, "maker fee greater than 1");
        parameters[_baseAsset].makerFee = _makerFee;
        emit ParameterUpdated(_baseAsset, PARAMETER_MAKERFEE, _makerFee);
    }

    function setMaxLeverage(bytes32 _baseAsset, uint _maxLeverage) external onlyOwner {
        parameters[_baseAsset].maxLeverage = _maxLeverage;
        emit ParameterUpdated(_baseAsset, PARAMETER_MAXLEVERAGE, _maxLeverage);
    }

    function setMaxMarketValue(bytes32 _baseAsset, uint _maxMarketValue) external onlyOwner {
        parameters[_baseAsset].maxMarketValue = _maxMarketValue;
        emit ParameterUpdated(_baseAsset, PARAMETER_MAXMARKETVALUE, _maxMarketValue);
    }

    function setMaxFundingRate(bytes32 _baseAsset, uint _maxFundingRate) external onlyOwner {
        IFuturesMarket(_manager().marketForAsset(_baseAsset)).recomputeFunding();
        parameters[_baseAsset].maxFundingRate = _maxFundingRate;
        emit ParameterUpdated(_baseAsset, PARAMETER_MAXFUNDINGRATE, _maxFundingRate);
    }

    function setMaxFundingRateSkew(bytes32 _baseAsset, uint _maxFundingRateSkew) external onlyOwner {
        IFuturesMarket(_manager().marketForAsset(_baseAsset)).recomputeFunding();
        parameters[_baseAsset].maxFundingRateSkew = _maxFundingRateSkew;
        emit ParameterUpdated(_baseAsset, PARAMETER_MAXFUNDINGRATESKEW, _maxFundingRateSkew);
    }

    function setMaxFundingRateDelta(bytes32 _baseAsset, uint _maxFundingRateDelta) external onlyOwner {
        IFuturesMarket(_manager().marketForAsset(_baseAsset)).recomputeFunding();
        parameters[_baseAsset].maxFundingRateDelta = _maxFundingRateDelta;
        emit ParameterUpdated(_baseAsset, PARAMETER_MAXFUNDINGRATEDELTA, _maxFundingRateDelta);
    }

    function setAllParameters(
        bytes32 _baseAsset,
        uint _takerFee,
        uint _makerFee,
        uint _maxLeverage,
        uint _maxMarketValue,
        uint[3] calldata _fundingParameters
    ) external onlyOwner {
        parameters[_baseAsset].takerFee = _takerFee;
        emit ParameterUpdated(_baseAsset, PARAMETER_TAKERFEE, _takerFee);

        parameters[_baseAsset].makerFee = _makerFee;
        emit ParameterUpdated(_baseAsset, PARAMETER_MAKERFEE, _makerFee);

        parameters[_baseAsset].maxLeverage = _maxLeverage;
        emit ParameterUpdated(_baseAsset, PARAMETER_MAXLEVERAGE, _maxLeverage);

        parameters[_baseAsset].maxMarketValue = _maxMarketValue;
        emit ParameterUpdated(_baseAsset, PARAMETER_MAXMARKETVALUE, _maxMarketValue);

        parameters[_baseAsset].maxFundingRate = _fundingParameters[0];
        emit ParameterUpdated(_baseAsset, PARAMETER_MAXFUNDINGRATE, _fundingParameters[0]);

        parameters[_baseAsset].maxFundingRateSkew = _fundingParameters[1];
        emit ParameterUpdated(_baseAsset, PARAMETER_MAXFUNDINGRATESKEW, _fundingParameters[1]);

        parameters[_baseAsset].maxFundingRateDelta = _fundingParameters[2];
        emit ParameterUpdated(_baseAsset, PARAMETER_MAXFUNDINGRATEDELTA, _fundingParameters[2]);
    }

    /* ---------- Getters ---------- */

    function getTakerFee(bytes32 _baseAsset) external view returns (uint) {
        return parameters[_baseAsset].takerFee;
    }

    function getMakerFee(bytes32 _baseAsset) external view returns (uint) {
        return parameters[_baseAsset].makerFee;
    }

    function getMaxLeverage(bytes32 _baseAsset) external view returns (uint) {
        return parameters[_baseAsset].maxLeverage;
    }

    function getMaxMarketValue(bytes32 _baseAsset) external view returns (uint) {
        return parameters[_baseAsset].maxMarketValue;
    }

    function getMaxFundingRate(bytes32 _baseAsset) external view returns (uint) {
        return parameters[_baseAsset].maxFundingRate;
    }

    function getMaxFundingRateSkew(bytes32 _baseAsset) external view returns (uint) {
        return parameters[_baseAsset].maxFundingRateSkew;
    }

    function getMaxFundingRateDelta(bytes32 _baseAsset) external view returns (uint) {
        return parameters[_baseAsset].maxFundingRateDelta;
    }

    function getAllParameters(bytes32 _baseAsset)
        external
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
        takerFee = parameters[_baseAsset].takerFee;
        makerFee = parameters[_baseAsset].makerFee;
        maxLeverage = parameters[_baseAsset].maxLeverage;
        maxMarketValue = parameters[_baseAsset].maxMarketValue;
        maxFundingRate = parameters[_baseAsset].maxFundingRate;
        maxFundingRateSkew = parameters[_baseAsset].maxFundingRateSkew;
        maxFundingRateDelta = parameters[_baseAsset].maxFundingRateDelta;
    }

    /* ========== EVENTS ========== */

    event ParameterUpdated(bytes32 indexed asset, bytes32 indexed parameter, uint value);
    event MarketConnected(bytes32 indexed market, address marketAddress);
}
