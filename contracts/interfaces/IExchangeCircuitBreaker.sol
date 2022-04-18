pragma solidity ^0.5.16;

// https://docs.synthetix.io/contracts/source/interfaces/IExchangeCircuitBreaker
interface IExchangeCircuitBreaker {
    // Views

    function exchangeRates() external view returns (address);

    function isInvalid(address oracleAddress, uint value) external view returns (bool);

    function priceDeviationThresholdFactor() external view returns (uint);

    function isDeviationAboveThreshold(uint base, uint comparison) external view returns (bool);

    function lastValue(address oracleAddress) external view returns (uint);

    // Mutative functions
    function resetLastValue(address[] calldata currencyKeys, uint[] calldata values) external;

    function probeCircuitBreaker(address aggregator, uint value) external returns (bool broken);
}
