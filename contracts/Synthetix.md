# Synthetix

[Go Back](../contracts.md)

## Notes

* Licence headers are illegal.
* TODO: Check whether the file header is still accurate.

## Inherited Contracts

### Direct

* ExternStateToken

### Transitive

* SelfDestructible
* Proxyable
* TokenFallbackCaller
* Owned
* ReentrancyPreventer

## Related Contracts

### Referenced

* Synth
* FeePool
* SynthetixEscrow
* RewardEscrow
* ExchangeRates
* SynthetixState
* SupplySchedule

### Referencing

## Variables

* `availableSynths`: List of the Synths useable within the system. Used to compute the total synth supply.
* `synths`: A mapping from currency keys (three letter descriptors) to synth token contract addresses.
* `feePool`: TODO
* `escrow`: TODO
* `rewardEscrow`: TODO
* `exchangeRates`: TODO
* `synthetixState`: TODO
* `supplySchedule`: TODO
* `protectionCircuit`: TODO
* `exchangeEnabled`: TODO

## Functions

* `setFeePool(IfeePool _feePool)`: Callable only by the owner; allows the fee pool contract address to be set.
* `setExchangeRates(ExchangeRates _exchangeRates)`: Callable only by the owner; allows the exchange rate contract address to be set.
* `setProtectionCircuit(bool _activated)`: Callable only by the oracle address; allows the protection circuit to be [de]activated.
* `setExchangeEnabled(bool _exchangeEnabled)`: Callable only by the owner; allows exchanging between synth flavours to be disabled.
* `addSynth(Synth synth)`: Callable only by the owner. Requires that the new synth's currency key is unique. Adds the new flavour to available synths.
* `removeSynth(bytes4 currencyKey)`: Callable only by the owner. Requires that the synth exists, and that it has no supply. The XDR synth is not removeable (TODO: Does the system need protection against, e.g. sUSD being removed?).
* `effectiveValue(bytes4 sourceCurrencyKey, uint sourceAmount, bytes4 destinationCurrencyKey)`: Just calls out to `ExchangeRates.effectiveValue`. Allows converting between currencies at current prices.
* `totalIssuedSynths(bytes4 currencyKey)`: Returns the total value of Synths in the system, priced in terms of the given currency. Requires no exchange rate to be stale. Computed as $\sum_c\frac{{price_c \times supply_c}}{price_{denom}}$. Optimisations: Checks that currencyKey is not stale in the function modifier, then later requires that no rate is stale in the function body; the modifier can be eliminated. Could hoist the division by `currencyRate` out of the loop. Two indexes into the array, `availableSynths[i]`.
* `availableCurrencyKeys()`: Returns `s.currencyKey()` for each Synth `s`.
* `availableSynthCount()`: Simply `availableSynths.length`.
* `transfer(address to, uint value)`: ERC20 transfer, calls the ERC223 version below.
* `transfer(address to, uint value, bytes data)`: ERC223 transfer. Requires the sending account to have sufficient unlocked balance. Calls the internal `_transfer_byProxy` function.
* `transferFrom(address from, address to, uint value)`: ERC20 transferFrom function. Calls the ERC223 version below.
* `transferFrom(address from, address to, uint value, bytes data)`: Requires the sending account to have sufficient unlocked balance. Calls the internal `_transferFrom_byProxy` function.
* `exchange(bytes4 sourceCurrencyKey, uint sourceAmount, bytes4 destinationCurrencyKey, address destinationAddress)`: Exhcanges one synth flavour for an equivalent value of another. Checks if `protectionCircuit` is true, then burns the synths with `_internalLiquidation` if so. Otherwise it uses the `_internalExchange` function (with a fee being charged). Requires the source and destination synths to be distinct, and a non-zero value to be converted.
* `synthInitiatedExchange(address from, bytes4 sourceCurrencyKey, sourceAmount, bytes4 destinationCurrencyKey, address destinationAddress)`: Used to allow a synth recipient to receive a transfer in their preferred currency rather than in the source currency. Only callable by Synths. Uses `_internalExchange` internally, but without charging a fee. NOTE: if the transfer fee rate is 0, then this allows free conversions?... TODO: Check this.
* `synthInitiatedFeePayment(address from, bytes4 sourceCurrencyKey, uint sourceAmount)`: Called by synths to send transfer fees to the fee pool. Only callable by synths. In practice, this is a NOOP because transfer fee rates are 0. Uses `_internalExchange` internally to convert the fee to XDRs.
* `_internalExchange(address from, bytes4 sourceCurrencyKey, uint sourceAmount, bytes4 destinationCurrencyKey, address destinationAddress, bool chargeFee)`: Internal function, and disallows exchanges out of the fee address. Deactivated if the `exchangeEnabled` is false. Deactivated if the ExchangeRates contract's price is updating. Disallows transfers to the zero address and to the synthetix contract or its proxy. First burns the source amount from the `from` balance (which also checks for sufficient balance). Then converts the quantities with the latest exchange rates by asking the ExchangeRates contract. Then computes a fee if `chargeFee` is true, by asking the FeePool contract the correct quantity. Then issues synths in the correct quantity, minus the fee, to the destination address. Then pays the fee into the fee pool in XDRs, performing another currency conversion here using `effectiveValue` and then issuing directly into the pool. Triggers ERC223 token fallback if necessary. Finally, emits an exchange event.
* `_internalLiquidation(address from, bytes4 sourceCurrencyKey, uint sourceAmount)`: Only used once, just burns the given quantity of the specified token from the `from` address. I would probably inline this and eliminate the function.
* `_addToDebtRegister(bytes4 currencyKey, uint amount)`: Whenever synths are issued, computes the factor the issuance changes the overall supply by and appends it to the list of such deltas in synthetixState.

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

