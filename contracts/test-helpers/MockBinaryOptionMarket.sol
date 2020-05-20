pragma solidity ^0.5.16;

import "../BinaryOption.sol";

contract MockBinaryOptionMarket {
    uint256 public senderPrice;
    BinaryOption public binaryOption;

    function setSenderPrice(uint256 newPrice) external {
        senderPrice = newPrice;
    }

    function deployOption(address initialBidder, uint256 initialBid) external {
        binaryOption = new BinaryOption(initialBidder, initialBid);
    }

    function claimOptions() external returns (uint256) {
        return binaryOption.claim(msg.sender);
    }

    function bid(address bidder, uint256 newBid) external {
        binaryOption.bid(bidder, newBid);
    }

    event NewOption(BinaryOption newAddress);
}
