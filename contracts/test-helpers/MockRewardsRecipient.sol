pragma solidity ^0.5.16;

import "../RewardsDistributionRecipient.sol";
import "../Owned.sol";


contract MockRewardsRecipient is RewardsDistributionRecipient {
    uint256 public rewardsAvailable;

    constructor(address _owner) public Owned() {
    	require(_owner != address(0), "Owner address cannot be 0");
        owner = _owner;
        emit OwnerChanged(address(0), _owner);
    }

    function notifyRewardAmount(uint256 reward) external onlyRewardsDistribution {
        rewardsAvailable = rewardsAvailable + reward;
        emit RewardAdded(reward);
    }

    event RewardAdded(uint256 amount);
}
