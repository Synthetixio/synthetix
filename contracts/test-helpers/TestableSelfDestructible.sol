pragma solidity ^0.5.16;

import "../Owned.sol";
import "../SelfDestructible.sol";


contract TestableSelfDestructible is Owned, SelfDestructible {
    constructor(address _owner) public Owned(_owner) SelfDestructible() {}
}
