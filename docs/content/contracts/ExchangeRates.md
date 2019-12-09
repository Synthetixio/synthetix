# ExchangeRates

This contract stores the latest Synth exchange rates. These rates are set by an oracle, which updates this contract every three minutes with any prices that have moved sufficiently. Once set, these prices are available for any contract in the Synthetix system to query.
Prices which have not been updated recently enough are considered stale; Synthetix functionality using stale prices does not operate. All rates are denominated in terms of sUSD, so the price of sUSD is always $1.0$, and is never stale.

The ExchangeRates contract is also responsible for computing the prices of various derived synths.
In particular, the behaviour of [inverse synths](#rateorinverted) is defined here. These are derivative synths whose price varies inversely with the price of an underlying asset.
In addition, the ExchangeRates contract determines the price of the XDR, which is recomputed after each new batch of prices is received from the oracle. The XDR price is the sum of the prices of the currencies in a basket (sUSD, sAUD, sCHF, sEUR, sGBP), as opposed to the [IMF's special drawing rights](https://en.wikipedia.org/wiki/Special_drawing_rights) which use a weighted average.

This contract interacts with the oracle's frontrunning protection, which is partially described in [SIP-6](https://sips.synthetix.io/sips/sip-6) and [SIP-7](https://sips.synthetix.io/sips/sip-7).

This does not turn off any functionality in the exchange rate contract, but is used by [`Synthetix`](Synthetix.md) to disable [currency exchanges](Synthetix.md#_internalexchange) while prices are being updated to protect against oracle front running. The lock is released when [rate updates have completed](#internalupdaterates).

**Source:** [ExchangeRates.sol](https://github.com/Synthetixio/synthetix/blob/master/contracts/ExchangeRates.sol)

## Architecture

---

### Inheritance Graph

<centered-image>
    ![ExchangeRates inheritance graph](../img/graphs/ExchangeRates.svg)
</centered-image>

---

### Related Contracts

<centered-image>
    ![ExchangeRates architecture graph](../img/graphs/ExchangeRates-architecture.svg)
</centered-image>

??? example "Details"

    - [`oracle`](#oracle): This address is not actually a contract, but it is the source of prices for this contract.
    - [`Aggregators`](#aggregators): These are a collection of decentralized pricing networks that collect and aggregate results from a network of oracles.
    - [`PurgeableSynth`](PurgeableSynth.md): exchange rates are used to determine if the total token value is below the purge threshold.
    - [`Synthetix`](Synthetix.md): the value of tokens is used to in order to facilitate exchange between them, to compute the `XDR` value of minted tokens for the [debt ledger](SynthetixState.md#debtledger), and to ensure exchanges cannot occur while price updates and being made or if a particular exchange rate is stale.
    - [`ArbRewarder`](ArbRewarder.md): The ArbRewarder must know the current SNX/ETH price so that arbitrage is accurate.

---

### Libraries

- [`SafeMath`](SafeMath.md) for `uint`
- [`SafeDecimalMath`](SafeDecimalMathmd) for `uint`

---

### External References

- [`AggregatorInterface`](https://github.com/smartcontractkit/chainlink/blob/5ab3cd2777590701007cc02941cb94179e79f3ba/evm/contracts/interfaces/AggregatorInterface.sol) - Each of these interfaces correspond to a decentralized pricing network facilitated by Chainlink that collect and aggregatate results from a network of oracles. See [Aggregator.sol](https://github.com/smartcontractkit/chainlink/blob/5ab3cd2777590701007cc02941cb94179e79f3ba/evm/contracts/Aggregator.sol) for the implementation.s

---

## Structs

---

### `InversePricing`

Holds necessary information for computing the price of [inverse Synths](../tokens.md#inverse-synths).

| Field      | Type                                 | Description                                                                                               |
| ---------- | ------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| entryPoint | `uint` ([18 dp](SafeDecimalMath.md)) | The underlying asset's price at the time the inverse index was set up. Must be strictly greater than $0$. |
| upperLimit | `uint` ([18 dp](SafeDecimalMath.md)) | The upper limit of the _inverse_ price. Must lie strictly between entryPoint and twice entryPoint.        |
| lowerLimit | `uint` ([18 dp](SafeDecimalMath.md)) | The lower limit of the _inverse_ price. Must lie strictly between $0$ and entryPoint.                     |
| frozen     | `bool`                               | True if an inverse Synth has breached one of its limits.                                                  |

---

## Constants

---

### `ORACLE_FUTURE_LIMIT`

The maximum time in the future ($10$ minutes) that rates are allowed to be set for.

**Type:** `uint constant`

**Value:** `10 minutes`

---

## Variables

---

### `aggregators`

For each currency with a decentralized aggregated pricing network, return the Aggregation contract address.

**Type:** `mapping(bytes32 => AggregatorInterface) public`

---

### `aggregatorKeys`

A list of the keys of currencies with a decentralized aggregated pricing network.

**Type:** `bytes32[] public`

---

### `inversePricing`

For each currency with an inverse index, keep the necessary [`InversePricing`](#inversepricing) information to maintain the index.

**Type:** `mapping(bytes32 => InversePricing) public`

---

### `invertedKeys`

A list of the keys of currencies with an inverted index.

**Type:** `bytes32[] public`

---

### `oracle`

The address which is permitted to push rate updates to the contract.

**Type:** `address public`

---

### `rateStalePeriod`

The duration after which a rate will be considered out of date. Synth exchange and other price-sensitive transactions in the [`Synthetix`](Synthetix.md) contract will not operate if a relevant rate is stale.
Initialised to $3$ hours.

**Type:** `uint public`

---

### `xdrParticipants`

The codes of each currency in the XDR basket. Hard-coded to `[sUSD, sAUD, sCHF, sEUR, sGBP]`. They are equally-weighted. For stability, there are no crypto assets listed here.

**Type:** `bytes32[5] public`

---

## Constructor

Initialises the oracle address and initial currency prices, the `XDR` basket, along with the inherited [`SelfDestructible`](SelfDestructible.md) instance.

??? example "Details"

    **Signature**

    `constructor(address _owner, address _oracle, bytes32[] _currencyKeys, uint[] _newRates) public`

    **Superconstructors**

    * [`SelfDestructible(_owner)`](SelfDestructible.md#constructor)

    **Preconditions**

    * `_currencyKeys` and `_newRates` must be the same length.
    * `"sUSD"` must not appear in `_currencyKeys`.
    * $0$ must not appear in `_newRates`.

---

## Views

---

### `anyRateIsStale`

Loop over the given array of currencies and return true if any of them [is stale](#rateisstale). `sUSD`'s rate is never stale. Rates for nonexistent currencies are always stale.

??? example "Details"

    **Signature**

    `anyRateIsStale(bytes32[] currencyKeys) external view returns (bool)`

---

### `effectiveValue`

Given a quantity of a source currency, returns a quantity of a destination currency that is of equivalent value at current exchange rates, if those rates are fresh.

The effective value is computed as a simple ratio of the prices of the currencies concerned. That is, to convert a quantity $Q_A$ of currency $A$ to currency $B$ at prices $\pi_A$ and $\pi_B$, the quantity $Q_B$ received is:

$$
    Q_B = Q_A \frac{\pi_A}{\pi_B}
$$

This computation is simple because all fractional quantities in the Synthetix system except for the [debt ledger](SynthetixState.md#debtledger) are [18 decimal fixed point numbers](SafeDecimalMath.md).

??? example "Details"

    **Signature**

    `effectiveValue(bytes32 sourceCurrencyKey, uint sourceAmount, bytes32 destinationCurrencyKey) public view returns (uint)`

    **Modifiers**

    * [`rateNotStale(sourceCurrencyKey)`](#ratenotstale)
    * [`rateNotStale(destinationCurrencyKey)`](#ratenotstale))

    **Preconditions**

    * Neither the source nor destination currency prices may be stale.

---

### `lastRateUpdateTimes`

Retrieves the timestamp the given rate was last updated. Accessed by the same keys as [`rates`](#rates) is.

??? example "Details"

    ***Signature***

    `lastRateUpdateTimes(bytes32 code) public view returns(uint256)`

---

### `ratesForCurrencies`

Maps [`rateForCurrency`](#rateforcurrency) over an array of keys.

??? example "Details"

    **Signature**

    `ratesForCurrencies(bytes32[] currencyKeys) public view returns (uint[])`

---

### `rateForCurrency`

Returns the last recorded rate for the given currency. This is just an alias to the public mapping `rates`, so it could probably be eliminated.

??? example "Details"

    **Signature**

    `rateForCurrency(bytes32 currencyKey) public view returns (uint)`

---

### `rateIsFrozen`

Returns true if the inverse price for the given currency is frozen. This is simply an alias to [`inversePricing[currencyKey].frozen`](#inversepricing). Currencies without an inverse price will naturally return false.

??? example "Details"

    **Signature**

    `rateIsFrozen(bytes32 currencyKey) external view returns (bool)`

---

### `rateIsStale`

The rate for a given currency is stale if its last update occurred more than [`rateStalePeriod`](#ratestaleperiod) seconds ago.

`sUSD` is a special case; since its rate is fixed at $1.0$, it is never stale. The rates of nonexistent currencies are always stale.

??? example "Details"

    **Signature**

    `rateIsStale(bytes32 currencyKey) public view returns (bool)`

---

### `rates`

Retrieves the exchange rate (`sUSD` per unit) for a given currency key (`sUSD`, `SNX`, et cetera). These prices are stored as [18 decimal place fixed point numbers](SafeDecimalMath.md).

??? example "Details"

    ***Signature***

    `rates(bytes32 code) public view returns(uint256)`

---

## Restricted Functions (Oracle)

---

### `deleteRate`

Deletes a currency's price and its update time from the ExchangeRates contract.

??? example "Details"

    **Signature**

    `deleteRate(bytes32 currencyKey) external`

    **Modifiers**

    * [`onlyOracle`](#onlyoracle)

    **Preconditions**

    * The specified currency must not already have been deleted.

    **Emits**

    * [`RateDeleted(currencyKey)`](#ratedeleted)

---

### `updateRates`

Allows the oracle to update exchange rates in the contract. Otherwise this is just an alias to [`internalUpdateRates`](#internalupdaterates).

??? example "Details"

    **Signature**

    `updateRates(bytes32[] currencyKeys, uint[] newRates, uint timeSent) external returns (bool)`

    **Modifiers**

    * [`onlyOracle`](#onlyoracle)

---

## Restricted Functions (Owner)

---

### `removeInversePricing`

Allows the owner to remove an inverse index for a particular currency.

??? example "Details"

    **Signature**

    `removeInversePricing(bytes32 currencyKey) external`

    **Modifiers**

    * [`Owned.onlyOwner`](Owned.md#onlyowner)

    **Emits**

    * [`InversePriceConfigured(currencyKey, 0, 0, 0)`](#inversepriceconfigured)

---

### `setInversePricing`

Allows the owner to set up an inverse index for a particular currency. See [`rateOrInverted`](#rateorinverted) for computation details. New inverse indexes begin unfrozen.

??? example "Details"

    **Signature**

    `setInversePricing(bytes32 currencyKey, uint entryPoint, uint upperLimit, uint lowerLimit, bool freeze, bool freezeAtUpperLimit) external`

    **Modifiers**

    * [`Owned.onlyOwner`](Owned.md#onlyowner)

    **Preconditions**

    * `entryPoint` must be greater than zero.
    * `lowerLimit` must be greater than zero.
    * `entryPoint` must be less than `upperLimit`.
    * `upperLimit` must be less than twice `entryPoint`.
    * `lowerLimit` must be less than `entryPoint`.

    !!! info
        Together these entail that $0 \lt \text{lowerLimit} \lt \text{entryPoint} \lt \text{upperLimit} \lt 2 \times \text{entryPoint}$.

        Observe that the first precondition here is redundant, as two of the others imply it.

    **Emits**

    * [`InversePriceConfigured(currencyKey, entryPoint, upperLimit, lowerLimit)`](#inversepriceconfigured)

---

### `setOracle`

Allows the owner to set the address which is permitted to send prices to this contract.

??? example "Details"

    **Signature**

    `setOracle(address _oracle) external`

    **Modifiers**

    * [`Owned.onlyOwner`](Owned.md#onlyowner)

    **Emits**

    * [`OracleUpdated(_oracle)`](#oracleupdated)

---

### `setRateStalePeriod`

Allows the owner to set the time after which rates will be considered stale.

??? example "Details"

    **Signature**

    `setRateStalePeriod(uint _time) external`

    **Modifiers**

    * [`Owned.onlyOwner`](Owned.md#onlyowner)

    **Emits**

    * [`RateStalePeriodUpdated(_time)`](#ratestaleperiodupdated)

---

## Internal Functions

---

### `internalUpdateRates`

Record the set of provided rates and the timestamp, handling any inverse indexes with [`rateOrInverted`](#rateorinverted). At this stage inverse indexes which escaped their bounds are frozen. Any rate with a more recent update time is skipped.
Once all rates have been updated the `XDR` price is recomputed by [`updateXDRRate`](#updatexdrrate).

Finally, the [price update lock](#priceupdatelock) is reset, reenabling Synth exchange functionality.

The `timeSent` argument is useful for maintaining the exact age of the data points even as transactions can take a variable amount of time to confirm. Without this, earlier updates could possibly overwrite later ones.

Returns true if no exception was thrown.

??? example "Details"

    **Signature**

    `internalUpdateRates(bytes32[] currencyKeys, uint[] newRates, uint timeSent) internal returns (bool)`

    **Preconditions**

    * `currencyKeys` and `newRates` must be the same length.
    * `timeSent` must be less than [`ORACLE_FUTURE_LIMIT`](#oracle_future_limit) seconds in the future.
    * `"sUSD"` must not appear in `currencyKeys`.
    * $0$ must not appear in `newRates`.

    **Emits**

    * [`InversePriceFrozen(currencyKey)`](#inversepricefrozen) if `currencyKey`'s price has gone out of range.
    * [`RatesUpdated(currencyKeys, newRates)`](#ratesupdated)
    * [`RatesUpdated("XDR", computedXDRRate)`](#ratesupdated)

---

### `rateOrInverted`

Returns the current price for a specified currency key.

If a currency is not an inverted index, then just return the rate that was passed in.
If the currency is an inverted index, return the inverted rate. If the inverted price reaches one of its limits, freeze its rate at the limit it breached. Future calls to a frozen inverted index will return the last recorded rate. That is, frozen rates can no longer be updated.

An inverted rate moves exactly inverse to the underlying price; if the underlying price moves up a dollar, the inverted price moves down a dollar.
The price $\bar{p}$ of an [inverse index](#inversepricing) $c$ with base price $p$, entry point $e$, and lower and upper limits $l$ and $u$ respectively, is computed as:

$$
    \bar{p} = \text{clamp(}2e - p, \ l, \ u\text{)}
$$

With $0 \lt l \lt e \lt u \lt 2e$ enforced by [`setInversePricing`](#setinversepricing).[^1]

[^1]: The [clamp function](https://en.cppreference.com/w/cpp/algorithm/clamp) can be defined thus: `clamp(v, l, u) = min(max(v, l), u)`.

So if $p$ moves from $e$ to $e + \delta$, then $\bar{p}$ moves to $e - \delta$, if it would not be frozen.
$\bar{p}$ is frozen whenever $\bar{p} \in \{l,u\}$; that is, when $2e - l \le p$ or $p \le 2e - u$. This implies that $p$ can never exceed twice its entry point without $\bar{p}$ being frozen, but in principle it could reach almost to zero.

??? example "Details"

    **Signature**

    `rateOrInverted(bytes32 currencyKey, uint rate) internal returns (uint)`

    **Emits**

    * [`InversePriceFrozen(currencyKey)`](#inversepricefrozen) if `currencyKey`'s price has gone out of range.

---

### `removeFromArray`

---

Helper function that removes an `entry` from an existing array in storage. Returns `true` if found and removed, `false` otherwise.

??? example "Details"

    ***Signature***

    `removeFromArray(bytes32 entry, bytes32[] storage array) internal returns (bool)`

---

### `_setRate`

Updates the rate and timestamp for the individual rate using an internal struct.

??? example "Details"

    ***Signature***

    `_setRate(bytes32 code, uint256 rate, uint256 time) internal`

---

### `updateXDRRate`

Updates the `XDR` price, which is set to the sum of the current prices of the currencies in [`xdrParticipants`](#xdrparticipants) basket (`sUSD`, `sAUD`, `sCHF`, `sEUR`, `sGBP`).

??? example "Details"

    **Signature**

    `updateXDRRate(uint timeSent) internal`

    **Emits**

    * [`RatesUpdated("XDR", computedXDRRate)`](#ratesupdated)

---

## Modifiers

---

### `onlyOracle`

Reverts the transaction if `msg.sender` is not the [`oracle`](#oracle).

---

### `rateNotStale`

Reverts the transaction if the given currency's rate is stale.

**Signature:** `rateNotStale(bytes32 currencyKey)`

---

## Events

---

### `AggregatorAdded`

Records that an Aggregator pricing network was added

**Signature:** `AggregatorAdded(bytes32 currencyKey, address aggregator)`

---

### `AggregatorRemoved`

Records that an Aggregator pricing network was removed

**Signature:** `AggregatorRemoved(bytes32 currencyKey, address aggregator)`

---

### `InversePriceConfigured`

Records that an inverse price index was set up or deleted. As there is no distinct event for deletion, this is signaled by providing zero values to all arguments barring `currencyKey`.

**Signature:** `InversePriceConfigured(bytes32 currencyKey, uint entryPoint, uint upperLimit, uint lowerLimit)`

---

### `InversePriceFrozen`

Records that an inverse price breached a limit and was frozen.

**Signature:** `InversePriceFrozen(bytes32 currencyKey)`

---

### `OracleUpdated`

Records that the anointed oracle was updated.

**Signature:** `OracleUpdated(address newOracle)`

---

### `RateStalePeriodUpdated`

Records that the stale period was altered.

**Signature:** `RateStalePeriodUpdated(uint rateStalePeriod)`

---

### `RatesUpdated`

Records that a set of currency prices were updated.

**Signature:** `RatesUpdated(bytes32[] currencyKeys, uint[] newRates)`

---

### `RatesDeleted`

Records that the price for a particular currency was deleted.

**Signature:** `RateDeleted(bytes32 currencyKey)`

---
