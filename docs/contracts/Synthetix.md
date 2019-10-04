# Synthetix

## Description

!!! info "Work In Progress"
    This still needs to be cleaned up and the rest of my notes migrated in.

!!! danger "Contract Header Out Of Date"
    The average SNX balance computations described in the file docstring of this contract was correct for the sUSD-only system. The multicurrency version of Synthetix has made this obsolete and much of it should be deleted or rewritten.

**Old:** Synthetix.sol: Has a list of Synths and understands issuance data for users to be able to mint and burn Synths.

[SIP-6](https://github.com/Synthetixio/SIPs/blob/master/SIPS/sip-6.md): Front-running protection: the oracle monitors activity for front-running. If it detects this, then the exchange fee rate is jacked up to 99% so that the front-runner's transaction is sucked up. Additionally, a user will be able to specify a fee rate above which their transaction will fail so that they don't get caught by the front running protection. Note: doesn't this protect the front-runners as well? UPDATED: the setProtectionCircuit function allows the oracle to target only particular transactions to be rejected.

[SIP-7](https://github.com/Synthetixio/SIPs/blob/master/SIPS/sip-7.md): More front-running protection: exchange pausing; preventing changes while oracle updates are in progress; remove the destination param in an exchange so that they only go to the message sender.

* Licence headers seem incorrect.
* Check whether the file header is still accurate.

**Source:** [Synthetix.sol](https://github.com/Synthetixio/synthetix/blob/master/contracts/Synthetix.sol)

<section-sep />

## Architecture

---

### Inheritance Graph

<centered-image>
    ![Synthetix inheritance graph](../img/graphs/Synthetix.svg)
</centered-image>

---

### Related Contracts

#### Referenced

* Synth
* FeePool
* SynthetixEscrow
* RewardEscrow
* RewardsDistribution
* ExchangeRates
* SynthetixState
* SupplySchedule

#### Referencing

---

<section-sep />

## Variables

---

### `availableSynths`

List of the active [`Synths`](Synths.md), including XDRs. Used to compute the total value of issued synths.

**Type:** `Synth[] public`

---

### `synths`

A mapping from currency keys (three letter descriptors) to [`Synth`](Synth.md) token contract addresses.

**Type:** `mapping(bytes32 => Synth) public`

---

### `feePool`

The address of the [`FeePool`](FeePool.md) contract, where exchange fees are deposited, and user issuance information is stored.

**Type:** `FeePool public`

---

### `escrow`

The [`SynthetixEscrow`](SynthetixEscrow.md) contract where Synths escrowed at the time of the original token sale are kept.

**Type:** `SynthetixEscrow public`

---

### `rewardEscrow`

The [`RewardEscrow`](RewardEscrow.md) contract, where SNX inflationary rewards are held in escrow for a year after they are claimed.

**Type:** `RewardEscrow public`

---

### `exchangeRates`

The [`ExchangeRates`](ExchangeRates.md) contract provides Synth (and inverse Synth) prices, for example to convert between Synths or to compute the total system value. [`ExchangeRates`](ExchangeRates.md) also possesses the capability to disable Synth exchanges while its prices are being updated by the [`oracle`](ExchangeRates.md#oracle).

**Type:** `ExchangeRates public`

---

### `synthetixState`

The [`SynthetixState`](SynthetixState.md) contract holds a number of vital records including the [debt ledger](SynthetixState.md#debtledger), the [current issuance data for each account](SynthetixState.md#issuancedata), and the [global target issuance ratio](SynthetixState.md#issuanceratio).

**Type:** `SynthetixState public`

---

### `supplySchedule`

The [`SupplySchedule`](SupplySchedule.md) governs the rate at which inflationary SNX rewards are released. Whenever [new tokens are minted](#mint), it ensures the total created so far comports with its annual schedule.

**Type:** `SupplySchedule public`

---

### `rewardsDistribution`

The [`RewardsDistribution`](RewardsDistribution.md) contract works in concert with the [`RewardsEscrow`](#rewardsescrow) contract mentioned above to direct inflationary SNX rewards to various recipient pools the protocol specifies.

**Type:** `RewardsDistribution public`

---

### `protectionCircuit`

When the protection circuit is activated, any [Synth exchanges](#exchange) will result in the input quantity to be [liquidated](#_internalliquidation).

This mechanism, which can only be [activated](#setprotectioncircuit) by the [oracle](ExchangeRates.md#oracle), is designed to discourage profitable front-running of price updates. The oracle, when it detects front-running, targets the relevant transaction for liquidation by activating the protection circuit and deactivating it once triggered.

See [SIP-6](https://sips.synthetix.io/sips/sip-6) and [SIP-7](https://sips.synthetix.io/sips/sip-7) for further details.

**Type:** `bool private`

---

### `TOKEN_NAME`

A constant used to initialise the ERC20 [`ExternStateToken.name`](ExternStateToken.md#name) field upon construction.

**Type:** `string constant`

**Value:** `"Synthetix Network Token"`

---

### `TOKEN_SYMBOL`

A constant used to initialise the ERC20 [`ExternStateToken.symbol`](ExternStateToken.md#symbol) field upon construction.

**Type:** `string constant`

**Value:** `"SNX"`

---

### `DECIMALS`

A constant used to initialise the ERC20 [`ExternStateToken.decimals`](ExternStateToken.md#decimals) field upon construction.

**Type:** `uint8 constant`

**Value:** `18`

---

### `exchangeEnabled`

Allows the contract owner to disable synth exchanges, for example during system upgrades.

**Type:** `bool public`

---

<section-sep />

## Functions

---

### `constructor`

The constructor initialises the various addresses that this contract knows about, as well as the inherited [`ExternStateToken`](ExternStateToken.md) instance.

??? example "Details"
    **Signature**

    `constructor(address _proxy, TokenState _tokenState, SynthetixState _synthetixState, address _owner, ExchangeRates _exchangeRates, FeePool _feePool, SupplySchedule _supplySchedule, SynthetixEscrow _rewardEscrow, SynthetixEscrow _escrow, RewardsDistribution _rewardsDistribution, uint _totalSupply) public`

    **Superconstructors**

    * [`ExternStateToken(_proxy, _tokenState, TOKEN_NAME, TOKEN_SYMBOL, _totalSupply, DECIMALS, _owner)`](ExternStateToken.md#constructor)

---

### `setFeePool`

Allows the owner to set the [address](#feepool) of the [`FeePool`](FeePool.md) contract.

??? example "Details"
    **Signature**

    `setFeePool(FeePool _feePool) external`

    **Modifiers**

    * [`Proxyable.optionalProxy_onlyOwner`](Proxyable.md#optionalproxy_onlyowner)

---

### `setExchangeRates`

Allows the owner to set the [address](#exchangerates) of the [`ExchangeRates`](ExchangeRates.md) contract.

??? example "Details"
    **Signature**

    `setExchangeRates(ExchangeRates _exchangeRates) external`

    **Modifiers**

    * [`Proxyable.optionalProxy_onlyOwner`](Proxyable.md#optionalproxy_onlyowner)

---

### `setProtectionCircuit`

Allows the oracle to activate or deactivate the [front running protection circuit](#protectioncircuit).

??? example "Details"
    **Signature**

    `setProtectionCircuit(bool _protectionCircuitIsActivated) external`

    **Modifiers**

    * [`onlyOracle`](#onlyoracle)

---

### `setExchangeEnabled`

Allows the owner to [disable synth exchanges](#exchangeenabled).

??? example "Details"
    **Signature**

    `setExchangeEnabled(bool _exchangeEnabled) external`

    **Modifiers**

    * [`Proxyable.optionalProxy_onlyOwner`](Proxyable.md#optionalproxy_onlyowner)

---

### `addSynth`

Allows the owner to add a new [`Synth`](Synth.md) to the system, inserting it into [`availableSynths`](#availablesynths) and [`synths`](#synths). The new synth's [currency key](Synth.md#currencykey) must be unique.

??? example "Details"
    **Signature**

    `addSynth(Synth synth) external`

    **Modifiers**

    * [`Proxyable.optionalProxy_onlyOwner`](Proxyable.md#optionalproxy_onlyowner)

    **Preconditions**

    * The new synth's currency key must not be taken already in the [`synths`](#synths) address mapping.

---

### `removeSynth`

Allows the owner to remove a [`Synth`](Synth.md) from the system.
Upon removal it is also deleted from [`availableSynths`](#availablesynths) and [`synths`](#synths), which frees that currency key to be reused.

A Synth cannot be removed if it has outstanding issued tokens.

??? example "Details"
    **Signature**

    `removeSynth(bytes32 currencyKey) external`

    **Modifiers**

    * [`Proxyable.optionalProxy_onlyOwner`](Proxyable.md#optionalproxy_onlyowner)

    **Preconditions**

    * The synth's currency key must exist in the [`synths`](#synths) address mapping.
    * The synth's total supply must be zero.
    * The XDR synth cannot be removed.

    !!! info "sUSD Removal"
        Note that there is no requirement the sUSD synth cannot be removed, although its removal would cause the [`Depot`](Depot.md) to malfunction, and although sUSD is not used directly in the [`ExchangeRates`](ExchangeRates.md) contract, everything is implicitly denominated in terms of sUSD.

---

### `effectiveValue`

Reports an equivalent value of a quantity of one synth in terms of another at current exchange rates. This is a simple wrapper for [`ExchangeRates.effectiveValue`](ExchangeRates.md#effectivevalue)

??? example "Details"
    **Signature**

    `effectiveValue(bytes32 sourceCurrencyKey, uint sourceAmount, bytes32 destinationCurrencyKey) public view returns (uint)`

---

### `totalIssuedSynths`

Returns the total value of Synths in the system, priced in terms of a given currency.

This value is computed as:

$$
\sum_{s \in \text{synths}}{\sigma_s \frac{\pi_s}{\pi_d}}
$$

Where $\sigma_s$ and $\pi_s$ are the total supply and price of synth $s$, and $d$ is the denominating synth flavour.

!!! info "Optimisation: Staleness Check"
    This function checks that currencyKey is not stale in the function modifier, then later requires that no rate is stale in the function body; the modifier can be eliminated.

!!! info "Optimisation: Hoist Division"
    Could hoist the division by `currencyRate` out of the loop and simply divide once at the end. Also `availableSynths[i]` can be assigned to a variable to avoid indexing into the array twice.

??? example "Details"
    **Signature**

    `totalIssuedSynths(bytes32 currencyKey) public view returns (uint)`

    **Modifiers**

    * [`rateNotStale(currencyKey)`](#ratenotstale)

    **Preconditions**

    * No rate for any of the [currently available currencies](#availablesynths) [can be stale](ExchangeRates.md#anyrateisstale).

---

### `availableCurrencyKeys`

Returns the [currency key](Synth.md#currencykey) for each synth in [`availableSynths`](#availablesynths).

??? example "Details"
    **Signature**

    `availableCurrencyKeys() public view returns (bytes32[])`

---

### `availableSynthCount`

Returns the number of synths in the system, that is [`availableSynths.length`](#availablesynths).

??? example "Details"
    **Signature**

    `availableSynthCount() public view returns (uint)`

---

### `transfer`

This is a pair of ERC20/ERC223 transfer functions. Their functionality is almost identical: providing both behaves almost like a single function with an optional ERC223 `data` parameter. If no `data` is provided then an empty buffer is passed internally.

A successful transfer requires the message sender to have sufficient balance, accounting for [locked SNX](#transferablesynthetix).

They are implemented based on [`ExternStateToken._transfer_byProxy`](ExternStateToken#_transfer_byproxy).

??? example "Details"
    **Signatures**

    * `transfer(address to, uint value) public returns (bool)`
    * `transfer(address to, uint value, bytes data) public returns (bool)`

    **Modifiers**

    * [`Proxyable.optionalProxy`](Proxyable.md#optionalproxy)

    **Preconditions and Events**

    * `value` must not exceed [`transferableSynthetix(messageSender)`](#transferablesynthetix)

    Otherwise, the these functions behave as per [`ExternStateToken._internalTransfer`](ExternStateToken.md#_internaltransfer).

---

### `transferFrom`

This is a pair of ERC20/ERC223 transferFrom functions. Their functionality is almost identical: providing both behaves almost like a single function with an optional ERC223 `data` parameter. If no `data` is provided then an empty buffer is passed internally.

A successful transfer requires the token owner to have sufficient balance, accounting for [locked SNX](#transferablesynthetix).

They are implemented based on [`ExternStateToken._transferFrom_byProxy`](ExternStateToken#_transferfrom_byproxy).

??? example "Details"
    **Signatures**

    * `transferFrom(address from, address to, uint value) public returns (bool)`
    * `transfer(address from, address to, uint value, bytes data) public returns (bool)`

    **Modifiers**

    * [`Proxyable.optionalProxy`](Proxyable.md#optionalproxy)
    * [`notFeeAddress(from)`](#notfeeaddress).

    **Preconditions and Events**

    * `value` must not exceed [`transferableSynthetix(from)`](#transferablesynthetix)

    Otherwise, the these functions behave as per [`ExternStateToken._internalTransfer`](ExternStateToken.md#_internaltransfer).

---

### `exchange`

* `exchange(bytes32 sourceCurrencyKey, uint sourceAmount, bytes32 destinationCurrencyKey, address destinationAddress)`: Exhcanges one synth flavour for an equivalent value of another. Checks if `protectionCircuit` is true, then burns the synths with `_internalLiquidation` if so. Otherwise it uses the `_internalExchange` function (with a fee being charged). Requires the source and destination synths to be distinct, and a non-zero value to be converted.

---

### `synthInitiatedExchange`

* `synthInitiatedExchange(address from, bytes32 sourceCurrencyKey, sourceAmount, bytes32 destinationCurrencyKey, address destinationAddress)`: Used to allow a synth recipient to receive a transfer in their preferred currency rather than in the source currency. Only callable by Synths. Uses `_internalExchange` internally, but without charging a fee. NOTE: if the transfer fee rate is 0, then this allows free conversions?... TODO: Check this.

---

### `synthInitiatedFeePayment`

* `synthInitiatedFeePayment(address from, bytes32 sourceCurrencyKey, uint sourceAmount)`: Called by synths to send transfer fees to the fee pool. Only callable by synths. In practice, this is a NOOP because transfer fee rates are 0. Uses `_internalExchange` internally to convert the fee to XDRs.

---

### `_internalExchange`

* `_internalExchange(address from, bytes32 sourceCurrencyKey, uint sourceAmount, bytes32 destinationCurrencyKey, address destinationAddress, bool chargeFee)`: Internal function, and disallows exchanges out of the fee address. Deactivated if the `exchangeEnabled` is false. Deactivated if the ExchangeRates contract's price is updating. Disallows transfers to the zero address and to the synthetix contract or its proxy. First burns the source amount from the `from` balance (which also checks for sufficient balance). Then converts the quantities with the latest exchange rates by asking the ExchangeRates contract. Then computes a fee if `chargeFee` is true, by asking the FeePool contract the correct quantity. Then issues synths in the correct quantity, minus the fee, to the destination address. Then pays the fee into the fee pool in XDRs, performing another currency conversion here using `effectiveValue` and then issuing directly into the pool. Triggers ERC223 token fallback if necessary. Finally, emits an exchange event.

---

### `_internalLiquidation`

* `_internalLiquidation(address from, bytes32 sourceCurrencyKey, uint sourceAmount)`: Only used once, just burns the given quantity of the specified token from the `from` address. I would probably inline this and eliminate the function.

!!! TODO "Investigate Economics"
    Does this mean that there is a forever-locked quantity of SNX in the system now?

---

### `_addToDebtRegister`

* `_addToDebtRegister(bytes32 currencyKey, uint amount)`: Whenever synths are issued, computes the factor the issuance changes the overall supply by and appends it to the list of such deltas in synthetixState.

$$
xv \text{: xdrValue - the value of the debt priced in XDRs} \\
tdi \text{: totalDebtIssued - the XDR value of all issued synths. } \ \frac{1}{price_{XDR}}\sum_c{price_c \times supply_c} \\
ntdi \text{: newTotalDebtIssued. } \ xv + tdi \\
dp \text{: debtPercentage. The percentage of the new debt, relative to the new total. } \ \frac{xv}{ntdi} = \frac{xv}{xv + tdi} \\
\delta \text{: The factor to multiply other debt holder's debt positions by to get their new fraction of the total. } \ 1 - dp = \frac{tdi}{xv + tdi} \\
ed \text{: existingDebt - The value of XDRs required to completely pay down this user's existing debt. Computed by the debtBalanceOf; see that function for definitions of terms. } \\
ed = \frac{last(dl)}{dl[dei]}ido \times \frac{1}{price_{XDR}}\sum_c{price_c \times supply_c} = \frac{last(dl)}{dl[dei]} \times ido \times tdi\\
\text{Increment the total issuer count if this user has no debt yet; i.e. if } ido = 0 \\
\text{Now save out new debt entry parameters for this user such that: } \ ido' = \frac{xv + ed}{ntdi} = dp + \frac{ed}{ntdi} = dp + \frac{\frac{last(dl)}{dl[dei]} \times ido}{\frac{xv}{tdi} + 1} \text{ and } dei' = length(dl) \\
\text{Finally, perform } \ dl.push(last(dl) \times \delta) \ \text{ where } \ dl[0] = 1.
$$

Note that the total system value is computed twice, once as $tdi$, and once within the call to `debtBalanceOf`. One of them could in principle be eliminated.

Also note that we have for $dl$ the recurrence:

$$
dl[0] = 1 \\
dl[n] = dl[n-1] \times \delta_n \\
\text{with } \ \delta_n = \frac{tdi_n}{xv_n + tdi_n}
\text{ } \\
$$

hence

$$
\text{ } \\
dl[n] = \prod_{k=1}^{n}\delta_k
\text{ } \\
\Rightarrow
\text{ } \\
\frac{dl[n]}{dl[m]} = \frac{\prod_{k=1}^{n}\delta_k}{\prod_{k=1}^{m}\delta_k} = \prod_{k=m+1}^{n}\delta_k, \ m \lt n
$$

So a given debt ledger entry is the product of the debt deltas, and the division of one debt ledger entry by another is the cumulative debt delta movement between those two debt ledger entries.

---

### `issueSynths`

* `issueSynths(bytes32 currencyKey, uint amount)`: MIGRATE

---

### `issueMaxSynths`

* `issueMaxSynths(bytes32 currencyKey)`: MIGRATE

---

### `burnSynths`

* `burnSynths(bytes32 currencyKey, uint amount)`: MIGRATE

---

### `_appendAccountIssuanceRecord`

* `_appendAccountIssuanceRecord()`: MIGRATE

---

### `_removeFromDebtRegister`

* `_removeFromDebtRegister(uint amount)`: MIGRATE

---

### `maxIssuableSynths`

The maximum number of a given synth that is issuable against the issuer's collateral. This is simply [`issuanceRatio *`](SynthetixState.md#issuanceratio) [`collateral(issuer)`](#collateral), priced in the requested currency.

??? example "Details"
    **Signature**

    `maxIssuableSynths(address issuer, bytes32 currencyKey) public view returns (uint)`

---

### `collateralisationRatio`

The ratio between value of synths that an account has issued and the value of the collateral they control. That is, this is just [`debtBalanceOf(issuer, "SNX") /`](#debtbalanceof) [`collateral(issuer)`](#collateral).

Ideally, issuers should maintain their collateralisation ratio at a level less than the [global issuance ratio](SynthetixState.md#issuanceratio), and they are incentivised to do this by the [fees they can claim](FeePool.md#claim) if they do so.

??? example "Details"
    **Signature**

    `collateralisationRatio(address issuer) public view returns (uint)`

---

### `debtBalanceOf`

Reports the quantity of a given currency required to free up all SNX locked in given account.

If $\mathrm{T}$ is the [total value of all issued synths](#totalissuedsynths), and $\xi$ is fraction of that value accounted for by this account's locked SNX, then the result is simply:

$$
\xi \times \mathrm{T}
$$

In order to account for fluctuations in synth prices and supply, the current ownership percentage is computed as the adjusted value:

$$
\xi = \omega \frac{\Delta_\text{last}}{\Delta_\text{entry}}
$$

Where $\omega$ is the account's debt ownership percentage at the time it [last issued or burnt](SynthetixState.md#issuancedata) synths, which produced the $\Delta_\text{entry}$ item in the [debt ledger](SynthetixState.md#debtledger). $\Delta_\text{last}$ is the latest value on the ledger. This logic is much the same as that found in [`FeePool._effectiveDebtRatioForPeriod`](FeePool.md#_effectivedebtratioforperiod).

??? example "Details"
    **Signature**

    `debtBalanceOf(address issuer, bytes32 currencyKey) public view returns (uint)`

---

### `remainingIssuableSynths`

The remaining synths of a given flavour this account can issue.

If $\text{maxIssuable}$ is [`maxIssuableSynths(issuer, currencyKey)`](#maxissuablesynths) and $\text{debt}$ is [`debtBalanceOf(issuer, currencyKey)`](#debtbalanceof), then the result of this function is $max(0, \text{maxIssuable} - \text{debt})$.

If prices fluctuate then the account's issued synth debt may exceed its current maximum issuable synths, in which case it may not issue any more synths until more collateral is added.

??? example "Details"
    **Signature**

    `remainingIssuableSynths(address issuer, bytes32 currencyKey) public view returns (uint)` 

---

### `collateral`

Returns the total SNX owned by the given account, locked and unlocked, escrowed and unescrowed. This is the quantity of SNX synths can be issued against.

This is computed as the sum of [`Synthetix.balanceOf(account)`](TokenState.md#balanceof),  [`SynthetixEscrow.balanceOf(account)`](SynthetixEscrow.md#balanceof), and [`RewardEscrow.balanceOf(account)`](RewardEscrow.md#balanceof); so an account may issue synths against both its active balance and its unclaimed escrow funds.

??? example "Details"
    **Signature**

    `collateral(address account) public view returns (uint)`

---

### `transferableSynthetix`

The quantity of SNX this account can transfer given that a portion of it may be locked due to issuance.

If $\text{balance}$ is [`balanceOf(account)`](TokenState.md#balanceof), and $\text{lockedSnx}$ is [`debtBalanceOf(account, "SNX") / SynthetixState.issuanceRatio`](#debtbalanceof), the function returns $max(0, \text{balance} - \text{lockedSnx})$. Escrowed tokens are not taken into account in this computation, so unescrowed tokens are locked immediately.

???+ info "A Note on Price Motion"
    The value of $\text{lockedSnx}$ depends on the current ($\pi$) and previous ($\pi'$) prices being reported by the oracle, and the issuance ratio ($\rho$).

    If we consider a situation where the synth supply has not changed in the time period under consideration, then ownership percentages do not change even if prices do. Further assuming that there is only a single synth circulating, and so debt balances correspond to the same number of synths, but perhaps not the same value.

    In such a situation, we can think of each user having issued a particular quantity of synths. This quantity depends on the prices of synths and SNX at the time of issuance.

    $$
    Q_s = \rho \ \frac{\pi'_c}{\pi'_s} \ Q_c
    $$

    Whose value at the present time priced [in terms of SNX](#effectivevalue), which is what [`debtBalanceOf(account, "SNX")`](#debtbalanceof) returns, is:

    $$
    {V_s}^{c} = \rho \ \frac{\pi'_c}{\pi'_s} \ \pi_c \ Q_c
    $$

    Note that this computation has a factor of $\rho$ in it, and this must be divided out in order to ascertain the quantity of SNX which are presently locked.

    $$
    \text{lockedSnx} = \frac{{V_s}^{c}}{\rho} = \frac{\pi'_c}{\pi'_s} \ \pi_c \ Q_c
    $$

    Which is to say that the quantity of SNX locked in this situation depends on the price.

    !!! todo "Extend this to the multicurrency case"
        Consider a two synth system, one primary synth and a secondary one which represents the price/supply of all other synths. Use the total issued value function to derive the behaviour for multiple currencies, and then examine a single currency as a special case.

!!! info "Price Motion Redux: Multicurrency"
    WIP

!!! caution "Misleading Dev Note"
    The note in the docstring suggests that escrowed SNX are locked first when issuing, but not locked first in this function.
    However, "locked" just means not transferable, so this concept only has meaning within the current function. Escrowed SNX are not transferable in any case, and it is really the unescrowed tokens that are locked first by this function.

!!! info "Optimisation: Stale Price Check"
    This function checks that the SNX price is not stale, which is unnecessary since it is checked inside the call to `totalIssuedSynths` within `debtBalanceOf`.

??? example "Details"
    **Signature**

    `transferableSynthetix(address account) public view returns (uint)`

    **Modifiers**

    * [`rateNotStale("SNX")`](#ratenotstale)

---

### `mint`

* `mint()`: MIGRATE

---

<section-sep />

## Events

---

### `SynthExchange`

* `SynthExchange(address indexed account, bytes32 fromCurrencyKey, uint256 fromAmount, bytes32 toCurrencyKey,  uint256 toAmount, address toAddress)`: Indicates that an exchange between two currencies has occurred, along with the source and destination addresses, currencies, and quantities.

---
