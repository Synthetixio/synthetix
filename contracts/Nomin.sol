/*
-----------------------------------------------------------------
FILE INFORMATION
-----------------------------------------------------------------

file:       Nomin.sol
version:    2.0
author:     Kevin Brown
date:       2018-09-13

-----------------------------------------------------------------
MODULE DESCRIPTION
-----------------------------------------------------------------

Havven-backed nomin stablecoin contract.

This contract issues nomins, which are tokens that mirror various
flavours of fiat currency.

Nomins are issuable by Havven holders who have to lock up some
value of their havvens to issue H * Cmax nomins. Where Cmax is
some value less than 1.

A configurable fee is charged on nomin transfers and deposited
into a common pot, which havven holders may withdraw from once
per fee period.

-----------------------------------------------------------------
*/

pragma solidity 0.4.25;

import "./ExternStateToken.sol";
import "./Havven.sol";

contract Nomin is ExternStateToken {

    /* ========== STATE VARIABLES ========== */

    Havven public havven;

    // Currency key which identifies this Nomin to the Havven system
    bytes4 public currencyKey;

    // Nomin transfers incur a 15 bp fee by default.
    uint constant TRANSFER_FEE_RATE = 15 * UNIT / 10000;

    /* ========== CONSTRUCTOR ========== */

    constructor(address _proxy, TokenState _tokenState, Havven _havven, string _tokenName, 
        string _tokenSymbol, address _owner, bytes4 _currencyKey
    )
        ExternStateToken(_proxy, _tokenState, _tokenName, _tokenSymbol, 0, _owner)
        public
    {
        require(_proxy != 0, "_proxy cannot be 0");
        require(address(_havven) != 0, "_havven cannot be 0");
        require(_owner != 0, "_owner cannot be 0");
        require(_havven.nomins(_currencyKey) == Nomin(0), "Currency key is already in use");

        havven = _havven;
        currencyKey = _currencyKey;
    }

    /* ========== SETTERS ========== */

    function setHavven(Havven _havven)
        external
        optionalProxy_onlyOwner
    {
        havven = _havven;
        emitHavvenUpdated(_havven);
    }

    /* ========== MUTATIVE FUNCTIONS ========== */

    /**
     * @notice Override ERC20 transfer function in order to check
     * whether the recipient account is frozen. Note that there is
     * no need to check whether the sender has a frozen account,
     * since their funds have already been confiscated,
     * and no new funds can be transferred to it.*/
    function transfer(address to, uint value)
        public
        optionalProxy
        notFeeAddress(messageSender)
        returns (bool)
    {
        uint amountReceived = havven.amountReceivedFromTransfer(value);
        uint fee = safeSub(value, amountReceived);

        // Send the fee off to the fee pool, which we don't want to charge an additional fee on
        havven.nominInitiatedExchangeWithoutFee(messageSender, currencyKey, fee, "HDR", havven.FEE_ADDRESS());

        // And send their result off to the destination address
        bytes memory empty;
        return _internalTransfer(messageSender, to, value, empty);
    }

    /* Override ERC223 transfer function in order to check
     * whether the recipient account is frozen. Note that there is
     * no need to check whether the sender has a frozen account,
     * since their funds have already been confiscated,
     * and no new funds can be transferred to it.*/
    function transfer(address to, uint value, bytes data)
        public
        optionalProxy
        notFeeAddress(messageSender)
        returns (bool)
    {
        uint amountReceived = havven.amountReceivedFromTransfer(value);
        uint fee = safeSub(value, amountReceived);

        // Send the fee off to the fee pool, which we don't want to charge an additional fee on
        havven.nominInitiatedExchangeWithoutFee(messageSender, currencyKey, fee, "HDR", havven.FEE_ADDRESS());

        // And send their result off to the destination address
        return _internalTransfer(messageSender, to, value, data);
    }

    /* Override ERC20 transferFrom function in order to check
     * whether the recipient account is frozen. */
    function transferFrom(address from, address to, uint value)
        public
        optionalProxy
        notFeeAddress(from)
        returns (bool)
    {
        // The fee is deducted from the amount sent.
        uint amountReceived = havven.amountReceivedFromTransfer(value);
        uint fee = safeSub(value, amountReceived);

        // Reduce the allowance by the amount we're transferring.
        // The safeSub call will handle an insufficient allowance.
        tokenState.setAllowance(from, messageSender, safeSub(tokenState.allowance(from, messageSender), value));

        // Send the fee off to the fee pool, which we don't want to charge an additional fee on
        havven.nominInitiatedExchangeWithoutFee(messageSender, currencyKey, fee, "HDR", havven.FEE_ADDRESS());

        bytes memory empty;
        return _internalTransfer(from, to, amountReceived, empty);
    }

    /* Override ERC223 transferFrom function in order to check
     * whether the recipient account is frozen. */
    function transferFrom(address from, address to, uint value, bytes data)
        public
        optionalProxy
        notFeeAddress(from)
        returns (bool)
    {
        // The fee is deducted from the amount sent.
        uint amountReceived = havven.amountReceivedFromTransfer(value);
        uint fee = safeSub(value, amountReceived);

        // Reduce the allowance by the amount we're transferring.
        // The safeSub call will handle an insufficient allowance.
        tokenState.setAllowance(from, messageSender, safeSub(tokenState.allowance(from, messageSender), value));

        // Send the fee off to the fee pool, which we don't want to charge an additional fee on
        havven.nominInitiatedExchangeWithoutFee(messageSender, currencyKey, fee, "HDR", havven.FEE_ADDRESS());

        return _internalTransfer(from, to, amountReceived, data);
    }

    function transferSenderPaysFee(address to, uint value)
        public
        optionalProxy
        notFeeAddress(messageSender)
        returns (bool)
    {
        uint fee = havven.transferFeeIncurred(value);

        // Send the fee off to the fee pool, which we don't want to charge an additional fee on
        havven.nominInitiatedExchangeWithoutFee(messageSender, currencyKey, fee, "HDR", havven.FEE_ADDRESS());

        // And send their transfer amount off to the destination address
        bytes memory empty;
        return _internalTransfer(messageSender, to, value, empty);
    }

    function transferSenderPaysFee(address to, uint value, bytes data)
        public
        optionalProxy
        notFeeAddress(messageSender)
        returns (bool)
    {
        uint fee = havven.transferFeeIncurred(value);

        // Send the fee off to the fee pool, which we don't want to charge an additional fee on
        havven.nominInitiatedExchangeWithoutFee(messageSender, currencyKey, fee, "HDR", havven.FEE_ADDRESS());

        // And send their transfer amount off to the destination address
        return _internalTransfer(messageSender, to, value, data);
    }

    function transferFromSenderPaysFee(address from, address to, uint value)
        public
        optionalProxy
        notFeeAddress(from)
        returns (bool)
    {
        uint fee = havven.transferFeeIncurred(value);

        // Reduce the allowance by the amount we're transferring.
        // The safeSub call will handle an insufficient allowance.
        tokenState.setAllowance(from, messageSender, safeSub(tokenState.allowance(from, messageSender), safeAdd(value, fee)));

        // Send the fee off to the fee pool, which we don't want to charge an additional fee on
        havven.nominInitiatedExchangeWithoutFee(messageSender, currencyKey, fee, "HDR", havven.FEE_ADDRESS());

        bytes memory empty;
        return _internalTransfer(from, to, value, empty);
    }

    function transferFromSenderPaysFee(address from, address to, uint value, bytes data)
        public
        optionalProxy
        notFeeAddress(from)
        returns (bool)
    {
        uint fee = havven.transferFeeIncurred(value);

        // Reduce the allowance by the amount we're transferring.
        // The safeSub call will handle an insufficient allowance.
        tokenState.setAllowance(from, messageSender, safeSub(tokenState.allowance(from, messageSender), safeAdd(value, fee)));

        // Send the fee off to the fee pool, which we don't want to charge an additional fee on
        havven.nominInitiatedExchangeWithoutFee(messageSender, currencyKey, fee, "HDR", havven.FEE_ADDRESS());

        return _internalTransfer(from, to, value, data);
    }

    // Allow havven to issue a certain number of nomins from an account.
    function issue(address account, uint amount)
        external
        onlyHavvenOrNomin
    {
        tokenState.setBalanceOf(account, safeAdd(tokenState.balanceOf(account), amount));
        totalSupply = safeAdd(totalSupply, amount);
        emitTransfer(address(0), account, amount);
        emitIssued(account, amount);
    }

    // Allow havven or another nomin contract to burn a certain number of nomins from an account.
    function burn(address account, uint amount)
        external
        onlyHavvenOrNomin
    {
        tokenState.setBalanceOf(account, safeSub(tokenState.balanceOf(account), amount));
        totalSupply = safeSub(totalSupply, amount);
        emitTransfer(account, address(0), amount);
        emitBurned(account, amount);
    }

    // Allow havven to trigger a token fallback call from our nomins so users get notified on
    // exchange as well as transfer
    function triggerTokenFallbackIfNeeded(address sender, address recipient, uint amount) 
        external
        onlyHavven
    {
        bytes memory empty;
        callTokenFallbackIfNeeded(sender, recipient, amount, empty);
    }

    /* ========== MODIFIERS ========== */

    modifier onlyHavvenOrNomin() {
        bool isHavven = msg.sender == address(havven);
        bool isNomin = false;

        // Gas optimisation - No point iterating nomins if we've already found it.
        if (!isHavven) {
            // No need to repeatedly call this function either
            uint availableNominCount = havven.availableNominCount();
            for (uint8 i = 0; i < availableNominCount; i++) {
                if (havven.availableNomins(i) == msg.sender) {
                    isNomin = true;
                    break;
                }
            }
        }

        require(isHavven || isNomin, "Only the Havven or Nomin contracts can perform this action");
        _;
    }

    modifier onlyHavven() {
        require(msg.sender == address(havven), "Only the Havven contract can perform this action");
        _;
    }

    modifier notFeeAddress(address account) {
        require(account != havven.FEE_ADDRESS(), "Cannot perform this action with the fee address");
        _;
    }

    /* ========== EVENTS ========== */

    event HavvenUpdated(address newHavven);
    bytes32 constant HAVVENUPDATED_SIG = keccak256("HavvenUpdated(address)");
    function emitHavvenUpdated(address newHavven) internal {
        proxy._emit(abi.encode(newHavven), 1, HAVVENUPDATED_SIG, 0, 0, 0);
    }

    event FeePoolUpdated(address newFeePool);
    bytes32 constant FEEPOOLUPDATED_SIG = keccak256("FeePoolUpdated(address)");
    function emitFeePoolUpdated(address newFeePool) internal {
        proxy._emit(abi.encode(newFeePool), 1, FEEPOOLUPDATED_SIG, 0, 0, 0);
    }

    event Issued(address indexed account, uint amount);
    bytes32 constant ISSUED_SIG = keccak256("Issued(address,uint256)");
    function emitIssued(address account, uint amount) internal {
        proxy._emit(abi.encode(amount), 2, ISSUED_SIG, bytes32(account), 0, 0);
    }

    event Burned(address indexed account, uint amount);
    bytes32 constant BURNED_SIG = keccak256("Burned(address,uint256)");
    function emitBurned(address account, uint amount) internal {
        proxy._emit(abi.encode(amount), 2, BURNED_SIG, bytes32(account), 0, 0);
    }
}
