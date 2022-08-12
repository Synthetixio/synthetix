pragma solidity >=0.4.24;
pragma experimental ABIEncoderV2;

import "./IERC20.sol";

// https://docs.synthetix.io/contracts/source/interfaces/IDirectIntegration
interface IDirectIntegrationManager {
    struct ParameterOverride {
        bytes32 paramName;
        bytes overriddenValue;
    }

    function getIntegrationParameterOverrides(address integration)
        external
        view
        returns (ParameterOverride[] memory overrides);

    function addIntegration(address integration) external;

    function addIntegrations(address[] calldata integrations) external;

    function removeIntegration(address integration) external;

    function removeIntegrations(address[] calldata integrations) external;

    function setOverride(address integration, ParameterOverride[] calldata params) external;

    function setOverrides(address[] calldata integrations, ParameterOverride[] calldata params) external;

    function addParameter(bytes32 paramName) external;

    function addParameters(bytes32[] calldata paramNames) external;

    function removeParameter(bytes32 paramName) external;

    function removeParameters(bytes32[] calldata paramNames) external;

    // TODO: Add a new direct integration `address` parameter to existing exchange functions
    // (uses ZERO_ADDR for regular calls without an integration)

    // TODO: move all the getters for the exchange params involved  https://sips.synthetix.io/sips/sip-267/#parameters-involved
    /// move them to direct integration interface and remove from SystemSettings
}
