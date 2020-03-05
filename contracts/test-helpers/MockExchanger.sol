pragma solidity 0.4.25;

import "../interfaces/ISynthetix.sol";


contract MockExchanger {
    uint256 private _mockReclaimAmount;
    uint256 private _mockRefundAmount;
    uint256 private _mockNumEntries;

    ISynthetix synthetix;

    constructor(ISynthetix _synthetix) public {
        synthetix = _synthetix;
    }

    // Mock settle function
    function settle(address from, bytes32 currencyKey)
        external
        view
        returns (uint256 reclaimed, uint256 refunded, uint numEntriesSettled)
    {
        if (_mockReclaimAmount > 0) {
            synthetix.synths(currencyKey).burn(from, _mockReclaimAmount);
        }

        if (_mockRefundAmount > 0) {
            synthetix.synths(currencyKey).issue(from, _mockRefundAmount);
        }

        return (_mockReclaimAmount, _mockRefundAmount, _mockNumEntries);
    }

    function settlementOwing(address account, bytes32 currencyKey) public view returns (uint, uint, uint) {
        return (_mockReclaimAmount, _mockRefundAmount, _mockNumEntries);
    }

    function setReclaim(uint256 _reclaimAmount) external {
        _mockReclaimAmount = _reclaimAmount;
    }

    function setRefund(uint256 _refundAmount) external {
        _mockRefundAmount = _refundAmount;
    }

    function setNumEntries(uint256 _numEntries) external {
        _mockNumEntries = _numEntries;
    }
}
