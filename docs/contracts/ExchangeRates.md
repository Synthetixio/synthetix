# ExchangeRates

## Notes

The price of `sUSD` is always 1, and is never stale; its price cannot be updated.
The `XDR` price is just $\sum_{c \in \text{basket}}{c_{price}}$, the sum of the prices of the currencies in the basket (`sUSD`, `sAUD`, `sCHF`, `sEUR`, `sGBP`), and not the average.

## Inherited Contracts

* [SelfDestructible](SelfDestructible.md)
* ^[State](State.md)
* ^^[Owned](Owned.md)

## Related Contracts

### Referenced

* SafeMath
* [SafeDecimalMath](SafeDecimalMathmd)

### Referencing

* [PurgeableSynth](PurgeableSynth.md)
* [Synthetix](Synthetix.md)

## Structs

```solidity
struct InversePricing {
    uint entryPoint; // The price at the time this inverse index was set up.
    uint upperLimit; // The upper limit of the *inverse* price (not the underlying rate).
    uint lowerLimit; // The lower limit of the *inverse* price (not the underlying rate).
    bool frozen; // Used in dapps, presumably, but also in PurgeableSynth (frozen synths can be purged)
}
```

## Variables

* `rates: mapping(bytes4 => uint) public`: Stores the exchange rate for each given currency code (`sUSD`, `SNX` , et cetera).
* `lastRateUpdateTimes: mapping(bytes4 => uint) public`: Stores the time each rate was last updated.
* `oracle: address public`: The address which is permitted to push rate updates to the contract.
* `ORACLE_FUTURE_LIMIT: uint constant`: The maximum time in the future that rates are allowed to be set at. Initialised to 10 minutes.
* `rateStalePeriod: uint public`: The duration after which a rate will be considered out of date.
* `priceUpdateLock: bool public`: A mutex so that exchanges can't be made while prices are being updated. This does not turn off any functionality in the exchange rate contract, but is used in the [Synthetix](Synthetix.md) contract to disable currency exchanges while prices are being updated. This is only settable by the oracle, which presumably sets it to true before price updates are submitted (TODO: Investigate this). It is set to false whenever the rates have completed their updates, inside the `internalUpdateRates` function.
* `xdrParticipants: bytes4[5] public`: The codes of each currency in the XDR basket. Hard-coded to `[sUSD, sAUD, sCHF, sEUR, sGBP]`. They are equally-weighted. No crypto assets here!
* `inversePricing: mapping(bytes4 => InversePricing) public`: For each currency with an inverse index, keep the necessary information to maintain the index.
* `invertedKeys: bytes4[] public`: A list of the currencies with an inverted index.

## Functions

