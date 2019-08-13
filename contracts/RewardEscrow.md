# RewardEscrow

[Go Back](../contracts.md)

## Notes

This is the mechanism for awarding SNX rewards from the inflationary supply.
Heavily derived from the [SynthetixEscrow](SynthetixEscrow.md) contract. However, the vesting schedule length is up to 260 entries long. This means that it might get a bit inefficient for active accounts to keep on using this function. Probably would have been better if the schedules get this long to store the index of the next entry or similar. These vesting schedules can be appended to by the fee pool contract, and since these actions can now happen at any time, an event is emitted whenever they occur, which they did not in the original contract, which only permitted such actions during the 8 week setup period.
NOTE: Typo in the module description "c-rationn", "SNW".

## Inherited Contracts

### Direct

* [Owned](Owned.md)

## Related Contracts

### Referenced

* SafeMath
* [Synthetix](Synthetix.md)
* [FeePool](FeePool.md)

### Referencing

* [Synthetix](Synthetix.md)
* [FeePool](FeePool.md)

## Variables

* `synthetix: Synthetix`: The main Synthetix contract.
* `feePool: FeePool`: The main FeePool contract.
* `vestingSchedules: mapping(address => uint[2][])`: For each account, a list of `(vesting timestamp, quantity)` pairs in ascending time order.
* `totalEscrowedAccountBalance: mapping(address => uint)`: the quantity of remaining tokens for a given account.
* `totalVestedAccountBalance: mapping(address => uint)`: the quantity of token that have been vested for a given account.
* `totalEscrowedBalance: uint`: The total remaining vested balance in this contract.
* `TIME_INDEX: uint constant`: Alias for 0, as timestamps are the first entries in vesting schedule pairs.
* `QUANTITY_INDEX: uint constant`: Alias for 1, as quantities are the second entries in vesting schedule pairs.
* `MAX_VESTING_ENTRIES: uint constant`: 52 * 5 = 260.

## Functions

* `setSynthetix(Synthetix _synthetix)`: As per the name. Only callable by the contract owner.
* `setFeePool(FeePool _feePool)`: As per the name. Only callable by the contract owner.
* `balanceOf(address account)`: Alias to `totalEscrowedAccountBalance[account]` for ERC20 integration.
* `numVestingEntries(account)`: `vestingSchedules[account].length`.
* `getVestingScheduleEntry(address account, uint index) returns (uint[2])`: returns the `(timestamp, quantity)` pair for the given account at the given index, since the public function generated for `vestingSchedule` has arity 3 where the third argument is the index into the pair.
* `getVestingTime(address account, uint index): returns (uint)`: `vestingSchedules[account][index][TIME_INDEX]`
* `getVestingTime(address account, uint index): returns (uint)`: `vestingSchedules[account][index][QUANTITY_INDEX]`
* `getNextVestingIndex(address account) returns (uint)`: returns the index of the next vesting entry that will vest for a given account. Iterates until it finds the first nonzero vesting entry timestamp (which is set to zero upon vesting), otherwise returns the length of the list (one past the end).
* `getNextVestingEntry(address account) returns (uint[2])`: Get the actual pair of values in the same manner as `getNextVestingIndex`. Return `[0,0]` if there is no next vesting entry.
* `getNextVestingTime(address account) returns (uint)`: `getNextVestingEntry(account)[TIME_INDEX]`
* `getNextVestingQuantity(address account) returns (uint)`: `getNextVestingEntry(account)[QUANTITY_INDEX]`
* `checkAccountSchedule(address account) returns (uint[520])`: Returns the full vesting schedule for a given user. I'm hoping this is probably not too inefficient as the array will mostly be trailing zeroes. Not sure if the RLP encoding represents such arrays more efficiently or not.
* `appendVestingEntry(address account, uint quantity)`: Only callable by the FeePool contract. Adds a new entry to the given user's vesting schedule, subject to a number of input sanity checks. Escrows the tokens for one year.
* `addVestingSchedule(address account, uint[] times, uint[] quantities)`: Calls `appendVestingEntry` in a loop.
* `vest()`: Finds the total of all vesting schedule entries that have come due for the caller, transfers that quantity of tokens to them, updates relevant totals.

## Events

* `SynthetixUpdated(address newSynthetix)`
* `FeePoolUpdated(address newFeePool)`
* `Vested(address indexed beneficiary, uint time, uint value)`
* `VestingEntryCreated(address indexed beneficiary, uint time, uint value)`
