/*
-----------------------------------------------------------------
FILE INFORMATION
-----------------------------------------------------------------

file:       Proxyable.sol
version:    1.1
author:     Anton Jurisevic

date:       2018-05-15

checked:    Mike Spain
approved:   Samuel Brooks

-----------------------------------------------------------------
MODULE DESCRIPTION
-----------------------------------------------------------------

A proxyable contract that works hand in hand with the Proxy contract
to allow for anyone to interact with the underlying contract both
directly and through the proxy.

-----------------------------------------------------------------
*/


pragma solidity ^0.4.23;

import "contracts/Owned.sol";
import "contracts/Proxy.sol";

contract Proxyable is Owned {
    // the proxy this contract exists behind.
    Proxy public proxy;

    // The caller of the proxy, passed through to this contract.
    // Note that every function using this member must apply the onlyProxy or
    // optionalProxy modifiers, otherwise their invocations can use stale values.
    address messageSender;

    /*** CONSTRUCTOR ***/
    constructor(address _proxy, address _owner)
        Owned(_owner)
        public
    {
        proxy = Proxy(_proxy);
        emit ProxyUpdated(_proxy);
    }

    function setProxy(address _proxy)
        external
        onlyOwner
    {
        proxy = Proxy(_proxy);
        emit ProxyUpdated(_proxy);
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

    event ProxyUpdated(address _proxy);

}