* `updateRates(bytes4[] currencyKeys, uint[] newRates, uint timeSent) returns (bool)`: Only callable by the oracle; otherwise just an alias to `internalUpdateRates`.
* `internalUpdateRates(bytes4[] currencyKeys, uint[] newRates, uint timeSent) returns (bool)`: Will not allow `timeSent` to be more than `ORACLE_FUTURE_LIMIT` seconds into the future. Throws an exception if the currencyKeys include `sUSD`, or if any rate is 0. Then, for each rate, set the rate and timestamp, handling any inverse indexes with `rateOrInverted`. Any particular element is skipped if the contract's last update time is after the new update time. NOTE: this means that if a price update is resent at the same timestamp, it can overwrite. Then update the `XDR` price with the `updateXDRRate` function, and disable the price update lock if it was set.
* `rateOrInverted(bytes4 currencyKey, uint rate) returns (uint)`: If no inverted rate exists for this currency key (i.e. if `inversePricing[currencyKey].entryPoint = 0`), then simply return rate. Otherwise:
If the rate is currently frozen, then just return the previously stored rate (`rates[currencyKey]`). So, frozen prices can never be updated.
If not, then return $2 \times entryPoint - rate$, or $0$
if this quantity is negative. Then, if the quantity either exceeds the upper limit, or is less than the lower limit, the rate is set to the limit which was reached, and `frozen` is set to true.
This can be expressed as $newRate \leftarrow max(lowerLimit, \ min(max(0, \ 2 \times entryPoint - rate), \ upperLimit))$. and $frozen \leftarrow newRate \in \{lowerLimit, \ upperLimit\}$.
Note that if $rate >= 2 \times entryPoint$, then the rate will always be frozen. The upshot of this system is that if the entry price of the asset underlying an inverted index is $entryPoint$, then if the price of the asset moves to $entryPoint + \delta$, then the rate of the inverted index moves to $entryPoint - \delta$, and the price freezes if $-\delta \le upperlimit - entryPoint$ or $\delta \ge entryPoint - lowerLimit$. The upper and lower limits are thus computed in terms of the inverse index, not of the underlying asset.
* `updateXDRRate(uint timeSent)`: Updates the `XDR` price based on the current prices of `xdrParticipants`. The `XDR` price is just the sum of those currencies. NOTE: this price is still updated even if the underlying prices are stale, and its timestamp will not reflect the timestamps of the underlying currencies.
* `deleteRate(bytes4 currencyKey)`: Only callable by the oracle. Will not delete an already-deleted rate.
* `setOracle(address _oracle)`: Only callable by the contract owner.
* `setRateStalePeriod(uint _time)`: Only callable by the contract owner.
* `setPriceUpdateLock(uint _priceUpdateLock)`: Only callable by the oracle.
* `setInversePricing(bytes4 currencyKey, uint entryPoint, uint upperLimit, uint lowerLimit)`: Only callable by the contract owner. $entryPoint, upperLimit, lowerLimit$ must be strictly greater than 0, noting that an entryPoint of 0 is taken to mean that no inverse index exists. $upperLimit$ must be greater than $entryPoint$, and less than $2 \times entryPoint$. $lowerLimit$ must be less than $entryPoint$. Push the currency key to the list of inverted keys if it is not already known. Inverse indices start unfrozen.
* `removeInversePricing(bytes4 currencyKey)`: Delete the corresponding entry in the `inversePricing` map, and delete the entry in the `invertedKeys` array, replacing it with the last element in the array. NOTE: This emits an `InversePriceConfigured` event for the currency key, with all arguments 0; this will still be emitted even if the currency had no inverse index.
* `effectiveValue(bytes4 sourceCurrencyKey, uint sourceAmount, bytes4 destinationCurrencyKey) returns (uint)`: Neither the source nor destination currency rates can be stale. If the prices are fresh, then just return $sourceAmount \times \frac{rates[sourceCurrencyKey]}{rates[destinationCurrencyKey]}$.
* `rateForCurrency(bytes4 currencyKey) returns (uint)`: Simply an alias to `rates[currencyKey]`.
* `ratesForCurrencies(bytes4[] currencyKeys) returns (uint[])`: Maps `rateForCurrency` over an array of keys.
* `lastRateUpdateTimeForCurrency(bytes4 currencyKey) returns (uint)`: Alias to `lastRateUpdateTime[currencyKey]`.
* `lastRateUpdateTimesForCurrencies(bytes4[] currencyKeys) returns (uint[])`: Maps `lastRateUpdateTimeForCurrency` over an array of keys.
* `rateIsStale(bytes4 currencyKey) returns (bool)`: `sUSD` is never stale. Otherwise, checks if the last updated time was more than `rateStalePeriod` seconds in the past.
* `rateIsFrozen(bytes4 currencyKey) returns (bool)`: Simply an alias to `inversePricing[currencyKey].frozen`. Currencies without an inverse price will naturally return false.
* `anyRateIsStale(bytes4[] currencyKeys) returns (bool)`: Loop over all currencies except sUSD and return true if any of them is stale.

## Events

* `OracleUpdated(address newOracle)`
* `RateStalePeriodUpdated(uint rateStalePeriod)`
* `RatesUpdated(bytes4[] currencyKeys, uint[] newRates)`
* `RateDeleted(bytes4 currencyKey)`
* `InversePriceConfigured(bytes4 currencyKey, uint entryPoint, uint upperLimit, uint lowerLimit)`
* `InversePriceFrozen(bytes4 currencyKey)`
