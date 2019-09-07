/*
-----------------------------------------------------------------
FILE INFORMATION
-----------------------------------------------------------------

file:       ExternStateToken.sol
version:    1.0
author:     Kevin Brown
date:       2018-08-06

-----------------------------------------------------------------
MODULE DESCRIPTION
-----------------------------------------------------------------

This contract offers a modifer that can prevent reentrancy on
particular actions. It will not work if you put it on multiple
functions that can be called from each other. Specifically guard
external entry points to the contract with the modifier only.

-----------------------------------------------------------------
*/

pragma solidity 0.4.25;

contract ReentrancyPreventer {

    uint256 private _isInFunctionBody = 1;

    /* ========== VIEWS ========== */

    function isInFunctionBody() internal view returns(bool) {
        return _isInFunctionBody == 2;
    }

    /* ========== MODIFIERS ========== */

    modifier preventReentrancy {
        require(_isInFunctionBody == 1, "Reverted to prevent reentrancy");
        _isInFunctionBody = 2;
        _;
        _isInFunctionBody = 1;
    }
}
