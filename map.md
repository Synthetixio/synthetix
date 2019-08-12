# Map

* Contracts
  * Check consistency with dev docs
  * PurgeableSynth.sol - Module description is broken.
  * Contracts:
    * [ ] DelegateApprovals.sol
    * [ ] Depot.sol
    * [ ] EscrowChecker.sol
    * [ ] EternalStorage.sol
    * [ ] ExchangeRates.sol
    * [ ] ExternStateToken.sol
    * [ ] FeePool.sol
    * [ ] FeePoolEternalStorage.sol
    * [ ] FeePoolState.sol
    * [ ] LimitedSetup.sol
    * [ ] Migrations.sol
    * [ ] Owned.sol
    * [ ] Pausable.sol
    * [ ] Proxy.sol
    * [ ] ProxyERC20.sol
    * [ ] Proxyable.sol
    * [ ] PurgeableSynth.sol
    * [ ] ReentrancyPreventer.sol
    * [ ] RewardEscrow.sol
    * [ ] SafeDecimalMath.sol
    * [ ] SelfDestructible.sol
    * [ ] State.sol
    * [ ] SupplySchedule.sol
    * [ ] Synth.sol
    * [ ] Synthetix.sol
    * [ ] SynthetixEscrow.sol
    * [ ] SynthetixState.sol
    * [ ] TokenFallbackCaller.sol
    * [ ] TokenState.sol
* Processes
  * [ ] Tokens/Synths
  * [ ] Minting
  * [ ] Conversion
  * [ ] Escrow
  * [ ] Connection between collateral pool value and token value
  * [ ] Stabilisation
  * [ ] Fee pool rewards
  * [ ] Inflationary rewards
  * [ ] Collat ratio targeting
  * [ ] SIPs
  * [ ] SCCPs
* Integrated platforms
  * Unipay
  * That graphs thing?
* Assets
  * Classify assets
  * risk profiles
  * correlation
* Docs
  * Litepaper
  * Readme
  * SIPs

# Governance

## SIPs (Synthetix Improvement Proposals)

* SIP-1: SIP specification.
* SIP-2: Eliminates fee penalty tiers and replaces them with a flat 100% penalty if above a target ratio.
* SIP-3: Purgeable Synths -- Allow the ability to destroy synths, refunding the balances in sUSD to holders. This allows removing unused synths, which otherwise cause unnecessary gas costs.
* SIP-4: Reduces fee window from 6 weeks to 2 in order to increase the responsiveness of incentive changes. It requires fees to roll over through the entire fee window before incentive changes are actually felt.
* SIP-5: Add six new synths sTRX, iTRX, sXTZ, iXTZ, sMKR, iMKR. Crypto synths and their inverses.
* SIP-6: Front-running protection: the oracle monitors activity for front-running. If it detects this, then the exchange fee rate is jacked up to 99% so that the front-runner's transaction is sucked up. Additionally, a user will be able to specify a fee rate above which their transaction will fail so that they don't get caught by the front running protection. Note: doesn't this protect the front-runners as well? UPDATED: the setProtectionCircuit function allows hte oracle to target only particular transactions to be rejected.
* SIP-7: More front-running protection: exchange pausing; preventing changes while oracle updates are in progress; remove the destination param in an exchange so that they only go to the message sender.

## SCCPs (Synthetix Configuration Change Proposal)

* SCCP-1: SCCP specification.
* SCCP-2: C-ratio to 750%
* SCCP-3: Exchange fee to 50bp from 30bp for two weeks to observe the impact on front-running.

## Mechanism Notes

* TODO

# Contracts

## LimitedSetup.sol

Allows certain contract functions to only operate during a setup period.

---

## State.sol

Allows a contract to have an external state whose values only it can modify.

---

## ExternStateToken.sol

TODO: Finish me

## Inherited Contracts

---

## Synthetix.sol

* TODO: Finish me

### Misc Notes

* Licence headers are illegal.
* TODO: Check whether the file header is still accurate.

