pragma solidity ^0.5.16;

import "../FuturesMarket.sol";

contract TestableFuturesMarket is FuturesMarket {
    function entryDebtCorrection() external view returns (int) {
        return _entryDebtCorrection;
    }

    function proportionalSkew() external view returns (int) {
        return _proportionalSkew();
    }

    function maxFundingRate() external view returns (uint) {
        return _maxFundingRate(baseAsset);
    }
}
