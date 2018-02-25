/*
-----------------------------------------------------------------
FILE INFORMATION
-----------------------------------------------------------------
file:       ERC20FeeState.sol
version:    0.3
author:     Dominic Romanowski

date:       2018-2-24

checked:    Anton Jurisevic
approved:   Samuel Brooks

-----------------------------------------------------------------
MODULE DESCRIPTION
-----------------------------------------------------------------

This contract takes what exists in the erc20state contract and adds functionality for
ERC20FeeToken and EtherNomins. Namely the feePool and the addresses of accounts that
have been frozen by the Court.

-----------------------------------------------------------------
*/

pragma solidity ^0.4.20;


import "contracts/ERC20State.sol";


contract ERC20FeeState is ERC20State {

    // Collected fees sit here until they are distributed
    uint public feePool = 0;

    // Users who have been voted out of using Nomins
    // This variable is specific to EtherNomins, and may not be needed in the future
    // in which case it will just be ignored
    mapping(address => bool) public isFrozen;

    function ERC20FeeState(address _owner,
                           uint initialSupply, address initialBeneficiary,
                           address _associatedContract)
        ERC20State(_owner, initialSupply, initialBeneficiary, _associatedContract)
        public
    {
    }

    /* ========== SETTERS ========== */

    function setFeePool(uint _val)
        onlyAssociatedContract
        public
    {
        feePool = _val;
    }

    function setFrozen(address _account, bool _val)
        onlyAssociatedContract
        public
    {
        isFrozen[_account] = _val;
    }
}
