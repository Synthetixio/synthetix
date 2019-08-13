# EscrowChecker

[Go Back](../contracts.md)

## Notes

A small contract that augments the escrow contract to allow extracting a user's schedule as an array, rather than the individual entries.

## Related Contracts

### Referenced

* [SynthetixEscrow](SynthetixEscrow.md)
* [RewardEscrow](RewardEscrow.md)

## Variables

* `synthetix_escrow: SynthetixEscrow public`

## Functions

* `checkAccountSchedule(address account)`: Returns 8 entries of the given address's vesting schedule as an alternating list of 16 `(timestamp, quantity)` pairs.
