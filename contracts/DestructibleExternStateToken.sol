/*
-----------------------------------------------------------------
FILE INFORMATION
-----------------------------------------------------------------
file:       DestructibleExternStateToken.sol
version:    1.1
author:     Anton Jurisevic
            Dominic Romanowski

date:       2018-05-02

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

pragma solidity 0.4.23;


import "contracts/SafeDecimalMath.sol";
import "contracts/SelfDestructible.sol";
import "contracts/TokenState.sol";


/**
 * @title ERC20 Token contract, with detached state and designed to operate behind a proxy.
 */
contract DestructibleExternStateToken is SafeDecimalMath, SelfDestructible {

    /* ========== STATE VARIABLES ========== */

    /* Stores balances and allowances. */
    TokenState public state;

    /* Other ERC20 fields. */
    string public name;
    string public symbol;
    uint public totalSupply;


    /* ========== CONSTRUCTOR ========== */

    /**
     * @dev Constructor.
     * @param _name Token's ERC20 name.
     * @param _symbol Token's ERC20 symbol.
     * @param _initialSupply The initial supply of the token.
     * @param _initialBeneficiary The recipient of the initial token supply if _state is 0.
     * @param _state The state contract address. A fresh one is constructed if 0x0 is provided.
     * @param _owner The owner of this contract.
     */
    constructor(string _name, string _symbol,
                                   uint _initialSupply, address _initialBeneficiary,
                                   TokenState _state, address _owner)
        SelfDestructible(_owner, _owner)
        public
    {
        name = _name;
        symbol = _symbol;
        totalSupply = _initialSupply;

        // if the state isn't set, create a new one
        if (_state == TokenState(0)) {
            state = new TokenState(_owner, address(this));
            state.setBalanceOf(_initialBeneficiary, totalSupply);
            emit Transfer(address(0), _initialBeneficiary, _initialSupply);
        } else {
            state = _state;
        }
   }

    /* ========== VIEWS ========== */

    /**
     * @notice Returns the ERC20 allowance of one party to spend on behalf of another.
     * @param tokenOwner The party authorising spending of their funds.
     * @param spender The party spending tokenOwner's funds.
     */
    function allowance(address tokenOwner, address spender)
        public
        view
        returns (uint)
    {
        return state.allowance(tokenOwner, spender);
    }

    /**
     * @notice Returns the ERC20 token balance of a given account.
     */
    function balanceOf(address account)
        public
        view
        returns (uint)
    {
        return state.balanceOf(account);
    }

    /* ========== MUTATIVE FUNCTIONS ========== */

    /**
     * @notice Change the address of the state contract.
     * @dev Only the contract owner may operate this function.
     */
    function setState(TokenState _state)
        external
        onlyOwner
    {
        state = _state;
        emit StateUpdated(_state);
    } 

    /**
     * @dev Perform an ERC20 token transfer. Designed to be called by transfer functions possessing
     * the onlyProxy or optionalProxy modifiers.
     */
    function transfer(address to, uint value)
        public
        returns (bool)
    {
        require(to != address(0));

        /* Insufficient balance will be handled by the safe subtraction. */
        state.setBalanceOf(msg.sender, safeSub(state.balanceOf(msg.sender), value));
        state.setBalanceOf(to, safeAdd(state.balanceOf(to), value));

        emit Transfer(msg.sender, to, value);

        return true;
    }

    /**
     * @dev Perform an ERC20 token transferFrom. Designed to be called by transferFrom functions
     * possessing the onlyProxy or optionalProxy modifiers.
     */
    function transferFrom(address from, address to, uint value)
        public
        returns (bool)
    {
        require(to != address(0));

        /* Insufficient balance will be handled by the safe subtraction. */
        state.setBalanceOf(from, safeSub(state.balanceOf(from), value));
        state.setAllowance(from, msg.sender, safeSub(state.allowance(from, msg.sender), value));
        state.setBalanceOf(to, safeAdd(state.balanceOf(to), value));

        emit Transfer(from, to, value);

        return true;
    }

    /**
     * @notice Approves spender to transfer on the message sender's behalf.
     */
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
