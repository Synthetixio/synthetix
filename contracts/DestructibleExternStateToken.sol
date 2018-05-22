/*
-----------------------------------------------------------------
FILE INFORMATION
-----------------------------------------------------------------

file:       DestructibleExternStateToken.sol
version:    1.2
author:     Anton Jurisevic
            Dominic Romanowski

date:       2018-05-22

checked:    Mike Spain
approved:   Samuel Brooks

-----------------------------------------------------------------
MODULE DESCRIPTION
-----------------------------------------------------------------

A partial ERC20 token contract, designed to operate with a proxy.
To produce a complete ERC20 token, transfer and transferFrom
tokens must be implemented, using the provided _byProxy internal
functions.
This contract utilises an external state for upgradability.

-----------------------------------------------------------------
*/

pragma solidity 0.4.24;


import "contracts/SafeDecimalMath.sol";
import "contracts/SelfDestructible.sol";
import "contracts/TokenState.sol";
import "contracts/Proxyable.sol";


/**
 * @title ERC20 Token contract, with detached state and designed to operate behind a proxy.
 */
contract DestructibleExternStateToken is SafeDecimalMath, SelfDestructible, Proxyable {

    /* ========== STATE VARIABLES ========== */

    uint constant SELF_DESTRUCT_DELAY = 4 weeks;

    /* Stores balances and allowances. */
    TokenState public state;

    /* Other ERC20 fields.
     * Note that the decimals field is defined in SafeDecimalMath.*/
    string public name;
    string public symbol;
    uint public totalSupply;

    /**
     * @dev Constructor.
     * @param _name Token's ERC20 name.
     * @param _symbol Token's ERC20 symbol.
     * @param _totalSupply The total supply of the token.
     * @param _state The state contract address. A fresh one is constructed if 0x0 is provided.
     * @param _owner The owner of this contract.
     */
    constructor(address _proxy, string _name, string _symbol, uint _totalSupply,
                TokenState _state, address _owner)
        SelfDestructible(_owner, _owner, SELF_DESTRUCT_DELAY)
        Proxyable(_proxy, _owner)
        public
    {
        name = _name;
        symbol = _symbol;
        totalSupply = _totalSupply;
        state = _state;
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
        optionalProxy_onlyOwner
    {
        state = _state;
        emitStateUpdated(_state);
    }

    /**
     * @dev Perform an ERC20 token transfer. Designed to be called by transfer functions possessing
     * the onlyProxy or optionalProxy modifiers.
     */
    function _transfer_byProxy(address sender, address to, uint value)
        internal
        returns (bool)
    {
        require(to != address(0));

        /* Insufficient balance will be handled by the safe subtraction. */
        state.setBalanceOf(sender, safeSub(state.balanceOf(sender), value));
        state.setBalanceOf(to, safeAdd(state.balanceOf(to), value));

        emitTransfer(sender, to, value);

        return true;
    }

    /**
     * @dev Perform an ERC20 token transferFrom. Designed to be called by transferFrom functions
     * possessing the optionalProxy or optionalProxy modifiers.
     */
    function _transferFrom_byProxy(address sender, address from, address to, uint value)
        internal
        returns (bool)
    {
        require(to != address(0));

        /* Insufficient balance will be handled by the safe subtraction. */
        state.setBalanceOf(from, safeSub(state.balanceOf(from), value));
        state.setAllowance(from, sender, safeSub(state.allowance(from, sender), value));
        state.setBalanceOf(to, safeAdd(state.balanceOf(to), value));

        emitTransfer(from, to, value);

        return true;
    }

    /**
     * @notice Approves spender to transfer on the message sender's behalf.
     */
    function approve(address spender, uint value)
        public
        optionalProxy
        returns (bool)
    {
        address sender = messageSender;

        state.setAllowance(sender, spender, value);
        emitApproval(sender, spender, value);
        return true;
    }

    /* ========== EVENTS ========== */

    event Transfer(address indexed from, address indexed to, uint value);
    function emitTransfer(address from, address to, uint value) internal {
        bytes memory data = abi.encode(value);
        bytes memory call_args = abi.encodeWithSignature("_emit(bytes,uint256,bytes32,bytes32,bytes32,bytes32)",
            data, 3, keccak256("Transfer(address,address,uint256)"), bytes32(from), bytes32(to));
        require(address(proxy).call(call_args));
    }

    event Approval(address indexed owner, address indexed spender, uint value);
    function emitApproval(address owner, address spender, uint value) internal {
        bytes memory data = abi.encode(value);
        bytes memory call_args = abi.encodeWithSignature("_emit(bytes,uint256,bytes32,bytes32,bytes32,bytes32)",
            data, 3, keccak256("Approval(address,address,uint256)"), bytes32(owner), bytes32(spender));
        require(address(proxy).call(call_args));        
    }

    event StateUpdated(address newState);
    function emitStateUpdated(address newState) internal {
        bytes memory data = abi.encode(newState);
        bytes memory call_args = abi.encodeWithSignature("_emit(bytes,uint256,bytes32,bytes32,bytes32,bytes32)",
            data, 1, keccak256("StateUpdated(address)"));
        require(address(proxy).call(call_args));        
    }
}
