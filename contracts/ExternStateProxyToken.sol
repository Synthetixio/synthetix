/*
-----------------------------------------------------------------
FILE INFORMATION
-----------------------------------------------------------------
file:       ExternStateProxyToken.sol
version:    1.0
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

pragma solidity ^0.4.21;


import "contracts/SafeDecimalMath.sol";
import "contracts/Owned.sol";
import "contracts/TokenState.sol";
import "contracts/Proxy.sol";


contract ExternStateProxyToken is SafeDecimalMath, Proxyable {

    /* ========== STATE VARIABLES ========== */

    // Stores balances and allowances.
    TokenState public state;

    // Other ERC20 fields
    string public name;
    string public symbol;
    uint public totalSupply;


    /* ========== CONSTRUCTOR ========== */

    function ExternStateProxyToken(string _name, string _symbol,
                                   uint initialSupply, address initialBeneficiary,
                                   TokenState _state, address _owner)
        Proxyable(_owner)
        public
    {
        name = _name;
        symbol = _symbol;
        totalSupply = initialSupply;

        // if the state isn't set, create a new one
        if (_state == TokenState(0)) {
            state = new TokenState(_owner, address(this));
            state.setBalanceOf(initialBeneficiary, totalSupply);
            emit Transfer(address(0), initialBeneficiary, initialSupply);
        } else {
            state = _state;
        }
   }

    /* ========== VIEWS ========== */

    function allowance(address tokenOwner, address spender)
        public
        view
        returns (uint)
    {
        return state.allowance(tokenOwner, spender);
    }

    function balanceOf(address account)
        public
        view
        returns (uint)
    {
        return state.balanceOf(account);
    }

    /* ========== MUTATIVE FUNCTIONS ========== */

    function setState(TokenState _state)
        external
        optionalProxy_onlyOwner
    {
        state = _state;
        emit StateUpdated(_state);
    } 

    /* Anything calling this must apply the onlyProxy or optionalProxy modifiers.*/
    function _transfer_byProxy(address sender, address to, uint value)
        internal
        returns (bool)
    {
        require(to != address(0));

        // Insufficient balance will be handled by the safe subtraction.
        state.setBalanceOf(sender, safeSub(state.balanceOf(sender), value));
        state.setBalanceOf(to, safeAdd(state.balanceOf(to), value));

        emit Transfer(sender, to, value);

        return true;
    }

    /* Anything calling this must apply the onlyProxy or optionalProxy modifiers.*/
    function _transferFrom_byProxy(address sender, address from, address to, uint value)
        internal
        returns (bool)
    {
        require(from != address(0) && to != address(0));

        // Insufficient balance will be handled by the safe subtraction.
        state.setBalanceOf(from, safeSub(state.balanceOf(from), value));
        state.setAllowance(from, sender, safeSub(state.allowance(from, sender), value));
        state.setBalanceOf(to, safeAdd(state.balanceOf(to), value));

        emit Transfer(from, to, value);

        return true;
    }

    function approve(address spender, uint value)
        external
        optionalProxy
        returns (bool)
    {
        address sender = messageSender;
        state.setAllowance(sender, spender, value);
        emit Approval(sender, spender, value);
        return true;
    }

    /* ========== EVENTS ========== */

    event Transfer(address indexed from, address indexed to, uint value);

    event Approval(address indexed owner, address indexed spender, uint value);

    event StateUpdated(address newState);
}
