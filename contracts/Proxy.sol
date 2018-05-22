/*
-----------------------------------------------------------------
FILE INFORMATION
-----------------------------------------------------------------

file:       Proxy.sol
version:    1.1
author:     Anton Jurisevic

date:       2018-05-15

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


pragma solidity 0.4.24;


import "contracts/Owned.sol";
import "contracts/Proxyable.sol";


contract Proxy is Owned {

    Proxyable public target;

    constructor(address _owner)
        Owned(_owner)
        public
    {}

    function setTarget(Proxyable _target)
        external
        onlyOwner
    {
        target = _target;
        emit TargetUpdated(_target);
    }

    function _emit(bytes callData, uint numTopics,
                   bytes32 topic1, bytes32 topic2,
                   bytes32 topic3, bytes32 topic4)
        external
        onlyTarget
    {
        uint size = callData.length;
        bytes memory _callData = callData;

        assembly {
            /* The first 32 bytes of callData contain its length (as specified by the abi). 
             * Length is assumed to be a uint256 and therefore maximum of 32 bytes
             * in length. It is also leftpadded to be a multiple of 32 bytes.
             * This means moving call_data across 32 bytes guarantees we correctly access
             * the data itself. */
            switch numTopics
            case 0 {
                log0(add(_callData, 32), size)
            } 
            case 1 {
                log1(add(_callData, 32), size, topic1)
            }
            case 2 {
                log2(add(_callData, 32), size, topic1, topic2)
            }
            case 3 {
                log3(add(_callData, 32), size, topic1, topic2, topic3)
            }
            case 4 {
                log4(add(_callData, 32), size, topic1, topic2, topic3, topic4)
            }
        }
    }

    function()
        external
        payable
    {
        target.setMessageSender(msg.sender);
        assembly {
            /* Copy call data into free memory region. */
            let free_ptr := mload(0x40)
            calldatacopy(free_ptr, 0, calldatasize)

            /* Forward all gas, ether, and data to the target contract. */
            let result := call(gas, sload(target_slot), callvalue, free_ptr, calldatasize, 0, 0)
            returndatacopy(free_ptr, 0, returndatasize)

            /* Revert if the call failed, otherwise return the result. */
            if iszero(result) { revert(free_ptr, calldatasize) }
            return(free_ptr, returndatasize)
        }
    }

    modifier onlyTarget {
        require(Proxyable(msg.sender) == target,
                "caller is not proxy target");
        _;
    }

    event TargetUpdated(Proxyable newTarget);
}
