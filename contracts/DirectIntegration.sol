pragma solidity ^0.5.16;

// Inheritance
import "./Owned.sol";
import "./MixinResolver.sol";
import "./MixinSystemSettings.sol";
import "./interfaces/IDirectIntegration.sol";

// Internal references
import "./interfaces/ISystemStatus.sol";

/*
 * SIP-267: Direct Integration
 * https://sips.synthetix.io/sips/sip-267/
 *
 * Used by the Spartan Council to approve an external contract, (i.e. one which is not owned or managed by the Synthetix protocol),
 * to interact with Synthetix's core exchange functionalities with overridden parameters.
 * If no parameter overrides are specified, then the prevailing parameter configuration will be automatically used.
 */
contract DirectIntegration is Owned, MixinSystemSettings, IDirectIntegration {
    /* ========== CONSTANTS ========== */
    bytes32 public constant CONTRACT_NAME = "DirectIntegration";

    uint internal constant DI_VERSION = 1;

    mapping public 

    /* ---------- Address Resolver Configuration ---------- */
    bytes32 private constant CONTRACT_SYSTEMSTATUS = "SystemStatus";

    /* ========== CONSTRUCTOR ========== */
    constructor(address _owner, address _resolver) public Owned(_owner) MixinSystemSettings(_resolver) {}

    /* ========== VIEWS ========== */
    function resolverAddressesRequired() public view returns (bytes32[] memory addresses) {
        addresses = new bytes32[](1);
        addresses[0] = CONTRACT_SYSTEMSTATUS;
    }

    function _systemStatus() internal view returns (IERC20) {
        return IERC20(requireAndGetAddress(CONTRACT_SYSTEMSTATUS));
    }

    /* ---------- Getters ---------- */

    /**
     * This can be used to read the configured value on an external contract for a given parameter.
     * @param integration the address of the external integrator's contract
     * @param paramId an identifier of the parameter (e.g. "atomicExchangeFeeRate")
     */
    function getIntegrationParameter(address integration, bytes32 paramId) public view returns (Parameters) {
        return {};
    }

    /* ========== MUTATIVE FUNCTIONS ========== */

    /**
     * Grants an external contract the ability to interact with the core Synthetix exchange functionality.
     * @param integration the address of the external integrator's contract
     * @param methodId an identifier of the exchange method to be tapped by the external contract (e.g. "exchangeAtomically")
     * @notice Invoking this function will require a SIP and a presentation, given the importance of clearly presenting
     * the external interactions with Synthetix contracts and the parameter overrides that would be implemented.
     */
    function addIntegration(address integration, bytes32 methodId) external onlyOwner {}

    /**
     * Revokes external access to the core exchange functionality and removes all associated overridden parameters.
     * @param integration the address of the external integrator's contract
     * @param methodId an identifier of the exchange method to be tapped by the external contract (e.g. "exchangeAtomically")
     * @notice This can be configured via SCCP.
     */
    function removeIntegration(address integration, bytes32 methodId) external onlyOwner {}

    /**
     * Allows the owner to suspend interaction with the specified integration.
     * @param integration the address of the external integrator's contract
     * @notice This can be called by the pDAO in care of emergencies.
     */
    function pauseIntegration(address integration) external onlyOwner {}

    /**
     * Resumes the ability to interact with the specified integration.
     * @param integration the address of the external integrator's contract
     * @notice This can be configured via SCCP.
     */
    function resumeIntegration(address integration) external onlyOwner {}

    /**
     * Adds an override to be used that supersedes the default Synthetix parameter value.
     * @param integration the address of the external integrator's contract
     * @param paramId an identifier of the parameter to be overridden (e.g. "atomicExchangeFeeRate")
     * @param params a list of the override values (e.g. ['sETH', 10] would set fees on atomic exchanges to 10 bp)
     * @dev In case an overridden value needs to be edited, `removeOverride` must first be invoked followed by `addOverride`.
     * @notice This will require a SIP and a presentation, given the importance of clearly presenting
     * external interactions with Synthetix contracts and the parameter overrides that would be implemented.
     */
    function addOverride(
        address integration,
        bytes32 paramId,
        Parameters calldata params
    ) external onlyOwner {}

    /**
     * Removes an overridden value and returns to using the prevailing Synthetix parameter value.
     * @param integration the address of the external integrator's contract
     * @param paramId an identifier of the overridden parameter to be restored to the default value (e.g. "atomicExchangeFeeRate")
     * @notice This can be configured via SCCP.
     */
    function removeOverride(address integration, bytes32 paramId) external onlyOwner {}

    /* ========== EVENTS ========== */

    event AddedIntegration(address indexed integration, bytes32 indexed methodId);
    event RemovedIntegration(address indexed integration, bytes32 indexed methodId);
    event AddedOverride(address indexed integration, bytes32 indexed paramId);
    event RemovedOverride(address indexed integration, bytes32 indexed paramId);
}
