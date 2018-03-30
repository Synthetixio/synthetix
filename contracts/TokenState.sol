/*
-----------------------------------------------------------------
FILE INFORMATION
-----------------------------------------------------------------
file:       TokenState.sol
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
contracts, such as Havven and EtherNomin.
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

pragma solidity ^0.4.21;


import "contracts/State.sol";


contract TokenState is State {

    // ERC20 fields.
    mapping(address => uint) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function TokenState(address _owner, address _associatedContract)
        State(_owner, _associatedContract)
        public
    {}

    /* ========== SETTERS ========== */

    function setAllowance(address tokenOwner, address spender, uint value)
        external
        onlyAssociatedContract
    {
        allowance[tokenOwner][spender] = value;
    }

    function setBalanceOf(address account, uint value)
        external
        onlyAssociatedContract
    {
        balanceOf[account] = value;
    }
}
