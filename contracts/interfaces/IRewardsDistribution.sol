pragma solidity ^0.5.16;


interface IRewardsDistribution {
    function distributeRewards(uint amount) external returns (bool);
}
