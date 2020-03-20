pragma solidity 0.4.25;


interface ISystemStatus {
    function requireSystemAvailable() external view;

    function requireSynthvailable(bytes32 currencyKey) external view;
}
