/*
-----------------------------------------------------------------
FILE INFORMATION
-----------------------------------------------------------------

file:       State.sol
version:    1.1
author:     Dominic Romanowski
            Anton Jurisevic

date:       2018-05-15

-----------------------------------------------------------------
MODULE DESCRIPTION
-----------------------------------------------------------------

This contract is used side by side with external state token
contracts, such as Synthetix and Synth.
It provides an easy way to upgrade contract logic while
maintaining all user balances and allowances. This is designed
to make the changeover as easy as possible, since mappings
are not so cheap or straightforward to migrate.

The first deployed contract would create this state contract,
using it as its store of balances.
When a new contract is deployed, it links to the existing
state contract, whose owner would then change its associated
contract to the new one.

-----------------------------------------------------------------
*/


pragma solidity 0.4.25;


import "./Owned.sol";


contract State is Owned {
    // the address of the contract that can modify variables
    // this can only be changed by the owner of this contract
    address public associatedContract;


    constructor(address _owner, address _associatedContract)
        Owned(_owner)
        public
    {
        associatedContract = _associatedContract;
        emit AssociatedContractUpdated(_associatedContract);
    }

    /* ========== SETTERS ========== */

    // Change the associated contract to a new address
    function setAssociatedContract(address _associatedContract)
        external
        onlyOwner
    {
        associatedContract = _associatedContract;
        emit AssociatedContractUpdated(_associatedContract);
    }

    /* ========== MODIFIERS ========== */

    modifier onlyAssociatedContract
    {
        require(msg.sender == associatedContract, "Only the associated contract can perform this action");
        _;
    }

    /* ========== EVENTS ========== */

    event AssociatedContractUpdated(address associatedContract);
}
