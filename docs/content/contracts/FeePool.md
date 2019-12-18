# FeePool

## Description

??? info "Work In Progress"

    > preamble

    **Old:** FeePool.sol: Understands fee information for Synthetix. As users transact, their fees are kept in 0xfeefeefee... and stored in XDRs. Allows users to claim fees they're entitled to.

    A contract for managing and claiming fees. Note that most logic related to of the transfer fee related logic is superfluous, as the transfer fee rate is 0.

    > Proxy and State Contracts

    Sits behind a proxy.

    ### Exchange Fees

    > Exchange fees, the fee pool, and XDRs.

    ### Inflationary Rewards

    > Rewards vs Fees, RewardsDistribution, and SupplySchedule

    ### Fee Periods

    > Fee Periods, issuance and burning

    This contract was updated as a part of [SIP-4](https://github.com/Synthetixio/SIPs/blob/master/SIPS/sip-4.md). As the contract requires fees to roll over through the entire fee window before incentive changes are actually felt, the system is a little unresponsive. To combat this, the fee window was reduced from six weeks to three weeks, which reduced the lag time between user action and the rewards actually being withdrawable.

    !!! note
        The SIP says that the fee window was reduced to two weeks, but the actual contract code sets it to three.

    ### Claiming Fees

    > The process

    > Fee threshold and issuance vs collateralisation ratio.

    * SIP-2: Eliminates fee penalty tiers and replaces them with a flat 100% penalty if above a target ratio.

**Source:** [FeePool.sol](https://github.com/Synthetixio/synthetix/blob/master/contracts/FeePool.sol)

## Architecture

---

### Inheritance Graph

<centered-image>
    ![FeePool inheritance graph](../img/graphs/FeePool.svg)
</centered-image>

---

### Related Contracts

<centered-image>
    ![FeePool architecture graph](../img/graphs/FeePool-architecture.svg)
</centered-image>

??? example "Details"
_ [`Proxy`](Proxy.md): The fee pool, being [`Proxyable`](Proxyable.md), sits behind a `CALL`-style proxy for upgradeability.
_ [`Synthetix`](Synthetix.md): The fee pool uses the main Synthetix contract to convert between flavours of synths when manipulating fees in XDRs or otherwise, and to retrieve account collateralisation ratios.
_ [`SynthetixState`](SynthetixState.md): The fee pool retrieves the global issuance ratio, and queries the debt ledger directly from the Synthetix state contract.
_ [`Synth`](Synth.md): The fee pool, retrieving their addresses from the Synthetix contract, directly burns and issues synths when transferring fees and converting between flavours. The address of the XDR Synth contract is of particular importance, since fees are denominated in XDRs when they are sitting in the pool, but paid out in a flavour of the user's choice. Synths themselves do not know the fee pool address directly, but ask the fee pool's proxy for its target.
_ [`FeePoolState`](FeePoolState.md): The fee pool state contract holds the details of each user's most recent issuance events: when they issued and burnt synths, and their value.
_ [`FeePoolEternalStorage`](FeePoolEternalStorage): A storage contact that holds the last fee withdrawal time for each account.
_ [`DelegateApprovals`](DelegateApprovals): A storage contract containing addresses to which the right to withdraw fees has been delegated by another account, for example to allow hot wallets to withdraw fees.
_ [`RewardEscrow`](RewardEscrow.md): The contract into which inflationary SNX rewards are paid by the fee pool so that they can be escrowed for a year after being claimed.
_ [`RewardsDistribution`](RewardsDistribution.md): This contract, in the guise of the [`rewardsAuthority`](#rewardsauthority), distributes allocations from the inflationary supply to various recipients.
_ [`Depot`](Depot.md): Allows users to exchange between Synths, SNX, and Ether. The Depot uses the fee pool to know what transfer fees were being incurred on its transfers, although the transfer fee has been nil since before [SIP-19](https://sips.synthetix.io/sips/sip-19).

---

### Libraries

- [SafeMath](SafeMath.md) for uint
- [SafeDecimalMath](SafeDecimalMath.md) for uint

---

## Structs

---

### `FeePeriod`

A record for a fee period, when it was opened, and the fees and rewards accrued within it. This information is maintained for the last several fee periods in [`recentFeePeriods`](#recentfeeperiods).

| Field               | Type                                       | Description                                                                                                                                                                                                                                                                                                                       |
| ------------------- | ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| feePeriodId         | `uint`                                     | A serial id for fee periods which is incremented for each new fee period.                                                                                                                                                                                                                                                         |
| startingDebtIndex   | `uint`                                     | The length of [`SynthetixState.debtLedger`](SynthetixState.md#debtledger) at the time this fee period began.                                                                                                                                                                                                                      |
| startTime           | `uint`                                     | The current timestamp when this fee period began.                                                                                                                                                                                                                                                                                 |
| feesToDistribute    | `uint` ([18 decimals](SafeDecimalMath.md)) | The total of fees to be distributed in this period, in XDRs. This increases when fees are collected in the current period or when unclaimed fees roll over from the oldest period to the second oldest. See [`feePaid`](#feepaid) and [`closeCurrentPeriod`](#closecurrentperiod).                                                |
| feesClaimed         | `uint` ([18 decimals](SafeDecimalMath.md)) | The number of fees that have already been claimed during this period.                                                                                                                                                                                                                                                             |
| rewardsToDistribute | `uint` ([18 decimals](SafeDecimalMath.md)) | The total of inflationary rewards to be distributed in this period, in SNX. This increases when new rewards are minted by [`Synthetix.mint`](Synthetix.md#mint)/[`rewardsMinted`](#rewardsminted), or when unclaimed rewards roll over from the oldest period to the second oldest ([`closeCurrentPeriod`](#closecurrentperiod)). |
| rewardsClaimed      | `uint` ([18 decimals](SafeDecimalMath.md)) | The quantity of inflationary rewards that have already been claimed during this period.                                                                                                                                                                                                                                           |

---

## Constants

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

### `LAST_FEE_WITHDRAWAL`

This string is used as part of a key for accessing account withdrawal timestamps from the [eternal storage contract](#feepooleternalstorage).

This is only used within [`FeePool.getLastFeeWithdrawal`](FeePool.md#getlastfeewithdrawal) and [`FeePool.setLastFeeWithdrawal`](FeePool.md#setlastfeewithdrawal), where it is hashed together with the target address to obtain the correct key.

This must have the same value as [`FeePoolEternalStorage.LAST_FEE_WITHDRAWAL`](FeePoolEternalStorage.md#last_fee_withdrawal).

**Type:** `bytes32 constant`

**Value:** `"last_fee_withdrawal"`

---

### `MAX_EXCHANGE_FEE_RATE`

[`exchangeFeeRate`](#exchangefeerate) cannot exceed this. Initialised to 10%.

**Type:** `uint constant public` ([18 decimals](SafeDecimalMath.md))

**Value:** 0.1

---

### `MAX_FEE_PERIOD_DURATION`

The maximum value of [`feePeriodDuration`](#feeperiodduration).

**Type:** `uint public constant`

**Value:** `60 days`

---

### `MIN_FEE_PERIOD_DURATION`

The minimum value of [`feePeriodDuration`](#feeperiodduration).

**Type:** `uint public constant`

**Value:** `1 days`

---

### `TARGET_THRESHOLD`

A threshold that allows issuers to be undercollateralised by up to 10%. Users may claim fees if their [collateralisation ratio](Synthetix.md#collateralisationratio) is below the target [issuance ratio](SynthetixState.md#issuanceratio) plus 10%.

This is designed to allow users to have a little slack in case prices move quickly.

**Type:** `uint public`

---

## Variables

---

### `delegates`

The address fo the [`DelegateApprovals`](DelegateApprovals.md) contract, used to allow delegation of fee claims.

**Type:** `DelegateApprovals public`

---

### `exchangeFeeRate`

The fee fraction charged on a currency exchange, between 0 and 0.1.

**Type:** `uint public` ([18 decimals](SafeDecimalMath.md))

---

### `feePeriodDuration`

This is the minimum duration of a single fee period in seconds. In practice they may be slightly longer if [`closeCurrentFeePeriod`](#closecurrentfeeperiod) is not called immediately at the earliest valid moment.

Its value is one week, but it may be between [`MIN_FEE_PERIOD_DURATION`](#min_fee_period_duration) and [`MAX_FEE_PERIOD_DURATION`](#max_fee_period_duration) (1 to 60 days).

**Type:** `uint public`

---

### `feePoolEternalStorage`

The [`FeePoolEternalStorage`](FeePoolEternalStorage.md) key-value store that holds account last withdrawal times.

**Type:** `FeePoolEternalStorage public`

---

### `feePoolState`

The [`FeePoolState`](FeePoolState.md) contract associated with this fee pool, which holds historical issuance data for the last several periods.

**Type:** `FeePoolState public`

---

### `rewardsAuthority`

The address with the authority to distribute rewards, which is the [`RewardsDistribution`](RewardsDistribution.md) contract.

**Type:** `address public`

---

### `rewardEscrow`

The [`RewardEscrow`](RewardEscrow.md) instance which holds inflationary rewards.

**Type:** `RewardEscrow public`

---

### `recentFeePeriods`

Stores [fee period information](#feeperiod) for the last three weeks, from newest to olders.

`recentFeePeriods[0]` is always the current fee period, which is modified by ongoing issuance and fee activity. Fees cannot be claimed from the current period, only from the closed periods at indexes `1` and `2`.

**Type:** `FeePeriod[FEE_PERIOD_LENGTH] public`

---

### `synthetix`

The main [`Synthetix`](Synthetix.md) contract.

**Type:** `Synthetix public`

---

### `synthetixState`

The associated [`SynthetixState`](SynthetixState.md) contract.

**Type:** `SynthetixState public`

---

## Constructor

---

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

## Views

---

### `amountReceivedFromTransfer`

Computes the number of Synths received by the recipient if a certain quantity is sent.

As of [SIP-19](https://sips.synthetix.io/sips/sip-19), this is just the identity function, since there are no longer any transfer fees. It is only used by the [`Depot`](Depot.md) contract.

??? example "Details"
**Signature**

    `amountReceivedFromTransfer(uint value) external view returns (uint)`

---

### `amountReceivedFromExchange`

Computes the quantity received if a quantity of Synths is exchanged into another flavour. The amount received is the quantity sent minus the [exchange fee](#exchangefeeincurred), as per the logic in [`Synthetix._internalExchange`](Synthetix.md#_internalexchange).

??? example "Details"
**Signature**

    `amountReceivedFromExchange(uint value) external view returns (uint)`

---

### `effectiveDebtRatioForPeriod`

Given an account and an index into [`recentFeePeriods`](#recentfeeperiods), this function computes the percentage of total debt ownership of the account at the end of that period.

This uses [`_effectiveDebtRatioForPeriod`](#_effectiveDebtRatioForPeriod), where the start index and ownership percentage are computed with [`FeePoolState.applicableIssuanceData`](FeePoolState.md#applicableissuancedata), and the end index is one before the beginnging of the next period. Hence this function disallows querying the debt for the current period.

In principle a future version could support the current fee period by using the last debt ledger entry as the end index.

??? example "Details"
**Signature**

    `effectiveDebtRatioForPeriod(address account, uint period) external view returns (uint)`

    **Preconditions**

    * `period` must not be 0, as the current fee period has not closed.
    * `period` must not exceed [`FEE_PERIOD_LENGTH`](#fee_period_length).

---

### `exchangeFeeIncurred`

Returns the fee charged on an exchange of a certain quantity of Synths into another flavour. This is simply the input multiplied by [`exchangeFeeRate`](#exchangeFeeRate).

??? example "Details"
**Signature**

    `exchangeFeeIncurred(uint value) public view returns (uint)`

---

### `feesAvailable`

Return the total of fees and rewards available to be withdrawn by this account. The result is reported as a `[fees, rewards]` pair denominated in the requested Synth flavour and SNX, respectively.

This is the total of fees accrued in completed periods, so is simply the the sum over an account's [`feesByPeriod`](#feesbyperiod) not including the current period.

??? example "Details"
**Signature**

    `feesAvailable(address account, bytes32 currencyKey) public view returns (uint, uint)`

---

### `feesByPeriod`

Returns an array of [`FEE_PERIOD_LENGTH`](#fee_period_length) `[fees, rewards]` pairs owed to an account for each [recent fee period](#recentfeeperiods) (including the current one). Fees are denominated in XDRs and rewards in SNX.

To compute this, for each period from oldest to newest, find the [latest issuance event this account performed before the close of this period](FeePoolState.md#applicableissuancedata), and use it to derive the owed [fees and rewards](#_feesandrewardsfromperiod) for that period.

Note that a single issuance event can result in fees accruing for several fee periods, if the issuer does not claim their fees in one or more periods.

Periods where the user has already withdrawn since that period closed are skipped, producing `[0,0]` entries.

??? example "Details"
**Signature**

    `feesByPeriod(address account) public view returns (uint[2][FEE_PERIOD_LENGTH] memory results)`

---

### `feesClaimable`

This is a predicate, returning true iff a particular account is permitted to claim any fees it has accrued.

A account is able to claim fees if its [collateralisation ratio](Synthetix.md#collateralisationratio) is less than 110% of the [global issuance ratio](SynthetixState.md#issuanceratio).

??? example "Details"
**Signature**

    `feesClaimable(address account) public view returns (bool)`

---

### `getLastFeeWithdrawal`

Returns from [`FeePoolEternalStorage`](FeePoolEternalStorage.md) the id of the fee period during which the given address last withdrew fees.

??? example "Details"
**Signature**

    `getLastFeeWithdrawal(address _claimingAddress) public view returns (uint)`

---

### `getPenaltyThresholdRatio`

Returns the collateralisation level a user can reach before they cannot claim fees. This is simply [`SynthetixState.issuanceRatio *`](SynthetixState.md#issuanceratio) [`(1 + TARGET_THRESHOLD)`](#target_threshold). The result is returned as a [18-decimal fixed point number](SafeDecimalMath.md).

??? example "Details"
**Signature**

    `getPenaltyThresholdRatio() public view returns (uint)`

---

### `totalFeesAvailable`

Computes the total fees available to be withdrawn, valued in terms of `currencyKey`. This simply sums the unclaimed fees over [`recentFeePeriods`](#recentfeeperiods) except those from the current period, because they cannot yet be claimed.

??? example "Details"
**Signature**

    `totalFeesAvailable(bytes32 currencyKey) external view returns (uint)`

---

### `totalRewardsAvailable`

Computes the total SNX rewards available to be withdrawn. This simply sums the unclaimed rewards over [`recentFeePeriods`](#recentfeeperiods) except those from the current period, because they cannot yet be claimed.

??? example "Details"
**Signature**

    `totalRewardsAvailable() external view returns (uint)`

---

## Mutative Functions

---

### `approveClaimOnBehalf`

Approves an account as a fee claimant for the sender in the [`DelegateApprovals`](DelegateApprovals.md#setapproval) contract.

??? example "Details"
**Signature**

    `approveClaimOnBehalf(address account) public`

    **Modifiers**

    * [`Proxyable.optionalProxy`](Proxyable.md#optionalproxy)

    **Preconditions**

    * The [`delegates`](#delegates) address must not be zero.
    * `account` must not be zero.

---

### `claimFees`

The message sender claims their fees in `sUSD`.

This is equivalent to [`_claimFees(messageSender)`](#_claimfees).

??? example "Details"
**Signature**

    `claimFees() external returns (bool)`

    **Modifiers**

    * [`Proxyable.optionalProxy`](Proxyable.md#optionalproxy)

---

### `claimOnBehalf`

The message sender claims fees in `sUSD` for a specified address; the funds are remitted to that address, and not to the sender.

This function first checks with the [`DelegateApprovals`](DelegateApprovals.md) contract that the sender is approved to claim fees on behalf of the specified address, but is otherwise equivalent to [`_claimFees(claimingForAddress)`](#_claimfees).

??? example "Details"
**Signature**

    `claimOnBehalf(address claimingForAddress) external returns (bool)`

    **Modifiers**

    * [`Proxyable.optionalProxy`](Proxyable.md#optionalproxy)

    **Preconditions**

    * `messageSender` must be [an approved delegate](DelegateApprovals.md#approval) of `claimingForAddress`.

---

### `closeCurrentFeePeriod`

If the current fee period has been open for longer than [`feePeriodDuration`](#feeperiodduration), then anyone may call this function to close it and open a new one.

The new fee period is added to the beginning of the [`recentFeePeriods`](#recentfeeperiods) list, and the last one is discarded. Any unclaimed fees from the last fee period roll over into the penultimate fee period.

The new fee period's [`feePeriodId`](#feeperiod) is the previous id incremented by 1, and its [`startingDebtIndex`](#feeperiod) is the length of [`SynthetixState.debtLedger`](SynthetixState.md#debtledger) at the time the fee period rolls over. Note that before a new minting event occurs this index will be one past the end of the ledger.

??? example "Details"
**Signature**

    `closeCurrentFeePeriod() external`

    **Preconditions**

    * The start time of the current fee period must have been at least [`feePeriodDuration`](#feeperiodduration) seconds in the past.

    **Emits**

    * [`FeePeriodClosed(closedFeePeriodId)`](#feeperiodclosed)

---

### `removeClaimOnBehalf`

Disapproves an account as a fee claimant for the sender in the [`DelegateApprovals`](DelegateApprovals.md#withdrawapproval) contract.

??? example "Details"
**Signature**

    `removeClaimOnBehalf(address account) public`

    **Modifiers**

    * [`Proxyable.optionalProxy`](Proxyable.md#optionalproxy)

    **Preconditions**

    * The [`delegates`](#delegates) address must not be zero.

---

## Owner Functions

---

### `appendVestingEntry`

Allows the contract owner to escrow SNX rewards for particular accounts. The rewards are escrowed for one year.

The SNX is deposited into the [`RewardEscrow`](RewardEscrow.md) contract from the sender using the ERC20 transferFrom function. The tokens are then escrowed on behalf of the targeted account with [`RewardEscrow.appendVestingEntry`](RewardEscrow.md#appendvestingentry).

??? example "Details"
**Signature**

    `appendVestingEntry(address account, uint quantity) public`

    **Modifiers**

    * [`Proxyable.optionalProxy_onlyOwner`](Proxyable.md#optionalproxy_onlyowner)

---

### `importFeePeriod`

During the setup period, allowed the contract owner to set a particular fee period entry in [`recentFeePeriods`](#recentfeeperiods) in order to migrate from a previous contract version.

??? example "Details"
**Signature**

    `importFeePeriod(uint feePeriodIndex, uint feePeriodId, uint startingDebtIndex, uint startTime, uint feesToDistribute, uint feesClaimed, uint rewardsToDistribute, uint rewardsClaimed) public`

    **Modifiers**

    * [`Proxyable.optionalProxy_onlyOwner`](Proxyable.md#optionalproxy_onlyowner)
    * [`LimitedSetup.onlyDuringSetup`](LimitedSetup.md#onlyduringsetup)

---

### `setDelegateApprovals`

Allows the contract owner to set the [`DelegateApprovals`](#delegates) contract address.

??? example "Details"
**Signature**

    `setDelegateApprovals(DelegateApprovals _delegates) external`

    **Modifiers**

    * [`Proxyable.optionalProxy_onlyOwner`](Proxyable.md#optionalproxy_onlyowner)

---

### `setExchangeFeeRate`

Allows the contract owner to set the [exchange fee rate](#exchangefeerate).

??? example "Details"
**Signature**

    `setExchangeFeeRate(uint _exchangeFeeRate) external`

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

### `setFeePoolState`

Allows the contract owner to set the [`feePoolState`](#feepoolstate) contract address.

??? example "Details"
**Signature**

    `setFeePoolState(FeePoolState, _feePoolState) external`

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

??? example "Details"
**Signature**

    `setTargetThreshold(uint _percent) external`

    **Modifiers**

    * [`Proxyable.optionalProxy_onlyOwner`](Proxyable.md#optionalproxy_onlyowner)

    **Preconditions**

    * `_percent` must not be negative.

---

## Restricted Functions

---

### `appendAccountIssuanceRecord`

Records that an account issued or burnt synths in the fee pool state.

This function merely emits an event and passes through to [`FeePoolState.appendAccountIssuanceRecord`](FeePoolState.md#appendAccountIssuanceRecord) and is itself only invoked by [`Synthetix._appendAccountIssuanceRecord`](Synthetix.md#_appendaccountissuancerecord).

The `debtRatio` argument is a [27-decimal fixed point number](SafeDecimalMath.md).

??? example "Details"
**Signature**

    `appendAccountIssuanceRecord(address account, uint debtRatio, uint debtEntryIndex) external`

    **Modifiers**

    * [`onlySynthetix`](#onlysynthetix)

    **Emits**

    * [`IssuanceDebtRatioEntry(account, debtRatio, debtEntryIndex, recentFeePeriods[0].startingDebtIndex)`](#issuancedebtratioentry)

---

### `feePaid`

Allows the [`Synthetix._internalExchange`](Synthetix.md#_internalexchange) function to record that a fee was paid whenever an exchange between Synth flavours occurs.

Converts `amount` from `currencyKey` to a value in XDRs (if required) and then adds the value to the current period's pot of fees to be distributed.

??? example "Details"
**Signature**

    `feePaid(bytes32 currencyKey, uint amount) external`

    **Modifiers**

    * [`onlySynthetix`](#onlysynthetix)

---

### `setRewardsToDistribute`

Adds a quantity of SNX to the current fee period's total of rewards to be distributed.

??? example "Details"
**Signature**

    `setRewardsToDistribute(uint amount) external`

    **Preconditions**

    * Either `msg.sender` or [`messageSender`](Proxyable.md#messagesender) must be the [rewards authority address](#rewardsauthority).

---

## Internal Functions

---

### `_claimFees`

Claims fees and rewards owed to the specified address.

The account's collateralisation ratio must be less than the [issuance ratio](SynthetixState.md#issuanceratio), plus the [target threshold](#target_threshold), as specified by the [`feesClaimable`](#feesclaimable) function. The quantity of fees and rewards owed is computed by [`feesAvailable`](#feesavailable).

Upon invocation, this function updates the account's [last fee withdrawal time](#_setlastfeewithdrawal), and removes the claimed [fees](#_recordFeePayment) and [rewards](#_recordRewardPayment) from the pool.
Fees are paid into the claiming address [in the specified currency](#_payFees), while the rewards are [escrowed](#_payRewards) on behalf of the claiming address in the [`RewardEscrow`](#rewardescrow) contract for one year.

The return value is always true if the transaction was not reverted.

??? example "Details"
**Signature**

    `_claimFees(address claimingAddress) internal returns (bool)`

    **Preconditions**

    * The user's [collateralisation ratio](Synthetix.md#collateralisationratio) must be below the threshold, as per [`feesClaimable`](#feesclaimable).
    * The user must have a positive value of fees or rewards available to claim.

    **Emits**

    * [`FeesClaimed(claimingAddress, feesPaid, rewardsPaid)`](#feesclaimed) (`feesPaid` is denominated in XDRs, `rewardsPaid` in SNX)

---

### `_effectiveDebtRatioForPeriod`

Given entry and exit indices into the debt ledger, and a percentage of total debt ownership at the entry index, this function computes the adjusted ownership percentage at the exit index. This percentage changes due to fluctuations in Synth prices and total supply.

If $\Delta_i$ is the value of the $i^{th}$ entry in the [debt ledger](SynthetixState.md#debtledger) and $\omega$ is the provided debt ownership percentage, then the result of this function is:

$$
\omega \frac{\Delta_\text{exit}}{\Delta_\text{entry}}
$$

See [`Synthetix._addToDebtRegister`](Synthetix.md#_addToDebtRegister) for details of the debt ownership percentage adjustment.

??? example "Details"
**Signature**

    `_effectiveDebtRatioForPeriod(uint closingDebtIndex, uint ownershipPercentage, uint debtEntryIndex) internal view returns (uint)`

---

### `_feesAndRewardsFromPeriod`

Computes the fees (in XDRs) and rewards (in SNX) owed at the end of a recent fee period given an entry index and the percentage of total system debt owned.

- `period` is an index into the [`recentFeePeriods`](#recentfeeperiods) array, thus 0 corresponds with the current period.
- `debtEntryIndex` should be an index into the debt ledger which was added before the close of the specified fee period.
- `ownershipPercentage` should be the percentage of the account's debt ownership at that `debtEntryIndex`. This is a [27-decimal fixed point number](SafeDecimalMath.md).

??? example "Details"
**Signature**

    `_feesAndRewardsFromPeriod(uint period, uint ownershipPercentage, uint debtEntryIndex) internal returns (uint, uint)`

---

### `_payFees`

Pays a quantity of fees in a desired Synth flavour to a claiming address.

The quantity is specified in XDRs, which is burnt from the fee pool, and an [equivalent value](Synthetix.md#effectivevalue) in the desired flavour is issued into the destination address.

??? example "Details"
**Signature**

    `_payFees(address account, uint xdrAmount, bytes32 destinationCurrencyKey) internal`

    **Modifiers**

    * [`notFeeAddress(account)`](#notfeeaddress)

    **Preconditions**

    * `account` can't be the fee address.
    * `account` can't be 0.
    * `account` can't be the FeePool contract itself.
    * `account` can't be the fee pool's proxy.
    * `account` can't be the Synthetix contract.

---

### `_payRewards`

Pays a quantity of rewards to a specified address, escrowing it for one year with [`RewardEscrow.appendVestingEntry`](RewardEscrow.md#appendvestingentry).

??? example "Details"
**Signature**

    `_payRewards(address account, uint snxAmount) internal`

    **Modifiers**

    * [`notFeeAddress(account)`](#notfeeaddress)

    **Preconditions**

    * `account` can't be the fee address.
    * `account` can't be 0.
    * `account` can't be the FeePool contract itself.
    * `account` can't be the fee pool's proxy.
    * `account` can't be the Synthetix contract.

---

### `_recordFeePayment`

Claims a quantity of fees from the [recent fee periods](#recentfeeperiods).

Fees are deducted from each [period's unclaimed fees](#feeperiod) in turn from the oldest to the most recent closed period as each is exhausted until either the entire quantity has been met, or the current fee period is reached.

As fees are not paid out from the current period, if there is any quantity left to be paid after all closed periods have been exhausted, it is simply ignored. Hence any losses due to rounding errors come out of the claim of the last person to claim. The function returns the quantity of fees actually claimed, which may be less than `xdrAmount` in this case.

This is only called in `_claimFees`.

In pseudo-code:

```python
remaining = xdrAmount # The quantity to pay out.
paid = 0 # The quantity actually paid.

# Pay out fees from recent periods, from oldest to newest as they are exhausted.
# Don't traverse the current fee period.
for each closed period in reversed(recentFeePeriods):
    unclaimedFees = period.feesToDistribute - period.feesClaimed
    # Skip to the next period if this one is exhausted.
    if unclaimedFees == 0:
        continue

    # Don't pay out too much.
    payable = min(unclaimedFees, remaining)

    paid += payable
    period.feesClaimed += payable
    remaining -= payable

return paid
```

??? example "Details"
**Signature**

    `_recordFeePayment(uint xdrAmount) internal returns (uint)`:

---

### `_recordRewardPayment`

Claims a quantity of SNX rewards from the [recent fee periods](#recentfeeperiods). This is only called in `_claimFees`.

Its logic is identical to [`_recordFeePayment`](#_recordfeepayment), except that the relevant quantities are in `SNX`, and are claimed from [`rewardsClaimed`](#feeperiod).

??? example "Details"
**Signature**

    `_recordRewardPayment(uint snxAmount) internal returns (uint)`:

---

### `_setLastFeeWithdrawal`

Stores into [FeePoolEternalStorage](FeePoolEternalStorage.md) the id of the fee period during which this address last withdrew fees.

??? example "Details"
**Signature**

    `_setLastFeeWithdrawal(address _claimingAddress, uint _feePeriodID) internal`

---

## Modifiers

---

### `notFeeAddress`

Reverts the transaction if `account` is the [fee address](#fee_address).

**Signature:** `notFeeAddress(address account)`

---

### `onlySynthetix`

Reverts the transaction if `msg.sender` is not the [`synthetix`](#synthetix) address.

---

## Events

---

### `ExchangeFeeUpdated`

Records that the fee for exchanging between Synths was [updated](#setexchangefee).

This event is emitted from the FeePool's [proxy](Proxy.md#_emit) with the `emitExchangeFeeUpdated` function.

**Signature:** `ExchangeFeeUpdated(uint newFeeRate)`

---

### `FeesClaimed`

Records that an account [claimed](#_claimfees) the fees and rewards owed to them.

This event is emitted from the FeePool's [proxy](Proxy.md#_emit) with the `emitFeesClaimed` function.

**Signature:** `FeesClaimed(address account, uint xdrAmount, uint snxRewards)`

---

### `FeePeriodDurationUpdated`

Records that the duration of a single fee period was [updated](#setfeeperiodduration).

This event is emitted from the FeePool's [proxy](Proxy.md#_emit) with the `emitFeePeriodDurationUpdated` function.

**Signature:** `FeePeriodDurationUpdated(uint newFeePeriodDuration)`

---

### `IssuanceDebtRatioEntry`

Records that a new account issuance record was [appended](#appendaccountissuancerecord) to the account's issuance ledger in [`FeePoolState`](FeePoolState.md#appendaccountissuancerecord).

This event is emitted from the FeePool's [proxy](Proxy.md#_emit) with the `emitIssuanceDebtRatioEntry` function.

**Signature:** `IssuanceDebtRatioEntry(address indexed account, uint debtRatio, uint debtEntryIndex, uint feePeriodStartingDebtIndex)`

---
