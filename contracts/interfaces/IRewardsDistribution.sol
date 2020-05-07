pragma solidity ^0.5.16;


interface IRewardsDistribution {
    // Mutative functions
    function distributeRewards(uint amount) external returns (bool);
}
