/*
-----------------------------------------------------------------
FILE INFORMATION
-----------------------------------------------------------------
file:       Owned.sol
version:    0.3
author:     Anton Jurisevic
            Dominic Romanowski

date:       2018-2-26

checked:    Mike Spain
approved:   Samuel Brooks

-----------------------------------------------------------------
MODULE DESCRIPTION
-----------------------------------------------------------------

An Owned contract, to be inherited by other contracts.
Requires its owner to be explicitly set in the constructor.
Provides an onlyOwner access modifier.

To change owner, the current owner must nominate the next owner,
who then has to accept the nomination. The nomination can be
cancelled before it is accepted by the new owner by having the
previous owner change the nomination (setting it to 0).

-----------------------------------------------------------------
*/

pragma solidity ^0.4.20;


contract Owned {
    address public owner;
    address nominatedOwner;

    function Owned(address _owner)
        public
    {
        owner = _owner;
    }

    function nominateOwner(address _owner)
        public
        onlyOwner
    {
        nominatedOwner = _owner;
        NewOwnerNominated(_owner);
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

    modifier onlyOwner
    {
        require(msg.sender == owner);
        _;
    }

    event NewOwnerNominated(address newOwner);
    event OwnerChanged(address oldOwner, address newOwner);
}
