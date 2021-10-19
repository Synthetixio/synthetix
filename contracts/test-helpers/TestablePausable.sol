pragma solidity ^0.8.4;

import "../Owned.sol";
import "../Pausable.sol";

/**
 * @title An implementation of Pausable. Used to test the features of the Pausable contract that can only be tested by an implementation.
 */
contract TestablePausable is Owned, Pausable {
    uint public someValue;

    constructor(address _owner) public Owned(_owner) Pausable() {}

    function setSomeValue(uint _value) external notPaused {
        someValue = _value;
    }
}