### Inherited Contracts

* ExternStateToken.sol

### Referenced Contracts

* Synth.sol
* FeePool.sol
* SynthetixEscrow.sol
* ExchangeRates.sol
* SynthetixState.sol
* SupplySchedule.sol

### Variables

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

### Functions

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

---

## SynthetixState.sol

This is a state contract, controlled by the main Synthetix contact (Synthetix.sol).

### Inherited Contracts

* State.sol
* LimitedSetup.sol

### Referenced Contracts

* Synthetix as this contract's `State.associatedContract`
* `SafeMath` and `SafeDecimalMath` for `uint`.

### Structs

Holds the issuance state and preferred currency of users in the Synthetix system.
Individual wallets have an issuance data object associated with their address:

```solidity
struct IssuanceData {
    uint initialDebtOwnership; // Percentage of the total debt owned by this address at the time of issuance.
    uint debtEntryIndex; // The relative index of when this user issued tokens (entered the debt pool).
}
```

This is used to compute user's exit price and collateralisation ratio.

### Variables

* `issuanceData`: mapping from addresses to their issuance data struct.
* `totalIssuerCount`: number of people with outstanding synths.
* `debtLedger`: a list of factors indicating for each debt-modifying event, what effect it had on the percentage of debt of all other holders.
* `importedXDRAmount`: The number of XDRs outstanding from before the multicurrency transition.
* `issuanceRatio`: The current issuance ratio: set to 0.2 to begin with.
* `MAX_ISSUANCE_RATIO`: No more than 1 synth may be issued per dollar of backing.
* `preferredCurrency`: If users nominate a preferred currency, all synths they receive will be converted to this currency.

### Functions

* `setCurrentIssuanceData(address account, uint initialDebtOwnership)`: updates the debtOwnership of account, and sets their debt entry index to the current length of the debt ledger, without appending anything to that ledger.
* `clearIssuanceData(address account)`: Delete the issuance data associated with this account.
* `increment/decrementTotalIssuerCount()`: totalIssuerCount++/--
* `appendDebtLedgerValue(uint value)`: debtLedger.push(value)
* `setPreferredCurrency(address account, bytes4 currencyKey)`: preferredCurrency[account] = currencyKey. I guess you set this to 0 to unset the value?
* `setIssuanceRatio(uint _issuanceRatio)`: Sets the ratio for synth issuance. The new ratio cannot exceed MAX_ISSUANCE_RATIO.
* `importIssuerData(address[] accounts, uint[] sUSDAmounts)`: adds a certain amount of sUSD debt for a given set of accounts, but only during the setup period.
* `_addToDebtRegister(address account, uint amount)`: Called in a loop by importIssuerData. Duplicates the code from the `Synthetix` except that the total debt is given during initialisation (`importedXDRAmount`).
* `debtLedgerLength()`: View function.
* `lastDebtLedgerEntry()`: View function.
* `hasIssued(address account)`: True when the account has outstanding debt -- i.e. when `issuanceData[account].initialDebtOwnership > 0`

---

## EternalStorage.sol

A key:value store for various data types, each data type has a mapping from bytes32 to entries of that type. Intended to be used by keccak256-hashing a key value to retrieve its corresponding value.

### Inherited Contracts

State.sol

---

## FeePoolEternalStorage.sol

This is just wrapper around the EternalStorage contract with a limited setup period and a setup function that sets each account's last fee withdrawal times.

### Inherited Contracts

* EternalStorage
* LimitedSetup

### Variables

* `LAST_FEE_WITHDRAWAL`: Just a const string with the value "last_fee_withdrawal".

### Functions

* `importFeeWIthdrawalData(address[] accounts, uint[] feePeriodIDs)`: Callable only by the owner, and only during the six-week setup period.

---

## FeePool.sol

A contract for managing and claiming fees.

### Inherited Contracts

* Proxyable
* SelfDestructible
* LimitedSetup

### Referenced Contracts

