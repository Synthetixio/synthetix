pragma solidity ^0.5.16;

import "../StakingRewards.sol";

contract StakingRewardUpdater {
    address public deployer;

    constructor() public {
        deployer = msg.sender;
    }

    // For all staking reward contracts that have expired,
    // take ownership, set duration, send SNX rewards, notify rewards then return ownership
    // Requires: this contract be the nominated owner of the staking rewards and sufficient rewards tokens given to each contract.
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

    function returnFunds(IERC20 token) external {
        token.transfer(deployer, token.balanceOf(address(this)));
    }
}
