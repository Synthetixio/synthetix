pragma solidity ^0.5.16;

import "../StakingRewards.sol";

contract StakingRewardUpdater {
    // For all staking reward contracts that have expired, take ownership, set duration, send SNX rewards,
    function execute(
        StakingRewards[] calldata rewardContracts,
        uint rewardsPerContract,
        uint duration
    ) external {
        for (uint i = 0; i < rewardContracts.length; i++) {
            StakingRewards rewardContract = rewardContracts[i];

            require(rewardContract.lastTimeRewardApplicable() < block.timestamp, "Staking reward contract still ongoing");

            address previousOwner = rewardContract.owner();

            rewardContract.acceptOwnership();

            rewardContract.setRewardsDuration(duration);

            IERC20 rewardsToken = IERC20(rewardContract.rewardsToken());

            require(rewardsToken.balanceOf(address(this)) >= rewardsPerContract, "Insufficient balance");

            rewardsToken.transfer(address(rewardContract), rewardsPerContract);

            address previousRewardsDistribution = rewardContract.rewardsDistribution();

            rewardContract.setRewardsDistribution(address(this));

            rewardContract.notifyRewardAmount(rewardsPerContract);

            rewardContract.setRewardsDistribution(previousRewardsDistribution);

            rewardContract.nominateNewOwner(previousOwner);
        }
    }
}
