/*
-----------------------------------------------------------------
FILE INFORMATION
-----------------------------------------------------------------

file:       Nomin.sol
version:    1.1
author:     Anton Jurisevic
            Mike Spain
            Dominic Romanowski

date:       2018-05-15

checked:    Mike Spain
approved:   Samuel Brooks

-----------------------------------------------------------------
MODULE DESCRIPTION
-----------------------------------------------------------------

Ether-backed nomin stablecoin contract.

This contract issues nomins, which are tokens worth 1 USD each.

Nomins are issuable by Havven holders who have to lock up some
value of their havvens to issue H * Cmax nomins. Where Cmax is
some value less than 1.

A configurable fee is charged on nomin transfers and deposited
into a common pot, which havven holders may withdraw from once per
fee period.

-----------------------------------------------------------------
*/

pragma solidity 0.4.23;


import "contracts/ExternStateFeeToken.sol";
import "contracts/TokenState.sol";
import "contracts/Court.sol";
import "contracts/Havven.sol";

contract Nomin is ExternStateFeeToken {

    /* ========== STATE VARIABLES ========== */

    // The address of the contract which manages confiscation votes.
    Court public court;
    Havven public havven;

    // Accounts which have lost the privilege to transact in nomins.
    mapping(address => bool) public frozen;


    /* ========== CONSTRUCTOR ========== */

    constructor(address _proxy, address _havven, address _owner, TokenState _initialState)
        ExternStateFeeToken(_proxy, "USD Nomins", "nUSD",
                            15 * UNIT / 10000, // nomin transfers incur a 15 bp fee
                            _havven, // the havven contract is the fee authority
                            _initialState,
                            _owner)
        public
    {
        // It should not be possible to transfer to the nomin contract itself.
        frozen[this] = true;
        havven = Havven(_havven);
    }

    /* ========== SETTERS ========== */

    function setCourt(Court _court)
        external
        optionalProxy_onlyOwner
    {
        court = _court;
        emitCourtUpdated(_court);
    }

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
        require(!frozen[to]);
        return _transfer_byProxy(messageSender, to, priceToSpend(value));
    }

    /* Override ERC20 transferFrom function in order to check
     * whether the recipient account is frozen. */
    function transferFrom(address from, address to, uint value)
        public
        optionalProxy
        returns (bool)
    {
        require(!frozen[to]);
        return _transferFrom_byProxy(messageSender, from, to, priceToSpend(value));
    }

    function transferSenderPaysFee(address to, uint value)
        public
        optionalProxy
        returns (bool)
    {
        require(!frozen[to]);
        return _transfer_byProxy(messageSender, to, value);
    }

    function transferFromSenderPaysFee(address from, address to, uint value)
        public
        optionalProxy
        returns (bool)
    {
        require(!frozen[to]);
        return _transferFrom_byProxy(messageSender, from, to, value);
    }

    /* If a confiscation court motion has passed and reached the confirmation
     * state, the court may transfer the target account's balance to the fee pool
     * and freeze its participation in further transactions. */
    function confiscateBalance(address target)
        external
        onlyCourt
    {
        
        // A motion must actually be underway.
        uint motionID = court.targetMotionID(target);
        require(motionID != 0);

        // These checks are strictly unnecessary,
        // since they are already checked in the court contract itself.
        require(court.motionConfirming(motionID));
        require(court.motionPasses(motionID));
        require(!frozen[target]);

        // Confiscate the balance in the account and freeze it.
        uint balance = state.balanceOf(target);
        state.setBalanceOf(address(this), safeAdd(state.balanceOf(address(this)), balance));
        state.setBalanceOf(target, 0);
        frozen[target] = true;
        emitAccountFrozen(target, balance);
        emitTransfer(target, address(this), balance);
    }

    /* The owner may allow a previously-frozen contract to once
     * again accept and transfer nomins. */
    function unfreezeAccount(address target)
        external
        optionalProxy_onlyOwner
    {
        if (frozen[target] && Nomin(target) != this) {
            frozen[target] = false;
            emitAccountUnfrozen(target);
        }
    }

    /* Allow havven to issue a certain number of
     * nomins from a target address */
    function issue(address target, uint amount)
        external
        onlyHavven
    {
        state.setBalanceOf(target, safeAdd(state.balanceOf(target), amount));
        totalSupply = safeAdd(totalSupply, amount);
        emitTransfer(address(0), target, amount);
        emitIssued(target, amount);
    }

    /* Allow havven to burn a certain number of
     * nomins from a target address */
    function burn(address target, uint amount)
        external
        onlyHavven
    {
        state.setBalanceOf(target, safeSub(state.balanceOf(target), amount));
        totalSupply = safeSub(totalSupply, amount);
        emitTransfer(target, address(0), amount);
        emitBurned(target, amount);
    }

    /* ========== MODIFIERS ========== */

    modifier onlyHavven() {
        require(Havven(msg.sender) == havven);
        _;
    }

    modifier onlyCourt() {
        require(Court(msg.sender) == court);
        _;
    }

    /* ========== EVENTS ========== */

    event CourtUpdated(address newCourt);
    function emitCourtUpdated(address newCourt) internal {
        bytes memory data = abi.encode(newCourt);
        bytes memory call_args = abi.encodeWithSignature("_emit(bytes,uint256,bytes32,bytes32,bytes32,bytes32)",
            data, 1, keccak256("CourtUpdated(address)"));
        require(address(proxy).call(call_args));
    }

    event HavvenUpdated(address newHavven);
    function emitHavvenUpdated(address newHavven) internal {
        bytes memory data = abi.encode(newHavven);
        bytes memory call_args = abi.encodeWithSignature("_emit(bytes,uint256,bytes32,bytes32,bytes32,bytes32)",
            data, 1, keccak256("HavvenUpdated(address)"));
        require(address(proxy).call(call_args));
    }

    event AccountFrozen(address target, address indexed targetIndex, uint balance);
    function emitAccountFrozen(address target, uint balance) internal {
        bytes memory data = abi.encode(target, balance);
        bytes memory call_args = abi.encodeWithSignature("_emit(bytes,uint256,bytes32,bytes32,bytes32,bytes32)",
            data, 2, keccak256("AccountFrozen(address,address,uint256)"), bytes32(target));
        require(address(proxy).call(call_args));
    }

    event AccountUnfrozen(address target, address indexed targetIndex);
    function emitAccountUnfrozen(address target) internal {
        bytes memory data = abi.encode(target);
        bytes memory call_args = abi.encodeWithSignature("_emit(bytes,uint256,bytes32,bytes32,bytes32,bytes32)",
            data, 2, keccak256("AccountUnfrozen(address,address)"), bytes32(target));
        require(address(proxy).call(call_args));
    }

    event Issued(address target, uint amount);
    function emitIssued(address target, uint amount) internal {
        bytes memory data = abi.encode(target, amount);
        bytes memory call_args = abi.encodeWithSignature("_emit(bytes,uint256,bytes32,bytes32,bytes32,bytes32)",
            data, 1, keccak256("Issued(address,address)"));
        require(address(proxy).call(call_args));
    }

    event Burned(address target, uint amount); 
    function emitBurned(address target, uint amount) internal {
        bytes memory data = abi.encode(target, amount);
        bytes memory call_args = abi.encodeWithSignature("_emit(bytes,uint256,bytes32,bytes32,bytes32,bytes32)",
            data, 1, keccak256("Burned(address)"));
        require(address(proxy).call(call_args));
    }
}
