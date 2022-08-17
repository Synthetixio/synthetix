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
    mapping(address => ParameterOverrides) internal _overrides;

    /* ========== CONSTRUCTOR ========== */
    constructor(address _owner, address _resolver) public Owned(_owner) MixinSystemSettings(_resolver) {}

    /* ========== VIEWS ========== */

    /* ---------- Getters ---------- */

    /**
     * Used to read the configured overridden values for a given integration.
     * @param integration the address of the external integrator's contract
     */
    function getParameterOverridesForIntegration(address integration)
        public
        view
        returns (ParameterOverrides memory overrides)
    {
        return _overrides[integration];
    }

    /* ========== MUTATIVE FUNCTIONS ========== */
    /**
     * Sets an override to be used for a given direct integration that supersedes the default Synthetix parameter value.
     * @param integration the address of the external integrator's contract
     * @param overrides a collection of parameters to be overridden
     * @dev Invoking this function will overwrite whatever overrides were previously set. Set overrides to zero to "remove" them.
     * @notice This will require a SIP and a presentation, given the importance of clearly presenting
     * external interactions with Synthetix contracts and the parameter overrides that would be implemented.
     */
    function setParameterOverrides(address integration, ParameterOverrides calldata overrides) external onlyOwner {
        _setParameterOverrides(integration, overrides);
    }

    /* ---------- Internal Functions ---------- */

    function _setParameterOverrides(address integration, ParameterOverrides memory overrides) internal {
        require(address(integration) != address(0), "Address cannot be 0");
        _overrides[integration] = overrides; // overwrites the parameters for a given direct integration
        emit OverrideSet(integration, overrides);
    }

    /* ========== EVENTS ========== */

    event OverrideSet(address indexed integration, ParameterOverrides indexed overrides);
}
