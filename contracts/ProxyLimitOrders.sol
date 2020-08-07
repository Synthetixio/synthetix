pragma solidity ^0.5.16;

// Inheritance
import "./Owned.sol";

// Internal references
import "./Proxyable.sol";


contract ProxyLimitOrders is Owned {
    Proxyable public target;

    constructor(address _owner) public Owned(_owner) {}

    function setTarget(Proxyable _target) external onlyOwner {
        target = _target;
        emit TargetUpdated(_target);
    }

    function() external payable {
        assembly {
            let ptr := mload(0x40)

            // (1) copy incoming call data
            calldatacopy(ptr, 0, calldatasize)

            // (2) forward call to logic contract
            let result := delegatecall(gas, sload(target_slot), ptr, calldatasize, 0, 0)
            let size := returndatasize

            // (3) retrieve return data
            returndatacopy(ptr, 0, size)

            // (4) forward return data back to caller
            switch result
                case 0 {
                    revert(ptr, size)
                }
                default {
                    return(ptr, size)
                }
        }
    }

    event TargetUpdated(Proxyable newTarget);
}
