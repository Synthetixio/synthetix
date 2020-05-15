pragma solidity ^0.5.16;

import "./TestableBinaryOptionMarket.sol";

contract MockBinaryOptionMarketFactory {
    uint256 public totalDebt;

    function createBinaryOptionMarket(
        address resolver,
        uint256 endOfBidding, uint256 maturity,
        bytes32 oracleKey, uint256 targetPrice,
        uint256 longBid, uint256 shortBid,
        uint256 poolFee, uint256 creatorFee, uint256 refundFee) public returns (BinaryOptionMarket) {

        BinaryOptionMarket market = new TestableBinaryOptionMarket(
            resolver,
            endOfBidding, maturity,
            oracleKey, targetPrice,
            msg.sender, longBid, shortBid,
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
