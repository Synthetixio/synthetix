pragma solidity >=0.4.24;


interface IStakingRewards {
    function lastTimeRewardApplicable() external view returns (uint256);

    function rewardPerToken() external view returns (uint256);

    function earned(address account) external view returns (uint256);

    function exit() external;

    function getReward() external;

    function notifyRewardAmount(uint256 reward) external;

    function stake(uint256 amount) external;

    function withdraw(uint256 amount) external;
}
