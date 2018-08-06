/*
-----------------------------------------------------------------
FILE INFORMATION
-----------------------------------------------------------------

file:       TokenRecipient.sol
version:    1.0
author:     Kevin Brown
date:       2018-08-02

-----------------------------------------------------------------
MODULE DESCRIPTION
-----------------------------------------------------------------

An example contract which gets notified when Havvens or Nomins are
transferred to it.

You can implement the havvenTokenFallback function in your contracts to 
take action when you receive Havvens or Nomins.

-----------------------------------------------------------------
*/

pragma solidity 0.4.24;

 /*
 * Contract that is working with Havvens or Nomins that wants to be notified on transfers
 */
contract TokenRecipient {
    /**
	 * @notice Get notified whenever a havven or nomin token contract transfers tokens to you.
     * @dev It's important to verify that msg.sender is one of our underlying contracts. If you
     *      want to know which type of token you're receiving, then implement a switch on msg.sender
	 * @param from The user who is transferring the tokens to you
	 * @param value The amount of tokens they're transferring
	 */
    function havvenTokenFallback(address from, uint value) public {
        // You'll need to ensure that msg.sender is one of our contracts and that you're not
        // just getting a call from somebody directly calling this function.
        //
        // IMPORTANT: These addresses WILL change as we update our underlying contracts, so
        //            we recommend maintaining a whitelist instead of hard coding specific
        //            values.
        //
        // For example:
        //
        // mapping(address => bool) public nominAddresses;
        //
        // <provide yourself with a way to update the mapping as time goes on>
        // 
        // Then at the top of this function:
        // require (nominAddresses[msg.sender]);
    }
}