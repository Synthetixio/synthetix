# SupplySchedule

## Description

Defines the Synthetix inflationary supply schedule, according to which the synthetix inflationary supply is released.

Minting is performed in increments of a week whenever [`updateMintValues`](#updatemintvalues) is called from [`Synthetix.mint`](Synthetix.md#mint). If in a given year $T$ tokens can be minted, about $\frac{T}{52}$ tokens are made available each week in that year. These accrue so that no tokens are lost even if minting is not performed for several periods; the accrued total is minted at the next invocation. These computations are covered in more detail in the [`mintableSupply`](#mintablesupply) description.

### Schedule

To the initial 100 million tokens, 75 million tokens are added in the first year, half that in the second, half again in the third and so on. This goes for 5 years, yielding a final total supply of 245,312,500 SNX.

Year |  New Supply | Total Supply | Increase
-----|-------------|--------------|---------
   0 | 100,000,000 |  100,000,000 |
   1 |  75,000,000 |  175,000,000 | 75%
   2 |  37,500,000 |  212,500,000 | 21%
   3 |  18,750,000 |  231,250,000 | 9%
   4 |   9,375,000 |  240,625,000 | 4%
   5 |   4,687,500 |  245,312,500 | 2%
   6 |           0 |  245,312,500 | 0%

The last year in this schedule generates no new tokens to allow any remaining from the previous year to be minted. No minting is possible after the end of this schedule.

**Source:** [SupplySchedule.sol](https://github.com/Synthetixio/synthetix/blob/master/contracts/SupplySchedule.sol)

## Architecture

---

### Inheritance Graph

<centered-image>
    ![SupplySchedule inheritance graph](../img/graphs/SupplySchedule.svg)
</centered-image>

---

### Related Contracts

* <>[Synthetix](Synthetix.md)

---

### Libraries

* [`SafeMath`](SafeMath.md) for `uint`
* [`SafeDecimalMath`](SafeDecimalMath.md) for `uint`

---

## Structs

---

### `ScheduleData`

Field | Type | Description
------|------|------------
totalSupply | `uint` | The quantity of new tokens made available to be minted this period.
startPeriod | `uint` | The timestamp at the start of this period.
endPeriod | `uint` | The timestamp at the end of this period. This should be the next period's timestamp minus 1.
totalSupplyMinted | `uint` | The total minted so far in this period, not including any tokens minted that remained from the previous period.

`totalSupplyMinted` for the current year is incremented whenever [`updateMintValues`](#updatemintvalues) is called. The others fields are static.

---

## Variables

---

### `mintPeriodDuration`

The duration of each minting period. This is constant at one week.

**Type:** `uint public`

**Value:** `1 weeks`

---

### `lastMintEvent`

The timestamp when new supply was last minted; i.e. when [`updateMintValues`](#updatemintvalues) was last called.

**Type:** `uint public`

---

### `synthetix`

The address of the main [`Synthetix`](Synthetix.md) contract.

**Type:** `Synthetix public`

---

### `SECONDS_IN_YEAR`

The approximate number of seconds in a year.

**Type:** `uint constant`

**Value:** `60 * 60 * 24 * 365`

---

### `START_DATE`

The timestamp at which the inflationary SNX supply began to be minted.

**Type:** `uint public constant`

**Value:** `1520294400 (2018-03-06T00:00:00+00:00)`

---

### `YEAR_[ONE - SEVEN]`

These seven constants indicate the start timestamp of each year, not accounting for leap years, seconds, et cetera. Each year is divided up evenly into week-long minting periods.

**Type:** `uint public constant`

**Value:** `START_DATE + SECONDS_IN_YEAR * [1-7]`

---

### `INFLATION_SCHEDULES_LENGTH`

The number of years in the minting schedule.

**Type:** `uint8 constant public`

**Value:** `7`

---

### `schedules`

An array holding the SNX minting schedule. This is initialised according to the schedule given in the [description above](#description). `schedules[0]` is taken as the first year Synthetix operated, with the initial 100 million tokens already minted in this period, and `schedules[6]` being one past the end, with its `totalSupply` set to 0, which allows minting any left over supply from `schedules[5]`.

**Type:** `ScheduleData[INFLATION_SCHEDULES_LENGTH] public`

---

### `minterReward`

Used as the quantity of SNX to reward the caller of [`Synthetix.mint`](Synthetix.md#mint), which incentivises users to continue minting the inflationary supply over time. Initialised to 200 SNX.

**Type:** `uint public`

---

## Functions

---

### `constructor`

Sets up the minting schedule and the inherited [`Owned`](Owned.md) instance. Note that `schedule[0].totalSupply = schedule[0].totalSupplyMinted = 1e8`, so the initial supply of SNX from the token sale is recorded as already having been minted from initialisation.

??? example "Details"
    **Signature**

    `constructor(address _owner) public`

    **Superconstructors**

    * [`Owned(_owner)`](Owned.md#constructor)

---

### `setSynthetix`

Allows the owner to set the [`synthetix`](#synthetix) address.

??? example "Details"
    **Signature**

    `setSynthetix(Synthetix _synthetix) external`

    **Modifiers**

    * [`Owned.onlyOwner`](Owned.md#onlyowner)

---

### `mintableSupply`

Returns the number of tokens currently mintable from the inflationary supply.

If [`isMintable`](#ismintable) returns false, this is $0$. Otherwise, it is the number of tokens accruing per week in the current year, multiplied by the number of whole weeks since the last mint event. If the last mint event was in the previous year, issue tokens up to the end of the previous period and treat the start of the current year as if it was the last mint event.

In most cases this is basically equivalent to the following, rounded down to the nearest weekly increment of tokens for the current year:

$$
\text{mintableSupply} \ = \ \text{year}_\text{totalSupply} \times \frac{\text{now} - \text{lastMintTime}}{\text{1 year}}
$$

???+ info "Mathematical Minutiae"

    The following re-expresses the logic from the smart contract.

    $$
    \begin{equation}
    \begin{split}
    \text{year} &= \text{The current year's ScheduleData entry.} \\
    \text{leftovers} &= \text{Unminted tokens left over from the previous year. May be zero.} \\
    \text{weeksPerYear} & = \Big\lfloor\frac{\text{year}_\text{end} - \text{year}_\text{start}}{\text{1 week}}\Big\rfloor \\
    \text{supplyPerWeek} &= \Big\lfloor\frac{\text{year}_\text{totalSupply} \times 10^{18}}{\text{weeksPerYear}}\Big\rfloor \\
    \text{weeksToMint} &= \Big\lfloor\frac{\text{now} - max(\text{lastMintTime}, \text{year}_\text{start})}{\text{1 week}}\Big\rfloor \\
    \text{currentAmount} &= \Big\lfloor\frac{\text{supplyPerWeek} \times \text{weeksToMint}}{10^{18}}\Big\rfloor \\
    \text{mintableSupply} &= \text{currentAmount} + \text{leftovers}
    \end{split}
    \end{equation}
    $$

    If we neglect the floors, understand that $\text{year}_\text{end} - \text{year}_\text{start}$ is always equal to a year ([`SECONDS_IN_YEAR - 1`](#seconds_in_year)), and assume that tokens have been minted at least once in the current year, then the result simplifies to the foregoing expression.

    **Unminted Leftovers**
    
    Note that $\Big\lfloor\frac{\text{year}_\text{end} - \text{year}_\text{start}}{\text{1 week}}\Big\rfloor$ is $52$, and there is a remainder of one day. Consequently the first mint event in each year will include an extra day's worth of leftover tokens from the previous year. See [`_remainingSupplyFromPreviousYear`](#_remainingsupplyfrompreviousyear).

    Also note that if no tokens are minted for a year, any leftovers from the previous year cannot be recovered.

??? example "Details"
    **Signature**

    `mintableSupply() public view returns (uint)`

---

### `_numWeeksRoundedDown`

This just returns its argument floor divided by [`mintPeriodDuration`](#mintperiodduration). Since this is only used in `mintableSupply()` it seems as if a variable would have done better than a public function.

??? example "Details"
    **Signature**

    `_numWeeksRoundedDown(uint _timeDiff) public view returns (uint)`

---

### `isMintable`

Returns true iff minting from the inflationary supply is permitted at the present time.

Minting is only allowed when neither:

* this period's token allocation was already minted; nor
* the current time is after the end of the final minting schedule date

This means that tokens are only mintable once a week, and no more tokens can be minted once the full schedule has elapsed even if there are some outstanding. However, the final year of the schedule mints no new tokens; during this time any remaining tokens can be minted.

??? example "Details"
    **Signature**

    `isMintable() public view returns (bool)`

---

### `getCurrentSchedule`

Returns the index of the current minting year in the [`schedule`](#schedule). Throws an exception if the last minting schedule entry has elapsed.

??? example "Details"
    **Signature**

    `getCurrentSchedule() public view returns (uint)`

    **Preconditions**

    * `schedules[6].endPeriod` must be in the future.

---

### `_remainingSupplyFromPreviousYear`

Computes the quantity of unminted tokens from the previous year, which assists in handling the transition between two years.

This returns $0$ if some tokens have already been minted this year, or if it is currently the first year. Otherwise, it is simply `lastYear.totalSupply - lastYear.totalSupplyMinted`.

??? example "Details"
    **Signature**

    `_remainingSupplyFromPreviousYear(uint currentSchedule) internal view returns (uint)`

---

### `updateMintValues`

This is called within [`Synthetix.mint`](Synthetix.md#mint) to declare that the outstanding inflationary supply of tokens has been minted before they are actually distributed.

When called, this function adds a quantity of [`mintableSupply()`](#mintablesupply) tokens to the current [`schedule.totalSupplyMinted`](#schedule) entry, and updates the [`lastMintEvent`](#lastmintevent) timestamp.
It is also responsible for updating this information if there were any unminted tokens left over from the previous year, which in effect sets `lastYear.totalSupplyMinted = lastYear.totalSupply`.

Although this function has no check that any tokens actually are mintable when it is called, the [`Synthetix`](Synthetix.md) contract requires it to be the case, so double calls should not occur. Similarly, the function does not itself enforce that the actual token supply has been increased by [`Synthetix`](Synthetix.md) in a manner consistent with the defined schedule and must simply trust that this compact is observed.

The function always returns `true` if the transaction was not reverted.

!!! info "Unmintable Tokens"
    Some tokens could fail to be minted if no minting occurs for a year. That is, minting in the `n`th year cannot recover any unminted tokens from the `n-2`th year or earlier.

??? example "Details"
    **Signature**

    `updateMintValues() external returns (bool)`

    **Modifiers**

    * [`onlySynthetix`](#onlysynthetix)

    **Preconditions**

    * `schedules[6].endPeriod` must be in the future.

    **Emits**

    * [`SupplyMinted(lastPeriodAmount, currentPeriodAmount, currentIndex, now)`](#supplyminted)

---

### `setMinterReward`

Allows the owner to set the current [minter reward](#minterreward).

??? example "Details"
    **Signature**

    `setMinterReward(uint _amount) external`

    **Modifiers**

    * [`Owned.onlyOwner`](Owned.md#onlyowner)

    **Emits**

    * [`MinterRewardUpdated(_amount)`](#minterrewardupdated)

---

## Modifiers

---

### `onlySynthetix`

Reverts the transaction if `msg.sender` is not the [`synthetix`](#synthetix) address.

---

## Events

---

### `SupplyMinted`

Records that a quantity of new tokens was [minted](#updatemintvalues).

**Signature:** `SupplyMinted(uint previousPeriodAmount, uint currentAmount, uint indexedSchedule, uint timestamp)`

---

### `MinterRewardUpdated`

Records that the [minter reward was updated](#setminterreward).

**Signature:** `MinterRewardUpdated(uint newRewardAmount)`

---
