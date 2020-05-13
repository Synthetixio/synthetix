pragma solidity ^0.5.16;

import "../BinaryOption.sol";

contract MockBinaryOptionMarket {
    uint256 public senderPrice;

    function setSenderPrice(uint256 newPrice) external {
        senderPrice = newPrice;
    }

    function deployOption(uint256 endOfBidding, address initialBidder, uint256 initialBid) external {
        BinaryOption boption = new BinaryOption(endOfBidding, initialBidder, initialBid);
        emit NewOption(boption);
    }

    event NewOption(BinaryOption newAddress);
}