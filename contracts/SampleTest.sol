pragma solidity ^0.5.16;
pragma experimental ABIEncoderV2;

// Inheritance
import "./Owned.sol";

contract SampleTest is Owned {
    uint public value;

    constructor(address _owner, uint _value) public Owned(_owner) {
        value = _value;
    }

    function setValue(uint _value) public onlyOwner {
        value = _value;
    }
}
