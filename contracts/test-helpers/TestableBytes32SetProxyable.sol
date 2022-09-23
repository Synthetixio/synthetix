pragma solidity ^0.5.16;

import "./TestableBytes32Set.sol";
import "../Owned.sol";
import "../Proxyable.sol";

contract TestableBytes32SetProxyable is Owned, Proxyable, TestableBytes32Set {
    constructor(address payable _proxy, address _owner) public Owned(_owner) Proxyable(_proxy) {}
}
