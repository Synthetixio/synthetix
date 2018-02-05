/*
-----------------------------------------------------------------
FILE INFORMATION
-----------------------------------------------------------------
file:       ERC20Token.sol
version:    0.1
author:     Anton Jurisevic

date:       2018-1-16

checked:    Mike Spain
approved:   Samuel Brooks

-----------------------------------------------------------------
MODULE DESCRIPTION
-----------------------------------------------------------------

An ERC20-compliant token.

-----------------------------------------------------------------
*/

pragma solidity ^0.4.19;


import "contracts/SafeDecimalMath.sol";


contract ERC20Token is SafeDecimalMath {

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
