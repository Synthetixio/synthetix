pragma solidity >=0.4.24;

interface ILiquidatorRewards {
    // Views

    function balanceOf(address account) external view returns (uint256);

    function earned(address account) external view returns (uint256);

    function getRewardForDuration() external view returns (uint256);

    function rewardPerToken(int amount) external view returns (uint256);

    function rewardsToken() external view returns (address);

    function totalSupply() external view returns (uint256);

    // Mutative

    function getReward() external;

    function notifyDebtChange(address account, int amount) external;

    function notifyRewardAmount(uint256 reward) external;
}
