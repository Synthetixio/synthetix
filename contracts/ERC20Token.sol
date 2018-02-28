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

pragma solidity ^0.4.20;


import "contracts/SafeDecimalMath.sol";
import "contracts/Owned.sol";
import "contracts/ERC20State.sol";
import "contracts/Proxy.sol";


contract ERC20Token is SafeDecimalMath, Proxyable {

    /* ========== STATE VARIABLES ========== */

    // state that stores balances, allowances and totalSupply
    ERC20State public state;

    string public name;
    string public symbol;


    /* ========== CONSTRUCTOR ========== */

    function ERC20Token(
        string _name, string _symbol,
        uint initialSupply, address initialBeneficiary,
        ERC20State _state, address _owner
    )
        Proxyable(_owner)
        public
    {
        name = _name;
        symbol = _symbol;
        state = _state;
        // if the state isn't set, create a new one
        if (state == ERC20State(0)) {
            state = new ERC20State(_owner, initialSupply, initialBeneficiary, address(this));
            Transfer(0x0, initialBeneficiary, initialSupply);
        }
    }

    /* ========== VIEWS ========== */

    function allowance(address _account, address _spender)
        public
        view
        returns (uint)
    {
        return state.allowance(_account, _spender);
    }

    function balanceOf(address _account)
        public
        view
        returns (uint)
    {
        return state.balanceOf(_account);
    }

    function totalSupply()
        public
        view
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

    function transfer(address messageSender, address _to, uint _value)
        public
        returns (bool)
    {
        require(_to != address(0));

        // Insufficient balance will be handled by the safe subtraction.
        state.setBalance(messageSender, safeSub(state.balanceOf(messageSender), _value));
        state.setBalance(_to, safeAdd(state.balanceOf(_to), _value));

        Transfer(messageSender, _to, _value);

        return true;
    }

    function transferFrom(address messageSender, address _from, address _to, uint _value)
        public
        returns (bool)
    {
        require(_from != address(0) && _to != address(0));

        // Insufficient balance will be handled by the safe subtraction.
        state.setBalance(_from, safeSub(state.balanceOf(_from), _value));
        state.setAllowance(_from, messageSender, safeSub(state.allowance(_from, messageSender), _value));
        state.setBalance(_to, safeAdd(state.balanceOf(_to), _value));

        Transfer(_from, _to, _value);

        return true;
    }

    function approve(address _spender, uint _value)
        public
        optionalProxy
        returns (bool)
    {
        address messageSender = proxy.messageSender();
        state.setAllowance(messageSender, _spender, _value);

        Approval(messageSender, _spender, _value);

        return true;
    }

    /* ========== EVENTS ========== */

    event Transfer(address indexed _from, address indexed _to, uint _value);

    event Approval(address indexed _owner, address indexed _spender, uint _value);

}
