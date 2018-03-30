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


contract ExternStateToken is SafeDecimalMath, Owned {

    /* ========== STATE VARIABLES ========== */

    // Stores balances and allowances.
    TokenState public bal_s;
    // Stores all other variables
    address public s;


    /* ========== CONSTRUCTOR ========== */

    function ExternStateToken(string _name, string _symbol,
                                   uint initialSupply, address initialBeneficiary,
                                   address _state, TokenState _token_state, address _owner)
        Owned(_owner)
        public
    {
        s = _state;
        s.setName(_name);
        s.setSymbol(_symbol);
        s.setTotalSupply(initialSupply);

        // if the state isn't set, create a new one
        if (_token_state == TokenState(0)) {
            bal_s = new TokenState(_owner, address(this));
            bal_s.setBalanceOf(initialBeneficiary, totalSupply);
            emit Transfer(address(0), initialBeneficiary, initialSupply);
        } else {
            bal_s = _token_state;
        }
   }

    /* ========== VIEWS ========== */

    function allowance(address tokenOwner, address spender)
        public
        view
        returns (uint)
    {
        return bal_s.allowance(tokenOwner, spender);
    }

    function balanceOf(address account)
        public
        view
        returns (uint)
    {
        return bal_s.balanceOf(account);
    }

    function name()
        public
        view
        returns (string)
    {
        return s.name();
    }

    function symbol()
        public
        view
        returns (string)
    {
        return s.symbol();
    }

    function totalSupply()
        public
        view
        returns (uint)
    {
        return s.totalSupply();
    }

    function setTotalSupply(uint _total_supply)
        internal
    {
        s.setTotalSupply(_total_supply);
    }

    /* ========== MUTATIVE FUNCTIONS ========== */

    function setState(address _state)
        external
        onlyOwner
    {
        s = _state;
        emit StateUpdated(_state);
    } 

    /* Anything calling this must apply the onlyProxy or optionalProxy modifiers.*/
    function transfer(address to, uint value)
        internal
        returns (bool)
    {
        require(to != address(0));

        // Insufficient balance will be handled by the safe subtraction.
        bal_s.setBalanceOf(msg.sender, safeSub(bal_s.balanceOf(msg.sender), value));
        bal_s.setBalanceOf(to, safeAdd(bal_s.balanceOf(to), value));

        emit Transfer(msg.sender, to, value);

        return true;
    }

    /* Anything calling this must apply the onlyProxy or optionalProxy modifiers.*/
    function transferFrom(address from, address to, uint value)
        internal
        returns (bool)
    {
        require(from != address(0) && to != address(0));

        // Insufficient balance will be handled by the safe subtraction.
        bal_s.setBalanceOf(from, safeSub(bal_s.balanceOf(from), value));
        bal_s.setAllowance(from, msg.sender, safeSub(bal_s.allowance(from, msg.sender), value));
        bal_s.setBalanceOf(to, safeAdd(bal_s.balanceOf(to), value));

        emit Transfer(from, to, value);

        return true;
    }

    function approve(address spender, uint value)
        external
        returns (bool)
    {
        address sender = msg.sender;
        bal_s.setAllowance(sender, spender, value);
        emit Approval(sender, spender, value);
        return true;
    }

    /* ========== EVENTS ========== */

    event Transfer(address indexed from, address indexed to, uint value);

    event Approval(address indexed owner, address indexed spender, uint value);

    event StateUpdated(address newState);
}
