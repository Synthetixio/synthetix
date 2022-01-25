pragma solidity >=0.4.24;

interface ILiquidatorRewards {
    // Views

    function balanceOf(address account) external view returns (uint256);

    function totalSupply() external view returns (uint256);

    // Mutative

    function getReward() external;
}
