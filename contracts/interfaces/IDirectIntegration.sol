pragma solidity >=0.4.24;

import "./IERC20.sol";

// https://docs.synthetix.io/contracts/source/interfaces/IDirectIntegration
interface IDirectIntegration {
    struct Parameters {
        bytes32 name;
        uint256 value;
    }

    function getIntegrationParameter(address integration, bytes32 paramId) external view returns (uint);

    function addIntegration(address integration, bytes32 methodId) external;

    function removeIntegration(address integration, bytes32 methodId) external;

    function pauseIntegration(address integration) external;

    function resumeIntegration(address integration) external;

    function addOverride(
        address integration,
        bytes32 paramId,
        Parameters calldata params
    ) external;

    function removeOverride(address integration, bytes32 paramId) external;
}
