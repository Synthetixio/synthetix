pragma solidity 0.4.25;

import "./Owned.sol";


// https://docs.synthetix.io/contracts/RewardsDistributionRecipient
contract RewardsDistributionRecipient is Owned {
    address rewardsDistribution;

    function notifyRewardAmount(uint256 reward) external;

    modifier onlyRewardsDistribution() {
        require(msg.sender == rewardsDistribution, "Caller is not RewardsDistribution contract");
        _;
    }

    function setRewardsDistribution(address _rewardsDistribution) external onlyOwner {
        rewardsDistribution = _rewardsDistribution;
    }
}
