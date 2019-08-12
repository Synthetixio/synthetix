# SelfDestructible

[Go Back](../contracts.md)

## Notes

A contract inheriting this can be self-destructed by its owner, after a delay.

## Inherited Contracts

### Direct

* [State](State.md)

## Variables

* `initiationTime: uint public`
* `selfDestructInitiated: bool public`
* `selfDestructBeneficiary: address public`: The address where any lingering eth in this contract will be sent.
* `SELFDESTRUCT_DELAY: uint public constant`: The duration that must be waited between self destruct initiation and actual destruction. 4 weeks by default.

## Functions

* `setSelfDestructBeneficiary(address _beneficiary)`
* `initiateSelfDestruct()`: Begin the self destruct countdown.
* `terminateSelfDestruct()`: Reset the timer and disable self destruction.
* `selfDestruct()`: If self destruction is active and the timer has elapsed, destroy this contract and forward its ether to `selfDestructBeneficiary`.

## Events

* `SelfDestructTerminated()`
* `SelfDestructed(address beneficiary)`
* `SelfDestructInitiated(uint selfDestructDelay)`
* `SelfDestructBeneficiaryUpdated(address newBeneficiary)`