* `issueSynths(bytes4 currencyKey, uint amount)`: TODO
* `issueMaxSynths(bytes4 currencyKey)`: TODO
* `burnSynths(bytes4 currencyKey, uint amount)`: TODO
* `_appendAccountIssuanceRecord()`: TODO
* `_removeFromDebtRegister(uint amount)`: TODO
* `maxIssuableSynths(address issuer, bytes4 currencyKey)`: The maximum number of a given synth that is issuable against the issuer's collateral. Ignores whatever they have already issued. This is simply `collateral(issuer) * issuanceRatio`, priced in the given currency.
* `collateralisationRatio(address issuer)`: Just `debtBalanceOf(issuer) / collateral(issuer)`, valued in terms of SNX. That is, it is the ratio of the value of Synths they have issued to the value of all the SNX they own. Under ideal conditions this should equal the global issuance ratio, and issuers are incentivised to keep their collateralisation ratios close to the issuance ratio by the fees they are able to claim.
* `debtBalanceOf(address issuer, bytes4 currencyKey)`: Reports the quantity of a given Synth/Currency (actually anything that the oracle has a price for) required to free up all of this user's SNX. This is computed as their fraction of total system ownership at the time they issued, multiplied by the ratio between the most recent debt ledger entry and the entry at the time they issued, multiplied by the current total system value. i.e. it works adjusts their fraction depending on how the price and supply have moved since they issued. They owe a larger fraction of the total if the number of synths goes down. TODO: What about price? Investigate this in the context of a single currency.

$$
dl \text{: debtLedger - the series of aggregated debt movements in the system. A ratio of two entries is the movement between those times.}
ido \text{: initialDebtOwnership - the fraction of debt owned by this account when their last issuance was made. Return 0 immediately if dei is 0.} \\
dei \text{: debtEntryIndex - the index of the debt ledger when their last issuance was made.} \\
cdo = \frac{last(dl)}{dl[dei]}ido \text{: currentDebtOwnership - the fraction of current system value currently owed by this account.} \\
tsv \text{: totalSystemValue - the sum of price times supply over all Synth flavours. That is, for a particular denominating currency, } \frac{1}{price_{denom}}\sum_c{price_c \times supply_c} \\
\text{Then the result is just } cdo \times tsv
$$

* `remainingIssuableSynths(address issuer, bytes4 currencyKey)`: The remaining synths this account can issue (of a given flavour). This is `max(0, maxIssuableSynths(issuer, currencyKey) - debtBalanceOf(issuer, currencyKey))`. not that the debt may exceed the max issuable synths, but the result is clamped.
* `collateral(address account)`: Returns the total SNX owned by the given account, locked and unlocked, escrowed and unescrowed. That is, it is computed as `balance(account) + escrowedBalance(account) + rewardBalance(account)`. That is, an account may issue Synths against both its active balance and its unclaimed escrowed funds.
* `transferableSynthetix(address account)`: The quantity of SNX this account can transfer. Returns `max(0, balance(account) - debtBalanceOf(account) / issuanceRatio)`. NOTE: The dev note is misleading. It suggests that escrowed SNX are locked first when issuing, but that this is not relevant in the current function, because escrowed SNX are not transferable. But "locked" is just a property of whether SNX can be transferred, and is *only* relevant within the `transferableSynthetix` function. Compare with the previous logic in the [1.0.1 Havven contract](https://github.com/Synthetixio/synthetix/blob/b30191ef7bae6821a1308acaa9d0728f69204da5/contracts/Havven.sol#L717). The functionality has been simplified; the docstring should indicate now that unescrowed SNX are locked first. OPTIMISATION: This function checks that the SNX price is not stale, but this is unnecessary, since it is checked inside the call to `totalIssuedSynths` within `debtBalanceOf`.
* `mint()`: TODO

## Events

### SynthExchange

`SynthExchange(address indexed account, bytes4 fromCurrencyKey, uint256 fromAmount, bytes4 toCurrencyKey,  uint256 toAmount, address toAddress)`

Indicates that an exchange between two currencies has occurred, along with the source and destination addresses, currencies, and quantities.
