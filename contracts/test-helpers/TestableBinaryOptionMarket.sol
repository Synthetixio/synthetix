pragma solidity ^0.5.16;

import "../BinaryOptionMarket.sol";

contract TestableBinaryOptionMarket is BinaryOptionMarket {
    constructor(
        address _owner, address _creator,
        uint256 _minimumInitialLiquidity,
        bytes32 _oracleKey, uint256 _targetPrice,
        uint[3] memory _times,
        uint[2] memory _bids,
        uint[3] memory _fees
    )
        public
        BinaryOptionMarket(
            _owner, _creator,
            _minimumInitialLiquidity,
            _oracleKey, _targetPrice,
                _times,
            _bids,
            _fees)
    {}

    function updatePrices(uint256 longBids, uint256 shortBids, uint totalDebt) public {
        _updatePrices(longBids, shortBids, totalDebt);
    }

    function setManager(address _manager) public {
        owner = _manager;
    }
}
