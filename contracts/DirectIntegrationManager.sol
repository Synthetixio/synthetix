pragma solidity ^0.5.16;
pragma experimental ABIEncoderV2;

// Inheritance
import "./Owned.sol";
import "./MixinResolver.sol";
import "./MixinSystemSettings.sol";
import "./interfaces/IDirectIntegrationManager.sol";

// Libraries
import "./AddressSetLib.sol";
import "./Bytes32SetLib.sol";

/*
 * SIP-267: Direct Integration
 * https://sips.synthetix.io/sips/sip-267/
 *
 * Used by the Spartan Council to approve an external contract, (i.e. one which is not owned or managed by the Synthetix protocol),
 * to interact with Synthetix's core exchange functionalities with overridden parameters.
 * If no parameter overrides are specified, then the prevailing parameter configuration will be automatically used.
 */
contract DirectIntegration is Owned, MixinSystemSettings, IDirectIntegrationManager {
    /* ========== LIBRARIES ========== */
    using AddressSetLib for AddressSetLib.AddressSet;
    using Bytes32SetLib for Bytes32SetLib.Bytes32Set;

    /* ========== CONSTANTS ========== */
    bytes32 public constant CONTRACT_NAME = "DirectIntegration";

    uint internal constant DI_VERSION = 1;

    /* ---------- Internal Variables ---------- */

    // The set of all direct integration addresses.
    AddressSetLib.AddressSet internal _directIntegrations;

    // The set of all parameters that can be overridden by direct integrations.
    Bytes32SetLib.Bytes32Set internal _configurableParameters;

    // Stores a list of all overridden parameters for a given direct integration.
    mapping(address => ParameterOverride[]) internal _overrides;

    /* ========== CONSTRUCTOR ========== */
    constructor(address _owner, address _resolver) public Owned(_owner) MixinSystemSettings(_resolver) {}

    /* ========== VIEWS ========== */

    /* ---------- Getters ---------- */

    /**
     * Used to read the configured overridden values for a given integration.
     * @param integration the address of the external integrator's contract
     */
    function getIntegrationParameterOverrides(address integration)
        public
        view
        returns (ParameterOverride[] memory overrides)
    {
        return _overrides[integration];
    }

    /* ========== MUTATIVE FUNCTIONS ========== */

    /**
     * Grants an external contract the ability to interact with the core Synthetix exchange functionality.
     * @param integration the address of the external integrator's contract
     * @notice This will require a SIP and a presentation, given the importance of clearly presenting
     * the external interactions with Synthetix contracts and the parameter overrides that would be implemented.
     */
    function addIntegration(address integration) external onlyOwner {
        address[] memory integrations = new address[](1);
        integrations[0] = integration;
        _addIntegrations(integrations);
    }

    function addIntegrations(address[] calldata integrations) external onlyOwner {
        _addIntegrations(integrations);
    }

    function _addIntegrations(address[] memory integrations) internal {
        for (uint i = 0; i < integrations.length; i++) {
            address integration = integrations[i];
            require(address(integration) != address(0), "Address cannot be 0");

            if (!_directIntegrations.contains(integration)) {
                // Add it to the set.
                _directIntegrations.add(integration);
                emit AddedIntegration(integration);
            }
        }
    }

    /**
     * Revokes external access to the core exchange functionality and removes all associated overridden parameters.
     * @param integration the address of the external integrator's contract
     * @notice This can be configured via SCCP.
     */
    function removeIntegration(address integration) external onlyOwner {
        address[] memory integrations = new address[](1);
        integrations[0] = integration;
        _removeIntegrations(integrations);
    }

    function removeIntegrations(address[] calldata integrations) external onlyOwner {
        _removeIntegrations(integrations);
    }

    function _removeIntegrations(address[] memory integrations) internal {
        for (uint i = 0; i < integrations.length; i++) {
            address integration = integrations[i];
            require(address(integration) != address(0), "Address cannot be 0");

            if (_directIntegrations.contains(integration)) {
                // Remove it from the set.
                _directIntegrations.remove(integration);
                emit RemovedIntegration(integration);
            }
        }
    }

    /**
     * Sets an override to be used for a given direct integration that supersedes the default Synthetix parameter value.
     * @param integration the address of the external integrator's contract
     * @param param the parameter to be overridden
     * @dev This overwrites whatever overrides were previously set. Set overrides to zero to remove them.
     * @notice This will require a SIP and a presentation, given the importance of clearly presenting
     * external interactions with Synthetix contracts and the parameter overrides that would be implemented.
     */
    function setOverride(address integration, ParameterOverride calldata param) external onlyOwner {
        address[] memory integrations = new address[](1);
        ParameterOverride[] memory params = new ParameterOverride[](1);
        integrations[0] = integration;
        params[0] = param;
        _setOverrides(integrations, params);
    }

    function setOverrides(address[] calldata integrations, ParameterOverride[] calldata params) external onlyOwner {
        _setOverrides(integrations, params);
    }

    function _setOverrides(address[] memory integrations, ParameterOverride[] memory params) internal {
        require(integrations.length == params.length, "Input array length mismatch");

        for (uint i = 0; i < integrations.length; i++) {
            address integration = integrations[i];
            require(address(integration) != address(0), "Address cannot be 0");

            _overrides[integration].push(params[i]);
            emit OverrideSet(integration, params[i].paramName, params[i].overriddenValue);
        }
    }

    /**
     * Adds a configurable parameter to the set of all parameters that can be overridden by direct integrations.
     * @param paramName an identifier of the parameter
     * @notice This can be configured via SCCP.
     */
    function addParameter(bytes32 paramName) external onlyOwner {
        bytes32[] memory paramNames = new bytes32[](1);
        paramNames[0] = paramName;
        _addParameters(paramNames);
    }

    function addParameters(bytes32[] calldata paramNames) external onlyOwner {
        _addParameters(paramNames);
    }

    function _addParameters(bytes32[] memory paramNames) internal {
        for (uint i = 0; i < paramNames.length; i++) {
            bytes32 paramName = paramNames[i];
            if (!_configurableParameters.contains(paramName)) {
                // Add it to the set.
                _configurableParameters.add(paramName);
                emit AddedParameter(paramName);
            }
        }
    }

    /**
     * Removes a configurable parameter from the set of all parameters that can be overridden by direct integrations.
     * @param paramName an identifier of the parameter
     * @notice This can be configured via SCCP.
     */
    function removeParameter(bytes32 paramName) external onlyOwner {
        bytes32[] memory paramNames = new bytes32[](1);
        paramNames[0] = paramName;
        _removeParameters(paramNames);
    }

    function removeParameters(bytes32[] calldata paramNames) external onlyOwner {
        _removeParameters(paramNames);
    }

    function _removeParameters(bytes32[] memory paramNames) internal {
        for (uint i = 0; i < paramNames.length; i++) {
            bytes32 paramName = paramNames[i];
            if (_configurableParameters.contains(paramName)) {
                // Remove it from the set.
                _configurableParameters.remove(paramName);
                emit RemovedParameter(paramName);
            }
        }
    }

    /* ========== EVENTS ========== */

    event AddedIntegration(address indexed integration);
    event RemovedIntegration(address indexed integration);
    event OverrideSet(address indexed integration, bytes32 indexed paramName, bytes indexed overriddenValue);
    event AddedParameter(bytes32 indexed paramName);
    event RemovedParameter(bytes32 indexed paramName);
}
