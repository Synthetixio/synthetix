/*
-----------------------------------------------------------------
FILE INFORMATION
-----------------------------------------------------------------
file:       ExternStateToken.sol
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
token contract.

This contract utilises a state for upgradability purposes.

-----------------------------------------------------------------
*/

pragma solidity 0.4.21;


import "contracts/SafeDecimalMath.sol";
import "contracts/Owned.sol";
import "contracts/TokenState.sol";


contract ExternStateToken is SafeDecimalMath, Owned {

    /* ========== STATE VARIABLES ========== */

    // Stores balances and allowances.
    TokenState public state;

    // Other ERC20 fields
    string public name;
    string public symbol;
    uint public totalSupply;


    /* ========== CONSTRUCTOR ========== */

    function ExternStateToken(string _name, string _symbol,
                                   uint initialSupply, address initialBeneficiary,
                                   TokenState _state, address _owner)
        Owned(_owner)
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
        onlyOwner
    {
        state = _state;
        emit StateUpdated(_state);
    } 

    /* Anything calling this must apply the onlyProxy or optionalProxy modifiers.*/
    function transfer(address to, uint value)
        public
        returns (bool)
    {
        require(to != address(0));

        // Insufficient balance will be handled by the safe subtraction.
        state.setBalanceOf(msg.sender, safeSub(state.balanceOf(msg.sender), value));
        state.setBalanceOf(to, safeAdd(state.balanceOf(to), value));

        emit Transfer(msg.sender, to, value);

        return true;
    }

    /* Anything calling this must apply the onlyProxy or optionalProxy modifiers.*/
    function transferFrom(address from, address to, uint value)
        public
        returns (bool)
    {
        require(to != address(0));

        // Insufficient balance will be handled by the safe subtraction.
        state.setBalanceOf(from, safeSub(state.balanceOf(from), value));
        state.setAllowance(from, msg.sender, safeSub(state.allowance(from, msg.sender), value));
        state.setBalanceOf(to, safeAdd(state.balanceOf(to), value));

        emit Transfer(from, to, value);

        return true;
    }

    function approve(address spender, uint value)
        public
        returns (bool)
    {
        state.setAllowance(msg.sender, spender, value);
        emit Approval(msg.sender, spender, value);
        return true;
    }

    /* ========== EVENTS ========== */

    event Transfer(address indexed from, address indexed to, uint value);

    event Approval(address indexed owner, address indexed spender, uint value);

    event StateUpdated(address newState);
}
