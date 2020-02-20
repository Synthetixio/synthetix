pragma solidity 0.4.25;

import "../Pausable.sol";


/**
 * @title An implementation of Pausable. Used to test the features of the Pausable contract that can only be tested by an implementation.
 */
contract TestablePausable is Pausable {
    uint public someValue;

    constructor(address _owner) public Pausable(_owner) {}

    function setSomeValue(uint _value) external notPaused {
        someValue = _value;
    }
}
