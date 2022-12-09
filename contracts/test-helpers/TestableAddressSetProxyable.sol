pragma solidity ^0.5.16;

import "./TestableAddressSet.sol";
import "../Owned.sol";
import "../Proxyable.sol";

contract TestableAddressSetProxyable is Owned, Proxyable, TestableAddressSet {
    constructor(address payable _proxy, address _owner) public Owned(_owner) Proxyable(_proxy) {}
}
