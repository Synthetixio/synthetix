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

Additionally this file contains the Proxyable interface.
Any contract the proxy wraps must implement this, in order
for the proxy to be able to pass msg.sender into the underlying
contract as the state parameter, messageSender.

-----------------------------------------------------------------
*/


/* With inspiration from Martin Swende and Zeppelin.*/

pragma solidity ^0.4.23;

import "contracts/Owned.sol";
import "contracts/Proxyable.sol";

contract Proxy is Owned {
    Proxyable target;
    bool public metropolis;

    constructor(Proxyable _target, address _owner)
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

    // only the current underlying contract is allowed to trigger events from this proxy.
    modifier onlyCurrentContract
    {
        require(Proxyable(msg.sender) == target);
        _;
    }

    function emitOnProxy(bytes payload)
    onlyCurrentContract
    external
    {
        uint size = payload.length;
        bytes memory stream = payload;
        assembly {
            log0(add(stream, 32), size)
        }
    }

    function emitOnProxy(bytes payload, bytes32 topic)
    onlyCurrentContract
    external
    {
        uint size = payload.length;
        bytes memory stream = payload;
        assembly {
            log1(add(stream, 32), size, topic)
        }
    }

    function emitOnProxy(bytes payload, bytes32 topic1, bytes32 topic2)
    onlyCurrentContract
    external
    {
        uint size = payload.length;
        bytes memory stream = payload;
        assembly {
            log2(add(stream, 32), size, topic1, topic2)
        }
    }

    function emitOnProxy(bytes payload, bytes32 topic1, bytes32 topic2, bytes32 topic3)
        //onlyCurrentContract
    external
    {
        uint size = payload.length;
        bytes memory stream = payload;
        assembly {
            log3(add(stream, 32), size, topic1, topic2, topic3)
        }
    }

    function emitOnProxy(bytes payload, bytes32 topic1, bytes32 topic2, bytes32 topic3, bytes32 topic4)
    onlyCurrentContract
    external
    {
        uint size = payload.length;
        bytes memory stream = payload;
        assembly {
            log4(add(stream, 32), size, topic1, topic2, topic3, topic4)
        }
    }

    /* ========== IMPLEMENTATION OF OWNED ABSTRACT METHODS ========== */

    function emitOwnerChanged(address oldOwner, address newOwner)
    internal
    {
        emit OwnerChanged(oldOwner, newOwner);
    }

    function emitOwnerNominated(address newOwner)
    internal
    {
        emit OwnerNominated(newOwner);
    }

    /* ========== EVENTS ========== */

    event OwnerChanged(address oldOwner, address newOwner);
    event OwnerNominated(address newOwner);
    event TargetChanged(address targetAddress);
}
