pragma solidity 0.4.25;

/**
 * @title ExchangeRates interface
 */
interface IExchangeRates {
    function effectiveValue(bytes32 sourceCurrencyKey, uint sourceAmount, bytes32 destinationCurrencyKey) public view returns (uint);

    function rateForCurrency(bytes32 currencyKey) public view returns (uint);

    function anyRateIsStale(bytes32[] currencyKeys) external view returns (bool);

    function rateIsStale(bytes32 currencyKey) external view returns (bool);
}
