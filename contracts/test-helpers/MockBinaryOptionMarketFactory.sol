pragma solidity ^0.5.16;

import "./TestableBinaryOptionMarket.sol";

contract MockBinaryOptionMarketFactory {
    uint256 public totalDebt;

    function createBinaryOptionMarket(uint256 endOfBidding, uint256 maturity,
        uint256 targetPrice, uint256 longBid, uint256 shortBid,
        uint256 poolFee, uint256 creatorFee, uint256 refundFee) public returns (BinaryOptionMarket) {

        BinaryOptionMarket market = new TestableBinaryOptionMarket(
            endOfBidding, maturity,
            targetPrice,
            longBid, shortBid,
            poolFee, creatorFee,
            refundFee);

        emit NewMarket(market);

        return market;
    }

    function incrementTotalDebt(uint256 newDebt) public {
        totalDebt += newDebt;
    }

    function decrementTotalDebt(uint256 newDebt) public {
        totalDebt -= newDebt;
    }

    event NewMarket(BinaryOptionMarket newAddress);
}
