pragma solidity ^0.5.16;

import "../Owned.sol";
import "../Proxyable.sol";

contract TestableProxyable is Owned, Proxyable {
    constructor(address payable _proxy, address _owner) public Owned(_owner) Proxyable(_proxy) {}

    event SomeEvent(uint);
    bytes32 internal constant SOMEEVENT_SIG = keccak256("SomeEvent(uint)");

    function emitSomeEvent() external {
        proxy._emit(abi.encode(0), 1, SOMEEVENT_SIG, 0, 0, 0);
    }
}
