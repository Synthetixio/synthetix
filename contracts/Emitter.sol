/*
-----------------------------------------------------------------
FILE INFORMATION
-----------------------------------------------------------------

file:       Emitter.sol
version:    1.1
author:     Martin Zdarsky-Jones

date:       2018-05-15

checked:
approved:

-----------------------------------------------------------------
MODULE DESCRIPTION
-----------------------------------------------------------------

An Emitter contract, to be inherited by other contracts.
The events are separated from the actual contract so that they
could be emitted from the proxy in later implementations.

-----------------------------------------------------------------
*/

pragma solidity 0.4.23;

import "contracts/EmitterBase.sol";

/**
 * @title A contract holding convenience methods for emitting events.
 */
contract Emitter is EmitterBase {

    /*** CONSTRUCTOR ***/
    constructor(address _proxy, address _owner)
        EmitterBase(_proxy, _owner)
        public
    {

    }

    function emitProxyChanged(address proxyAddress)
        internal
    {
        EventData memory data = createEventData("ProxyChanged(address)", 1);
        addAddress(data, proxyAddress, false);
        emitOnProxy(data);
    }

    function emitAccountFrozen(address target, address targetIndex, uint256 balance)
        internal
    {
        EventData memory data = createEventData("AccountFrozen(address,address,uint256)", 2);
        addAddress(data, target, false);
        addAddress(data, targetIndex, true);
        addUint256(data, balance, false);
        emitOnProxy(data);
    }

    function emitAccountUnfrozen(address target, address targetIndex)
        internal
    {
        EventData memory data = createEventData("AccountUnfrozen(address,address)", 1);
        addAddress(data, target, false);
        addAddress(data, targetIndex, true);
        emitOnProxy(data);
    }

    function emitApproval(address owner, address spender, uint256 value)
        internal
    {
        EventData memory data = createEventData("Approval(address,address,uint256)", 1);
        addAddress(data, owner, true);
        addAddress(data, spender, true);
        addUint256(data, value, false);
        emitOnProxy(data);
    }

    function emitAssociatedContractUpdated(address _associatedContract)
        internal
    {
        EventData memory data = createEventData("AssociatedContractUpdated(address)", 1);
        addAddress(data, _associatedContract, false);
        emitOnProxy(data);
    }

    function emitBurned(address target, uint256 amount)
        internal
    {
        EventData memory data = createEventData("Burned(address,uint256)", 2);
        addAddress(data, target, false);
        addUint256(data, amount, false);
        emitOnProxy(data);
    }

    function emitCourtUpdated(address newCourt)
        internal
    {
        EventData memory data = createEventData("CourtUpdated(address)", 1);
        addAddress(data, newCourt, false);
        emitOnProxy(data);
    }

    function emitEscrowUpdated(address _newEscrow)
        internal
    {
        EventData memory data = createEventData("NominUpdated(address)", 1);
        addAddress(data, _newEscrow, false);
        emitOnProxy(data);
    }

    function emitFeeAuthorityUpdated(address feeAuthority)
        internal
    {
        EventData memory data = createEventData("FeeAuthorityUpdated(address)", 1);
        addAddress(data, feeAuthority, false);
        emitOnProxy(data);
    }

    function emitFeePeriodDurationUpdated(uint256 duration)
        internal
    {
        EventData memory data = createEventData("FeePeriodDurationUpdated(uint256)", 1);
        addUint256(data, duration, false);
        emitOnProxy(data);
    }

    function emitFeePeriodRollover(uint256 timestamp)
        internal
    {
        EventData memory data = createEventData("FeePeriodRollover(uint256)", 1);
        addUint256(data, timestamp, false);
        emitOnProxy(data);
    }

    function emitFeesDonated(address donor, address donorIndex, uint256 value)
        internal
    {
        EventData memory data = createEventData("FeesDonated(address,address,uint256)", 2);
        addAddress(data, donor, false);
        addAddress(data, donorIndex, true);
        addUint256(data, value, false);
        emitOnProxy(data);
    }

    function emitFeesWithdrawn(address account, address accountIndex, uint256 value)
        internal
    {
        EventData memory data = createEventData("FeesWithdrawn(address,address,uint256)", 2);
        addAddress(data, account, false);
        addAddress(data, accountIndex, true);
        addUint256(data, value, false);
        emitOnProxy(data);
    }

    function emitHavvenUpdated(address newHavven)
        internal
    {
        EventData memory data = createEventData("HavvenUpdated(address)", 1);
        addAddress(data, newHavven, false);
        emitOnProxy(data);
    }

    function emitIssued(address target, uint256 amount)
        internal
    {
        EventData memory data = createEventData("Issued(address,uint256)", 2);
        addAddress(data, target, false);
        addUint256(data, amount, false);
        emitOnProxy(data);
    }

    function emitNominUpdated(address _newNomin)
        internal
    {
        EventData memory data = createEventData("NominUpdated(address)", 1);
        addAddress(data, _newNomin, false);
        emitOnProxy(data);
    }

    function emitOracleUpdated(address new_oracle)
        internal
    {
        EventData memory data = createEventData("OracleUpdated(address)", 1);
        addAddress(data, new_oracle, false);
        emitOnProxy(data);
    }

    function emitPriceUpdated(uint256 price)
        internal
    {
        EventData memory data = createEventData("PriceUpdated(uint256)", 1);
        addUint256(data, price, false);
        emitOnProxy(data);
    }

    function emitStateUpdated(address newState)
        internal
    {
        EventData memory data = createEventData("StateUpdated(address)", 1);
        addAddress(data, newState, false);
        emitOnProxy(data);
    }

    function emitTransfer(address from, address to, uint256 value)
        internal
    {
        EventData memory data = createEventData("Transfer(address,address,uint256)", 1);
        addAddress(data, from, true);
        addAddress(data, to, true);
        addUint256(data, value, false);
        emitOnProxy(data);
    }
 
    function emitTransferFeeRateUpdated(uint256 newFeeRate)
        internal
    {
        EventData memory data = createEventData("TransferFeeRateUpdated(uint256)", 1);
        addUint256(data, newFeeRate, false);
        emitOnProxy(data);
    }


    /* ========== EVENTS ========== */

    event AccountFrozen(address target, address indexed targetIndex, uint balance);
    event AccountUnfrozen(address target, address indexed targetIndex);
    event Approval(address indexed owner, address indexed spender, uint value);
    event AssociatedContractUpdated(address _associatedContract);
    event Burned(address target, uint amount);
    event CourtUpdated(address newCourt);
    event EscrowUpdated(address newEscrow);
    event FeeAuthorityUpdated(address feeAuthority);
    event FeePeriodDurationUpdated(uint duration);
    event FeePeriodRollover(uint timestamp);
    event FeesDonated(address donor, address indexed donorIndex, uint value);
    event FeesWithdrawn(address account, address indexed accountIndex, uint value);
    event HavvenUpdated(address newHavven);
    event Issued(address target, uint amount);
    event NominUpdated(address newNomin);
    event OracleUpdated(address new_oracle);
    event PriceUpdated(uint price);
    event StateUpdated(address newState);
    event Transfer(address indexed from, address indexed to, uint value);
    event TransferFeePaid(address indexed account, uint value);
    event TransferFeeRateUpdated(uint newFeeRate);
    event Vested(address beneficiary, address indexed beneficiaryIndex, uint time, uint value);

}
