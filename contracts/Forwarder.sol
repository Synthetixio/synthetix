pragma solidity ^0.5.16;

import "./Owned.sol";


// solhint-disable payable-fallback

// https://docs.synthetix.io/contracts/Forwarder
contract Forwarder is Owned {
    address public target;

    constructor(address _owner) public Owned(_owner) {}

    function setTarget(address _target) external onlyOwner {
        target = _target;
        emit TargetUpdated(target);
    }

    // The basics of a proxy read call - note that msg.sender in the underlying will be this contract.
    // That is OK for the purposes of a call forwarder
    function() external {
        assembly {
            calldatacopy(0, 0, calldatasize)

            let result := staticcall(gas, sload(target_slot), 0, calldatasize, 0, 0)
            returndatacopy(0, 0, returndatasize)

            if iszero(result) {
                revert(0, returndatasize)
            }
            return(0, returndatasize)
        }
    }

    event TargetUpdated(address newTarget);
}
