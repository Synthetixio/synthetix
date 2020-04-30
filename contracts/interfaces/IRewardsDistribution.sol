pragma solidity ^0.5.16;

// https://docs.synthetix.io/contracts/RewardsDistribution
interface IRewardsDistribution {
    // SETTERS
    function setSynthetixProxy(address _synthetixProxy) external;
    function setRewardEscrow(address _rewardEscrow) external; 
    function setFeePoolProxy(address _feePoolProxy) external;
    function setAuthority(address _authority) external;
    // FUNCTIONS
    function addRewardDistribution(address destination, uint amount) external returns (bool);
    function editRewardDistribution(uint index, address destination, uint amount) external returns (bool);
    function removeRewardDistribution(uint index) external;
    function distributeRewards(uint amount) external returns (bool);
    // VIEWS
    function distributionsLength() external view returns (uint);
}
