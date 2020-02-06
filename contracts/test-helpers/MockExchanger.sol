pragma solidity 0.4.25;

contract MockExchanger {
    uint256 private _mockReclaimAmount;
    uint256 private _mockRefundAmount;

    constructor() public {}

    // Mock settle function
    function settle(address from, bytes32 currencyKey) external view returns (uint256 reclaimed, uint256 refunded) {

        return (_mockReclaimAmount, _mockRefundAmount);
    }

    function setReclaim(uint256 _reclaimAmount) external {
        _mockReclaimAmount = _reclaimAmount; 
    }

    function setRefund(uint256 _refundAmount) external {
        _mockRefundAmount = _refundAmount; 
    }
}
