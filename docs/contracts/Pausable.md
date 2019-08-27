# Pausable

Allows an inheriting contract to be paused and resumed, providing a modifier that will allow modifier functions to operate only if the contract is not paused.

## Inherited Contracts

### Direct

* [Owned](Owned.md)

## Variables

* `lastPauseTime uint public`
* `paused bool public`

## Functions

* `setPaused(bool _paused)`: Only callable by the contract owner. Sets the pause state and updates the timestamp.

## Events

* `PauseChanged(bool isPaused)`
