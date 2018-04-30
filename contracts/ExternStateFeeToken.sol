/*
-----------------------------------------------------------------
FILE INFORMATION
-----------------------------------------------------------------
file:       ExternStateFeeToken.sol
version:    1.0
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

-----------------------------------------------------------------
*/

pragma solidity 0.4.23;


import "contracts/SafeDecimalMath.sol";
import "contracts/Owned.sol";
import "contracts/TokenState.sol";


/**
 * @title ERC20 Token contract, with detached state.
 * Additionally charges fees on each transfer.
 */
contract ExternStateFeeToken is SafeDecimalMath, Owned {

    /* ========== STATE VARIABLES ========== */

    /* Stores balances and allowances. */
    TokenState public state;

    /* Other ERC20 fields. */
    string public name;
    string public symbol;
    uint public totalSupply;

    /* A percentage fee charged on each transfer. */
    uint public transferFeeRate;
    /* Fee may not exceed 10%. */
    uint constant MAX_TRANSFER_FEE_RATE = UNIT / 10;
    /* The address with the authority to distribute fees. */
    address public feeAuthority;


    /* ========== CONSTRUCTOR ========== */

    /**
     * @dev Constructor.
     * @param _name Token's ERC20 name.
     * @param _symbol Token's ERC20 symbol.
     * @param _transferFeeRate The fee rate to charge on transfers.
     * @param _feeAuthority The address which has the authority to withdraw fees from the accumulated pool.
     * @param _state The state contract address. A fresh one is constructed if 0x0 is provided.
     * @param _owner The owner of this contract.
     */
    constructor(string _name, string _symbol,
                                 uint _transferFeeRate, address _feeAuthority,
                                 TokenState _state, address _owner)
        Owned(_owner)
        public
    {
        if (_state == TokenState(0)) {
            state = new TokenState(_owner, address(this));
        } else {
            state = _state;
        }

        name = _name;
        symbol = _symbol;
        feeAuthority = _feeAuthority;

        /* Constructed transfer fee rate should respect the maximum fee rate. */
        require(_transferFeeRate <= MAX_TRANSFER_FEE_RATE);
        transferFeeRate = _transferFeeRate;
    }

    /* ========== SETTERS ========== */

    function setTransferFeeRate(uint _transferFeeRate)
        external
        onlyOwner
    {
        require(_transferFeeRate <= MAX_TRANSFER_FEE_RATE);
        transferFeeRate = _transferFeeRate;
        emit TransferFeeRateUpdated(_transferFeeRate);
    }

    function setFeeAuthority(address _feeAuthority)
        public
        onlyOwner
    {
        feeAuthority = _feeAuthority;
        emit FeeAuthorityUpdated(_feeAuthority);
    }

    function setState(TokenState _state)
        external
        onlyOwner
    {
        state = _state;
        emit StateUpdated(_state);
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
        /* Transfers less than the reciprocal of transferFeeRate should be completely eaten up by fees.
         * This is on the basis that transfers less than this value will result in a nil fee.
         * Probably too insignificant to worry about, but the following code will achieve it.
         *      if (fee == 0 && transferFeeRate != 0) {
         *          return _value;
         *      }
         *      return fee;
         */
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

    // The balance of the nomin contract itself is the fee pool.
    // Collected fees sit here until they are distributed.
    function feePool()
        external
        view
        returns (uint)
    {
        return state.balanceOf(address(this));
    }


    /* ========== MUTATIVE FUNCTIONS ========== */

    function transfer(address to, uint value)
        public
        returns (bool)
    {
        require(to != address(0));

        // The fee is deducted from the sender's balance, in addition to
        // the transferred quantity.
        uint fee = transferFeeIncurred(value);
        uint totalCharge = safeAdd(value, fee);

        // Insufficient balance will be handled by the safe subtraction.
        state.setBalanceOf(msg.sender, safeSub(state.balanceOf(msg.sender), totalCharge));
        state.setBalanceOf(to, safeAdd(state.balanceOf(to), value));
        state.setBalanceOf(address(this), safeAdd(state.balanceOf(address(this)), fee));

        emit Transfer(msg.sender, to, value);
        emit TransferFeePaid(msg.sender, fee);
        emit Transfer(msg.sender, address(this), fee);

        return true;
    }

    function transferFrom(address from, address to, uint value)
        public
        returns (bool)
    {
        require(to != address(0));

        // The fee is deducted from the sender's balance, in addition to
        // the transferred quantity.
        uint fee = transferFeeIncurred(value);
        uint totalCharge = safeAdd(value, fee);

        // Insufficient balance will be handled by the safe subtraction.
        state.setBalanceOf(from, safeSub(state.balanceOf(from), totalCharge));
        state.setAllowance(from, msg.sender, safeSub(state.allowance(from, msg.sender), totalCharge));
        state.setBalanceOf(to, safeAdd(state.balanceOf(to), value));
        state.setBalanceOf(address(this), safeAdd(state.balanceOf(address(this)), fee));

        emit Transfer(from, to, value);
        emit TransferFeePaid(from, fee);
        emit Transfer(from, address(this), fee);

        return true;
    }

    function approve(address spender, uint value)
        external
        returns (bool)
    {
        state.setAllowance(msg.sender, spender, value);

        emit Approval(msg.sender, spender, value);

        return true;
    }

    /**
     * @notice Withdraw tokens from the fee pool into a given account.
     * @dev Only the fee authority may call this.
     */
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
        state.setBalanceOf(address(this), safeSub(state.balanceOf(address(this)), value));
        state.setBalanceOf(account, safeAdd(state.balanceOf(account), value));

        emit FeesWithdrawn(account, account, value);
        emit Transfer(address(this), account, value);

        return true;
    }

    /**
     * @notice Donate tokens from the sender's balance into the fee pool.
     */
    function donateToFeePool(uint n)
        external
        returns (bool)
    {
        /* Empty donations are disallowed. */
        uint balance = state.balanceOf(msg.sender);
        require(balance != 0);

        /* safeSub ensures the donor has sufficient balance. */
        state.setBalanceOf(msg.sender, safeSub(balance, n));
        state.setBalanceOf(address(this), safeAdd(state.balanceOf(address(this)), n));

        emit FeesDonated(msg.sender, msg.sender, n);
        emit Transfer(msg.sender, address(this), n);

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
