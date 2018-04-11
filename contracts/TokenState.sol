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

pragma solidity 0.4.21;


import "contracts/Owned.sol";

/**
 * @title ERC20 Token State
 * @notice Stores balance information of an ERC20 token contract.
 */
contract TokenState is Owned {

    /* The address of the contract that can modify balances and allowances;
     * this can only be changed by the owner of this contract. */
    address public associatedContract;

    /* ERC20 fields. */
    mapping(address => uint) public balanceOf;
    mapping(address => mapping(address => uint)) public allowance;

    /**
     * @dev Constructor
     * @param _owner The address which controls this contract.
     * @param _associatedContract The ERC20 contract whose state this composes.
     */
    function TokenState(address _owner, address _associatedContract)
        Owned(_owner)
        public
    {
        associatedContract = _associatedContract;
        emit AssociatedContractUpdated(_associatedContract);
    }

    /* ========== SETTERS ========== */

    /**
     * @notice Change the associated contract to a new address.
     * @dev Only the contract owner may call this.
     */
    function setAssociatedContract(address _associatedContract)
        external
        onlyOwner
    {
        associatedContract = _associatedContract;
        emit AssociatedContractUpdated(_associatedContract);
    }

    /**
     * @notice Set ERC20 allowance.
     * @dev Only the associated contract may call this.
     * @param tokenOwner The authorising party.
     * @param spender The authorised party.
     * @param value The total value the authorised party may spend on the
     * authorising party's behalf.
     */
    function setAllowance(address tokenOwner, address spender, uint value)
        external
        onlyAssociatedContract
    {
        allowance[tokenOwner][spender] = value;
    }

    /**
     * @notice Set the balance in a given account
     * @dev Only the associated contract may call this.
     * @param account The account whose value to set.
     * @param value The new balance of the given account.
     */ 
    function setBalanceOf(address account, uint value)
        external
        onlyAssociatedContract
    {
        balanceOf[account] = value;
    }


    /* ========== MODIFIERS ========== */

    modifier onlyAssociatedContract
    {
        require(msg.sender == associatedContract);
        _;
    }

    /* ========== EVENTS ========== */

    event AssociatedContractUpdated(address _associatedContract);
}
