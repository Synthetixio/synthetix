pragma solidity ^0.5.16;


interface IFuturesMarket {
    function marketDebt() external view returns (uint debt, bool isInvalid);
}
