/* With inspiration from Martin Swende and Zeppelin.*/

pragma solidity ^0.4.20;

import "contracts/Owned.sol";

contract Proxy is Owned {
    address target;
    bool public metropolis;

    function Proxy(address _target, address _owner)
        Owned(_owner)
        public
    {
        target = _target;
    }

    function _setTarget(address _target) 
        public
        onlyOwner
    {
        require(_target != address(0));
        target = _target;
    }

    // Allow the use of the more-flexible metropolis RETURNDATACOPY/SIZE operations.
    function _setMetropolis(bool _metropolis)
        public
        onlyOwner
    {
        metropolis = _metropolis;
    }

    function () 
        public
    {
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
                let ret_size := returndatasize 
                returndatacopy(free_ptr, 0, ret_size)

                // Revert if the call failed, otherwise return the result.
                if iszero(result) { revert(0, 0) }
                return(free_ptr, ret_size)
            }
            // If metropolis is unavailable, allow static 32-byte return values.
            let ret_size := 32
            let result := call(gas, sload(target_slot), callvalue, free_ptr, calldatasize, free_ptr, 32)
            if iszero(result) { revert(0, 0) }
            return(free_ptr, ret_size)
        } 
    }
}