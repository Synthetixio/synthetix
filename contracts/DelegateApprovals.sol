/*
-----------------------------------------------------------------
FILE INFORMATION
-----------------------------------------------------------------

file:       DelegateApprovals.sol
version:    1.0
author:     Jackson Chan
checked:    Clinton Ennis
date:       2019-05-01

-----------------------------------------------------------------
MODULE DESCRIPTION
-----------------------------------------------------------------

The approval state contract is designed to allow a wallet to
authorise another address to perform actions, on a contract,
on their behalf. This could be an automated service
that would help a wallet claim fees / rewards on their behalf.

The concept is similar to the ERC20 interface where a wallet can
approve an authorised party to spend on the authorising party's
behalf in the allowance interface.

Withdrawing approval sets the delegate as false instead of
removing from the approvals list for auditability.

This contract inherits state for upgradeability / associated
contract.

-----------------------------------------------------------------
*/
pragma solidity 0.4.25;


import "./State.sol";

contract DelegateApprovals is State {

    // Approvals - [authoriser][delegate]
    // Each authoriser can have multiple delegates
    mapping(address => mapping(address => bool)) public approval;

    /**
     * @dev Constructor
     * @param _owner The address which controls this contract.
     * @param _associatedContract The contract whose approval state this composes.
     */
    constructor(address _owner, address _associatedContract)
        State(_owner, _associatedContract)
        public
    {}

    function setApproval(address authoriser, address delegate)
        external
        onlyAssociatedContract
    {
        approval[authoriser][delegate] = true;
        emit Approval(authoriser, delegate);
    }

    function withdrawApproval(address authoriser, address delegate)
        external
        onlyAssociatedContract
    {
        delete approval[authoriser][delegate];
        emit WithdrawApproval(authoriser, delegate);
    }

     /* ========== EVENTS ========== */

    event Approval(address indexed authoriser, address delegate);
    event WithdrawApproval(address indexed authoriser, address delegate);
}
