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
import "contracts/FeeTokenState.sol";
import "contracts/Proxy.sol";


contract ExternStateProxyFeeToken is Proxyable, SafeDecimalMath {

    /* ========== STATE VARIABLES ========== */

    // state that stores balances, allowances, totalSupply, fee pools and frozen accounts
    FeeTokenState public state;

    string public name;
    string public symbol;

    // A percentage fee charged on each transfer.
    // Zero by default, but may be set in derived contracts.
    uint public transferFeeRate;
    // Fee may not exceed 10%.
    uint constant MAX_TRANSFER_FEE_RATE = UNIT / 10;

    // The address with the authority to distribute fees.
    address public feeAuthority;

    /* ========== CONSTRUCTOR ========== */

    function ExternStateProxyFeeToken(string _name, string _symbol,
                                      address initialBeneficiary,
                                      uint _feeRate, address _feeAuthority,
                                      FeeTokenState _state, address _owner)
        Proxyable(_owner)
        public
    {
        name = _name;
        symbol = _symbol;
        transferFeeRate = _feeRate;
        feeAuthority = _feeAuthority;

        state = _state;
        if (state == FeeTokenState(0)) {
            state = new FeeTokenState(_owner, 0, initialBeneficiary, address(this));
        }
    }

    /* ========== SETTERS ========== */

    function setTransferFeeRate(uint _transferFeeRate)
        external
        optionalProxy_onlyOwner
    {
        require(_transferFeeRate <= MAX_TRANSFER_FEE_RATE);
        transferFeeRate = _transferFeeRate;
        TransferFeeRateUpdate(_transferFeeRate);
    }

    function setFeeAuthority(address _feeAuthority)
        external
        optionalProxy_onlyOwner
    {
        feeAuthority = _feeAuthority;
        FeeAuthorityUpdate(_feeAuthority);
    }

    function setState(FeeTokenState _state)
        external
        optionalProxy_onlyOwner
    {
        state = _state;
    }

    /* ========== VIEWS ========== */

    function totalSupply()
        external
        view
        returns (uint)
    {
        return state.totalSupply();
    }

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

    function feePool()
        public
        view
        returns (uint)
    {
        return state.feePool();
    }

    // Return the fee charged on top in order to transfer _value worth of tokens.
    function transferFeeIncurred(uint value)
        public
        view
        returns (uint)
    {
        return safeDecMul(value, transferFeeRate);
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
        return safeDecDiv(value, safeAdd(UNIT, transferFeeRate));
    }

    /* ========== MUTATIVE FUNCTIONS ========== */

    function transfer(address to, uint value)
        public
        optionalProxy
        returns (bool)
    {
        require(to != address(0));

        // The fee is deducted from the sender's balance, in addition to
        // the transferred quantity.
        uint fee = transferFeeIncurred(value);
        uint totalCharge = safeAdd(value, fee);

        address messageSender = proxy.messageSender();

        // Insufficient balance will be handled by the safe subtraction.
        state.setBalance(messageSender, safeSub(balanceOf(messageSender), totalCharge));
        state.setBalance(to, safeAdd(balanceOf(to), value));
        state.setFeePool(safeAdd(feePool(), fee));

        Transfer(messageSender, to, value);
        TransferFeePaid(messageSender, fee);

        return true;
    }

    function transferFrom(address from, address to, uint value)
        public
        optionalProxy
        returns (bool)
    {
        require(from != address(0) && to != address(0));

        // The fee is deducted from the sender's balance, in addition to
        // the transferred quantity.
        uint fee = transferFeeIncurred(value);
        uint totalCharge = safeAdd(value, fee);

        address messageSender = proxy.messageSender();

        // Insufficient balance will be handled by the safe subtraction.
        state.setBalance(from, safeSub(state.balanceOf(from), totalCharge));
        state.setAllowance(from, messageSender, safeSub(state.allowance(from, messageSender), totalCharge));
        state.setBalance(to, safeAdd(state.balanceOf(to), value));
        state.setFeePool(safeAdd(feePool(), fee));

        Transfer(from, to, value);
        TransferFeePaid(messageSender, fee);

        return true;
    }

    function approve(address spender, uint value)
        external
        optionalProxy
        returns (bool)
    {
        address messageSender = proxy.messageSender();
        state.setAllowance(messageSender, spender, value);

        Approval(messageSender, spender, value);

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
        state.setFeePool(safeSub(feePool(), value));
        state.setBalance(account, safeAdd(state.balanceOf(account), value));

        FeeWithdrawal(account, value);

        return true;
    }

    /* Donate tokens from the sender's balance into the fee pool. */
    function donateToFeePool(uint n)
        external
        optionalProxy
        returns (bool)
    {
        address messageSender = proxy.messageSender();

        // Empty donations are disallowed.
        uint balance = state.balanceOf(messageSender);
        require(balance != 0);

        // safeSub ensures the donor has sufficient balance.
        state.setBalance(messageSender, safeSub(balance, n));
        state.setFeePool(safeAdd(feePool(), n));

        FeeDonation(messageSender, messageSender, n);

        return true;
    }

    /* ========== EVENTS ========== */

    event Transfer(address indexed from, address indexed to, uint value);

    event TransferFeePaid(address indexed account, uint value);

    event Approval(address indexed owner, address indexed spender, uint value);

    event TransferFeeRateUpdate(uint newFeeRate);

    event FeeWithdrawal(address indexed account, uint value);

    event FeeDonation(address donor, address indexed donorIndex, uint value);

    event FeeAuthorityUpdate(address feeAuthority);
}
