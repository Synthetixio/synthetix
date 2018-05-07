pragma solidity ^0.4.23;

import "./Owned.sol";
import "./Proxy.sol";

contract Proxyable is Owned {
    // the proxy this contract exists behind.
    Proxy public proxy;

    // The caller of the proxy, passed through to this contract.
    // Note that every function using this member must apply the onlyProxy or
    // optionalProxy modifiers, otherwise their invocations can use stale values.
    address messageSender;

    /*** ABSTRACT FUNCTION ***/
    function emitProxyChanged(address _proxy) internal;

    /*** CONSTRUCTOR ***/
    constructor(address _owner)
    Owned(_owner)
    public { }

    function setProxy(address _proxy)
    external
    onlyOwner
    {
        proxy = Proxy(_proxy);
        emitProxyChanged(_proxy);
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

}