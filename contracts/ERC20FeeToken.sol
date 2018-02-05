/*
-----------------------------------------------------------------
FILE INFORMATION
-----------------------------------------------------------------
file:       ERC20FeeToken.sol
version:    0.2
author:     Anton Jurisevic

date:       2018-1-16

checked:    Mike Spain
approved:   Samuel Brooks

-----------------------------------------------------------------
MODULE DESCRIPTION
-----------------------------------------------------------------

An ERC20-compliant token which also has a configurable fee rate
charged on its transfers.

These fees accrue into a pool, from which a nominated authority
may withdraw.

-----------------------------------------------------------------
*/

pragma solidity ^0.4.19;


import "contracts/SafeDecimalMath.sol";
import "contracts/Owned.sol";


contract ERC20FeeToken is Owned, SafeDecimalMath {

    /* ========== STATE VARIABLES ========== */

    // ERC20 token data
    // Allowance mapping domain: (owner, spender)
    uint public totalSupply;
    string public name;
    string public symbol;
    mapping(address => uint) public balanceOf;
    mapping(address => mapping (address => uint256)) public allowance;

    // A percentage fee charged on each transfer.
    // Zero by default, but may be set in derived contracts.
    uint public transferFeeRate;
    // Fee may not exceed 10%.
    uint constant maxTransferFeeRate = UNIT / 10;

    // Collected fees sit here until they are distributed.
    uint public feePool = 0;

    // The address with the authority to distribute fees.
    address public feeAuthority;


    /* ========== CONSTRUCTOR ========== */

    function ERC20FeeToken(string _name, string _symbol,
                           uint initialSupply, address initialBeneficiary,
                           uint _feeRate, address _feeAuthority,
                           address _owner)
        Owned(_owner)
        public
    {
        name = _name;
        symbol = _symbol;
        totalSupply = initialSupply;
        balanceOf[initialBeneficiary] = initialSupply;
        transferFeeRate = _feeRate;
        feeAuthority = _feeAuthority;
    }


    /* ========== SETTERS ========== */

    function setTransferFeeRate(uint newFeeRate)
        public
        onlyOwner
    {
        require(newFeeRate <= maxTransferFeeRate);
        transferFeeRate = newFeeRate;
        TransferFeeRateUpdate(newFeeRate);
    }


    /* ========== VIEW FUNCTIONS ========== */

    // Return the fee charged on top in order to transfer _value worth of tokens.
    function transferFeeIncurred(uint _value)
        public
        view
        returns (uint)
    {
        return safeDecMul(_value, transferFeeRate);
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
    function transferPlusFee(uint _value)
        public
        view
        returns (uint)
    {
        return safeAdd(_value, safeDecMul(_value, transferFeeRate));
    }


    /* ========== MUTATIVE FUNCTIONS ========== */

    function transfer(address _to, uint _value)
        public
        returns (bool)
    {
        // The fee is deducted from the sender's balance, in addition to
        // the transferred quantity.
        uint fee = transferFeeIncurred(_value);
        uint totalCharge = safeAdd(_value, fee);

        // Zero-value transfers must fire the transfer event...
        Transfer(msg.sender, _to, _value);
        TransferFeePaid(msg.sender, fee);

        // ...but don't spend gas updating state unnecessarily.
        if (_value == 0) {
            return true;
        }

        // Insufficient balance will be handled by the safe subtraction.
        balanceOf[msg.sender] = safeSub(balanceOf[msg.sender], totalCharge);
        balanceOf[_to] = safeAdd(balanceOf[_to], _value);
        feePool = safeAdd(feePool, fee);

        return true;
    }

    function transferFrom(address _from, address _to, uint _value)
        public
        returns (bool)
    {
        // The fee is deducted from the sender's balance, in addition to
        // the transferred quantity.
        uint fee = transferFeeIncurred(_value);
        uint totalCharge = safeAdd(_value, fee);

        // Zero-value transfers must fire the transfer event...
        Transfer(_from, _to, _value);
        TransferFeePaid(msg.sender, fee);

        // ...but don't spend gas updating state unnecessarily.
        if (_value == 0) {
            return true;
        }

        // Insufficient balance will be handled by the safe subtraction.
        balanceOf[_from] = safeSub(balanceOf[_from], totalCharge);
        allowance[_from][msg.sender] = safeSub(allowance[_from][msg.sender], totalCharge);
        balanceOf[_to] = safeAdd(balanceOf[_to], _value);
        feePool = safeAdd(feePool, fee);

        return true;
    }

    function approve(address _spender, uint _value)
        public
        returns (bool)
    {
        allowance[msg.sender][_spender] = _value;
        Approval(msg.sender, _spender, _value);
        return true;
    }

    /* Withdraw tokens from the fee pool into a given account. */
    function withdrawFee(address account, uint value)
        public
    {
        require(msg.sender == feeAuthority);
        // Safe subtraction ensures an exception is thrown if the balance is insufficient.
        feePool = safeSub(feePool, value);
        balanceOf[account] = safeAdd(balanceOf[account], value);
        FeeWithdrawal(account, value);
    }


    /* ========== EVENTS ========== */

    event Transfer(address indexed _from, address indexed _to, uint _value);

    event TransferFeePaid(address indexed account, uint value);

    event Approval(address indexed _owner, address indexed _spender, uint _value);

    event TransferFeeRateUpdate(uint newFeeRate);

    event FeeWithdrawal(address indexed account, uint value);
}

