pragma solidity ^0.5.16;


/**
 * @title RewardsDistribution interface
 */
interface IRewardsDistribution {
    function distributeRewards(uint amount) external;
}
