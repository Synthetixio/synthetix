pragma solidity ^0.5.16;
pragma experimental ABIEncoderV2;

// Inheritance
import "./Owned.sol";
import "./MixinResolver.sol";
import "./MixinSystemSettings.sol";
import "./interfaces/IDirectIntegrationManager.sol";

/*
 * SIP-267: Direct Integration
 * https://sips.synthetix.io/sips/sip-267/
 *
 * Used by the Spartan Council to approve an external contract, (i.e. one which is not owned or managed by the Synthetix protocol),
 * to interact with Synthetix's core exchange functionalities with overridden parameters.
 * If no parameter overrides are specified, then the prevailing parameter configuration will be automatically used.
 */
contract DirectIntegration is Owned, MixinSystemSettings, IDirectIntegrationManager {
    /* ========== CONSTANTS ========== */
    bytes32 public constant CONTRACT_NAME = "DirectIntegration";

    uint internal constant DI_VERSION = 1;

    /* ---------- Internal Variables ---------- */

    // Stores a mapping of all overridden parameters for a given direct integration.
    mapping(address => StoredParameterIntegrationSettings) internal _settings;

    /* ========== CONSTRUCTOR ========== */
    constructor(address _owner, address _resolver) public Owned(_owner) MixinSystemSettings(_resolver) {}

    /* ========== VIEWS ========== */

    /* ---------- Getters ---------- */

    /**
     * Used to read the configured overridden values for a given integration.
     * @param integration the address of the external integrator's contract
     */
    function getExchangeParameters(address integration, bytes32 currencyKey)
        public
        view
        returns (ParameterIntegrationSettings memory overrides)
    {
        StoredParameterIntegrationSettings storage storedOverrides = _settings[integration];

        uint storedAtomicEquivalentForDexPricing = _binarySearch(storedOverrides.atomicEquivalentForDexPricing, currencyKey);
        uint storedAtomicExchangeFeeData = _binarySearch(storedOverrides.atomicExchangeFeeRate, currencyKey);
        uint storedExchangeFeeRate = _binarySearch(storedOverrides.exchangeFeeRate, currencyKey);
        uint storedAtomicVolatilityConsiderationWindow = _binarySearch(storedOverrides.atomicVolatilityConsiderationWindow, currencyKey);
        uint storedAtomicVolatilityTwapSeconds = _binarySearch(storedOverrides.atomicVolatilityTwapSeconds, currencyKey);
        uint storedAtomicVolatilityUpdateThreshold = _binarySearch(storedOverrides.atomicVolatilityUpdateThreshold, currencyKey);

        return ParameterIntegrationSettings(
            currencyKey,
            storedAtomicEquivalentForDexPricing != 0 ? address(uint160(storedAtomicEquivalentForDexPricing)) : getAtomicEquivalentForDexPricing(currencyKey),
            storedAtomicExchangeFeeData > 0 ? storedAtomicExchangeFeeData : getAtomicExchangeFeeRate(currencyKey),
            storedOverrides.atomicTwapWindow > 0 ? storedOverrides.atomicTwapWindow : getAtomicTwapWindow(),
            storedOverrides.atomicMaxTwapDelta,
            storedOverrides.atomicMaxVolumePerBlock > 0 ? storedOverrides.atomicMaxVolumePerBlock : getAtomicMaxVolumePerBlock(),
            storedAtomicVolatilityConsiderationWindow > 0 ? storedAtomicVolatilityConsiderationWindow : getAtomicVolatilityConsiderationWindow(currencyKey),
            storedAtomicVolatilityTwapSeconds,
            storedAtomicVolatilityUpdateThreshold > 0 ? storedAtomicVolatilityUpdateThreshold : getAtomicVolatilityUpdateThreshold(currencyKey),
            storedExchangeFeeRate > 0 ? storedExchangeFeeRate : getExchangeFeeRate(currencyKey),
            storedOverrides.exchangeMaxDynamicFee > 0 ? storedOverrides.exchangeMaxDynamicFee : getExchangeMaxDynamicFee(),
            storedOverrides.exchangeDynamicFeeRounds > 0 ? storedOverrides.exchangeDynamicFeeRounds : getExchangeDynamicFeeRounds(),
            storedOverrides.exchangeDynamicFeeThreshold > 0 ? storedOverrides.exchangeDynamicFeeThreshold : getExchangeDynamicFeeThreshold(),
            storedOverrides.exchangeDynamicFeeWeightDecay > 0 ? storedOverrides.exchangeDynamicFeeWeightDecay : getExchangeDynamicFeeWeightDecay()
        );
    }

    /* ========== MUTATIVE FUNCTIONS ========== */
    /**
     * Sets an override to be used for a given direct integration that supersedes the default Synthetix parameter value.
     * @param integration the address of the external integrator's contract
     * @param settings a collection of parameters to be overridden
     * @dev Invoking this function will overwrite whatever overrides were previously set. Set overrides to zero to "remove" them.
     * @notice This will require a SIP and a presentation, given the importance of clearly presenting
     * external interactions with Synthetix contracts and the parameter overrides that would be implemented.
     */
    function setExchangeParameters(address integration, StoredParameterIntegrationSettings memory settings) public onlyOwner {
        _setExchangeParameters(integration, settings);
    }

    /* ---------- Internal Functions ---------- */

    function _setExchangeParameters(address integration, StoredParameterIntegrationSettings memory settings) internal {
        require(address(integration) != address(0), "Address cannot be 0");

        // all lists must be ascending or binary search doesn't work
        _ensureAscending(settings.atomicEquivalentForDexPricing);
        _ensureAscending(settings.atomicExchangeFeeRate);
        _ensureAscending(settings.atomicVolatilityConsiderationWindow);
        _ensureAscending(settings.atomicVolatilityTwapSeconds);
        _ensureAscending(settings.atomicVolatilityUpdateThreshold);
        _ensureAscending(settings.exchangeFeeRate);

        // TODO: causes `UnimplementedFeatureError`
        //_settings[integration] = settings; // overwrites the parameters for a given direct integration
        emit IntegrationParametersSet(integration, settings);
    }

    function _ensureAscending(MappedParameter[] memory params) internal pure {
        bytes32 lastKey;
        for (uint i = 0;i < params.length;i++) {
            require(params[i].key > lastKey);
            lastKey = params[i].key;
        }
    }

    function _binarySearch(MappedParameter[] memory params, bytes32 desiredKey) internal view returns (uint) {
        _binarySearchInner(params, desiredKey, 0, params.length - 1);
    }

    function _binarySearchInner(MappedParameter[] memory params, bytes32 desiredKey, uint start, uint end) internal view returns (uint) {
        if (end - start == 0) {
            return 0;
        }

        uint guess = end - start / 2;
        if (params[guess].key == desiredKey) {
            return params[guess].value;
        } else if (params[guess].key > desiredKey) {
            return _binarySearchInner(params, desiredKey, start, guess);
        } else {
            return _binarySearchInner(params, desiredKey, guess + 1, end);
        }
    }

    /* ========== EVENTS ========== */

    event IntegrationParametersSet(address indexed integration, StoredParameterIntegrationSettings overrides);
}
