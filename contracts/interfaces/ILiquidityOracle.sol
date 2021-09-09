pragma solidity ^0.5.16;

interface ILiquidityOracle {
    function priceImpactFactor(bytes32 asset) external view returns (uint);

    function maxOpenInterestDelta(bytes32 asset) external view returns (uint);

    function openInterest(bytes32 asset) external view returns (int);

    function resetOpenInterest(bytes32 asset) external;

    function updateOpenInterest(bytes32 asset, uint amount) external;
}
