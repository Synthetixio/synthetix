pragma solidity >=0.4.24;

interface ILiquidatorRewards {
    // Views

    function earned(address account) external view returns (uint256);

    function rewardPerToken() external view returns (uint256);

    function snx() external view returns (address);

    // Mutative

    function getReward() external;

    function notifyDebtChange(address account) external;

    function notifyRewardAmount(uint256 reward) external;
}
