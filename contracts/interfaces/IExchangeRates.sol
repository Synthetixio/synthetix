pragma solidity 0.4.25;

/**
 * @title ExchangeRates interface
 */
interface IExchangeRates {
    function effectiveValue(bytes4 sourceCurrencyKey, uint sourceAmount, bytes4 destinationCurrencyKey) external view returns (uint);

    function rateForCurrency(bytes4 currencyKey) external view returns (uint);
    function ratesForCurrencies(bytes4[] currencyKeys) external view returns (uint[] memory);

    function rateIsStale(bytes4 currencyKey) external view returns (bool);
    function anyRateIsStale(bytes4[] currencyKeys) external view returns (bool);
}