* Synthetix
* SynthetixState
* SynthetixEscrow (rewardEscrow)
* FeePoolEternalStorage
* FeePoolState
* DelegateApprovals
* SafeMath
* SafeDecimalMath

### Structs

```solidity
struct FeePeriod {
    uint feePeriodId;
    uint startingDebtIndex;
    uint startTime;
    uint feesToDistribute;
    uint feesClaimed;
    uint rewardsToDistribute;
    uint rewardsClaimed;
}
```

### Variables

* `synthetix`: The main Synthetix contract.
* `synthetixState`: The underlying SynthetixState contract.
* `rewardEscrow`: The SynthetixEscrow instance which holds the issuance rewards.
* `feePoolEternalStorage`: A key:value store to allow values to be stored without upgrading anything.
* `transferFeeRate`: Fee charged on each transfer (cannot exceed MAX_TRANSFER_FEE_RATE, which is 10%)
* `exchangeFeeRate`: Fee charged on a currency exchange (cannot exceed MAX_EXCHANGE_FEE_RATE, which is 10%)
* `feeAuthority`: Address which can distribute fees.
* `feePoolState`: The FeePoolState contract associated with this fee pool.
* `FEE_ADDRESS`: The address where fees are pooled.
* `FEE_PERIOD_LENGTH`: 3. Three weeks. NOTE: The comment is wrong, since it says 6.
* `recentFeePeriods`: A list of three FeePeriod objects for the 3 most recent periods. Goes from newest to oldest.
* `feePeriodDuration`: 1 week - between MIN_FEE_PERIOD_DURATION and MAX_FEE_PERIOD_DURATION (1 to 60 days)
* `TARGET_THRESHOLD`: Users are unable to claim fees if their collateralisation ratio drifts out of target threshold (NOTE: typo here, 'treshold'). Set to 10%. Note that this is in CONSTANT_CASE even though it is not a constant and has a setter.
* `LAST_FEE_WITHDRAWAL`: "last_fee_withdrawal", used as a key for accessing the eternal storage contract.

### Functions

