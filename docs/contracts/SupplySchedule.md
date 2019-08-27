# SupplySchedule

Defines the Synthetix inflationary supply schedule. To the initial 100 million, this adds 75 million tokens in the first year, half that in the second, half again in the third and so on. So the total supply of SNX by the end of the nth year is $100,000,000 \times (1 + \frac{3}{4}\sum_{i=1}^{n}{\frac{1}{2}^{n-1}})$. This goes for 5 years,
yielding a final total supply of 245,312,500 SNX. 

!!! TODO
    Work out a formula for the total supply at a given week.

As per the documentation, the schedule is:

Year |  Increase   | Total Supply | Increase
-----|-------------|--------------|---------
   0 |           0 |  100,000,000 |
   1 |  75,000,000 |  175,000,000 | 75%
   2 |  37,500,000 |  212,500,000 | 21%
   3 |  18,750,000 |  231,250,000 | 9%
   4 |   9,375,000 |  240,625,000 | 4%
   5 |   4,687,500 |  245,312,500 | 2%
   6 |           0 |  245,312,500 | 0%

The last year in this schedule is to allow any remaining tokens from the penultimate year to be minted. No minting is possible after the end of this schedule.

Minting is performed in increments of a week. So if in a given year $x$ tokens can be minted, each week $\frac{x}{weeksPerYear}$ tokens are made available. These tokens accrue so that no tokens are lost if minting is not performed for an extended period of time; all the tokens that accrued during that period will be minted in the next minting event.

NOTE: This contract is missing docstrings.

## Inherited Contracts

### Direct

* [Owned](Owned.md)

## Related Contracts

### Referenced

* SafeMath
* [SafeDecimalMath](SafeDecimalMath)
* [Synthetix](Synthetix.md)

### Referencing

* [Synthetix](Synthetix.md)

## Structs

```solidity
struct ScheduleData {
    uint totalSupply; // The quantity of new tokens made available to be minted in this period

    uint startPeriod; // Start of the period

    uint endPeriod; // End of the period

    uint totalSupplyMinted; // The total minted so far in this period (not including tokens from the previous period).
}
```

NOTE: The comment on `totalSupplyMinted` is `// UTC Time - Total of supply minted`. The 'UTC Time - ' bit doesn't make much sense, since the variable is a quantity of tokens, not anything to do with time.

## Variables

* `mintPeriodDuration: uint public`: The duration of each period. One week by default.
* `lastMintEvent: uint public`: Timestamp when supply was last minted.
* `synthetix: Synthetix`: The main Synthetix contract.
* `SECONDS_IN_YEAR: uint constant`: As per the name.
* `START_DATE: uint public constant`: 1520294400 (2018-03-06T00:00:00+00:00)
* `YEAR_[ONE - SEVEN]: uint public constant`: Seven variables to indicate the start timestamp of each year. Each is initialised to `START_DATE + SECONDS_IN_YEAR * [1-7]`. There's minor inaccuracy since it doesn't account for leap years, seconds, et cetera.
* `INFLATION_SCHEDULES_LENGTH: uint8 constant public`: 7.
* `schedules: ScheduleData[INFLATION_SCHEDULES_LENGTH] public`: An array holding the SNX minting schedule. This is initialised according to the schedule given in the notes section above. `schedules[0]` is taken as the first year, with the initial 100 million tokens minted in this period, and `schedules[6].totalSupply` set to 0.
* `minterReward: uint public`: Used in the Synthetix contract as the basic quantity to reward minters with. Initialised to 200 SNX.

## Functions

* `constructor`: Sets up the minting schedule.
* `setSynthetix(Synthetix _synthetix)`: Only callable by the contract owner. NOTE: has a comment in the body `// emit event`, but no event is actually emitted.
* `mintableSupply() returns (uint)`: Returns 0 if `isMintable` is false. Otherwise: Compute the number of weeks that have elapsed since the later of the start of this year and the last mint event time. Multiply this by the number of tokens accruing per week in the current year. Return this quantity, plus any left over tokens from the previous year.

$$
mintPeriodDuration: \text{The length of a mint period (one week) in seconds.} \\
amountPreviousPeriod: \text{The remaining supply from the previous year.} \\
schedule: \text{The current minting schedule.} \\
weeksInPeriod = \Big\lfloor\frac{schedule.end - schedule.start}{mintPeriodDuration}\Big\rfloor \\
supplyPerWeek = \Big\lfloor\frac{schedule.totalSupply \times 10^{18}}{weeksInPeriod}\Big\rfloor \\
weeksToMint = \Big\lfloor\frac{now - max(lastMintEvent, schedule.start)}{mintPeriodDuration}\Big\rfloor \\
amountInPeriod = \Big\lfloor\frac{supplyPerWeek * weeksToMint}{10^{18}}\Big\rfloor \\
result = amountInPeriod + amountPreviousPeriod
$$

If we neglect the floors, this could be rewritten as:

$$
fractionElapsed = \frac{now - max(lastMintEvent, schedule.start)}{schedule.end - schedule.start} \\
amountInPeriod = schedule.totalSupply \times fractionElapsed \\
result = amountInPeriod + amountPreviousPeriod
$$

* `_numWeeksRoundedDown(uint _timeDiff)`: Just returns `_timeDiff` integer divided by `mintPeriodDuration`. Function seems unnecessary and it has a tediously unnecessary comment in the body describing what division is.
* `isMintable() returns (bool)`: If the last mint event occurred more than a mint period duration ago, and it's not after the end of the final minting schedule date, then allow minting. This means that no minting can occur once the full schedule has elapsed.
* `getCurrentSchedule() returns (uint)`: Throws an exception if the last minting schedule entry has elapsed. Otherwise returns the index of the current minting period entry.
* `_remainingSupplyFromPreviousYear(uint currentSchedule) returns (uint)`: Handles the transition between two minting periods. If we're in the first period, or the last mint event did not occur in the previous year, then returns 0. Otherwise it returns `max(0, lastYear.totalSupply - lastYear.totalSupplyMinted)`. NOTE: The clamp here appears to be unnecessary, unless the `mintableSupply` function is incorrect.
* `updateMintValues() returns (bool)`: Only callable by the Synthetix contract. If there are any remaining mintable tokens from the previous year, then record them as having been minted:

```solidity
lastYear.totalSupplyMinted = lastYear.totalSupplyMinted + _remainingSupplyFromPreviousYear(currentIndex)

=> (with the knowledge that lastPeriodAmount is nonzero)

lastYear.totalSupplyMinted = lastYear.totalSupplyMinted + lastYear.totalSupply - lastYear.totalSupplyMinted

=>

lastYear.totalSupplyMinted = lastYear.totalSupply
```

Then record the new token supply that was minted in the current year. This is performed as `currentYear.totalSupplyMinted += mintableSupply() - lastPeriodAmount`. In most cases `lastPeriodAmount` will be 0.

NOTE: Some tokens could fail to be minted if no minting occurs for a year. I.e. a minting event in the `n`th year  cannot recover any unminted tokens from the `n-2`th year and earlier.

* `setMinterReward(uint _amount)`: Only callable by the contract owner.

## Events

* `SupplyMinted(uint previousPeriodAmount, uint currentAmount, uint indexedSchedule, uint timestamp)`
* `MinterRewardUpdated(uint newRewardAmount)`
