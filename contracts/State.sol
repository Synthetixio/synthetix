/*
-----------------------------------------------------------------
FILE INFORMATION
-----------------------------------------------------------------
file:       State.sol
version:    1.0
author:     Dominic Romanowski
            Anton Jurisevic

date:       2018-2-24

checked:    Anton Jurisevic
approved:   Samuel Brooks

-----------------------------------------------------------------
MODULE DESCRIPTION
-----------------------------------------------------------------

A contract that holds the state of an ERC20 compliant token.

This contract is used side by side with external state token
contracts, such as Havven and Nomin.
It provides an easy way to upgrade contract logic while
maintaining all user balances and allowances. This is designed
to to make the changeover as easy as possible, since mappings
are not so cheap or straightforward to migrate.

The first deployed contract would create this state contract,
using it as its store of balances.
When a new contract is deployed, it links to the existing
state contract, whose owner would then change its associated
contract to the new one.

-----------------------------------------------------------------
*/


pragma solidity 0.4.23;


import "contracts/Emitter.sol";

contract State is Emitter {
    // the address of the contract that can modify variables
    // this can only be changed by the owner of this contract
    address public associatedContract;


    constructor(address _owner, address _associatedContract)
        Emitter(_owner)
        public
    {
        associatedContract = _associatedContract;
        emitAssociatedContractUpdated(_associatedContract);
    }

    /* ========== SETTERS ========== */

    // Change the associated contract to a new address
    function setAssociatedContract(address _associatedContract)
        external
        onlyOwner
    {
        associatedContract = _associatedContract;
        emitAssociatedContractUpdated(_associatedContract);
    }

    /* ========== MODIFIERS ========== */

    modifier onlyAssociatedContract
    {
        require(msg.sender == associatedContract);
        _;
    }

}
