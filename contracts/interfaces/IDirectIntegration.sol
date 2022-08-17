pragma solidity >=0.4.24;

// https://docs.synthetix.io/contracts/source/interfaces/IDirectIntegration
interface IDirectIntegration {
    function getReturnAmount(
        address srcEquivalent,
        address destEquivalent,
        uint srcAmount
    ) external returns (uint);

    // user should be able to specify what data they should send to the DirectIntegration contract
    function exchangeWithDirectIntegration(bytes32 synthKey, bytes calldata payload) external;
}
