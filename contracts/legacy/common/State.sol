pragma solidity 0.4.25;

import "./Owned.sol";


contract State is Owned {
    address public associatedContract;

    constructor(address _owner, address _associatedContract) public Owned(_owner) {
        associatedContract = _associatedContract;
        emit AssociatedContractUpdated(_associatedContract);
    }

    function setAssociatedContract(address _associatedContract) external onlyOwner {
        associatedContract = _associatedContract;
        emit AssociatedContractUpdated(_associatedContract);
    }

    modifier onlyAssociatedContract {
        require(msg.sender == associatedContract, "Only the associated contract can perform this action");
        _;
    }

    event AssociatedContractUpdated(address associatedContract);
}
