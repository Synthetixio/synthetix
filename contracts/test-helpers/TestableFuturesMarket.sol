pragma solidity ^0.5.16;

import "../FuturesMarket.sol";

contract TestableFuturesMarket is FuturesMarket {
    constructor(
        address payable _proxy,
        address _owner,
        address _resolver,
        bytes32 _baseAsset,
        uint _takerFee,
        uint _makerFee,
        uint _maxLeverage,
        uint _maxMarketValue,
        uint _minInitialMargin,
        uint[3] memory _fundingParameters
    )
        public
        FuturesMarket(
            _proxy,
            _owner,
            _resolver,
            _baseAsset,
            _takerFee,
            _makerFee,
            _maxLeverage,
            _maxMarketValue,
            _minInitialMargin,
            _fundingParameters
        )
    {}

    function entryDebtCorrection() external view returns (int) {
        return _entryDebtCorrection;
    }

    function proportionalSkew() external view returns (int) {
        return _proportionalSkew();
    }
}
