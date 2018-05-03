/*
-----------------------------------------------------------------
FILE INFORMATION
-----------------------------------------------------------------
file:       Emittor.sol
version:    1.0
author:     Martin Zdarsky-Jones

date:       2018-5-4

checked:
approved:

-----------------------------------------------------------------
MODULE DESCRIPTION
-----------------------------------------------------------------

An Emittor contract, to be inherited by other contracts.
The events are separated from the actual contract so that they
could be emitted from the proxy in later implementations.

-----------------------------------------------------------------
*/

pragma solidity ^0.4.23;


/**
 * @title A contract holding convenience methods for emitting events.
 */
contract Emittor {

    function emitAccountFrozen(address target, address targetIndex, uint balance)
        internal
    {
        emit AccountFrozen(target, targetIndex, balance);
    }

    function emitAccountUnfrozen(address target, address targetIndex)
        internal
    {
        emit AccountUnfrozen(target, targetIndex);
    }

    function emitApproval(address owner, address spender, uint value)
        internal
    {
        emit Approval(owner, spender, value);
    }

    function emitAssociatedContractUpdated(address _associatedContract)
        internal
    {
        emit AssociatedContractUpdated(_associatedContract);
    }

    function emitBurnedNomins(address target, uint amount)
        internal
    {
        emit BurnedNomins(target, amount);
    }

    function emitCourtUpdated(address newCourt)
        internal
    {
        emit CourtUpdated(newCourt);
    }

    function emitFeeAuthorityUpdated(address feeAuthority)
        internal
    {
        emit FeeAuthorityUpdated(feeAuthority);
    }

    function emitFeePeriodDurationUpdated(uint duration)
        internal
    {
        emit FeePeriodDurationUpdated(duration);
    }

    function emitFeePeriodRollover(uint timestamp)
        internal
    {
        emit FeePeriodRollover(timestamp);
    }

    function emitFeesDonated(address donor, address donorIndex, uint value)
        internal
    {
        emit FeesDonated(donor, donorIndex, value);
    }

    function emitFeesWithdrawn(address account, address accountIndex, uint value)
        internal
    {
        emit FeesWithdrawn(account, accountIndex, value);
    }

    function emitHavvenUpdated(address newHavven)
        internal
    {
        emit HavvenUpdated(newHavven);
    }

    function emitIssuedNomins(address target, uint amount)
        internal
    {
        emit IssuedNomins(target, amount);
    }

    function emitMotionApproved(uint motionID, uint motionIDIndex)
        internal
    {
        emit MotionApproved(motionID, motionIDIndex);
    }

    function emitMotionBegun(address initiator, address initiatorIndex, address target, address targetIndex, uint motionID, uint motionIDIndex, uint startTime)
        internal
    {
        emit MotionBegun(initiator, initiatorIndex, target, targetIndex, motionID, motionIDIndex, startTime);
    }

    function emitMotionClosed(uint motionID, uint motionIDIndex)
        internal
    {
        emit MotionClosed(motionID, motionIDIndex);
    }

    function emitMotionVetoed(uint motionID, uint motionIDIndex)
        internal
    {
        emit MotionVetoed(motionID, motionIDIndex);
    }

    function emitOracleUpdated(address new_oracle)
        internal
    {
        emit OracleUpdated(new_oracle);
    }

    function emitOwnerChanged(address oldOwner, address newOwner)
        internal
    {
        emit OwnerChanged(oldOwner, newOwner);
    }

    function emitOwnerNominated(address newOwner)
        internal
    {
        emit OwnerNominated(newOwner);
    }

    function emitPriceUpdated(uint price)
        internal
    {
        emit PriceUpdated(price);
    }

    function emitSelfDestructBeneficiaryUpdated(address newBeneficiary)
        internal
    {
        emit SelfDestructBeneficiaryUpdated(newBeneficiary);
    }

    function emitSelfDestructed(address beneficiary)
        internal
    {
        emit SelfDestructed(beneficiary);
    }

    function emitSelfDestructInitiated(uint duration)
        internal
    {
        emit SelfDestructInitiated(duration);
    }

    function emitSelfDestructTerminated()
        internal
    {
        emit SelfDestructTerminated();
    }

    function emitStateUpdated(address newState)
        internal
    {
        emit StateUpdated(newState);
    }

    function emitTransfer(address from, address to, uint value)
        internal
    {
        emit Transfer(from, to, value);
    }

    function emitTransferFeePaid(address account, uint value)
        internal
    {
        emit TransferFeePaid(account, value);
    }

    function emitTransferFeeRateUpdated(uint newFeeRate)
        internal
    {
        emit TransferFeeRateUpdated(newFeeRate);
    }

    function emitVested(address beneficiary, address beneficiaryIndex, uint time, uint value)
        internal
    {
        emit Vested(beneficiary, beneficiaryIndex, time, value);
    }

    function emitVoteCancelled(address voter, address voterIndex, uint motionID, uint motionIDIndex)
        internal
    {
        emit VoteCancelled(voter, voterIndex, motionID, motionIDIndex);
    }

    function emitVotedAgainst(address voter, address voterIndex, uint motionID, uint motionIDIndex, uint weight)
        internal
    {
        emit VotedAgainst(voter, voterIndex, motionID, motionIDIndex, weight);
    }

    function emitVotedFor(address voter, address voterIndex, uint motionID, uint motionIDIndex, uint weight)
        internal
    {
        emit VotedFor(voter, voterIndex, motionID, motionIDIndex, weight);
    }

    /* ========== EVENTS ========== */

    event AccountFrozen(address target, address indexed targetIndex, uint balance);
    event AccountUnfrozen(address target, address indexed targetIndex);
    event Approval(address indexed owner, address indexed spender, uint value);
    event AssociatedContractUpdated(address _associatedContract);
    event BurnedNomins(address target, uint amount);
    event CourtUpdated(address newCourt);
    event FeeAuthorityUpdated(address feeAuthority);
    event FeePeriodDurationUpdated(uint duration);
    event FeePeriodRollover(uint timestamp);
    event FeesDonated(address donor, address indexed donorIndex, uint value);
    event FeesWithdrawn(address account, address indexed accountIndex, uint value);
    event HavvenUpdated(address newHavven);
    event IssuedNomins(address target, uint amount);
    event MotionApproved(uint motionID, uint indexed motionIDIndex);
    event MotionBegun(address initiator, address indexed initiatorIndex, address target, address indexed targetIndex, uint motionID, uint indexed motionIDIndex, uint startTime);
    event MotionClosed(uint motionID, uint indexed motionIDIndex);
    event MotionVetoed(uint motionID, uint indexed motionIDIndex);
    event OracleUpdated(address new_oracle);
    event OwnerChanged(address oldOwner, address newOwner);
    event OwnerNominated(address newOwner);
    event PriceUpdated(uint price);
    event SelfDestructBeneficiaryUpdated(address newBeneficiary);
    event SelfDestructed(address beneficiary);
    event SelfDestructInitiated(uint duration);
    event SelfDestructTerminated();
    event StateUpdated(address newState);
    event Transfer(address indexed from, address indexed to, uint value);
    event TransferFeePaid(address indexed account, uint value);
    event TransferFeeRateUpdated(uint newFeeRate);
    event Vested(address beneficiary, address indexed beneficiaryIndex, uint time, uint value);
    event VoteCancelled(address voter, address indexed voterIndex, uint motionID, uint indexed motionIDIndex);
    event VotedAgainst(address voter, address indexed voterIndex, uint motionID, uint indexed motionIDIndex, uint weight);
    event VotedFor(address voter, address indexed voterIndex, uint motionID, uint indexed motionIDIndex, uint weight);

}
