# Depot

!!! todo "Work in Progress"

    This needs to be properly cleaned up.

## Description

**Old:** Depot.sol: Allows users to exchange ETH for sUSD and SNX (has not yet been updated for multicurrency).

Throughout, the contract assumes that sUSD is always worth exactly US\$1. So: a) this will only work with `sUSD`. b) there's a profit opportunity if the `sUSD` is off its peg.

!!! note

    Some of this code is lifted verbatim from the old `EtherNomin` code, but this isn't indicated in the licence header.

!!! info "Zero Transfer Fee"

    [SIP-19](https://sips.synthetix.io/sips/sip-19) deprecated transfer fees. Hence, although exchange operations call [`FeePool.amountReceivedFromTransfer`](FeePool.md#amountreceivedfromtransfer) to subtract this fee from the sale quantity, the fee function just returns its argument unchanged, so nothing is actually charged.

**Source:** [Depot.sol](https://github.com/Synthetixio/synthetix/blob/master/contracts/Depot.sol)

## Architecture

---

### Inheritance Graph

<centered-image>
    ![Depot inheritance graph](../img/graphs/Depot.svg)
</centered-image>

---

### Related Contracts

- [Synthetix](Synthetix.md)
- [Synth](Synth.md)
- [FeePool](FeePool.md)

---

### Libraries

- [`SafeMath`](SafeMath.md) for `uint`
- [`SafeDecimalMath`](SafeDecimalMath.md) for `uint`

---

## Structs

---

### `synthDeposit`

Stores an individual Synth deposit on sale.

| Field  | Type      | Description                     |
| ------ | --------- | ------------------------------- |
| user   | `address` | The depositor.                  |
| amount | `uint`    | The quantity of sUSD deposited. |

---

## Variables

---

### `synthetix`

The address of the main [`Synthetix`](Synthetix.md) contract; the depot contains SNX.

**Type:** `Synthetix public`

---

### `synth`

The address of the sUSD [`Synth`](Synth.md), which are the synth held in the depot.

**Type:** `Synth public`

---

### `feePool`

The address of the [`FeePool`](FeePool.md) contract. Since transfer fees were eliminated in [SIP-19](https://sips.synthetix.io/sips/sip-19), this is not really used anymore. All the fee pool functions this contract calls have now been replaced with effective no-ops.

**Type:** `FeePool public`

---

### `fundsWallet`

The address where ether and synths raised by selling SNX are sent.

It is also where ether is sent if the proceeds of a sale of synths could not be transferred because the recipient is a non-payable contract.

**Type:** `address public`

---

### `oracle`

The address which provides the usd prices of SNX and ether. This is not the same oracle address as in [`ExchangeRates`](ExchangeRates.md#oracle).

**Type:** `address public`

---

### `ORACLE_FUTURE_LIMIT`

The oracle can submit prices no more than ten minutes into the future.

**Type:** `uint public constant`

**Value:** `10 minutes`

---

### `priceStalePeriod`

It is assumed the known price is out of date if it is older than this. Initialised to 3 hours.

**Type:** `uint public`

---

### `lastPriceUpdateTime`

The last time [`usdToSnxPrice`](#usdtosnxprice) and [`usdToEthPrice`](#usdtoethprice) were updated by the [`oracle`](#oracle) calling [`updatePrices`](#updateprices).

**Type:** `uint public`

---

### `usdToSnxPrice`

The price of SNX in USD.

**Type:** `uint public` ([18 decimals](SafeDecimalMath.md))

---

### `usdToEthPrice`

The price of ETH in USD.

**Type:** `uint public` ([18 decimals](SafeDecimalMath.md))

---

### `deposits`

Users can deposit sUSD to be sold on the depot. This variable holds the queue of open deposits, which are sold in the order they were deposited.

This queue is stored as an "array" within a mapping: the keys are array indices. Deposits are stored by a contiguous block of keys between [`depositStartIndex`](#depositstartindex) (inclusive) and [`depositEndIndex`](#depositendindex) (exclusive).

A mapping is used instead of an array in order to avoid having to copy entries around when deposits are deleted, which saves on gas. When a deposit is made it is added to the end of the list, and when a deposit is filled, it is removed from the start of the list. Thus over time the list of deposits slides down the set of array indexes, but the address space of the mapping is large enough that it will never be filled.

**Type:** `mapping(uint => synthDeposit) public`

---

### `depositStartIndex`

The index of the next deposit to be processed in the [`deposits`](#deposits) queue.

**Type:** `uint public`

---

### `depositEndIndex`

The index one past the last deposit in the [`deposits`](#deposits) queue.

**Type:** `uint public`

---

### `totalSellableDeposits`

The total quantity of sUSD currently in the [`deposits`](#deposits) queue to be purchased.

**Type:** `uint public` ([18 decimals](SafeDecimalMath.md))

---

### `minimumDepositAmount`

The minimum sUSD quantity required for a deposit to be added to the queue. Initialised to 50.0.

**Type:** `uint public` ([18 decimals](SafeDecimalMath.md))

---

### `smallDeposits`

Deposits of less than [`minimumDepositAmount`](#minimumdepositamount) sUSD are not placed on the [`deposits`](#deposits) queue. Instead, they are kept here so that the depositor can withdraw them.

**Type:** `mapping(address => uint) public` ([18 decimals](SafeDecimalMath.md))

---

## Functions

---

### `constructor`

Initialises the various addresses this contract knowws, along with the initial prices and the inherited [`SelfDestructible`](SelfDestructible.md) and [`Pausable`](Pausable.md) instances.

??? example "Details"

    **Signature**

    `constructor(address _owner, address _fundsWallet, Synthetix _synthetix, Synth _synth, FeePool _feePool, address _oracle, uint _usdToEthPrice, uint _usdToSnxPrice) public`

    **Superconstructors**

    * [`SelfDestructible(_owner)`](SelfDestructible.md)
    * [`Pausable(_owner)`](Pausable.md)

---

### `setFundsWallet`

Allows the owner to set the [`fundsWallet`](#fundswallet) address.

??? example "Details"

    **Signature**

    `setFundsWallet(address _fundsWallet) external`

    **Modifiers**

    * [`Owned.onlyOwner`](Owned.md#onlyowner)

    **Emits**

    * [`FundsWalletUpdated(_fundsWallet)`](#fundswalletupdated)

---

### `setOracle`

Allows the owner to set the [`oracle`](#oracle) address.

??? example "Details"

    **Signature**

    `setOracle(address _oracle) external`

    **Modifiers**

    * [`Owned.onlyOwner`](Owned.md#onlyowner)

    **Emits**

    * [`OracleUpdated(_oracle)`](#oracleupdated)

---

### `setSynth`

Allows the owner to set the address of the [`synth`](#synth) contract the depot knows about.

??? example "Details"

    **Signature**

    `setSynth(Synth _synth) external`

    **Modifiers**

    * [`Owned.onlyOwner`](Owned.md#onlyowner)

    **Emits**

    * [`SynthUpdated(_synth)`](#synthupdated)

---

### `setSynthetix`

Allows the owner to set the address of the [`synthetix`](#synthetix) contract.

??? example "Details"

    **Signature**

    `setSynthetix(Synthetix _synthetix)`

    **Modifiers**

    * [`Owned.onlyOwner`](Owned.md#onlyowner)

    **Emits**

    * [`SynthetixUpdated(_synthetix)`](#synthetixupdated)

---

### `setPriceStalePeriod`

Allows the owner to set the [stale period](#pricestaleperiod) for depot prices.

??? example "Details"

    **Signature**

    `setPriceStalePeriod(uint _time)`

    **Modifiers**

    * [`Owned.onlyOwner`](Owned.md#onlyowner)

    **Emits**

    * [`PriceStalePeriodUpdated(_time)`](#pricestaleperiodupdated)

---

### `setMinimumDepositAmount`

Allows the owner to set the [minimum deposit amount](#minimumdepositamount).

??? example "Details"

    **Signature**

    `setMinimumDepositAmount(uint _amount)`

    **Modifiers**

    * [`Owned.onlyOwner`](Owned.md#onlyowner)

    **Preconditions**

    * `_amount` must be greater than `UNIT`.

    **Emits**

    * [`MinimumDepositAmountUpdated(minimumDepositAmount)`](#minimumdepositamountupdated)

---

### `updatePrices`

Allows the oracle address to update the USD [ETH](#usdToEthPrice) and [SNX](#usdToSnxPrice) prices known to the depot.

The prices are accompanied by the time they were sent. The oracle will not accept updates that are not the most recent, otherwise which protects from accepting stale prices during network congestion.

??? example "Details"

    **Signature**

    `updatePrices(uint newEthPrice, uint newSynthetixPrice, uint timeSent) external`

    **Modifiers**

    * [`onlyOracle`](#onlyoracle)

    **Preconditions**

    * The time the price update was sent must be after the [last price update time](#lastpriceupdatetime).k
    * The time the price update was sent must be no more than [ten minutes](#oracle_future_limit) in the future.

    **Emits**

    * [`PricesUpdated(newEthPrice, newSynthetixPrice, timeSent)`](#pricesupdated)

---

### `() (fallback function)`

This simply calls [`exchangeEtherForSynths`](#exchangeetherforsynths.) so that if ether is sent to the contract, it is automatically exchanged for synths.

??? example "Details"

    **Signature**

    `() external payable`

---

### `exchangeEtherForSynths`

Sells sUSD to callers who send ether. The synths are sold from the [`deposits`](#deposits) queue in the order they were deposited.

Purchased quantity: msg.value \* usdToEthPrice

Each deposit is sold in turn until the full
This function if invoked with a

Requires that the contract is not paused, and that the prices are not stale.

Returns the number of sUSD exchanged. Converts any ether sent to the contract to a quantity of synths at current prices. Fulfils this quantity by iterating through the deposit queue until the entire quantity is found. If a given deposit is insufficient to cover the entire requested amount, it is exhausted and removed from the queue. For each deposit found, the proper quantity of ether is sent to the depositor. If the quantity could not be sent because the target is a non-payable contract, then it is remitted to `fundsWallet`. Then send the Synths to the recipient. If the whole quantity could not be fulfilled, then the remaining ether is refunded to the purchaser.

- `exchangeEtherForSynths() returns (uint)`:

---

### `exchangeEtherForSynthsAtRate`

- `exchangeEtherForSynthsAtRate(uint guaranteedRate) returns (uint)`: Allows the caller to specify the current price, and then calls to `exchangeEtherForSynths`. Reverts if the current price does not match the price provided as an argument. This is intended as a protection against front-running by the contract owner, or otherwise a case where a price update is in flight at the invocation time.

---

### `exchangeEtherForSynthetix`

- `exchangeEtherForSynthetix() returns (uint)`: Requires that the contract is not paused, and that the prices are not stale. Converts the received ether to a quantity of SNX with `synthetixReceivedForEther`. Sends the ether to `fundsWallet`, sends the converted quantity of SNX to the message sender from the contract's own reserves. Returns the SNX quantity sent. If the contract has insufficient SNX, then the transfer will fail and the transaction will revert.

---

### `exchangeEtherForSynthetixAtRate`

- `exchangeEtherForSynthetixAtRate(uint guaranteedEtherRate, uint guaranteedSynthetixRate) returns (uint)`: As `exchangeEtherForSynthsAtRate` is to `exchangeEtherForSynths`, this is to `exchangeEtherForSynthetix`.

---

### `exchangeSynthsForSynthetix`

- `exchangeSynthsForSynthetix(uint synthAmount) returns (uint)`: Identical to `exchangeEtherForSynthetix`, but perform the price conversion with `synthetixReceivedForSynths`. The amount of synths to send is provided as a function argument, and then transferred to `fundsWallet` with `transferFrom`, so this function requires the caller to have approved the depot contract to make such a withdrawal. Note that this assumes that sUSD is worth exactly one dollar.

---

### `exchangeSynthsForSynthetixAtRate`

- `exchangeSynthsForSynthetixAtRate(uint synthAmount, uint guaranteedRate) returns (uint)`: As per `exchangeEtherForSynthetixAtRate`.

---

### `withdrawSynthetix`

- `withdrawSynthetix(uint amount)`: Only callable by the contract owner. Allows the owner to transfer SNX out of the Depot to themselves.

---

### `withdrawMyDepositedSynths`

- `withdrawMyDepositedSynths()`: Withdraws all Synths deposited by the message sender. Iterates through the entire deposit queue; if for a given entry the message sender is the depositor, delete that deposit and and add the deposited quantity of tokens to the pile to be remitted. Then transfer this quantity back to the message sender, along with any tokens in `smallDeposits`.

---

### `depositSynths`

- `depositSynths(uint amount)`: Just an alias to `synth.transferFrom(msg.sender, this, amount)`. This requires the sender to have approved the deposit.

---

### `tokenFallback`

- `tokenFallback(address from, uint amount, bytes data) returns (bool)`: Only callable by the `synth` contract. Handles the actual deposit flow whenever synths are sent to this contract. If the transferred quantity is smaller than the minimum deposit amount, add it to the sender's small deposit balance. Otherwise, "append" the deposit to the deposit queue/mapping and update total sellable deposit quantity.

---

### `pricesAreStale`

True if [`usdToSnxPrice`](#usdtosnxprice) and [`usdToEthPrice`](#usdtoethprice) are too old to be considered usably up to date.

That is, they are considered stale if [`lastPriceUpdateTime`](#lastpriceupdatetime) is more than [`priceStalePeriod`](#pricestaleperiod) seconds in the past.

If prices are stale, then the depot's exchange functionality is disabled. This is because attackers can profitably exploit the contract if the prices known on chain do not reflect the true state of the world closely enough.

??? example "Details"

    **Signature**

    `pricesAreStale() public view returns (bool)`

---

### `synthetixReceivedForSynths`

Computes the quantity of SNX received in exchange for a given quantity of sUSD at current prices, assuming sUSD are worth \$1. This is equivalent to:

$$
Q_\text{SNX} = Q_\text{sUSD} \times \frac{1}{\pi_\text{SNX}}
$$

??? example "Details"

    **Signature**

    `synthetixReceivedForSynths(uint amount) public view returns (uint)`

---

### `synthetixReceivedForEther`

Computes the quantity of SNX received in exchange for a given quantity of Ether at current prices. This is equivalent to:

$$
Q_\text{SNX} = Q_\text{ETH} \times \frac{\pi_\text{ETH}}{\pi_\text{SNX}}
$$

??? example "Details"

    **Signature**

    `synthetixReceivedForEther(uint amount) public view returns (uint)`

---

### `synthsReceivedForEther`

Computes the quantity of sUSD received in exchange for a given quantity of ETH at current prices. This is equivalent to:

$$
Q_\text{sUSD} = Q_\text{ETH} \times \pi_\text{SNX}
$$

??? example "Details"

    **Signature**

    `synthsReceivedForEther(uint amount) public view returns (uint)`

---

## Modifiers

---

### `onlyOracle`

Reverts the transaction if `msg.sender` is not the [`oracle`](#oracle) address.

---

### `onlySynth`

Reverts the transaction if `msg.sender` is not the [`synth`](#synth) address.

---

### `pricesNotStale`

Reverts the transaction if [`pricesAreStale`](#pricesarestale) returns false, because the contract's known prices are too old to safely use.

---

## Events

---

### `FundsWalletUpdated`

- `FundsWalletUpdated(address newFundsWallet)`

---

### `OracleUpdated`

- `OracleUpdated(address newOracle)`

---

### `SynthUpdated`

- `SynthUpdated(Synth newSynthContract)`

---

### `SynthetixUpdated`

- `SynthetixUpdated(Synthetix newSynthetixContract)`

---

### `PriceStalePeriodUpdated`

- `PriceStalePeriodUpdated(uint priceStalePeriod)`

---

### `PricesUpdated`

- `PricesUpdated(uint newEthPrice, uint newSynthetixPrice, uint timeSent)`

---

### `Exchange`

- `Exchange(string fromCurrency, uint fromAmount, string toCurrency, uint toAmount)`

---

### `SynthWithdrawal`

- `SynthWithdrawal(address user, uint amount)`

---

### `SynthDeposit`

- `SynthDeposit(address indexed user, uint amount, uint indexed depositIndex)`

---

### `SynthDepositRemoved`

- `SynthDepositRemoved(address indexed user, uint amount, uint indexed depositIndex)`

---

### `SynthDepositNotAccepted`

- `SynthDepositNotAccepted(address user, uint amount, uint minimum)`

---

### `SynthDepositAmountUpdated`

- `MinimumDepositAmountUpdated(uint amount)`

---

### `NonPayableContract`

- `NonPayableContract(address indexed receiver, uint amount)`

---

### `ClearedDeposit`

- `ClearedDeposit(address indexed fromAddress, address indexed toAddress, uint fromETHAmount, uint toAmount, uint indexed depositIndex)`

---
