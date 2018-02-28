/*
-----------------------------------------------------------------
FILE INFORMATION
-----------------------------------------------------------------
file:       Proxy.sol
version:    0.3
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

The proxy can also optionally activate metropolis operations,
which will allow more-versatile return values once that fork
has hit.

Additionally this file contains the Proxyable interface,
which contracts that the proxy wraps must implement, in order
for it to be able to pass msg.sender into the underlying
contract as the state parameter, messageSender.

-----------------------------------------------------------------
*/


/* With inspiration from Martin Swende and Zeppelin.*/

pragma solidity ^0.4.20;

import "contracts/Owned.sol";

contract Proxy is Owned {
    Proxyable target;
    bool public metropolis;

    function Proxy(Proxyable _target, address _owner)
        Owned(_owner)
        public
    {
        target = _target;
        TargetChanged(_target);
    }

    function _setTarget(address _target) 
        external
        onlyOwner
    {
        require(_target != address(0));
        target = Proxyable(_target);
        TargetChanged(_target);
    }

    // Allow the use of the more-flexible metropolis RETURNDATACOPY/SIZE operations.
    function _setMetropolis(bool _metropolis)
        external
        onlyOwner
    {
        metropolis = _metropolis;
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

            // Use metropolis if possible.
            let met_cond := sload(metropolis_slot)
            if met_cond
            {
                // Forward all gas, ether, and data to the target contract.
                let result := call(gas, sload(target_slot), callvalue, free_ptr, calldatasize, 0, 0)
                returndatacopy(free_ptr, 0, returndatasize)

                // Revert if the call failed, otherwise return the result.
                if iszero(result) { revert(free_ptr, calldatasize) }
                return(free_ptr, returndatasize)
            }
            // If metropolis is unavailable, use static 32-byte return values.
            let ret_size := 32
            let result := call(gas, sload(target_slot), callvalue, free_ptr, calldatasize, free_ptr, ret_size)
            if iszero(result) { revert(free_ptr, calldatasize) }
            return(free_ptr, ret_size)
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
        ProxyChanged(_proxy);
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

    modifier onlyOwner_Proxy
    {
        require(messageSender == owner);
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
