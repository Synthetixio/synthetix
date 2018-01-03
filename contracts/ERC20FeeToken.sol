/*
-----------------------------------------------------------------
FILE INFORMATION
-----------------------------------------------------------------
file:       ERC20FeeToken.sol
version:    0.1
author:     Block8 Technologies, in partnership with Havven

            Anton Jurisevic

date:       2018-1-3

checked:    -
approved:   -

-----------------------------------------------------------------
MODULE DESCRIPTION
-----------------------------------------------------------------

An ERC20-compliant token which also has a configurable fee rate
that charged on its transfers.

-----------------------------------------------------------------
LICENCE INFORMATION
-----------------------------------------------------------------

Copyright (c) 2017 Havven.io

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
    
-----------------------------------------------------------------
RELEASE NOTES
-----------------------------------------------------------------

-----------------------------------------------------------------
Block8 Technologies is accelerating blockchain technology
by incubating meaningful next-generation businesses.
Find out more at https://www.block8.io/
-----------------------------------------------------------------
*/

pragma solidity ^0.4.19;

import "SafeFixedMath.sol";
import "Owned.sol";

contract ERC20FeeToken is Owned, SafeFixedMath {
    // Total nomins in the pool or in circulation.
    // Supply is initially zero, but may be increased by the Havven foundation.
    uint supply = 0;
 
    // Nomin balances for each address.
    mapping(address => uint) balances;

    // Nomin proxy transfer allowances.
    mapping(address => mapping (address => uint256)) allowances;

    // A percentage fee charged on each transfer.
    // Zero by default, but may be set in derived contracts.
    uint public transferFee = 0;

    // Constructor
    function ERC20FeeToken(address _owner) Owned(_owner) public { }
   
    // Get the total token supply
    function totalSupply()
        public
        view
        returns (uint)
    {
        return supply;
    }
 
    // Get the account balance of another account with address _account
    function balanceOf(address _account)
        public
        view
        returns (uint)
    {
        return balances[_account];
    }

    // Return the fee charged on top in order to transfer _value worth of tokens.
    function feeCharged(uint _value) 
        public
        view
        returns (uint)
    {
        return safeMul(_value, transferFee);
    }

    function setTransferFee(uint newFee)
        public
        onlyOwner
    {
        require(newFee <= UNIT);
        transferFee = newFee;
        TransferFeeUpdated(newFee);
    }
 
    // Send _value amount of tokens to address _to
    function transfer(address _to, uint _value)
        public
        returns (bool)
    {
        // The fee is deducted from the sender's balance.
        uint totalCharge = safeAdd(_value, feeCharged(_value));
        if (subIsSafe(balances[msg.sender], totalCharge) &&
            addIsSafe(balances[_to], _value)) {
            Transfer(msg.sender, _to, _value);
            // Zero-value transfers must fire the transfer event,
            // but don't spend gas updating state if unnecessary.
            if (_value == 0) {
                return true;
            }
            balances[msg.sender] = safeSub(balances[msg.sender], totalCharge);
            balances[_to] = safeAdd(balances[_to], _value);
            return true;
        }
        return false;
    }
 
    // Send _value amount of tokens from address _from to address _to
    function transferFrom(address _from, address _to, uint _value)
        public
        returns (bool)
    {
        // The fee is deducted from the sender's balance.
        uint totalCharge = safeAdd(_value, feeCharged(_value));
        if (subIsSafe(balances[_from], totalCharge) &&
            subIsSafe(allowances[_from][msg.sender], totalCharge) &&
            addIsSafe(balances[_to], _value)) {
                Transfer(_from, _to, _value);
                // Zero-value transfers must fire the transfer event,
                // but don't spend gas updating state if unnecessary.
                if (_value == 0) {
                    return true;
                }
                balances[_from] = safeSub(balances[_from], totalCharge);
                allowances[_from][msg.sender] = safeSub(allowances[_from][msg.sender], totalCharge);
                balances[_to] = safeAdd(balances[_to], _value);
                return true;
        }
        return false;
    }
  
    // Allow _spender to withdraw from your account, multiple times, up to the _value amount.
    // If this function is called again it overwrites the current allowance with _value.
    // this function is required for some DEX functionality.
    function approve(address _spender, uint _value)
        public
        returns (bool)
    {
        allowances[msg.sender][_spender] = _value;
        Approval(msg.sender, _spender, _value);
        return true;
    }
 
    // Returns the amount which _spender is still allowed to withdraw from _owner
    function allowance(address _owner, address _spender)
        public
        view
        returns (uint)
    {
        return allowances[_owner][_spender];
    }
 
    // Tokens were transferred.
    event Transfer(address indexed _from, address indexed _to, uint _value);
 
    // approve(address _spender, uint _value) was called.
    event Approval(address indexed _owner, address indexed _spender, uint _value);

    // The transfer fee was updated.
    event TransferFeeUpdated(uint newFee);
}

