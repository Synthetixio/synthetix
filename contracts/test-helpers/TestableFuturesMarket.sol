pragma solidity ^0.8.9;

import "../FuturesMarket.sol";

contract TestableFuturesMarket is FuturesMarket {
    constructor(
        address payable _proxy,
        address _owner,
        address _resolver,
        bytes32 _baseAsset
    ) FuturesMarket(_proxy, _owner, _resolver, _baseAsset) {}

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
