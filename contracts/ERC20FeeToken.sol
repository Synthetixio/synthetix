/*
-----------------------------------------------------------------
FILE INFORMATION
-----------------------------------------------------------------
file:       ERC20FeeToken.sol
version:    0.1
author:     Block8 Technologies, in partnership with Havven

            Anton Jurisevic

date:       2018-1-3

checked:    Samuel Brooks
approved:   Samuel Brooks

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
    uint public transferFeeRate = 0;

    // Collected fees sit here until they are distributed.
    uint public feePool = 0;

    // The address with the authority to distribute fees.
    address public feeAuthority;

    // Constructor
    function ERC20FeeToken(address _owner, address _feeAuthority)
        Owned(_owner)
        public
    {
        feeAuthority = _feeAuthority;
    }

    modifier onlyFeeAuthority
    {
        require(msg.sender == feeAuthority);
        _;
    }
   
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
    function transferFeeIncurred(uint _value) 
        public
        view
        returns (uint)
    {
        return safeMul(_value, transferFeeRate);
        // Transfers less than the reciprocal of transferFeeRate should be completely eaten up by fees.
        // This is on the basis that transfers less than this value will result in a nil fee.
        // Probably too insignificant to worry about, but the following code will achieve it.
        //      if (fee == 0 && transferFeeRate != 0) {
        //          return _value;
        //      }
        //      return fee;
    }

    function setTransferFeeRate(uint newFeeRate)
        public
        onlyOwner
    {
        require(newFee <= UNIT);
        transferFeeRate = newFeeRate;
        TransferFeeRateUpdate(newFeeRate);
    }

    function withdrawFee(address account, uint value)
        public
        onlyFeeAuthority
    {
        // Exception thrown if insufficient balance due to safe subtraction operation
        feePool = safeSub(feePool, value);
        balances[account] = safeAdd(balances[account], value);
        FeeWithdrawal(account, value);
    }
 
    // Send _value amount of tokens to address _to
    function transfer(address _to, uint _value)
        public
        returns (bool)
    {
        // The fee is deducted from the sender's balance, in addition to
        // the transferred quantity.
        uint fee = transferFeeIncurred(_value);
        uint totalCharge = safeAdd(_value, fee);

        // Zero-value transfers must fire the transfer event...
        Transfer(msg.sender, _to, _value);
        TransferFeePaid(msg.sender, fee);

        // ...but don't spend gas updating state if unnecessary.
        if (_value == 0) {
            return true;
        }

        // Insufficient balance will be handled by the safe subtraction.
        balances[msg.sender] = safeSub(balances[msg.sender], totalCharge);
        balances[_to] = safeAdd(balances[_to], _value);
        feePool = safeAdd(feePool, fee);

        return true;
    }
 
    // Send _value amount of tokens from address _from to address _to
    function transferFrom(address _from, address _to, uint _value)
        public
        returns (bool)
    {
        // The fee is deducted from the sender's balance, in addition to
        // the transferred quantity.
        uint fee = transferFeeIncurred(_value);
        uint totalCharge = safeAdd(_value, fee);

        // Zero-value transfers must fire the transfer event...
        Transfer(_from, _to, _value);
        TransferFeePaid(msg.sender, fee);

        // ...but don't spend gas updating state if unnecessary.
        if (_value == 0) {
            return true;
        }

        // Insufficient balance will be handled by the safe subtraction.
        balances[_from] = safeSub(balances[_from], totalCharge);
        allowances[_from][msg.sender] = safeSub(allowances[_from][msg.sender], totalCharge);
        balances[_to] = safeAdd(balances[_to], _value);
        feePool = safeAdd(feePool, fee);
        
        return true;
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

    // A transfer occurred, and a fee was paid on it.
    event TransferFeePaid(address account, uint value);
 
    // approve(address _spender, uint _value) was called.
    event Approval(address indexed _owner, address indexed _spender, uint _value);

    // The transfer fee rate was updated.
    event TransferFeeRateUpdate(uint newFeeRate);

    // A quantity of fees was withdrawn from the pool and sent to the given account.
    event FeeWithdrawal(address account, uint value);
}

