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


pragma solidity ^0.4.21;

import "contracts/Owned.sol";

/**
 * @title Passes through function calls to an underlying Proxyable contract.
 */
contract Proxy is Owned {
    Proxyable public _target;

    /**
     * @dev Constructor
     * @param _initialTarget The address of the underlying contract to attach this proxy to.
     * The target must implement the Proxyable interface.
     * @param _owner The owner of this contract, who may change its target address.
     */
    function Proxy(Proxyable _initialTarget, address _owner)
        Owned(_owner)
        public
    {
        _target = _initialTarget;
        emit TargetChanged(_initialTarget);
    }

    /**
     * @notice Direct this proxy to a new target contract.
     */
    function _setTarget(address newTarget) 
        external
        onlyOwner
    {
        require(newTarget != address(0));
        _target = Proxyable(newTarget);
        emit TargetChanged(newTarget);
    }

    /**
     * @dev Fallback function passes through all data and ether to the target contract
     * and returns the result that the target returns.
     */
    function () 
        public
        payable
    {
        _target.setMessageSender(msg.sender);
        assembly {
            /* Copy call data into free memory region. */
            let free_ptr := mload(0x40)
            calldatacopy(free_ptr, 0, calldatasize)

            /* Forward all gas, ether, and data to the target contract. */
            let result := call(gas, sload(_target_slot), callvalue, free_ptr, calldatasize, 0, 0)
            returndatacopy(free_ptr, 0, returndatasize)

            /* Revert if the call failed, otherwise return the result. */
            if iszero(result) { revert(free_ptr, calldatasize) }
            return(free_ptr, returndatasize)
        } 
    }

    event TargetChanged(address targetAddress);
}


/**
 * @title Accepts function calls passed through from a Proxy contract.
 */
contract Proxyable is Owned {
    /* the proxy this contract exists behind. */
    Proxy public proxy;

    /* The caller of the proxy, passed through to this contract.
     * Note that every function using this member must apply the onlyProxy or
     * optionalProxy modifiers, otherwise their invocations can use stale values. */
    address messageSender;

    /**
     * @dev Constructor
     * @param _owner The account that owns this contract. It may change the proxy address.
     */
    function Proxyable(address _owner)
        Owned(_owner)
        public { }

    /**
     * @notice Set the proxy associated with this contract.
     * @dev Only the contract owner may call this.
     */
    function setProxy(Proxy _proxy)
        external
        onlyOwner
    {
        proxy = _proxy;
        emit ProxyChanged(_proxy);
    }

    /**
     * @notice Set the address that this contract believes initiated the current function call.
     * @dev Only the proxy contract may call this, but it is also set inside the optionalProxy
     * modifier.
     */
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
