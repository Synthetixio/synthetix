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
    address nominatedOwner;
    uint nominationTime;
    uint constant forceDelay = 1 days;

    function Owned(address _owner)
        public
    {
        owner = _owner;
    }

    function nominateOwner(address newOwner)
        public
        onlyOwner
    {
        nominatedOwner = newOwner;
        nominationTime = now;
        NewOwnerNominated(newOwner);
    }

    function _setOwner()
        internal
    {
        OwnerChanged(owner, nominatedOwner);
        owner = nominatedOwner;
        nominatedOwner = address(0);
    }

    function acceptOwnership()
        public
    {
        require(msg.sender == nominatedOwner);
        _setOwner();
    }

    function forceAcceptOwnership()
        public
        onlyOwner
    {
        require(nominationTime + forceDelay < now);
        _setOwner();
    }

    modifier onlyOwner
    {
        require(msg.sender == owner);
        _;
    }

    event NewOwnerNominated(address newOwner);
    event OwnerChanged(address oldOwner, address newOwner);
}
