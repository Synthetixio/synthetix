pragma solidity ^0.5.16;

interface IFuturesMarket {
    function marketDebt() external view returns (uint debt, bool isInvalid);

    function baseAsset() external view returns (bytes32 key);

    function recomputeFunding() external returns (uint lastIndex);
}
