/*
-----------------------------------------------------------------
FILE INFORMATION
-----------------------------------------------------------------

file:       TokenFallback.sol
version:    1.0
author:     Kevin Brown
date:       2018-08-10

-----------------------------------------------------------------
MODULE DESCRIPTION
-----------------------------------------------------------------

This contract provides the logic that's used to call tokenFallback()
when transfers happen.

It's pulled out into its own module because it's needed in two
places, so instead of copy/pasting this logic and maininting it
both in Fee Token and Extern State Token, it's here and depended
on by both contracts.

-----------------------------------------------------------------
*/

pragma solidity 0.4.25;

import "./ReentrancyPreventer.sol";

contract TokenFallbackCaller is ReentrancyPreventer {
    function callTokenFallbackIfNeeded(address sender, address recipient, uint amount, bytes data)
        internal
        preventReentrancy
    {
        /*
            If we're transferring to a contract and it implements the tokenFallback function, call it.
            This isn't ERC223 compliant because we don't revert if the contract doesn't implement tokenFallback.
            This is because many DEXes and other contracts that expect to work with the standard
            approve / transferFrom workflow don't implement tokenFallback but can still process our tokens as
            usual, so it feels very harsh and likely to cause trouble if we add this restriction after having
            previously gone live with a vanilla ERC20.
        */

        // Is the to address a contract? We can check the code size on that address and know.
        uint length;

        // solium-disable-next-line security/no-inline-assembly
        assembly {
            // Retrieve the size of the code on the recipient address
            length := extcodesize(recipient)
        }

        // If there's code there, it's a contract
        if (length > 0) {
            // Now we need to optionally call tokenFallback(address from, uint value).
            // We can't call it the normal way because that reverts when the recipient doesn't implement the function.

            // solium-disable-next-line security/no-low-level-calls
            recipient.call(abi.encodeWithSignature("tokenFallback(address,uint256,bytes)", sender, amount, data));

            // And yes, we specifically don't care if this call fails, so we're not checking the return value.
        }
    }
}
