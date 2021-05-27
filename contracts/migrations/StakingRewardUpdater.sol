pragma solidity ^0.5.16;

interface IAddressResolver {
    function getAddress(bytes32 name) external view returns (address);

    function getSynth(bytes32 key) external view returns (address);

    function requireAndGetAddress(bytes32 name, string calldata reason) external view returns (address);
}

interface IStakingRewards {
    function lastTimeRewardApplicable() external view returns (uint256);

    function rewardsDistribution() external view returns (address);

    // Restricted functions
    function notifyRewardAmount(uint256 reward) external;

    function setRewardsDuration(uint256 _rewardsDuration) external;

    function setRewardsDistribution(address _rewardsDistribution) external;

    // IOwned
    function owner() external view returns (address);

    //      Restricted functions
    function acceptOwnership() external;

    function nominateNewOwner(address _owner) external;
}

interface IERC20 {
    function totalSupply() external view returns (uint);

    function balanceOf(address owner) external view returns (uint);

    function allowance(address owner, address spender) external view returns (uint);

    // Mutative functions
    function transfer(address to, uint value) external returns (bool);

    function approve(address spender, uint value) external returns (bool);

    function transferFrom(
        address from,
        address to,
        uint value
    ) external returns (bool);
}

contract StakingRewardUpdater {
    IAddressResolver public resolver;

    constructor(IAddressResolver _resolver) public {
        resolver = _resolver;
    }

    // For all staking reward contracts,
    function execute(
        IStakingRewards[] calldata rewardContracts,
        uint rewardsPerContract,
        uint duration
    ) external {
        IERC20 synthetix = IERC20(resolver.requireAndGetAddress("Synthetix", "Cannot find Synthetix address"));

        for (uint i = 0; i < rewardContracts.length; i++) {
            IStakingRewards rewardContract = rewardContracts[i];

            require(rewardContract.lastTimeRewardApplicable() < block.timestamp, "Staking reward contract still ongoing");

            address previousOwner = rewardContract.owner();

            rewardContract.acceptOwnership();

            rewardContract.setRewardsDuration(duration);

            require(synthetix.balanceOf(address(this)) >= rewardsPerContract, "Insufficient balance");

            synthetix.transfer(address(rewardContract), rewardsPerContract);

            address previousRewardsDistribution = rewardContract.rewardsDistribution();

            rewardContract.setRewardsDistribution(address(this));

            rewardContract.notifyRewardAmount(rewardsPerContract);

            rewardContract.setRewardsDistribution(previousRewardsDistribution);

            rewardContract.nominateNewOwner(previousOwner);
        }
    }
}
