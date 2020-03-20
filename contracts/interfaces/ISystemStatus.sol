pragma solidity 0.4.25;


interface ISystemStatus {
    function requireSystemActive() external view;

    function requireIssuanceActive() external view;

    function requireSynthActive(bytes32 currencyKey) external view;
}
