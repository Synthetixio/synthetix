# Audit Notes

These notes have been extracted from the relevant function descriptions in the rest of this section. Some of them, which are clarifying notes, are probably worth reintroducing to their appropriate sections. Other notes which are recognised issues but which can't or won't be rectified should also be reintroduced to their appropriate sections.

On a different point, I'm not sure what the policy is on authorship information in the file headers but it did stick out to me that the names of the original authors of several contracts were simply removed. Not a huge deal, but it does seem a bit odd to replace a name when there are still large sections of code and commentary created by them in the file unchanged. Relevant instances include Synthetix, Synth, RewardEscrow, Depot, and SafeDecimalMath contracts, to varying degrees.

<section-sep />

## `Mintr`

!!! bug
    The Depot description text on Mintr still links to swappr.io, but should link to synthetix.exchange

<section-sep />

## `Synthetix`

!!! info "Contract Header Out Of Date"
    The average SNX balance computations described in the file docstring of this contract was correct for the sUSD-only system. The multicurrency version of Synthetix has made this obsolete and much of it should be deleted or rewritten.

---

### `constructor`

!!! caution "Incorrect Constructor Docstring"
    `If the provided address is 0x0, then a fresh one will be constructed with the contract owning all tokens.` This is no longer correct.

---

### `removeSynth`

