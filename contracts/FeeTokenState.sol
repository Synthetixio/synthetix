/*
-----------------------------------------------------------------
FILE INFORMATION
-----------------------------------------------------------------
file:       FeeTokenState.sol
version:    0.4
author:     Dominic Romanowski

date:       2018-2-24

checked:    Anton Jurisevic
approved:   Samuel Brooks

-----------------------------------------------------------------
MODULE DESCRIPTION
-----------------------------------------------------------------

This contract takes what exists in the TokenState contract and adds
functionality for StatefulProxyFeeToken and EtherNomins;  namely
the feePool and the addresses of accounts that have been
frozen by the Court.

-----------------------------------------------------------------
*/

pragma solidity ^0.4.20;


import "contracts/TokenState.sol";


contract FeeTokenState is TokenState {

    // Collected fees sit here until they are distributed
    uint public feePool;

    // Users who have been voted out of using Nomins
    // This variable is specific to EtherNomins, and may not be needed in the future
    // in which case it will just be ignored
    mapping(address => bool) public isFrozen;

    function FeeTokenState(address _owner,
                           uint initialSupply, address initialBeneficiary,
                           address _associatedContract)
        TokenState(_owner, initialSupply, initialBeneficiary, _associatedContract)
        public
    {
    }

    /* ========== SETTERS ========== */

    function setFeePool(uint value)
        external
        onlyAssociatedContract
    {
        feePool = value;
    }

    function setFrozen(address account, bool value)
        external
        onlyAssociatedContract
    {
        isFrozen[account] = value;
    }
}
