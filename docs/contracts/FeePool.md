# FeePool

!!! info "Work In Progress"
    This still needs to be cleaned up and the rest of my notes migrated in.

## Description

**Old:** FeePool.sol: Understands fee information for Synthetix. As users transact, their fees are kept in 0xfeefeefee... and stored in XDRs. Allows users to claim fees they're entitled to.

A contract for managing and claiming fees. Note that most logic related to of the transfer fee related logic is superfluous, as the transfer fee rate is 0.

Sits behind a proxy.

* SIP-2: Eliminates fee penalty tiers and replaces them with a flat 100% penalty if above a target ratio.

This contract was updated as a part of [SIP-4](https://github.com/Synthetixio/SIPs/blob/master/SIPS/sip-4.md). As the contract requires fees to roll over through the entire fee window before incentive changes are actually felt, the system is a little unresponsive. To combat this, the fee window was reduced from six weeks to three weeks, which reduced the lag time between user action and the rewards actually being withdrawable.

!!! note
    The SIP says that the fee window was reduced to two weeks, but the actual contract code sets it to three.

!!! danger "Admin Function Events"
    Several admin functions should emit events, but they do not. Now that transfer fee logic has been removed, it may be possible to introduce these.

!!! bug "Lingering Debug Events"
    `LogInt` and `LogAddress` events remain in the source code and should be removed as they are unused.

**Source:** [FeePool.sol](https://github.com/Synthetixio/synthetix/blob/master/contracts/FeePool.sol)

<section-sep />

## Inheritance Graph

<inheritance-graph>
    ![graph](../img/graphs/FeePool.svg)
</inheritance-graph>

## Related Contracts

* \<\>[Proxy](Proxy.md) (through `Proxyable`)
* \<\>[RewardEscrow](RewardEscrow.md)
* \<\>[FeePoolEternalStorage](FeePoolEternalStorage.md) (back link: `State.associatedContract`)
* \<\>[FeePoolState](FeePoolState.md)
* \<\>[DelegateApprovals](DelegateApprovals.md) (back link: `State.associatedContract`)
* \<\>[Synth](Synth.md) (Note that the forward link only exists transiently in the `_payFees` function: a link to `XDR`s is always instantiated, in order to burn from the fee pool, and a link per destination currency to be minted)
* \<\>[Synthetix](Synthetix.md)
* \>[SynthetixState](SynthetixState.md)
* \<[Depot](Depot.md)

## Libraries

* [SafeMath](SafeMath.md) for uint
* [SafeDecimalMath](SafeDecimalMath.md) for uint

<section-sep />

## Structs

---

### `FeePeriod`

A record for a fee period, when it was opened, and the fees and rewards accrued within it. This information is maintained for the last several fee periods in [`recentFeePeriods`](#recentfeeperiods).

Field | Type | Description
------|------|------------
feePeriodId | `uint` | A serial id for fee periods which is incremented for each new fee period.
startingDebtIndex | `uint` | The length of [`SynthetixState.debtLedger`](SynthetixState.md#debtledger) at the time this fee period began.
startTime | `uint` | The current timestamp when this fee period began.
feesToDistribute | `uint` ([18 decimals](SafeDecimalMath.md)) | The total of fees to be distributed in this period, in XDRs. This increases when fees are collected in the current period or when unclaimed fees roll over from the oldest period to the second oldest. See [`feePaid`](#feepaid) and [`closeCurrentPeriod`](#closecurrentperiod).
feesClaimed | `uint` ([18 decimals](SafeDecimalMath.md) | The number of fees that have already been claimed during this period.
rewardsToDistribute | `uint` ([18 decimals](SafeDecimalMath.md) | The total of inflationary rewards to be distributed in this period, in SNX. This increases when new rewards are minted by [`Synthetix.mint`](Synthetix.md#mint)/[`rewardsMinted`](#rewardsminted), or when unclaimed rewards roll over from the oldest period to the second oldest ([`closeCurrentPeriod`](#closecurrentperiod)).
rewardsClaimed | `uint` ([18 decimals](SafeDecimalMath.md) | The quantity of inflationary rewards that have already been claimed during this period.

---

<section-sep />

## Variables

---

### `synthetix`

The main [`Synthetix`](Synthetix.md) contract.

**Type:** `Synthetix public`

---

### `synthetixState`

The associated [`SynthetixState`](SynthetixState.md) contract.

**Type:** `SynthetixState public`

---

### `rewardEscrow`

The [`RewardEscrow`](RewardEscrow.md) instance which holds inflationary rewards.

**Type:** `RewardEscrow public`

---

### `feePoolEternalStorage`

A key-value store ([FeePoolEternalStorage](FeePoolEternalStorage.md)) to allow values to be stored without upgrading anything.

**Type:** `FeePoolEternalStorage public`

---

### `exchangeFeeRate`

The fee fraction charged on a currency exchange, between 0 and 0.1.

**Type:** `uint public` ([18 decimals](SafeDecimalMath.md))

---

### `MAX_EXCHANGE_FEE_RATE`

[`exchangeFeeRate`](#exchangefeerate) cannot exceed this. Initialised to 10%.

!!! bug "Missing Bounds Check"
    That [`exchangeFeeRate`](#exchangefeerate) should not exceed this value is not actually checked in the [`setExchangeFeeRate`](#setexchangefeerate) function.

**Type:** `uint constant public` ([18 decimals](SafeDecimalMath.md))

**Value:** 0.1

---

### `rewardsAuthority`

The address with the authority to distribute rewards, which is the [`RewardsDistribution`](RewardsDistribution.md) contract.

**Type:** `address public`

---

### `feePoolState`

The [`FeePoolState`](FeePoolState.md) contract associated with this fee pool, which holds historical issuance data for the last several periods.

**Type:** `FeePoolState public`

---

### `delegates`

The address fo the [`DelegateApprovals`](DelegateApprovals.md) contract, used to allow delegation of fee claims.

**Type:** `DelegateApprovals public`

---

### `FEE_ADDRESS`

The address where fees are pooled as XDRs.

**Type:** `address constant public`

**Value:** [`0xfeEFEEfeefEeFeefEEFEEfEeFeefEEFeeFEEFEeF`](https://etherscan.io/address/0xfeEFEEfeefEeFeefEEFEEfEeFeefEEFeeFEEFEeF)

---

### `FEE_PERIOD_LENGTH`

This is the number of weekly fee periods that are tracked by the smart contracts, hence the length of the [`recentFeePeriods`](#recentfeeperiods) array.

This was reduced from 6 to 3 as part of [SIP-4](https://sips.synthetix.io/sips/sip-4), but note the inconsistency with the corresponding constant in [`FeePoolState`](FeePoolState.md#fee_period_length), which cannot be altered.

**Type:** `uint constant public`

**Value:** `3`

---

### `recentFeePeriods`

Stores [fee period information](#feeperiod) for the last three weeks, from newest to olders.

`recentFeePeriods[0]` is always the current fee period, which is modified by ongoing issuance and fee activity. Fees cannot be claimed from the current period, only from the closed periods at indexes `1` and `2`.

**Type:** `FeePeriod[FEE_PERIOD_LENGTH] public`

---

### `feePeriodDuration`

This is the minimum duration of a single fee period in seconds. In practice they may be slightly longer if [`closeCurrentFeePeriod`](#closecurrentfeeperiod) is not called immediately at the earliest valid moment.

Its value is one week, but it may be between [`MIN_FEE_PERIOD_DURATION`](#min_fee_period_duration) and [`MAX_FEE_PERIOD_DURATION`](#max_fee_period_duration) (1 to 60 days).

**Type:** `uint public`

!!! caution "Erroneous Comment"
    The comment on this variable says `It is required for the fee authority to roll over the periods`, but this is no longer true, as [`closeCurrentFeePeriod`](#closecurrentfeeperiod) is now callable by anyone.

---

### `MIN_FEE_PERIOD_DURATION`

The minimum value of [`feePeriodDuration`](#feeperiodduration).

**Type:** `uint public constant`

**Value:** `1 days`

---

### `MAX_FEE_PERIOD_DURATION`

The maximum value of [`feePeriodDuration`](#feeperiodduration).

**Type:** `uint public constant`

**Value:** `60 days`

---

### `TARGET_THRESHOLD`

A threshold that allows issuers to be undercollateralised by up to 10%. Users may claim fees if their [collateralisation ratio](Synthetix.md#collateralisationratio) is below the target [issuance ratio](SynthetixState.md#issuanceratio) plus 10%.

This is designed to allow users to have a little slack in case prices move quickly.

**Type:** `uint public`

!!! caution "Constant Case"
    Note that this is in CONSTANT_CASE even though it is not a constant. Its value may be changed by the owner calling [`setTargetThreshold`](#settargetthreshold).

!!! danger "Potential System Undercollateralisation"
    At 10%, `TARGET_THRESHOLD` in principle allows the system's total issued value to reach 110% percent of its supposed maximum.
    Moreover, the fact that this quantity is modifiable, and has no constraint on what value it can be changed to means that it could be set, for example, to 500%, and the Synthetix system would become a fractional reserve system.

---

### `LAST_FEE_WITHDRAWAL`

This string is used as part of a key for accessing account withdrawal timestamps from the [eternal storage contract](#feepooleternalstorage).

This is only used within  [`FeePool.getLastFeeWithdrawal`](FeePool.md#getlastfeewithdrawal) and [`FeePool.setLastFeeWithdrawal`](FeePool.md#setlastfeewithdrawal), where it is hashed together with the target address to obtain the correct key.

This must have the same value as [`FeePoolEternalStorage.LAST_FEE_WITHDRAWAL`](FeePoolEternalStorage.md#last_fee_withdrawal).

**Type:** `bytes32 constant`

**Value:** `"last_fee_withdrawal"`

---

<section-sep />

## Functions

---

### `constructor`

This initialises the various state contract addresses the fee pool knows about, along with its inherited [`SelfDestructible`](SelfDestructible.md), [`Proxyable`](Proxyable.md), and [`LimitedSetup`](LimitedSetup.md) instances.

This constructor also begins the first fee period, as it initialises the first fee period id to 1, and the first fee period start time to the construction time.

??? example "Details"
    **Signature**

    `constructor(address _proxy, address _owner, Synthetix _synthetix, FeePoolState _feePoolState, FeePoolEternalStorage _feePoolEternalStorage, ISynthetixState _synthetixState, ISynthetixEscrow _rewardEscrow, address _rewardsAuthority, uint _exchangeFeeRate) public`

    **Superconstructors**

    * [`Proxyable(_proxy, _owner)`](Proxyable.md#constructor)
    * [`SelfDestructible(_owner)`](SelfDestructible.md#constructor)
    * [`LimitedSetup(3 weeks)`](LimitedSetup.md#constructor)
    
    **Preconditions**

    * `_exchangeFeeRate` must be no greater than [`MAX_EXCHANGE_FEE_RATE`](#max_exchange_fee_rate).

---

### `appendAccountIssuanceRecord`

Records that an account issued or burnt synths in the fee pool state.

This function merely emits an event and passes through to [`FeePoolState.appendAccountIssuanceRecord`](FeePoolState.md#appendAccountIssuanceRecord) and is itself only invoked by [`Synthetix._appendAccountIssuanceRecord`](Synthetix.md#_appendaccountissuancerecord).

??? example "Details"
    **Signature**

    `appendAccountIssuanceRecord(address account, uint debtRatio, uint debtEntryIndex) external`

    **Modifiers**

    * [`onlySynthetix`](#onlysynthetix)

    **Emits**

    * [`IssuanceDebtRatioEntry(account, debtRatio, debtEntryIndex, recentFeePeriods[0].startingDebtIndex)`](#issuancedebtratioentry)

---

### `setExchangeFeeRate`

Allows the contract owner to set the [exchange fee rate](#exchangefeerate).

!!! bug "Missing Bounds Check"
    The docstring implies that the exchange fee rate cannot exceed 10%, but this is not checked in the function.

??? example "Details"
    **Signature**

    `setExchangeFeeRate(uint _exchangeFeeRate) external`

    **Modifiers**

    * [`Proxyable.optionalProxy_onlyOwner`](Proxyable.md#optionalproxy_onlyowner)

---

### `setRewardsAuthority`

Allows the contract owner to set the [rewards authority](#rewardsauthority).

??? example "Details"
    **Signature**

    `setRewardsAuthority(address _rewardsAuthority) external`

    **Modifiers**

    * [`Proxyable.optionalProxy_onlyOwner`](Proxyable.md#optionalproxy_onlyowner)

---

### `setFeePoolState`

Allows the contract owner to set the [`feePoolState`](#feepoolstate) contract address.

??? example "Details"
    **Signature**

    `setFeePoolState(FeePoolState, _feePoolState) external`

    **Modifiers**

    * [`Proxyable.optionalProxy_onlyOwner`](Proxyable.md#optionalproxy_onlyowner)

---

### `setDelegateApprovals`

Allows the contract owner to set the [`DelegateApprovals`](#delegates) contract address.

??? example "Details"
    **Signature**

    `setDelegateApprovals(DelegateApprovals _delegates) external`

    **Modifiers**

    * [`Proxyable.optionalProxy_onlyOwner`](Proxyable.md#optionalproxy_onlyowner)

---

### `setFeePeriodDuration`

Allows the contract owner to set the [fee period duration](#feeperiodduration).

??? example "Details"
    **Signature**

    `setFeePeriodDuration(uint _feePeriodDuration) external`

    **Modifiers**

    * [`Proxyable.optionalProxy_onlyOwner`](Proxyable.md#optionalproxy_onlyowner)

    **Preconditions**

    * `_feePeriodDuration` must be no less than [`MIN_FEE_PERIOD_DURATION`](#min_fee_period_duration).
    * `_feePeriodDuration` must be no greater than [`MAX_FEE_PERIOD_DURATION`](#max_fee_period_duration).

---

### `setSynthetix`

Allows the contract owner to set the [`Synthetix` contract address](#synthetix).

??? example "Details"
    **Signature**

    `setSynthetix(Synthetix _synthetix) external`

    **Modifiers**

    * [`Proxyable.optionalProxy_onlyOwner`](Proxyable.md#optionalproxy_onlyowner)

    **Preconditions**

    * `_synthetix` must not be the zero address.

---

### `setTargetThreshold`

Allows the contract owner to set the [collateralisation ratio target threshold](#target_threshold).

The function requires its input as an integral percentage point value, rather than as a fractional number. So in order to set [`TARGET_THRESHOLD`](#target_threshold) to 0.05, provide the argument `5`. There is no way of setting a threshold between whole number percentages.

!!! bug "Missing Bounds Check"
    This function does not constrain the input value. See the notes on the [`TARGET_THRESHOLD`](#target_threshold) for consequences of this if the owner chooses to set this to something large.

??? example "Details"
    **Signature**

    `setTargetThreshold(uint _percent) external`

    **Modifiers**

    * [`Proxyable.optionalProxy_onlyOwner`](Proxyable.md#optionalproxy_onlyowner)

    **Preconditions**

    * `_percent` must not be negative.

    !!! info "A Minor Inelegance"
        Note that this checks that a uint is non-negative. This check should be removed as it serves no purpose.

---

### `feePaid`

Allows the [`Synthetix._internalExchange`](Synthetix.md#_internalexchange) function to record that a fee was paid whenever an exchange between Synth flavours occurs.

Converts `amount` from `currencyKey` to a value in XDRs (if required) and then adds the value to the current period's pot of fees to be distributed.

???+ info "A Minor Note on Efficiency"
    This could be more efficient if this function only accepted values already converted to XDRs. `feePaid` throws away `currencyKey`, only using it for calling back to Synthetix to find the equivalent XDR value at current exchange rates.

    Further, the Synthetix contract already pre-computes the XDR value before passing it to the FeePool contract anyway, so the branch that actually converts the value can never be reached.

??? example "Details"
    **Signature**

    `feePaid(bytes32 currencyKey, uint amount) external`

    !!! caution "Naming"
        Be aware that although the name reads like it could be a predicate, this is actually an effectful function.

    **Modifiers**

    * [`onlySynthetix`](#onlysynthetix)

---

### `setRewardsToDistribute`

Adds a quantity of SNX to the current fee period's total of rewards to be distributed.

!!! caution "Potentially-Misleading Name"
    Although the name might imply otherwise, this function can't reduce or reset the amount of funds to be distributed, but only add to the existing pot.

??? example "Details"
    **Signature**

    `setRewardsToDistribute(uint amount) external`

    **Preconditions**

    * Either `msg.sender` or [`messageSender`](Proxyable.md#messagesender) must be the [rewards authority address](#rewardsauthority).

---

### `closeCurrentFeePeriod`

!!! todo
    Finish this.

* `closeCurrentFeePeriod()`: Only callable by the fee authority. Close the current fee period, and open the next one. The new `feePeriodId` is the previous one incremented by 1. The previously-recorded fee periods are shifted along and the last one is overwritten, though its unclaimed fees are merged into the penultimate fee period it was overwritten by. Note that the comment, "Take a snapshot of the total value of the system." at the end of this function is inaccurate. The new fee period `startingDebtIndex` is the length of [SynthetixState](SynthetixState.md)'s `debtLedger` at the time the fee period rolls over. Note that before a new minting event occurs this index will be one past the end of the ledger.

---

### `claimFees`

The message sender claims their fees in the currency specified.

This is equivalent to [`_claimFees(messageSender, currencyKey)`](#_claimFees).

??? example "Details"
    **Signature**

    `claimFees(bytes32 currencyKey) external returns (bool)`

    **Modifiers**

    * [`Proxyable.optionalProxy`](Proxyable.md#optionalproxy)

---

### `claimOnBehalf`

The message sender claims fees in a given currency for a specified address; the funds are remitted to that address, and not to the sender.

This function first checks with the [`DelegateApprovals`](DelegateApprovals.md) contract that the sender is approved to claim fees on behalf of the specified address, but is otherwise equivalent to [`_claimFees(claimingForAddress, currencyKey)`](#_claimFees).

??? example "Details"
    **Signature**

    `claimOnBehalf(address claimingForAddress, bytes32 currencyKey) external returns (bool)`

    **Modifiers**

    * [`Proxyable.optionalProxy`](Proxyable.md#optionalproxy)

    **Preconditions**

    * `messageSender` must be [an approved delegate](DelegateApprovals.md#approval) of `claimingForAddress`.

---

### `_claimFees`

!!! todo
    Finish this.

* `_claimFees(address claimingAddress, bytes32 currencyKey)`: Claim fees at the specified address in the specified currency. C-ratio must be within the bounds specified by the `feesClaimable` function -- i.e. less than the issuance ratio. MIGRATE

---

### `recoverTransferFees`

!!! todo
    Finish this.

---

### `importFeePeriod`

* `importFeePeriod(uint feePeriodIndex, uint feePeriodId, uint startingDebtIndex, uint startTime, uint feesToDistribute, uint feesClaimed, uint rewardsToDistribute, uint rewardsClaimed)`: Sets a particular fee period entry, but only during the three week setup period.

---

### `appendVestingEntry`

!!! todo
    Finish this.

---

### `approveClaimOnBehalf`

* `approveClaimOnBehalf(address account)`: Calls out to the [DelegateApprovals](DelegateApprovals.md) contract to set `account` as an approved claimant. Does not function if its argument is 0 (not much point to this), or if the `DelegateApprovals` contract address is 0 (not much point to this either).

---

### `removeClaimOnBehalf`

* `removeClaimOnBehalf(address account)`: Calls out to the [DelegateApprovals](DelegateApprovals.md) contract to remove `account` as an approved claimant. Does not function if the `DelegateApprovals address is 0 (not too much point here).

---

### `_recordFeePayment`

* `_recordFeePayment(uint xdrAmount) returns (uint)`: Called in `_claimFees`. Computes and returns the quantity of fees paid out (which pay be less than `xdrAmount` if there aren't enough fees in the pool), and updates the `feesClaimed` item for fee periods that the payment is withdrawn from. These withdrawals are preferentially performed from from the oldest to the newest fee period. For each period, starting at the oldest one: If there are unclaimed fees for this period, deduct the fees (up to the entire unclaimed quantity) from this quantity; if the fee period has been exhausted, proceed to the next period. Continue this until either the entire amount has been paid out, or there are no fees left. If at the end, the quantity withdrawn is less than `xdrAmount`, then the difference (which will just be rounding errors) is simply not paid out (slashed). That is, it pays not to be the last person to withdraw.

In pseudo-code:

```python
remaining = xdrAmount # The quantity to pay out.
paid = 0 # The quantity actually paid.

# Pay out fees from recent periods, from oldest to newest as they are exhausted.
for period in reversed(recentFeePeriods):
    # Skip to the next period if this one is exhausted.
    if period.unclaimedFees == 0:
        continue

    # Don't pay out too much.
    payable = min(period.unclaimedFees, remaining)

    paid += payable
    period.unclaimedFees -= payable
    remaining -= payable

return paid
```

For efficiency, the actual code returns immediately once `remaining` is 0, for efficiency.

!!! note
    The final lines of the loop body, `if (i == 0 && remainingToAllocate > 0) { remainingToAllocate = 0; }` are redundant and do nothing. We're already at the last loop iteration and the variable is not used subsequently. There might be another minor efficiency dividend to be had by not fetching `feesClaimed` from the state twice.

---

### `_recordRewardPayment`

* `_recordRewardPayment(uint snxAmount) returns (uint)`: Called in `_claimFees`. Logic is identical to `_recordFeePayment`, but the relevant quantities are in `SNX` and not `XDR`. The same efficiency notes apply.

---

### `_payFees`

* `_payFees(address account, uint xdrAmount, bytes32 destinationCurrencyKey)`: Pays a quantity of fees to a claiming address, converting it to a particular currency. The destination address cannot be 0, the fee pool itself, the fee pool's proxy, the Synthetix contract, or the fee address. Behaviour: fetch the `XDR` and destination currency Synth addresses from the Synthetix contract; burn the specified quantity of `XDR`s from the fee pool (safe subtraction so no overflowing here); convert the `XDR`s to an equivalent value of the destination currency and issue them into the destination account's wallet; trigger the ERC223 token fallback on the recipient address if it implements one.

---

### `_payRewards`

* `_payRewards(address account, uint snxAmount)`: Pays a quantity of rewards to a specified address. The address can't be the fee address, 0, the fee pool itself, the fee pool's proxy, or the synthetix contract. Calls out to [RewardEscrow](RewardEscrow.md)'s `appendVestingEntry` function, so the reward is escrowed for one year.

---

### `amountReceivedFromTransfer`

* `amountReceivedFromTransfer(uint value)`: Computes the number of tokens received by the recipient if `value` tokens are sent. Equivalent to `value / (1 + transferFeeRate)`.

---

### `exchangeFeeIncurred`

* `exchangeFeeIncurred(uint value)`: The same as `transferFeeIncurred`, but `value * exchangeFeeRate`.

---

### `amountReceivedFromExchange`

* `amountReceivedFromExchange(uint value)`: Computes the quantity received if `value` tokens are exchanged. Note that this is not the same as `amountReceivedFromTransfer`. The computation is `value * (1 - exchangeFeeRate)`, because the fee is deducted from the quantity rather than added on top.

---

### `totalFeesAvailable`

* `totalFeesAvailable(bytes32 currencyKey)`: Computes the total fees available in the system to be withdrawn, valued in terms of `currencyKey`. Simply sums the unclaimed fees over the recorded fee periods, except the first period, because these fees cannot be claimed yet.

---

### `totalRewardsAvailable`

* `totalRewardsAvailable()`: Similar logic as `totalFeesAvailable`.

---

### `feesAvailable`

* `feesAvailable(address account, bytes32 currencyKey)`: return the total of fees this user has accrued in previous fee periods. MIGRATE 

---

### `feesClaimable`

* `feesClaimable(address account)`: true iff the collateralisation ratio of this account is less than the target ratio plus 10% of the ratio or so. This function code could be made more concise. The logic allows fees to be withdrawable if a user's ratio is less than Synthetix.issuanceRatio * (1 + TARGET_THRESHOLD). The same result could in theory be met by just adjusting the issuance ratio, except that this system also allows the collateralisation ratio to be set to any value. NOTE: Name sounds like it could be returning a quantity of fees claimable, which is actually `feesAvailable`. It's actually a predicate, so the naming of these functions is a bit ambiguous.

---

### `feesByPeriod`

* `feesByPeriod(address account)`: MIGRATE
  Note: XDRs existing seems to be necessary for a user to have nonzero ownership percentages, so the second
  guard in this function looks redundant, or should be checked earlier. It's likely to be an exceedingly rare case anyway.

---

### `_feesAndRewardsFromPeriod`

* `_feesAndRewardsFromPeriod(uint period, uint ownershipPercentage, uint debtEntryIndex)`: MIGRATE

---

### `_effectiveDebtRatioForPeriod`

* `_effectiveDebtRatioForPeriod(uint closingDebtIndex, uint ownershipPercentage, uint debtEntryIndex)`: Logic seems screwy here?... TODO: CHECK ME. NOTE: Off-by-one error in the guard. The condition should be `closingDebtIndex >= synthetixState.debtLedgerLength()`.

---

### `effectiveDebtRatioForPeriod`

* `effectiveDebtRatioForPeriod(address account, uint period)`: MIGRATE NOTE: missing docstring.

---

### `getLastFeeWithdrawal`

* `getLastFeeWithdrawal(address _claimingAddress)`: Returns from [FeePoolEternalStorage](FeePoolEternalStorage.md) the id of the fee period during which the given address last withdrew fees.

---

### `getPenaltyThresholdRatio`

* `getPenaltyThresholdRatio()`: Computes the target issuance ratio plus a bit of slop. Is equivalent to `synthetixState.issuanceRatio * (1 + TARGET_THRESHOLD)`. NOTE: the address of synthetixState is computed with the indirection `synthetix.synthetixState()`, but the fee pool contract already has a copy of the address in its own `synthetixState` variable.

---

### `_setLastFeeWithdrawal`

* `_setLastFeeWithdrawal(address _claimingAddress, uint _feePeriodID)`: Stores into [FeePoolEternalStorage](FeePoolEternalStorage.md) the id of the fee period during which this address last withdrew fees.

!!! note
     `_setLastFeeWithdrawal` is erroneously in the modifiers section, should probably be next to `getLastFeeWithdrawal`.

---

<section-sep />

## Modifiers

---

### `onlySynthetix`

Reverts the transaction if `msg.sender` is not the [`synthetix`](#synthetix) address.

---

### `notFeeAddress`

Reverts the transaction if `msg.sender` is not the [fee address](#fee_address).

---

<section-sep />

## Events

---

### `IssuanceDebtRatioEntry`

---

### `TransferFeeUpdated`

---

### `ExchangeFeeUpdated`

---

### `FeePeriodDurationUpdated`

---

### `FeePeriodClosed`

---

### `FeesClaimed`

---

<section-sep />
