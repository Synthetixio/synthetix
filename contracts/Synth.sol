/*
-----------------------------------------------------------------
FILE INFORMATION
-----------------------------------------------------------------

file:       Synth.sol
version:    2.0
author:     Kevin Brown
date:       2018-09-13

-----------------------------------------------------------------
MODULE DESCRIPTION
-----------------------------------------------------------------

Synthetix-backed stablecoin contract.

This contract issues synths, which are tokens that mirror various
flavours of fiat currency.

Synths are issuable by Synthetix Network Token (SNX) holders who
have to lock up some value of their SNX to issue S * Cmax synths.
Where Cmax issome value less than 1.

A configurable fee is charged on synth transfers and deposited
into a common pot, which Synthetix holders may withdraw from once
per fee period.

-----------------------------------------------------------------
*/

pragma solidity 0.4.25;

import "./ExternStateToken.sol";
import "./IFeePool.sol";
import "./Synthetix.sol";

contract Synth is ExternStateToken {

    /* ========== STATE VARIABLES ========== */

    IFeePool public feePool;
    Synthetix public synthetix;

    // Currency key which identifies this Synth to the Synthetix system
    bytes4 public currencyKey;

    uint8 constant DECIMALS = 18;

    /* ========== CONSTRUCTOR ========== */

    constructor(address _proxy, TokenState _tokenState, Synthetix _synthetix, IFeePool _feePool,
        string _tokenName, string _tokenSymbol, address _owner, bytes4 _currencyKey
    )
        ExternStateToken(_proxy, _tokenState, _tokenName, _tokenSymbol, 0, DECIMALS, _owner)
        public
    {
        require(_proxy != 0, "_proxy cannot be 0");
        require(address(_synthetix) != 0, "_synthetix cannot be 0");
        require(address(_feePool) != 0, "_feePool cannot be 0");
        require(_owner != 0, "_owner cannot be 0");
        require(_synthetix.synths(_currencyKey) == Synth(0), "Currency key is already in use");

        feePool = _feePool;
        synthetix = _synthetix;
        currencyKey = _currencyKey;
    }

    /* ========== SETTERS ========== */

    function setSynthetix(Synthetix _synthetix)
        external
        optionalProxy_onlyOwner
    {
        synthetix = _synthetix;
        emitSynthetixUpdated(_synthetix);
    }

    function setFeePool(IFeePool _feePool)
        external
        optionalProxy_onlyOwner
    {
        feePool = _feePool;
        emitFeePoolUpdated(_feePool);
    }

    /* ========== MUTATIVE FUNCTIONS ========== */

    /**
     * @notice Override ERC20 transfer function in order to
     * subtract the transaction fee and send it to the fee pool
     * for SNX holders to claim. */
    function transfer(address to, uint value)
        public
        optionalProxy
        notFeeAddress(messageSender)
        returns (bool)
    {
        uint amountReceived = feePool.amountReceivedFromTransfer(value);
        uint fee = value.sub(amountReceived);

        // Send the fee off to the fee pool.
        synthetix.synthInitiatedFeePayment(messageSender, currencyKey, fee);

        // And send their result off to the destination address
        bytes memory empty;
        return _internalTransfer(messageSender, to, amountReceived, empty);
    }

    /**
     * @notice Override ERC223 transfer function in order to
     * subtract the transaction fee and send it to the fee pool
     * for SNX holders to claim. */
    function transfer(address to, uint value, bytes data)
        public
        optionalProxy
        notFeeAddress(messageSender)
        returns (bool)
    {
        uint amountReceived = feePool.amountReceivedFromTransfer(value);
        uint fee = value.sub(amountReceived);

        // Send the fee off to the fee pool, which we don't want to charge an additional fee on
        synthetix.synthInitiatedFeePayment(messageSender, currencyKey, fee);

        // And send their result off to the destination address
        return _internalTransfer(messageSender, to, amountReceived, data);
    }

    /**
     * @notice Override ERC20 transferFrom function in order to
     * subtract the transaction fee and send it to the fee pool
     * for SNX holders to claim. */
    function transferFrom(address from, address to, uint value)
        public
        optionalProxy
        notFeeAddress(from)
        returns (bool)
    {
        // The fee is deducted from the amount sent.
        uint amountReceived = feePool.amountReceivedFromTransfer(value);
        uint fee = value.sub(amountReceived);

        // Reduce the allowance by the amount we're transferring.
        // The safeSub call will handle an insufficient allowance.
        tokenState.setAllowance(from, messageSender, tokenState.allowance(from, messageSender).sub(value));

        // Send the fee off to the fee pool.
        synthetix.synthInitiatedFeePayment(from, currencyKey, fee);

        bytes memory empty;
        return _internalTransfer(from, to, amountReceived, empty);
    }

    /**
     * @notice Override ERC223 transferFrom function in order to
     * subtract the transaction fee and send it to the fee pool
     * for SNX holders to claim. */
    function transferFrom(address from, address to, uint value, bytes data)
        public
        optionalProxy
        notFeeAddress(from)
        returns (bool)
    {
        // The fee is deducted from the amount sent.
        uint amountReceived = feePool.amountReceivedFromTransfer(value);
        uint fee = value.sub(amountReceived);

        // Reduce the allowance by the amount we're transferring.
        // The safeSub call will handle an insufficient allowance.
        tokenState.setAllowance(from, messageSender, tokenState.allowance(from, messageSender).sub(value));

        // Send the fee off to the fee pool, which we don't want to charge an additional fee on
        synthetix.synthInitiatedFeePayment(from, currencyKey, fee);

        return _internalTransfer(from, to, amountReceived, data);
    }

    /* Subtract the transfer fee from the senders account so the
     * receiver gets the exact amount specified to send. */
    function transferSenderPaysFee(address to, uint value)
        public
        optionalProxy
        notFeeAddress(messageSender)
        returns (bool)
    {
        uint fee = feePool.transferFeeIncurred(value);

        // Send the fee off to the fee pool, which we don't want to charge an additional fee on
        synthetix.synthInitiatedFeePayment(messageSender, currencyKey, fee);

        // And send their transfer amount off to the destination address
        bytes memory empty;
        return _internalTransfer(messageSender, to, value, empty);
    }

    /* Subtract the transfer fee from the senders account so the
     * receiver gets the exact amount specified to send. */
    function transferSenderPaysFee(address to, uint value, bytes data)
        public
        optionalProxy
        notFeeAddress(messageSender)
        returns (bool)
    {
        uint fee = feePool.transferFeeIncurred(value);

        // Send the fee off to the fee pool, which we don't want to charge an additional fee on
        synthetix.synthInitiatedFeePayment(messageSender, currencyKey, fee);

        // And send their transfer amount off to the destination address
        return _internalTransfer(messageSender, to, value, data);
    }

    /* Subtract the transfer fee from the senders account so the
     * to address receives the exact amount specified to send. */
    function transferFromSenderPaysFee(address from, address to, uint value)
        public
        optionalProxy
        notFeeAddress(from)
        returns (bool)
    {
        uint fee = feePool.transferFeeIncurred(value);

        // Reduce the allowance by the amount we're transferring.
        // The safeSub call will handle an insufficient allowance.
        tokenState.setAllowance(from, messageSender, tokenState.allowance(from, messageSender).sub(value.add(fee)));

        // Send the fee off to the fee pool, which we don't want to charge an additional fee on
        synthetix.synthInitiatedFeePayment(from, currencyKey, fee);

        bytes memory empty;
        return _internalTransfer(from, to, value, empty);
    }

    /* Subtract the transfer fee from the senders account so the
     * to address receives the exact amount specified to send. */
    function transferFromSenderPaysFee(address from, address to, uint value, bytes data)
        public
        optionalProxy
        notFeeAddress(from)
        returns (bool)
    {
        uint fee = feePool.transferFeeIncurred(value);

        // Reduce the allowance by the amount we're transferring.
        // The safeSub call will handle an insufficient allowance.
        tokenState.setAllowance(from, messageSender, tokenState.allowance(from, messageSender).sub(value.add(fee)));

        // Send the fee off to the fee pool, which we don't want to charge an additional fee on
        synthetix.synthInitiatedFeePayment(from, currencyKey, fee);

        return _internalTransfer(from, to, value, data);
    }

    // Override our internal transfer to inject preferred currency support
    function _internalTransfer(address from, address to, uint value, bytes data)
        internal
        returns (bool)
    {
        bytes4 preferredCurrencyKey = synthetix.synthetixState().preferredCurrency(to);

        // Do they have a preferred currency that's not us? If so we need to exchange
        if (preferredCurrencyKey != 0 && preferredCurrencyKey != currencyKey) {
            return synthetix.synthInitiatedExchange(from, currencyKey, value, preferredCurrencyKey, to);
        } else {
            // Otherwise we just transfer
            return super._internalTransfer(from, to, value, data);
        }
    }

    // Allow synthetix to issue a certain number of synths from an account.
    function issue(address account, uint amount)
        external
        onlySynthetixOrFeePool
    {
        tokenState.setBalanceOf(account, tokenState.balanceOf(account).add(amount));
        totalSupply = totalSupply.add(amount);
        emitTransfer(address(0), account, amount);
        emitIssued(account, amount);
    }

    // Allow synthetix or another synth contract to burn a certain number of synths from an account.
    function burn(address account, uint amount)
        external
        onlySynthetixOrFeePool
    {
        tokenState.setBalanceOf(account, tokenState.balanceOf(account).sub(amount));
        totalSupply = totalSupply.sub(amount);
        emitTransfer(account, address(0), amount);
        emitBurned(account, amount);
    }

    // Allow owner to set the total supply on import.
    function setTotalSupply(uint amount)
        external
        optionalProxy_onlyOwner
    {
        totalSupply = amount;
    }

    // Allow synthetix to trigger a token fallback call from our synths so users get notified on
    // exchange as well as transfer
    function triggerTokenFallbackIfNeeded(address sender, address recipient, uint amount)
        external
        onlySynthetixOrFeePool
    {
        bytes memory empty;
        callTokenFallbackIfNeeded(sender, recipient, amount, empty);
    }

    /* ========== MODIFIERS ========== */

    modifier onlySynthetixOrFeePool() {
        bool isSynthetix = msg.sender == address(synthetix);
        bool isFeePool = msg.sender == address(feePool);

        require(isSynthetix || isFeePool, "Only the Synthetix or FeePool contracts can perform this action");
        _;
    }

    modifier notFeeAddress(address account) {
        require(account != feePool.FEE_ADDRESS(), "Cannot perform this action with the fee address");
        _;
    }

    /* ========== EVENTS ========== */

    event SynthetixUpdated(address newSynthetix);
    bytes32 constant SYNTHETIXUPDATED_SIG = keccak256("SynthetixUpdated(address)");
    function emitSynthetixUpdated(address newSynthetix) internal {
        proxy._emit(abi.encode(newSynthetix), 1, SYNTHETIXUPDATED_SIG, 0, 0, 0);
    }

    event FeePoolUpdated(address newFeePool);
    bytes32 constant FEEPOOLUPDATED_SIG = keccak256("FeePoolUpdated(address)");
    function emitFeePoolUpdated(address newFeePool) internal {
        proxy._emit(abi.encode(newFeePool), 1, FEEPOOLUPDATED_SIG, 0, 0, 0);
    }

    event Issued(address indexed account, uint value);
    bytes32 constant ISSUED_SIG = keccak256("Issued(address,uint256)");
    function emitIssued(address account, uint value) internal {
        proxy._emit(abi.encode(value), 2, ISSUED_SIG, bytes32(account), 0, 0);
    }

    event Burned(address indexed account, uint value);
    bytes32 constant BURNED_SIG = keccak256("Burned(address,uint256)");
    function emitBurned(address account, uint value) internal {
        proxy._emit(abi.encode(value), 2, BURNED_SIG, bytes32(account), 0, 0);
    }
}