* `appendAccountIssuanceRecord(address account, uint debtRatio, uint debtEntryIndex)`: Pass through to FeePoolState.appendAccountIssuanceRecord, and emits an event; only callable by the main Synthetix contract.
* `setExchangeFeeRate(uint _exchangeFeeRate)`: sets the exchange fee rate to the given argument. Note that the docstring implies that the exchange fee rate cannot exceed 10%, but this is not checked.
* `setTransferFeeRate(uint _transferFeeRate)`: sets the transfer fee rate to the given argument. This one does check that the argument is in the proper range.
* `setFeeAuthority(address _feeAuthority)`: as per the name.
* `setFeePoolState(FeePoolState, _feePoolState)`: as per the name.
* `setDelegateApprovals(DelegateApprovals _delegates)`: as per the name.
* `setFeePeriodDuration(uint _feePeriodDuration)`: as per the name. Checks that the argument is in the proper range.
* `setSynthetix(Synthetix _synthetix)`: Arg must be nonzero.
* `setTargetThreshold(uint _percent)`: NOTE: pointlessly checks that a uint is non-negative. In my view it would likely be better to pass in an actual fixed point number rather than a percentage point integer, so that granularity can be finer than whole percentage points.
* `feePaid(bytes4 currencyKey, uint amount)`: converts amount to XDRs and then adds the XDR value to the fee pool to be distributed. As an aside, this could be more efficient by pre-computing the XDR value before passing it to the FeePool contract, which throws away currencyKey, only using it for calling back to Synthetix to find the equivalent XDR value at current exchange rates. Poor name: reads like a predicate, but is actually an effectful function.
* `rewardsMinted(uint amount)`: Adds a quantity of SNX rewards to the current fee period reward distribution total. Poor name: reads like a predicate, but is actually an effectful function.
* `closeCurrentFeePeriod()`: Close the current fee period, and open the next one. The previously-recorded fee periods are shifted along and the last one is overwritten, though its unclaimed fees are merged into the penultimate fee period it was overwritten by. Note that the comment, "Take a snapshot of the total value of the system." at the end of this function is inaccurate.
* `claimFees(bytes4 currencyKey)`: The message sender claims their fees in the currency specified.
* `claimFeesOnBehalf(address claimingForAddress, bytes4 currencyKey)`: Claim fees for a specified address. They are awarded to that address, and not to the message sender.
* `_claimFees(address claimingAddress, bytes4 currencyKey)`: Claim fees at the specified address in the specified currency. C-ratio must be within the bounds specified by the `feesClaimable` function -- i.e. less than the issuance ratio. TODO: FINISH ME
* `importFeePeriod(uint feePeriodIndex, uint feePeriodId, uint startingDebtIndex, uint startTime, uint feesToDistribute, uint feesClaimed, uint rewardsToDistribute, uint rewardsClaimed)`: Sets a particular fee period entry, but only during the setup period.
* `approveClaimOnBehalf(address account)`: TODO
* `removeClaimOnBehalf(address account)`: TODO
* `_recordFeePayment(uint xdrAmount)`: TODO
* `_recordRewardPayment(uint snxAmount)`: TODO
* `_payFees(address account, uint xdrAmount, bytes4 destinationCurrencyKey)`: TODO
* `_payRewards(address account, uint snxAmount)`: TODO
* `transferFeeIncurred(uint value)`: TODO
* `transferredAmountToReceive(uint value)`: TODO
* `amountReceivedFromTransfer(uint value)`: TODO
* `exchangeFeeIncurred(uint value)`: TODO
* `exchangedAmountToReceive(uint value)`: TODO
* `amountReceivedFromExchange(uint value)`: TODO
* `totalFeesAvailable(bytes4 currencyKey)`: TODO
* `totalRewardsAvailable()`: TODO
* `feesAvailable(address account, bytes4 currencyKey)`: return the total of fees this user has accrued in previous fee periods. TODO: FINISH ME
* `feesClaimable(address account)`: true iff the collateralisation ratio of this account is less than the target ratio plus 10% of the ratio
  or so. This function code could be made more concise. The logic allows fees to be withdrawable if a user's ratio is less than
  Synthetix.issuanceRatio * (1 + TARGET_THRESHOLD). But the same result could be met by just adjusting the issuance ratio.
* `feesByPeriod(address account)`: TODO: FINISH ME
  Note: XDRs existing seems to be necessary for a user to have nonzero ownership percentages, so the second
  guard in this function looks redundant, or should be checked earlier. It's likely to be an exceedingly rare case anyway.
* `_feesAndRewardsFromPeriod(uint period, uint ownershipPercentage, uint debtEntryIndex)`: TODO: FINISH ME
* `_effectiveDebtRatioForPeriod(uint closingDebtIndex, uint ownershipPercentage, uint debtEntryIndex)`: 
Logic seems screwy here?... TODO: CHECK ME. NOTE: Off-by-one error in the guard. The condition should be `closingDebtIndex >= synthetixState.debtLedgerLength()`.
* `effectiveDebtRatioForPeriod(address account, uint period)`: TODO
* `getLastFeeWithdrawal(address _claimingAddress)`: TODO
* `getPenaltyThresholdRatio()`: TODO
* `_setLastFeeWithdrawal(address _claimingAddress, uint _feePeriodID)`: TODO NOTE: this is erroneously in the modifiers section.

---

## FeePoolState.sol

Stores the issuance percentage for each address for up to six fee periods. Note that this contract limits to 6 periods, while the FeePool contract limits it to only 3.

### Inherited Contracts

* SelfDestructible
* LimitedSetup

### Referenced Contracts

* FeePool

### Structs

```solidity
// As in SynthetixState.sol, modulo naming, but one per fee period.
struct IssuanceData {
    uint debtPercentage;
    uint debtEntryIndex;
}
```

### Variables

