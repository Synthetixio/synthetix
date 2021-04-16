pragma solidity ^0.5.16;

import "../BinaryOptionMarket.sol";
import "./MockBinaryOptionMarketMastercopy.sol";
import "../AddressResolver.sol";

contract MockBinaryOptionMarketManager {
    BinaryOptionMarket public market;
    bool public paused = false;

    function createMarket(
        AddressResolver resolver,
        address creator,
        uint[2] calldata creatorLimits,
        bytes32 oracleKey,
        uint strikePrice,
        bool refundsEnabled,
        uint[3] calldata times, // [biddingEnd, maturity, expiry]
        uint[2] calldata bids, // [longBid, shortBid]
        uint[3] calldata fees // [poolFee, creatorFee, refundFee]
    ) external {
        market = new MockBinaryOptionMarketMastercopy(address(this));
        market.initialize(resolver, creator, creatorLimits, oracleKey, strikePrice, refundsEnabled, times, bids, fees);
    }

    function decrementTotalDeposited(uint) external pure {
        return;
    }

    function resolveMarket() external {
        market.resolve();
    }

    function durations()
        external
        pure
        returns (
            uint,
            uint,
            uint
        )
    {
        return (60 * 60 * 24, 0, 0);
    }
}
