pragma solidity ^0.5.16;


/**
 * @title ExchangeRates interface
 */
interface IExchangeRates {
    function effectiveValue(
        bytes32 sourceCurrencyKey,
        uint sourceAmount,
        bytes32 destinationCurrencyKey
    ) external view returns (uint);

    function rateForCurrency(bytes32 currencyKey) external view returns (uint);

    function ratesForCurrencies(bytes32[] calldata currencyKeys) external view returns (uint[] memory);

    function rateIsStale(bytes32 currencyKey) external view returns (bool);

    function rateIsFrozen(bytes32 currencyKey) external view returns (bool);

    function anyRateIsStale(bytes32[] calldata currencyKeys) external view returns (bool);

    function getCurrentRoundId(bytes32 currencyKey) external view returns (uint);

    function effectiveValueAtRound(
        bytes32 sourceCurrencyKey,
        uint sourceAmount,
        bytes32 destinationCurrencyKey,
        uint roundIdForSrc,
        uint roundIdForDest
    ) external view returns (uint);

    function getLastRoundIdBeforeElapsedSecs(
        bytes32 currencyKey,
        uint startingRoundId,
        uint startingTimestamp,
        uint timediff
    ) external view returns (uint);

    function ratesAndStaleForCurrencies(bytes32[] calldata currencyKeys) external view returns (uint[] memory, bool);

    function rateAndTimestampAtRound(bytes32 currencyKey, uint roundId) external view returns (uint rate, uint time);
}
