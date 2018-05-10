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

    /*
     * This modifier is a necessity to set proxy address before Owned constructor
     * so that Owned could emit an event on proxy
     */
    modifier initialSetProxy(address _proxy)
    {
        proxy = Proxy(_proxy);
        _;
    }

    /*** CONSTRUCTOR ***/
    constructor(address _proxy, address _owner)
        initialSetProxy(_proxy)
        Owned(_owner)
        public
    {
        emit ProxyChanged(_proxy);
    }

    function setProxy(address _proxy)
        external
        onlyOwner
    {
        proxy = Proxy(_proxy);
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

    event ProxyChanged(address _proxy);

}