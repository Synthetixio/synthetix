/*
-----------------------------------------------------------------
FILE INFORMATION
-----------------------------------------------------------------
file:       Proxy.sol
version:    1.0
author:     Anton Jurisevic

date:       2018-2-28

checked:    Mike Spain
approved:   Samuel Brooks

-----------------------------------------------------------------
MODULE DESCRIPTION
-----------------------------------------------------------------

A proxy contract that, if it does not recognise the function
being called on it, passes all value and call data to an
underlying target contract.

Additionally this file contains the Proxyable interface.
Any contract the proxy wraps must implement this, in order
for the proxy to be able to pass msg.sender into the underlying
contract as the state parameter, messageSender.

-----------------------------------------------------------------
*/


pragma solidity 0.4.21;

import "contracts/Owned.sol";

contract Proxy is Owned {
    Proxyable target;

    function Proxy(Proxyable _target, address _owner)
        Owned(_owner)
        public
    {
        target = _target;
        emit TargetChanged(_target);
    }

    function _setTarget(address _target) 
        external
        onlyOwner
    {
        require(_target != address(0));
        target = Proxyable(_target);
        emit TargetChanged(_target);
    }

    function () 
        public
        payable
    {
        target.setMessageSender(msg.sender);
        assembly {
            // Copy call data into free memory region.
            let free_ptr := mload(0x40)
            calldatacopy(free_ptr, 0, calldatasize)

            // Forward all gas, ether, and data to the target contract.
            let result := call(gas, sload(target_slot), callvalue, free_ptr, calldatasize, 0, 0)
            returndatacopy(free_ptr, 0, returndatasize)

            // Revert if the call failed, otherwise return the result.
            if iszero(result) { revert(free_ptr, calldatasize) }
            return(free_ptr, returndatasize)
        } 
    }

    event TargetChanged(address targetAddress);
}


contract Proxyable is Owned {
    // the proxy this contract exists behind.
    Proxy public proxy;

    // The caller of the proxy, passed through to this contract.
    // Note that every function using this member must apply the onlyProxy or
    // optionalProxy modifiers, otherwise their invocations can use stale values.
    address messageSender;

    function Proxyable(address _owner)
        Owned(_owner)
        public { }

    function setProxy(Proxy _proxy)
        external
        onlyOwner
    {
        proxy = _proxy;
        emit ProxyChanged(_proxy);
    }

    function setMessageSender(address sender)
        external
        onlyProxy
    {
        messageSender = sender;
    }

    modifier onlyProxy
    {
        require(Proxy(msg.sender) == proxy);
        _;
    }

    modifier optionalProxy
    {
        if (Proxy(msg.sender) != proxy) {
            messageSender = msg.sender;
        }
        _;
    }

    // Combine the optionalProxy and onlyOwner_Proxy modifiers.
    // This is slightly cheaper and safer, since there is an ordering requirement.
    modifier optionalProxy_onlyOwner
    {
        if (Proxy(msg.sender) != proxy) {
            messageSender = msg.sender;
        }
        require(messageSender == owner);
        _;
    }

    event ProxyChanged(address proxyAddress);

}
