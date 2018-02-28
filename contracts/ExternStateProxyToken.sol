/*
-----------------------------------------------------------------
FILE INFORMATION
-----------------------------------------------------------------
file:       ExternStateProxyToken.sol
version:    0.4
author:     Anton Jurisevic
            Dominic Romanowski

date:       2018-2-28

checked:    Mike Spain
approved:   Samuel Brooks

-----------------------------------------------------------------
MODULE DESCRIPTION
-----------------------------------------------------------------

A token interface to be overridden to produce an ERC20-compliant
token contract. It relies on being called underneath a proxy,
as described in Proxy.sol.

This contract utilises a state for upgradability purposes.

-----------------------------------------------------------------
*/

pragma solidity ^0.4.20;


import "contracts/SafeDecimalMath.sol";
import "contracts/Owned.sol";
import "contracts/TokenState.sol";
import "contracts/Proxy.sol";


contract ExternStateProxyToken is SafeDecimalMath, Proxyable {

    /* ========== STATE VARIABLES ========== */

    // state that stores balances, allowances and totalSupply
    TokenState public state;

    string public name;
    string public symbol;


    /* ========== CONSTRUCTOR ========== */

    function ExternStateProxyToken(
        string _name, string _symbol,
        uint initialSupply, address initialBeneficiary,
        TokenState _state, address _owner
    )
        Proxyable(_owner)
        public
    {
        name = _name;
        symbol = _symbol;
        state = _state;
        // if the state isn't set, create a new one
        if (state == TokenState(0)) {
            state = new TokenState(_owner, initialSupply, initialBeneficiary, address(this));
            Transfer(0x0, initialBeneficiary, initialSupply);
        }
    }

    /* ========== VIEWS ========== */

    function allowance(address account, address spender)
        public
        view
        returns (uint)
    {
        return state.allowance(account, spender);
    }

    function balanceOf(address account)
        public
        view
        returns (uint)
    {
        return state.balanceOf(account);
    }

    function totalSupply()
        public
        view
        returns (uint)
    {
        return state.totalSupply();
    }

    /* ========== MUTATIVE FUNCTIONS ========== */

    function setState(TokenState _state)
        onlyOwner
        public
    {
        state = _state;
    } 

    function transfer(address messageSender, address to, uint value)
        public
        returns (bool)
    {
        require(to != address(0));

        // Insufficient balance will be handled by the safe subtraction.
        state.setBalance(messageSender, safeSub(state.balanceOf(messageSender), value));
        state.setBalance(to, safeAdd(state.balanceOf(to), value));

        Transfer(messageSender, to, value);

        return true;
    }

    function transferFrom(address messageSender, address from, address to, uint value)
        public
        returns (bool)
    {
        require(from != address(0) && to != address(0));

        // Insufficient balance will be handled by the safe subtraction.
        state.setBalance(from, safeSub(state.balanceOf(from), value));
        state.setAllowance(from, messageSender, safeSub(state.allowance(from, messageSender), value));
        state.setBalance(to, safeAdd(state.balanceOf(to), value));

        Transfer(from, to, value);

        return true;
    }

    function approve(address spender, uint value)
        public
        optionalProxy
        returns (bool)
    {
        address messageSender = proxy.messageSender();
        state.setAllowance(messageSender, spender, value);

        Approval(messageSender, spender, value);

        return true;
    }

    /* ========== EVENTS ========== */

    event Transfer(address indexed from, address indexed to, uint value);

    event Approval(address indexed owner, address indexed spender, uint value);
}
