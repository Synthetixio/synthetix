pragma solidity ^0.5.16;

import "../BinaryOption.sol";

contract MockBinaryOptionMarket {
    uint256 public senderPrice;
    BinaryOption public binaryOption;

    function setSenderPrice(uint256 newPrice) external {
        senderPrice = newPrice;
    }

    function deployOption(uint256 endOfBidding, address initialBidder, uint256 initialBid) external {
        binaryOption = new BinaryOption(endOfBidding, initialBidder, initialBid);
    }

    function claimOptions() external returns (uint256) {
        return binaryOption.claimOptions(msg.sender);
    }

    event NewOption(BinaryOption newAddress);
}