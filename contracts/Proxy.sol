/* Adapted form zerpellin 

contract Proxy {
  function implementation() public view returns (address);
 
  function () payable public {
    address _impl = implementation();
    require(_impl != address(0));
    bytes memory data = msg.data;

    assembly {
      let result := delegatecall(gas, _impl, add(data, 0x20), mload(data), 0, 0)
      let size := returndatasize
      let ptr := mload(0x40)
      returndatacopy(ptr, 0, size)
      switch result
      case 0 { revert(ptr, size) }
      default { return(ptr, size) }
    }
  }
}
*/
pragma solidity ^0.4.20;

import "contracts/Owned.sol";

contract Proxy is Owned{
    address target;
    bool metropolis;

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
            let free_ptr := mload(0x40)
            calldatacopy(free_ptr, 0, calldatasize)

            let result := call(gas, sload(target_slot), callvalue, free_ptr, calldatasize, 0, 0)

            let ret_size := 32
            let met_cond := sload(metropolis_slot)
            if met_cond { ret_size := returndatasize }

            returndatacopy(free_ptr, 0, ret_size)
            if iszero(result) { revert(free_ptr, ret_size) }
            return(free_ptr, ret_size)
        }

        /*
        assembly {
            let free_ptr := mload(0x40)
            calldatacopy(free_ptr, 0, 4)
            mstore(add(free_ptr, 4), caller)
            calldatacopy(add(free_ptr, 4), 0x24, sub(calldatasize, 4))

            let result := call(gas, sload(target_slot), callvalue, free_ptr, add(calldatasize, 0x20), 0, 0)

            let ret_size := 32
            let met_cond := sload(metropolis_slot)
            if met_cond { ret_size := returndatasize }

            returndatacopy(free_ptr, 0, ret_size)
            if iszero(result) { revert(free_ptr, ret_size) }
            return(free_ptr, ret_size)
        }
        */

 

    }
}