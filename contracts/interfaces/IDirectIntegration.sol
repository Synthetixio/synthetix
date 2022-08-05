pragma solidity >=0.4.24;

import "./IERC20.sol";

// https://docs.synthetix.io/contracts/source/interfaces/IDirectIntegration
interface IDirectIntegration {
    function addIntegration() external;

    function removeIntegration() external;

    function addOverride() external;

    function removeOverride() external;
}
