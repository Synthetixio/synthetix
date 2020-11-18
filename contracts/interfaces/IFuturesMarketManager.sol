pragma solidity ^0.5.16;


interface IFuturesMarketManager {
    function markets(uint index, uint pageSize) external view returns (address[] memory);

    function totalDebt() external view returns (uint debt, bool isInvalid);
}
