pragma solidity 0.4.25;

/**
 * @title ExchangeRates interface
 */
interface IExchangeRates {
    function effectiveValue(bytes32 sourceCurrencyKey, uint sourceAmount, bytes32 destinationCurrencyKey) external view returns (uint);

    function rateForCurrency(bytes32 currencyKey) external view returns (uint);
    function ratesForCurrencies(bytes32[] currencyKeys) external view returns (uint[] memory);

    function rateIsStale(bytes32 currencyKey) external view returns (bool);
    function anyRateIsStale(bytes32[] currencyKeys) external view returns (bool);

    function getCurrentRoundId(bytes32 currencyKey) external view returns (uint);
    function effectiveValueAtRound(
        bytes32 sourceCurrencyKey,
        uint sourceAmount,
        bytes32 destinationCurrencyKey,
        uint roundIdForSrc,
        uint roundIdForDest
    ) external view returns (uint);

    function getLastRoundIdWhenWaitingPeriodEnded(
        bytes32 currencyKey,
        uint startingRoundId,
        uint startingTimestamp,
        uint timediff
    ) external view returns (uint);

    function ratesAndStaleForCurrencies(bytes32[] currencyKeys)
        external
        view
        returns (uint[], bool);
}
