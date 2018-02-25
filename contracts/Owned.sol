/*
-----------------------------------------------------------------
FILE INFORMATION
-----------------------------------------------------------------
file:       Owned.sol
version:    0.2
author:     Anton Jurisevic

date:       2018-1-16

checked:    Mike Spain
approved:   Samuel Brooks

-----------------------------------------------------------------
MODULE DESCRIPTION
-----------------------------------------------------------------

An ownable contract, to be inherited by other contracts.
Requires its owner to be explicitly set in the constuctor,
provides onlyOwner access modifier and setOwner function,
which itself must only be callable by the current owner.

-----------------------------------------------------------------
*/

pragma solidity ^0.4.20;


contract Owned {
    address public owner;

    function Owned(address _owner)
        public
    {
        owner = _owner;
    }

    function setOwner(address newOwner)
        public
        onlyOwner
    {
        owner = newOwner;
        OwnerChanged(owner, newOwner);
    }

    modifier onlyOwner
    {
        require(msg.sender == owner);
        _;
    }

    event OwnerChanged(address oldOwner, address newOwner);
}
