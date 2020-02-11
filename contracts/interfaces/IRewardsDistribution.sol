pragma solidity 0.4.25;


/**
 * @title RewardsDistribution interface
 */
interface IRewardsDistribution {
    function distributeRewards(uint amount) external;
}
