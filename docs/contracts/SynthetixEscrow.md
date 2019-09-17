# SynthetixEscrow

This contract holds the SNX which were escrowed at the time of the token sale, releasing them on a defined schedule.

**Source:** [SynthetixEscrow.sol](https://github.com/Synthetixio/synthetix/blob/master/contracts/SynthetixEscrow.sol)

## Inherited Contracts

### Direct

* [Owned](Owned.md)
* [LimitedSetup](LimitedSetup.md)

## Related Contracts

### Referenced

* SafeMath
* [Synthetix](Synthetix.md)

### Referencing

* [Synthetix](Synthetix.md)

## Variables

* `synthetix: Synthetix`: The main Synthetix contract.
* `vestingSchedules: mapping(address => uint[2][])`: For each account, a list of `(vesting timestamp, quantity)` pairs in ascending time order.
* `totalVestedAccountBalance: mapping(address => uint)`: the quantity of remaining tokens for a given account.
* `totalVestedBalance: uint`: The total remaining vested balance in this contract.
* `TIME_INDEX: uint constant`: Alias for 0, as timestamps are the first entries in vesting schedule pairs.
* `QUANTITY_INDEX: uint constant`: Alias for 1, as quantities are the second entries in vesting schedule pairs.
* `MAX_VESTING_ENTRIES: uint constant`: 20.

## Functions

* `setSynthetix(Synthetix _synthetix)`: As per the name. Only callable by the contract owner.
* `balanceOf(address account)`: Alias to `totalVestedAccountBalance[account]` for ERC20 integration.
* `numVestingEntries(account)`: `vestingSchedules[account].length`.
* `getVestingScheduleEntry(address account, uint index) returns (uint[2])`: returns the `(timestamp, quantity)` pair for the given account at the given index, since the public function generated for `vestingSchedule` has arity 3 where the third argument is the index into the pair.
* `getVestingTime(address account, uint index): returns (uint)`: `vestingSchedules[account][index][TIME_INDEX]`
* `getVestingTime(address account, uint index): returns (uint)`: `vestingSchedules[account][index][QUANTITY_INDEX]`
* `getNextVestingIndex(address account) returns (uint)`: returns the index of the next vesting entry that will vest for a given account. Iterates until it finds the first nonzero vesting entry timestamp (which is set to zero upon vesting), otherwise returns the length of the list (one past the end).
* `getNextVestingEntry(address account) returns (uint[2])`: Get the actual pair of values in the same manner as `getNextVestingIndex`. Return `[0,0]` if there is no next vesting entry.
* `getNextVestingTime(address account) returns (uint)`: `getNextVestingEntry(account)[TIME_INDEX]`
* `getNextVestingQuantity(address account) returns (uint)`: `getNextVestingEntry(account)[QUANTITY_INDEX]`
* `withdrawSynthetix(uint quantity)`: Only callable by the owner and only during the setup period. Transfers a quantity of SNX to the Synthetix contract.
* `purgeAccount(address account)`: Only callable by the owner and only during the setup period. Deletes all vesting information associated with a given account and updates relevant totals.
* `appendVestingEntry(address account, uint time, uint quantity)`: Only callable by the owner and only during the setup period. Adds a new entry to the given user's vesting schedule, subject to a number of input sanity checks.
* `addVestingSchedule(address account, uint[] times, uint[] quantities)`: Calls `appendVestingEntry` in a loop.
* `vest()`: Finds the total of all vesting schedule entries that have come due for the caller, transfers that quantity of tokens to them, updates relevant totals.

## Events

* `SynthetixUpdated(address newSynthetix)`
* `Vested(address indexed beneficiary, uint time, uint value)`
