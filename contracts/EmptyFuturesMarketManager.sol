pragma solidity ^0.5.16;

// Empty contract for ether collateral placeholder for OVM
// https://docs.synthetix.io/contracts/source/contracts/emptyethercollateral

import "./interfaces/IFuturesMarketManager.sol";

contract EmptyFuturesMarketManager is IFuturesMarketManager {
    bytes32 public constant CONTRACT_NAME = "EmptyFuturesMarketManager";

    function markets(uint index, uint pageSize) external view returns (address[] memory) {
        index;
        pageSize;
        address[] memory _markets;
        return _markets;
    }

    function numMarkets() external view returns (uint) {
        return 0;
    }

    function allMarkets() external view returns (address[] memory) {
        address[] memory _markets;
        return _markets;
    }

    function marketForKey(bytes32 marketKey) external view returns (address) {
        marketKey;
        return address(0);
    }

    function marketsForKeys(bytes32[] calldata marketKeys) external view returns (address[] memory) {
        marketKeys;
        address[] memory _markets;
        return _markets;
    }

    function totalDebt() external view returns (uint debt, bool isInvalid) {
        return (0, false);
    }
}
