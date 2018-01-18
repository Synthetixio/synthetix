/*
-----------------------------------------------------------------
FILE INFORMATION
-----------------------------------------------------------------
file:       ERC20Token.sol
version:    0.1
author:     Block8 Technologies, in partnership with Havven

            Anton Jurisevic

date:       2018-1-16

checked:    -
approved:   -

-----------------------------------------------------------------
MODULE DESCRIPTION
-----------------------------------------------------------------

An ERC20-compliant token.

-----------------------------------------------------------------
LICENCE INFORMATION
-----------------------------------------------------------------

Copyright (c) 2018 Havven.io

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


contract ERC20Token is SafeFixedMath {

    /* ========== STATE VARIABLES ========== */

    // ERC20 token data
    // Allowance mapping domain: (owner, spender)
    uint public totalSupply;
    string public name;
    string public symbol;
    mapping(address => uint) public balanceOf;
    mapping(address => mapping (address => uint256)) public allowance;


    /* ========== CONSTRUCTOR ========== */

    function ERC20Token(string _name, string _symbol,
                        uint initialSupply, address initialBeneficiary)
        public
    {
        name = _name;
        symbol = _symbol;
        totalSupply = initialSupply;
        balanceOf[initialBeneficiary] = initialSupply;
    }


    /* ========== MUTATIVE FUNCTIONS ========== */

    function transfer(address _to, uint _value)
        public
        returns (bool)
    {
        // Zero-value transfers must fire the transfer event...
        Transfer(msg.sender, _to, _value);

        // ...but don't spend gas updating state unnecessarily.
        if (_value == 0) {
            return true;
        }

        // Insufficient balance will be handled by the safe subtraction.
        balanceOf[msg.sender] = safeSub(balanceOf[msg.sender], _value);
        balanceOf[_to] = safeAdd(balanceOf[_to], _value);

        return true;
    }

    function transferFrom(address _from, address _to, uint _value)
        public
        returns (bool)
    {
        // Zero-value transfers must fire the transfer event...
        Transfer(_from, _to, _value);

        // ...but don't spend gas updating state unnecessarily.
        if (_value == 0) {
            return true;
        }

        // Insufficient balance will be handled by the safe subtraction.
        balanceOf[_from] = safeSub(balanceOf[_from], _value);
        allowance[_from][msg.sender] = safeSub(allowance[_from][msg.sender], _value);
        balanceOf[_to] = safeAdd(balanceOf[_to], _value);

        return true;
    }

    function approve(address _spender, uint _value)
        public
        returns (bool)
    {
        allowance[msg.sender][_spender] = _value;
        Approval(msg.sender, _spender, _value);
        return true;
    }


    /* ========== EVENTS ========== */

    event Transfer(address indexed _from, address indexed _to, uint _value);

    event Approval(address indexed _owner, address indexed _spender, uint _value);

}
