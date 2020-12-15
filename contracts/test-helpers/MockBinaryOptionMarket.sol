pragma solidity ^0.5.16;

import "../BinaryOption.sol";

import "../SafeDecimalMath.sol";


contract MockBinaryOptionMarket {
    using SafeDecimalMath for uint;

    uint public deposited;
    uint public senderPrice;
    BinaryOption public binaryOption;

    function setDeposited(uint newDeposited) external {
        deposited = newDeposited;
    }

    function setSenderPrice(uint newPrice) external {
        senderPrice = newPrice;
    }

    function exercisableDeposits() external view returns (uint) {
        return deposited;
    }

    function senderPriceAndExercisableDeposits() external view returns (uint price, uint _deposited) {
        return (senderPrice, deposited);
    }

    function deployOption(address initialBidder, uint initialBid) external {
        binaryOption = new BinaryOption(initialBidder, initialBid);
    }

    function claimOptions() external returns (uint) {
        return binaryOption.claim(msg.sender, senderPrice, deposited);
    }

    function exerciseOptions() external {
        deposited -= binaryOption.balanceOf(msg.sender);
        binaryOption.exercise(msg.sender);
    }

    function bid(address bidder, uint newBid) external {
        binaryOption.bid(bidder, newBid);
        deposited += newBid.divideDecimalRound(senderPrice);
    }

    function refund(address bidder, uint newRefund) external {
        binaryOption.refund(bidder, newRefund);
        deposited -= newRefund.divideDecimalRound(senderPrice);
    }

    function expireOption(address payable beneficiary) external {
        binaryOption.expire(beneficiary);
    }

    function requireActiveAndUnpaused() external pure {
        return;
    }

    event NewOption(BinaryOption newAddress);
}
