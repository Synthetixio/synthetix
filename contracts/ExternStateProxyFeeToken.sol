/*
-----------------------------------------------------------------
FILE INFORMATION
-----------------------------------------------------------------
file:       ExternStateProxyFeeToken.sol
version:    0.4
author:     Anton Jurisevic
            Dominic Romanowski

date:       2018-2-28

checked:    Mike Spain
approved:   Samuel Brooks

-----------------------------------------------------------------
MODULE DESCRIPTION
-----------------------------------------------------------------

A token which also has a configurable fee rate
charged on its transfers. This is designed to be overridden in
order to produce an ERC20-compliant token.

These fees accrue into a pool, from which a nominated authority
may withdraw.

This contract utilises a state for upgradability purposes.
It relies on being called underneath a proxy contract, as
included in Proxy.sol.

-----------------------------------------------------------------
*/

pragma solidity ^0.4.20;


import "contracts/SafeDecimalMath.sol";
import "contracts/Owned.sol";
import "contracts/TokenState.sol";
import "contracts/Proxy.sol";


contract ExternStateProxyFeeToken is Proxyable, SafeDecimalMath {

    /* ========== STATE VARIABLES ========== */

    // Stores balances and allowances.
    TokenState public state;

    // Other ERC20 fields
    string public name;
    string public symbol;
    uint public totalSupply;

    // Collected fees sit here until they are distributed
    uint public feePool;
    // A percentage fee charged on each transfer.
    uint public transferFeeRate;
    // Fee may not exceed 10%.
    uint constant MAX_TRANSFER_FEE_RATE = UNIT / 10;
    // The address with the authority to distribute fees.
    address public feeAuthority;


    /* ========== CONSTRUCTOR ========== */

    function ExternStateProxyFeeToken(string _name, string _symbol,
                                      uint _transferFeeRate, address _feeAuthority,
                                      TokenState _state, address _owner)
        Proxyable(_owner)
        public
    {
        if (_state == TokenState(0)) {
            state = new TokenState(_owner, address(this));
        } else {
            state = _state;
        }

        name = _name;
        symbol = _symbol;
        transferFeeRate = _transferFeeRate;
        feeAuthority = _feeAuthority;
    }

    /* ========== SETTERS ========== */

    function setTransferFeeRate(uint _transferFeeRate)
        external
        optionalProxy_onlyOwner
    {
        require(_transferFeeRate <= MAX_TRANSFER_FEE_RATE);
        transferFeeRate = _transferFeeRate;
        TransferFeeRateUpdated(_transferFeeRate);
    }

    function setFeeAuthority(address _feeAuthority)
        external
        optionalProxy_onlyOwner
    {
        feeAuthority = _feeAuthority;
        FeeAuthorityUpdated(_feeAuthority);
    }

    function setState(TokenState _state)
        external
        optionalProxy_onlyOwner
    {
        state = _state;
        StateUpdated(_state);
    }

    /* ========== VIEWS ========== */

    function balanceOf(address account)
        public
        view
        returns (uint)
    {
        return state.balanceOf(account);
    }

    function allowance(address from, address to)
        public
        view
        returns (uint)
    {
        return state.allowance(from, to);
    }

    // Return the fee charged on top in order to transfer _value worth of tokens.
    function transferFeeIncurred(uint value)
        public
        view
        returns (uint)
    {
        return safeMul_dec(value, transferFeeRate);
        // Transfers less than the reciprocal of transferFeeRate should be completely eaten up by fees.
        // This is on the basis that transfers less than this value will result in a nil fee.
        // Probably too insignificant to worry about, but the following code will achieve it.
        //      if (fee == 0 && transferFeeRate != 0) {
        //          return _value;
        //      }
        //      return fee;
    }

    // The value that you would need to send so that the recipient receives
    // a specified value.
    function transferPlusFee(uint value)
        external
        view
        returns (uint)
    {
        return safeAdd(value, transferFeeIncurred(value));
    }

    // The quantity to send in order that the sender spends a certain value of tokens.
    function priceToSpend(uint value)
        external
        view
        returns (uint)
    {
        return safeDiv_dec(value, safeAdd(UNIT, transferFeeRate));
    }

    /* ========== MUTATIVE FUNCTIONS ========== */

    /* Whatever calls this should have either the optionalProxy or onlyProxy modifier,
     * and pass in messageSender. */
    function _transfer_byProxy(address sender, address to, uint value)
        internal
        returns (bool)
    {
        require(to != address(0));

        // The fee is deducted from the sender's balance, in addition to
        // the transferred quantity.
        uint fee = transferFeeIncurred(value);
        uint totalCharge = safeAdd(value, fee);

        // Insufficient balance will be handled by the safe subtraction.
        state.setBalanceOf(sender, safeSub(balanceOf(sender), totalCharge));
        state.setBalanceOf(to, safeAdd(balanceOf(to), value));
        feePool = safeAdd(feePool, fee);

        Transfer(sender, to, value);
        TransferFeePaid(sender, fee);

        return true;
    }

    /* Whatever calls this should have either the optionalProxy or onlyProxy modifier,
     * and pass in messageSender. */
    function _transferFrom_byProxy(address sender, address from, address to, uint value)
        internal
        returns (bool)
    {
        require(to != address(0));

        // The fee is deducted from the sender's balance, in addition to
        // the transferred quantity.
        uint fee = transferFeeIncurred(value);
        uint totalCharge = safeAdd(value, fee);

        // Insufficient balance will be handled by the safe subtraction.
        state.setBalanceOf(from, safeSub(state.balanceOf(from), totalCharge));
        state.setAllowance(from, sender, safeSub(state.allowance(from, sender), totalCharge));
        state.setBalanceOf(to, safeAdd(state.balanceOf(to), value));
        feePool = safeAdd(feePool, fee);

        Transfer(from, to, value);
        TransferFeePaid(sender, fee);

        return true;
    }

    function approve(address spender, uint value)
        external
        optionalProxy
        returns (bool)
    {
        address sender = messageSender;
        state.setAllowance(sender, spender, value);

        Approval(sender, spender, value);

        return true;
    }

    /* Withdraw tokens from the fee pool into a given account. */
    function withdrawFee(address account, uint value)
        external
        returns (bool)
    {
        require(msg.sender == feeAuthority && account != address(0));
        
        // 0-value withdrawals do nothing.
        if (value == 0) {
            return false;
        }

        // Safe subtraction ensures an exception is thrown if the balance is insufficient.
        feePool = safeSub(feePool, value);
        state.setBalanceOf(account, safeAdd(state.balanceOf(account), value));

        FeesWithdrawn(account, account, value);

        return true;
    }

    /* Donate tokens from the sender's balance into the fee pool. */
    function donateToFeePool(uint n)
        external
        optionalProxy
        returns (bool)
    {
        address sender = messageSender;

        // Empty donations are disallowed.
        uint balance = state.balanceOf(sender);
        require(balance != 0);

        // safeSub ensures the donor has sufficient balance.
        state.setBalanceOf(sender, safeSub(balance, n));
        feePool = safeAdd(feePool, n);

        FeesDonated(sender, sender, n);

        return true;
    }

    /* ========== EVENTS ========== */

    event Transfer(address indexed from, address indexed to, uint value);

    event TransferFeePaid(address indexed account, uint value);

    event Approval(address indexed owner, address indexed spender, uint value);

    event TransferFeeRateUpdated(uint newFeeRate);

    event FeeAuthorityUpdated(address feeAuthority);

    event StateUpdated(address newState);

    event FeesWithdrawn(address account, address indexed accountIndex, uint value);

    event FeesDonated(address donor, address indexed donorIndex, uint value);
}