* `FEE_PERIOD_LENGTH`: 6; note the inconsistency with the corresponding constant in FeePool, which is set to 3.
* `accountIssuanceLedger`: A list of up to 6 issuance data entries per account, for the last 6 fee periods they changed their issuance levels in, from newest to oldest (decreasing debt ledger indexes).

### Functions

* `getAccountsDebtEntry(address account, uint index`: Accesses `accountIssuanceLedger`
* `applicableIssuanceData(address account, uint closingDebtIndex)`: Retrieve the most-recent issuance data entry for this user which closed no later than the provided index. Comment is wrong.
* `appendAccountIssuanceRecord(address account, uint debtRatio, uint debtEntryIndex, uint currentPeriodStartDebtIndex)`: If the latest entry in this account's issuance ledger was from this period, overwrite it.
  Otherwise, shift the existing entries down one spot, dropping the last one, and add a new entry at the head of the list for the current fee period.
  Note that debtRatio is misnamed, it's actually the global debt percentage of this account.
* `importIssuerData(address[] accounts, uint[] ratios, uint periodToInsert, uint feePeriodCloseIndex)`: Docstring needs a spell check.

---

## DelegateApprovals.sol

Each approver may authorise a number of delegates to perform an action (withdrawing fees) on their behalf.
Note that the file docstring is inaccurate "Withdrawing approval sets the delegate as false instead of 
removing from the approvals list for auditability.". But the contract actually uses a nested mapping so setting
false and deletion are equivalent operations (the contract actually deletes).

### Inherited Contracts

* State

### Referenced Contracts

* FeePool (associatedContract)

---

## TokenFallbackCaller.sol

TODO Allows ERC223ish contracts 

### Inherited 
* 


# Areas of potential vulnerability to investigate

* Oracle front-running.
* C-ratio manipulation.
* Other levers such as marketing, botting?
* Intervention when deployments occur?
* Correlation study of the XDR. What's in this basket?
* Fee period length contradiction between FeePool and FeePoolState
* Do calls to debtBalanceOf outside of totalIssuedSynths allow stale rates?
* Do debt ledger entries lose too much precision given that they are a product of small quantities?
* What happens if I issue very small quantities of synths? Can I lose the debt due to rounding? Thus, can I increase the supply without the system locking any of my snx?

# A Note on Conversion Fee Evasion

The synthetix system has both a conversion and a transfer fee. Although they should be distinct,
the preferred currency auto conversion on transfer only charges the transfer fee, and not the conversion fee.
As a result, it is possible to convert Synths more cheaply whenever the transfer fee is less than the conversion fee.
Given that the transfer fee is currently 0, it is possible by this means to perform free conversions. First, this potentially
eliminates all fee revenue for the system to incentivise participants with. Second, if markets have priced in the conversion fee
and are unaware of the exploit, then there is a profit cycle here.

In particular:

$$
\text{let } \ \phi_\kappa, \ \phi_\tau \in [0,1] \ \text{ be the conversion and transfer fee rates, respectively.} \\
\pi_A, \ \pi_B \ \text{ be the prices of synths } A \text{ and } B \text{ in terms of some implicit common currency.} \\
Q_A \text{ be a starting quantity of synth A.} \\
$$

Then to convert from $A$ to $B$, quantities

$$
Q^\kappa_B = Q_A\frac{\pi_A}{\pi_B}(1 - \phi_\kappa) \\
Q^\tau_B = Q_A\frac{\pi_A}{\pi_B}(1 - \phi_\tau)
$$

are received if the user performs a standard conversion or a transfer conversion, respectively.
The profit of performing a transfer conversion relative to a standard one is then:

$$
Q^\tau_B - Q^\kappa_B = Q_A\frac{\pi_A}{\pi_B}(\phi_\kappa - \phi_\tau)
$$

That is, the percentage profit is simply $(\phi_\kappa - \phi_\tau)$. With no transfer fee, the profit is $\phi_\kappa$, as expected.
