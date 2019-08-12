# FeePool.sol

A contract for managing and claiming fees.

## Inherited Contracts

* Proxyable
* SelfDestructible
* LimitedSetup

## Referenced Contracts

* Synthetix
* SynthetixState
* SynthetixEscrow (rewardEscrow)
* FeePoolEternalStorage
* FeePoolState
* DelegateApprovals
* SafeMath
* SafeDecimalMath

## Structs

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

## Variables

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

## Functions

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
