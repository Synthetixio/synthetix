/*
-----------------------------------------------------------------
FILE INFORMATION
-----------------------------------------------------------------
file:       ERC20Token.sol
version:    0.3
author:     Anton Jurisevic
            Dominic Romanowski

date:       2018-2-24

checked:    Mike Spain
approved:   Samuel Brooks

-----------------------------------------------------------------
MODULE DESCRIPTION
-----------------------------------------------------------------

An ERC20-compliant token.

This contract utilises a state for upgradability purposes.

-----------------------------------------------------------------
*/

pragma solidity ^0.4.19;


import "contracts/SafeDecimalMath.sol";
import "contracts/Owned.sol";
import "contracts/ERC20State.sol";


contract ERC20Token is SafeDecimalMath, Owned {

    /* ========== STATE VARIABLES ========== */

    // state that stores balances, allowances and totalSupply
    ERC20State public state;

    string public name;
    string public symbol;


    /* ========== CONSTRUCTOR ========== */

    function ERC20Token(
        address _owner, string _name, string _symbol, uint initialSupply,
        address initialBeneficiary, ERC20State _state
    )
        Owned(_owner)
        public
    {
        name = _name;
        symbol = _symbol;
        state = _state;
        // if the state isn't set, create a new one
        if (state == ERC20State(0)) {
            state = new ERC20State(_owner, initialSupply, initialBeneficiary, address(this));
        }
    }

    /* ========== GETTERS ========== */

    function allowance(address _account, address _spender)
        public
        returns (uint)
    {
        return state.allowance(_account, _spender);
    }

    function balanceOf(address _account)
        public
        returns (uint)
    {
        return state.balanceOf(_account);
    }

    function totalSupply()
        public
        returns (uint)
    {
        return state.totalSupply();
    }

    /* ========== MUTATIVE FUNCTIONS ========== */

    function setState(ERC20State _state)
        onlyOwner
        public
    {
        state = _state;
    }

    function setTotalSupply(uint _val)
        onlyOwner
        public
    {
        state.setTotalSupply(_val);
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
        state.setBalance(msg.sender, safeSub(state.balanceOf(msg.sender), _value));
        state.setBalance(_to, safeAdd(state.balanceOf(_to), _value));

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
        state.setBalance(_from, safeSub(state.balanceOf(_from), _value));
        state.setAllowance(_from, msg.sender, safeSub(state.allowance(_from, msg.sender), _value));
        state.setBalance(_to, safeAdd(state.balanceOf(_to), _value));

        return true;
    }

    function approve(address _spender, uint _value)
        public
        returns (bool)
    {
        state.setAllowance(msg.sender, _spender, _value);
        Approval(msg.sender, _spender, _value);

        return true;
    }

    /* ========== EVENTS ========== */

    event Transfer(address indexed _from, address indexed _to, uint _value);

    event Approval(address indexed _owner, address indexed _spender, uint _value);

}
