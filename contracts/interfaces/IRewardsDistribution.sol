pragma solidity >=0.4.24;


interface IRewardsDistribution {
    // Views
    function distributionsLength() external view returns (uint);

    // Mutative Functions
    function distributeRewards(uint amount) external returns (bool);
}
