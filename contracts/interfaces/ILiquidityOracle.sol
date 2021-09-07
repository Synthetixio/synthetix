pragma solidity ^0.5.16;

interface ILiquidityOracle {
    function resetOpenInterest(bytes32 asset) external;
    function updateOpenInterest(bytes32 asset, uint amount) external;
    function openInterest(bytes32 asset) external returns (uint);
    function priceImpactFactor(bytes32 asset) external returns (uint);
    function maxOpenInterestDelta(bytes32 asset) external returns (int);
}