!!! caution "sUSD Removal"
    Note that there is no requirement the sUSD synth cannot be removed, although its removal would cause several contracts to malfunction.

    * The [`Depot`](Depot.md) only deals in sUSD.
    * Everything in the [`ExchangeRates`](ExchangeRates.md) contract is denominated in sUSD, whose price there is fixed at 1.0 sUSD/sUSD.
    * [`PurgeableSynth.purge`](PurgeableSynth.md#purge) liquidates everything back to sUSD.

---

### `totalIssuedSynths`

!!! info "Optimisation: Staleness Check"
    This function checks that currencyKey is not stale in the function modifier, then later requires that no rate is stale in the function body; the modifier can be eliminated.

!!! info "Optimisation: Hoist Division"
    Could hoist the division by `currencyRate` out of the loop and simply divide once at the end. Also `availableSynths[i]` can be assigned to a variable to avoid indexing into the array twice.

---

### `exchange`

!!! caution "Inconsistency With SIP-7"
    [SIP-7](https://sips.synthetix.io/sips/sip-7) indicated that the `destinationAddress` parameter would be removed, but this has not been implemented. Should the SIP be updated?

---

### `synthInitiatedExchange`

!!! info "Outdated Comment"
    `// Don't charge fee on the exchange, as they've already been charged a transfer fee in the synth contract`

    No transfer fee is charged anymore; this note can be removed.

---

### `_internalLiquidation`

!!! info "Inlining Candidate"
    As this function is only used once, inside [`exchange`](Synthetix.md#exchange), and it is very short, this could potentially be inlined.

---

### `_addToDebtRegister`

!!! info "Optimisation: System Value Recomputation"
    The total system value is computed twice, once as $X$, and once within the call to `debtBalanceOf`. One of them could in principle be eliminated.

!!! info "Optimisation: Use Already-Computed Results When Incrementing Issuer Count"
    Currently this function increments the total issuer count if `!synthetixState.hasIssued(messageSender)`, but this can be substituted with `existingDebt == 0`, which doesn't need to call out to the state contract.

!!! info "Optimisation: Remove Modifier"
    This is only called inside [`issueSynths`](Synthetic.md#issuesynths), which already has the [`Proxyable.optionalProxy`](Proxyable.md#optionalproxy) modifier, so it can be removed from this function. The function is also a candidate for inlining.

---

### `_appendAccountIssuanceRecord`

!!! info "Optimisation: Save Intercontract Function Call"
    This function is only called after calls to [`_addToDebtRegister`](Synthetix.md#_addtodebtregister) and [`_removeFromDebtRegister`](Synthetix.md#_removefromdebtregister). The latest issuance data is set inside these functions with a call to [`SynthetixState.setCurrentIssuanceData`](SynthetixState.md#setcurrentissuancedata), which is then immediately retrieved from [`SynthetixState.issuanceData`](SynthetixState.md#issuancedata). The extra call to the state contract could be removed by moving the calls to [`_appendAccountIssuanceRecord`](Synthetix.md#appendaccountissuancerecord) into the debt register manipulation functions and passing in the parameters locally.

    This might also make the code clearer by moving the code making modifications to the [current](SynthetixState.md#issuancedata) and [historical](FeePoolState.md#accountissuanceledger) issuance data closer together.

---

### `_removeFromDebtRegister`

!!! info "Optimisation: Pass Existing Debt as Parameter"
    `uint existingDebt = debtBalanceOf(messageSender, "XDR")`, but this has already been computed already in the immediately enclosing function, [`burnSynths`](Synthetix.md#burnsynths).

!!! info "Optimisation: Superfluous Variable Assignment"
    If the check `newTotalDebtIssued > 0` fails, then 0 is assigned to `delta`, but the variable is already uninitialised, and so already has this value.

!!! caution "Potentially-Misleading Name"
    This function does not remove anything from the debt ledger; rather it appends a new entry to it indicating a decreased total debt.

---

### `transferableSynthetix`

!!! caution "Misleading Dev Note"
    The note in the docstring suggests that escrowed SNX are locked first when issuing, but not locked first in this function.
    However, "locked" just means not transferable, so this concept only has meaning within the current function. Escrowed SNX are not transferable in any case, and it is really the unescrowed tokens that are locked first by this function.

!!! info "Optimisation: Stale Price Check"
    This function checks that the SNX price is not stale, which is unnecessary since it is checked inside the call to `totalIssuedSynths` within `debtBalanceOf`.

---

### `onlySynth`

!!! info "Optimisation: Remove Loop"
    Instead of iterating through [`availableSynths`](Synthetix.md#availablesynths), just check if [`synths[messageSender]`](Synthetix.md#synths) is initialised.

    This function is a candidate for inlining since it is only used in [`synthInitiatedExchange`](#synthinitiatedexchange), and moving the [`optionalProxy`](#optionalproxy) modifier onto that function.

---

<section-sep />

## `FeePool`

---

!!! caution "Admin Function Events"
    Several admin functions should emit events, but they do not. Now that transfer fee logic has been removed, it may be possible to introduce these.

!!! info "Lingering Debug Events"
    `LogInt` and `LogAddress` events remain in the source code and should be removed as they are unused.

---

### `MAX_EXCHANGE_FEE_RATE`

!!! bug "Missing Bounds Check"
    That [`exchangeFeeRate`](FeePool.md#exchangefeerate) should not exceed this value is not actually checked in the [`setExchangeFeeRate`](FeePool.md#setexchangefeerate) function.

---

### `feePeriodDuration`

!!! caution "Erroneous Comment"
    The comment on this variable says `It is required for the fee authority to roll over the periods`, but this is no longer true, as [`closeCurrentFeePeriod`](FeePool.md#closecurrentfeeperiod) is now callable by anyone.

---

### `TARGET_THRESHOLD`

!!! caution "Constant Case"
    Note that this is in CONSTANT_CASE even though it is not a constant. Its value may be changed by the owner calling [`setTargetThreshold`](FeePool.md#settargetthreshold).

!!! bug "Potential System Undercollateralisation"
    At 10%, `TARGET_THRESHOLD` in principle allows the system's total issued value to reach 110% percent of its supposed maximum.
    Moreover, the fact that this quantity is modifiable, and has no constraint on what value it can be changed to means that it could be set, for example, to 500%, and the Synthetix system would become a fractional reserve system.

---

### `setExchangeFeeRate`

!!! bug "Missing Bounds Check"
    The docstring implies that the exchange fee rate cannot exceed 10%, but this is not checked in the function.

---

### `setTargetThreshold`

!!! bug "Missing Bounds Check"
    This function does not constrain the input value. See the notes on the [`TARGET_THRESHOLD`](FeePool.md#target_threshold) for consequences of this if the owner chooses to set this to something large.

!!! info "A Minor Inelegance"
    Note that this checks that a uint is non-negative. This check should be removed as it serves no purpose.

---

### `feePaid`

???+ info "A Minor Note on Efficiency"
    This could be more efficient if this function only accepted values already converted to XDRs. `feePaid` throws away `currencyKey`, only using it for calling back to Synthetix to find the equivalent XDR value at current exchange rates.

    Further, the Synthetix contract already pre-computes the XDR value before passing it to the FeePool contract anyway, so the branch that actually converts the value can never be reached.

!!! info "Naming"
    Be aware that although the name reads like it could be a predicate, this is actually an effectful function.

---

### `setRewardsToDistribute`

!!! info "Potentially-Misleading Name"
    Although the name might imply otherwise, this function can't reduce or reset the amount of funds to be distributed, but only add to the existing pot.

---

### `closeCurrentFeePeriod`

!!! caution "Erroneous Comment"
    A comment at the end of this function says `Take a snapshot of the total value of the system.`, but no such snapshot is explicitly taken. Rather, the relative movements of the system's valuation is recorded at every minting event in the system [debt ledger](SynthetixState.md#debtledger).

---

### `approveClaimOnBehalf`

!!! info "Redundant Conditions"
    Neither of the preconditions is actually necessary.

---

### `removeClaimOnBehalf`

!!! info "Redundant Precondition"
    The precondition is unnecessary.

---

### `_recordFeePayment`

!!! info "Optimisation: Remove Redundant Code"
    The final lines of the loop body, `if (i == 0 && remainingToAllocate > 0) { remainingToAllocate = 0; }` are redundant. One could just iterate once less. There might be another minor efficiency dividend to be had by not fetching `feesClaimed` from the state twice.

---

### `_payFees`

!!! info "A Minor Infficiency"
    Some gas could be saved by keeping the address of the XDR synth as a variable rather than retrieving it with [`Synthetix.synths("XDR")`](Synthetix.md#synths) each invocation.

---

### `feesAvailable`

!!! info "Ambiguous Naming"
    Don't confuse this funciton with [`feesClaimable`](FeePool.md#feesclaimable).

---

### `feesClaimable`

!!! bug "Potential System Undercollateralisation"
    The logic allows fees to be withdrawn if an account's ratio is less than [`SynthetixState.issuanceRatio *`](SynthetixState.md#issuanceRatio) [`(1 + TARGET_THRESHOLD)`](FeePool.md#target_threshold).

    The same result could be met by just adjusting the issuance ratio, except that the target threshold in this version of the system does not have any of the bounds checking that exists on the issuance ratio's value. This allows the issuance ratio to be set to any value.

---

!!! info "Potentially Ambiguous Naming"
    This function is a predicate, although its name sounds like it could be returning a quantity of fees claimable, which is actually the [`feesAvailable`](FeePool.md#feesavailable) function.

---

### `feesByPeriod`

!!! bug "Zero Fees Remaining Check"
    The guard `if (synthetix.totalIssuedSynths("XDR") == 0) return;` is a bit strange.

    XDRs existing seems to be a necessary condition for a user to have nonzero ownership percentages, so this check looks redundant.

    Not sure if the fee pool ever actually empties out, but in any case it doesn't account for the case where there is a positive but too-low quantity of fees remaining. In any case, it will report zero for all periods if there are no fees in the pool, but if there is a sudden infusion of fees then their fees owed increases. It's probably more informative for the user if they can see what their potential fee claim is even if there are no fees to be claimed, so that they can tell if they should wait for the pot to fill up or not.

    Additionally, it only checks for fees and not for rewards, which means that cases where there are rewards left but no fees will be incorrectly skipped.

    So one of two options could be appropriate. Either: remove the check; or clamp the fees owed to the quantity left in the pot, accounting for rewards as well as fees, which subsumes the existing behaviour in a more-consistent structure.

!!! caution "Closing Debt Index Comments"
    The latter two thirds of the comment on the `closingDebtIndex` declaration seems to be out of date? `issuanceData[0]` is never explicitly fetched within the loop, only `feePoolState.applicableIssuanceData` is actually used.

    The gas optimisation comments should be removed and/or implemented, though keeping the most recent entry doesn't make a lot of sense if no applicable issuance event was found.

!!! caution "Initialisation Check Comment"
    In most circumstances, the guard `nextPeriod.startingDebtIndex > 0` cannot fail to be true unless the current period is 0, but this is disallowed by the loop condition.

    This matters during the initial deployed period before the [`recentFeePeriods`](FeePool.md#recentfeeperiods) array has been populated. It might be worth leaving a comment clarifying this.

!!! info "Optimisation: Broaden Debt Entry Initialisation Check"
    The check `if (debtEntryIndex == 0 && userOwnershipPercentage == 0) return;` only checks if this user has no debt entries at all. First, `debtEntryIndex == 0` implies `userOwnershipPercentage == 0`. Second, they may have a zero debt ownership percentage, but still have a nonzero debt entry index if at some point they burnt all Synths. In this case the function body can still be skipped. So it is sufficient to check for `userOwnershipPercentage == 0`.

!!! info "Optimisation: Move Initialisation Check Inside Conditional"
    The check that `nextPeriod.startingDebtIndex > 0` can be skipped if the last fee withdrawal time was already too recent by moving it into its own nested conditional.

!!! info "Optimisation: Hoist Function Call"
    The return value of `getLastFeeWithdrawal(account)` does not change between iterations, thus this call can be hoisted out of the loop, saving some inter-contract call overhead.

---

### `_feesAndRewardsFromPeriod`

!!! bug "Current Period Ownership Percentage Movement"
    This uses [`_effectiveDebtRatioForPeriod`](FeePool.md#_effectivedebtratioforperiod) to account for ownership movements, unless we are considering the current period. This means that the reported fees owing for the current period is inaccurate until the fee period closes. In case of the current period, this should perhaps use the latest entry in the debt ledger to compute the adjustment given that there is no closing index.

---

### `_effectiveDebtRatioForPeriod`

!!! info "Superfluous Check"
    This returns 0 if `closingDebtIndex` is strictly greater than the [length of the debt ledger](SynthetixState.md#debtledgerlength).

    This condition can never be satisfied except in case of a bug, but even if it could be satisfied, the corresponding entry would still return 0 anyway, since the debt ledger grows monotonically.

!!! caution "Edge Case: Array Index Out of Bounds"
    The length guard includes an off-by-one error, as the condition should be `closingDebtIndex >= synthetixState.debtLedgerLength()`.

    If `closingDebtIndex` equals [`SynthetixState.debtLedgerLength()`](SynthetixState.md#debtledgerlength), then this function will fetch the [`SynthetixState.debtLedger`](SynthetixState.md#debtledger) element one past the end, which will produce 0. Consequently the function will return 0 even if it should not.

    It is unlikely this case can be evinced in practice given the above note on the superfluity of the check.

---

### `effectiveDebtRatioForPeriod`

!!! caution "Potentially Misleading Comment"
    The following lines could be read to imply that each period's debt index begins at zero.

    ```
    // No debt minted during period as next period starts at 0
    if (recentFeePeriods[period - 1].startingDebtIndex == 0) return;
    ```

    In fact, this check can only be triggered if no debt has been minted at all, as it implies (in combination with the preconditions on the period number) that the fee period is uninitialised. This is only an issue before enough fee periods have completed to fill up [`recentFeePeriods`](FeePool.md#recentfeeperiods).

---

### `getPenaltyThresholdRatio`

!!! info "A Minor Inefficiency"
    The address of [`SynthetixState`](SynthetixState.md) is computed with the indirection [`Synthetix.synthetixState`](Synthetix.md#synthetixstate), but the fee pool contract already has a copy of the address in its own [`synthetixState`](FeePool.md#synthetixstate) variable.

---

<section-sep />

## `FeePoolState`

---

### `appendAccountIssuanceRecord`

!!! caution "Incorrect Docstring"
    `accountIssuanceLedger[account][1-3]` should be `[1-2]`.
  
!!! info
    The `debtRatio` parameter name may be unclear; it's actually the debt of this account as a percentage of the global debt.

---

### `importIssuerData`

!!! caution
    Because the internal loop index is a `uint8`, if the `accounts` argument is longer than 256 entries this function will loop indefinitely, consuming all gas.

---

<section-sep />

## `DelegateApprovals`

!!! caution "Inaccurate File Docstring"
    The file docstring is slightly inaccurate. It says `Withdrawing approval sets the delegate as false instead of removing from the approvals list for auditability.`, but the contract actually uses a nested mapping. That is to say, no explicit approvals list exists and the audit trail is generated by events. So setting `false` and deletion are equivalent operations.

<section-sep />

## `SupplySchedule`

---

### `ScheduleData`

!!! caution "Incorrect Comment"
    The comment on `totalSupplyMinted` is `// UTC Time - Total of supply minted`. The 'UTC Time - ' bit doesn't make sense; the variable is a quantity of tokens, not a timestamp.

---

### `setSynthetix`

!!! caution
    Although this function has a comment in the body `// emit event`, no event is actually emitted when the Synthetix address is updated.

---

### `getCurrentSchedule`

!!! info "An Inefficiency"
    This computes the current year by bounds-checking each year in a loop, but it could be done more simply with integer division.

---

### `_remainingSupplyFromPreviousYear`

???+ info "A Minor Inefficiency"
    In the function the result is actually computed as `max(0, lastYear.totalSupply - lastYear.totalSupplyMinted)`, which is redundant since the arguments are unsigned. Even if the minted supply could exceed the allocated supply, the result would overflow and the safe subtraction would revert the transaction.

---

### `checkAccountSchedule`

!!! todo "TODO: Investigate Efficiency"
    Hopefully this is probably not too inefficient as the array will mostly be trailing zeroes. Not sure if the RLP encoding represents such arrays more efficiently or not. Largely won't matter if it's just a view function being used by dapps, however.

---

### `appendVestingEntry`

???+ info "A Minor Note on Efficiency"
    Note that this function checks that the new vesting timestamp (`now + 52 weeks`) is after the last vesting entry's timestamp, if one exists. In most cases this requirement can't be violated, since `now` increases monotonically. In the worst case where multiple calls are made for a given account in a single block, they go through with the same timestamp, so only the first one will be accepted. But in this case, a user's last fee withdrawal will have been set, and `quantity` will be zero, which fails an earlier precondition.

    The function also needlessly recomputes `numVestingEntries`, which is already stored in the `scheduleLength` local.

---

### `removeRewardDistribution`

!!! info "A Point on Gas Consumption"
    Since this function must shift all later entries down to fill the gap from the one it removed, it could in principle consume an unbounded amount of gas. However, the number of entries will presumably always be very low.

---

<section-sep />

## `ExchangeRates`

---

### `updateXDRRate`

!!! caution "Stale XDR Price Recomputation"
    The `XDR` price is still recomputed even if the underlying prices are stale, or if the oracle is not updating any of the `XDR` participants. Due to this, `XDR`'s update timestamp does not necessarily reflect the timestamps of the underlying currencies. Unless every other price is stale, the price of the `XDR` cannot be stale, even if its constituent prices are.

---

### `setInversePricing`

!!! info "Redundant Precondition"
    Together the preconditions entail that $0 \lt \text{lowerLimit} \lt \text{entryPoint} \lt \text{upperLimit} \lt 2 \times \text{entryPoint}$.

    This means that the first precondition is redundant, as two of the others imply it.

---

### `removeInversePricing`

!!! caution
    The [`InversePriceConfigured`](ExchangeRates.md#inversepriceconfigured) event is still emitted even if the currency had no inverse index to delete.

---

<section-sep />

## `ProxyERC20`

!!! caution
    Although the `transfer()`, `approve()`, and `transferFrom()` functions properly set up the message sender, they do not forward ether to the target contract. Hence these funds could get stuck in the proxy, and the underlying functionality will not work properly if it expects ether. Such funds can be recovered by operating in `DELEGATECALL` mode and transferring the ether out with an appropriate underlying contract.

    It is conceivable that a future version of this proxy could potentially allow the underlying contract to transfer funds held in the proxy, which would eliminate this issue.

<section-sep />

## `Proxyable`

---

### `setIntegrationProxy`

!!! caution
    There is no `IntegrationProxyUpdated` event corresponding to [`ProxyUpdated`](Proxyable.md#proxyupdated).

---

<section-sep />

## `TokenFallbackCaller`

!!! bug
    The file docstring still refers to "Fee Token", which no longer exists.

<section-sep />
