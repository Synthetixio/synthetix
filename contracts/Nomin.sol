/*
-----------------------------------------------------------------
FILE INFORMATION
-----------------------------------------------------------------

file:       Nomin.sol
version:    1.2
author:     Anton Jurisevic
            Mike Spain
            Dominic Romanowski
            Kevin Brown

date:       2018-05-29

-----------------------------------------------------------------
MODULE DESCRIPTION
-----------------------------------------------------------------

Havven-backed nomin stablecoin contract.

This contract issues nomins, which are tokens worth 1 USD each.

Nomins are issuable by Havven holders who have to lock up some
value of their havvens to issue H * Cmax nomins. Where Cmax is
some value less than 1.

A configurable fee is charged on nomin transfers and deposited
into a common pot, which havven holders may withdraw from once
per fee period.

-----------------------------------------------------------------
*/

pragma solidity 0.4.24;


import "contracts/FeeToken.sol";
import "contracts/TokenState.sol";
import "contracts/Havven.sol";

contract Nomin is FeeToken {

    /* ========== STATE VARIABLES ========== */

    Havven public havven;

    // Accounts which have lost the privilege to transact in nomins.
    mapping(address => bool) public frozen;

    // Nomin transfers incur a 15 bp fee by default.
    uint constant TRANSFER_FEE_RATE = 15 * UNIT / 10000;
    string constant TOKEN_NAME = "Nomin USD";
    string constant TOKEN_SYMBOL = "nUSD";

    /* ========== CONSTRUCTOR ========== */

    constructor(address _proxy, TokenState _tokenState, Havven _havven,
                uint _totalSupply,
                address _owner)
        FeeToken(_proxy, _tokenState,
                 TOKEN_NAME, TOKEN_SYMBOL, _totalSupply,
                 TRANSFER_FEE_RATE,
                 _havven, // The havven contract is the fee authority.
                 _owner)
        public
    {
        require(_proxy != 0, "_proxy cannot be 0");
        require(address(_havven) != 0, "_havven cannot be 0");
        require(_owner != 0, "_owner cannot be 0");

        // It should not be possible to transfer to the fee pool directly (or confiscate its balance).
        frozen[FEE_ADDRESS] = true;
        havven = _havven;
    }

    /* ========== SETTERS ========== */

    function setHavven(Havven _havven)
        external
        optionalProxy_onlyOwner
    {
        // havven should be set as the feeAuthority after calling this depending on
        // havven's internal logic
        havven = _havven;
        setFeeAuthority(_havven);
        emitHavvenUpdated(_havven);
    }


    /* ========== MUTATIVE FUNCTIONS ========== */

    /* Override ERC20 transfer function in order to check
     * whether the recipient account is frozen. Note that there is
     * no need to check whether the sender has a frozen account,
     * since their funds have already been confiscated,
     * and no new funds can be transferred to it.*/
    function transfer(address to, uint value)
        public
        optionalProxy
        returns (bool)
    {
        require(!frozen[to], "Cannot transfer to frozen address");
        return _transfer_byProxy(messageSender, to, value);
    }

    /* Override ERC20 transferFrom function in order to check
     * whether the recipient account is frozen. */
    function transferFrom(address from, address to, uint value)
        public
        optionalProxy
        returns (bool)
    {
        require(!frozen[to], "Cannot transfer to frozen address");
        return _transferFrom_byProxy(messageSender, from, to, value);
    }

    function transferSenderPaysFee(address to, uint value)
        public
        optionalProxy
        returns (bool)
    {
        require(!frozen[to], "Cannot transfer to frozen address");
        return _transferSenderPaysFee_byProxy(messageSender, to, value);
    }

    function transferFromSenderPaysFee(address from, address to, uint value)
        public
        optionalProxy
        returns (bool)
    {
        require(!frozen[to], "Cannot transfer to frozen address");
        return _transferFromSenderPaysFee_byProxy(messageSender, from, to, value);
    }

    /* The owner may allow a previously-frozen contract to once
     * again accept and transfer nomins. */
    function unfreezeAccount(address target)
        external
        optionalProxy_onlyOwner
    {
        require(frozen[target] && target != FEE_ADDRESS, "Account must be frozen, and cannot be the fee address");
        frozen[target] = false;
        emitAccountUnfrozen(target);
    }

    /* Allow havven to issue a certain number of
     * nomins from an account. */
    function issue(address account, uint amount)
        external
        onlyHavven
    {
        tokenState.setBalanceOf(account, safeAdd(tokenState.balanceOf(account), amount));
        totalSupply = safeAdd(totalSupply, amount);
        emitTransfer(address(0), account, amount);
        emitIssued(account, amount);
    }

    /* Allow havven to burn a certain number of
     * nomins from an account. */
    function burn(address account, uint amount)
        external
        onlyHavven
    {
        tokenState.setBalanceOf(account, safeSub(tokenState.balanceOf(account), amount));
        totalSupply = safeSub(totalSupply, amount);
        emitTransfer(account, address(0), amount);
        emitBurned(account, amount);
    }

    /* ========== MODIFIERS ========== */

    modifier onlyHavven() {
        require(Havven(msg.sender) == havven, "Only the Havven contract can perform this action");
        _;
    }

    /* ========== EVENTS ========== */

    event HavvenUpdated(address newHavven);
    bytes32 constant HAVVENUPDATED_SIG = keccak256("HavvenUpdated(address)");
    function emitHavvenUpdated(address newHavven) internal {
        proxy._emit(abi.encode(newHavven), 1, HAVVENUPDATED_SIG, 0, 0, 0);
    }

    event AccountFrozen(address indexed target, uint balance);
    bytes32 constant ACCOUNTFROZEN_SIG = keccak256("AccountFrozen(address,uint256)");
    function emitAccountFrozen(address target, uint balance) internal {
        proxy._emit(abi.encode(balance), 2, ACCOUNTFROZEN_SIG, bytes32(target), 0, 0);
    }

    event AccountUnfrozen(address indexed target);
    bytes32 constant ACCOUNTUNFROZEN_SIG = keccak256("AccountUnfrozen(address)");
    function emitAccountUnfrozen(address target) internal {
        proxy._emit(abi.encode(), 2, ACCOUNTUNFROZEN_SIG, bytes32(target), 0, 0);
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
