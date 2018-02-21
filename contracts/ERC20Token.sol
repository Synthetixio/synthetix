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
import "contracts/Owned.sol";
import "contracts/ERC20State.sol";


contract ERC20Token is SafeDecimalMath, Owned {

    /* ========== STATE VARIABLES ========== */

    ERC20State public stateContract;

    string public name;
    string public symbol;


    /* ========== CONSTRUCTOR ========== */

    function ERC20Token(address _owner, string _name, string _symbol)
        Owned(_owner)
        public
    {
        name = _name;
        symbol = _symbol;
    }

    /* ========== MUTATIVE FUNCTIONS ========== */

    function setState(ERC20State _stateContract)
        onlyOwner
        public
    {
        stateContract = _stateContract;
    }

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
        stateContract.setBalance(msg.sender, safeSub(stateContract.balanceOf(msg.sender), _value));
        stateContract.setBalance(_to, safeAdd(stateContract.balanceOf(_to), _value));

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
        stateContract.setBalance(_from, safeSub(stateContract.balanceOf(_from), _value));
        stateContract.setAllowance(_from, msg.sender, safeSub(stateContract.allowance(_from, msg.sender), _value));
        stateContract.setBalance(_to, safeAdd(stateContract.balanceOf(_to), _value));

        return true;
    }

    function approve(address _spender, uint _value)
        public
        returns (bool)
    {
        stateContract.setAllowance(msg.sender, _spender, _value);
        Approval(msg.sender, _spender, _value);

        return true;
    }

    function allowance(address _account, address _spender)
        public
        returns (uint)
    {
        return stateContract.allowance(_account, _spender);
    }

    function balanceOf(address _account)
        public
        returns (uint)
    {
        return stateContract.balanceOf(_account);
    }

    function totalSupply()
        public
        returns (uint)
    {
        return stateContract.totalSupply();
    }

    /* ========== EVENTS ========== */

    event Transfer(address indexed _from, address indexed _to, uint _value);

    event Approval(address indexed _owner, address indexed _spender, uint _value);

}
