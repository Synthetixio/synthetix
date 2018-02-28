/* With inspiration from Martin Swende and Zeppelin.*/

pragma solidity ^0.4.20;

import "contracts/Owned.sol";

contract Proxy is Owned {
    Proxyable target;
    address public messageSender;
    bool public metropolis;

    function Proxy(Proxyable _target, address _owner)
        Owned(_owner)
        public
    {
        target = _target;
        TargetChanged(_target);
    }

    function _setTarget(address _target) 
        public
        onlyOwner
    {
        require(_target != address(0));
        target = Proxyable(_target);
        TargetChanged(_target);
    }

    // Allow the use of the more-flexible metropolis RETURNDATACOPY/SIZE operations.
    function _setMetropolis(bool _metropolis)
        public
        onlyOwner
    {
        metropolis = _metropolis;
    }

    function _setMessageSender(address sender)
        public
        _onlyTarget
    {
        messageSender = sender;
    }

    function () 
        public
        payable
    {
        messageSender = msg.sender;
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

    modifier _onlyTarget
    {
        require(Proxyable(msg.sender) == target);
        _;
    }

    event TargetChanged(address targetAddress);
}


contract Proxyable is Owned {
    Proxy public proxy;

    function Proxyable(address _owner)
        Owned(_owner)
        public { }

    function setProxy(Proxy _proxy)
        public
        onlyOwner
    {
        proxy = _proxy;
        ProxyChanged(_proxy);
    }

    modifier onlyProxy
    {
        require(Proxy(msg.sender) == proxy);
        _;
    }

    modifier onlyOwner_Proxy
    {
        require(proxy.messageSender() == owner);
        _;
    }

    modifier optionalProxy
    {
        if (Proxy(msg.sender) != proxy) {
            proxy._setMessageSender(msg.sender);
        }
        _;
    }

    // Combine the optionalProxy and onlyOwner_Proxy modifiers.
    // This is slightly cheaper and safer, since there is an ordering requirement.
    modifier optionalProxy_onlyOwner
    {
        if (Proxy(msg.sender) != proxy) {
            proxy._setMessageSender(msg.sender);
            require(msg.sender == owner);
        } else {
            require(proxy.messageSender() == owner);
        }
        _;
    }

    event ProxyChanged(address proxyAddress);

}
