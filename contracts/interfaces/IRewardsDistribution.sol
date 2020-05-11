pragma solidity >=0.4.24;


interface IRewardsDistribution {
    // Mutative functions
    function distributeRewards(uint amount) external returns (bool);
}
