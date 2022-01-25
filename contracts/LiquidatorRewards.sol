pragma solidity ^0.5.16;

import "openzeppelin-solidity-2.3.0/contracts/math/SafeMath.sol";
import "openzeppelin-solidity-2.3.0/contracts/token/ERC20/ERC20Detailed.sol";
import "openzeppelin-solidity-2.3.0/contracts/token/ERC20/SafeERC20.sol";
import "openzeppelin-solidity-2.3.0/contracts/utils/ReentrancyGuard.sol";

// Inheritance
import "./interfaces/ILiquidatorRewards.sol";
import "./Pausable.sol";

// TODO: An updated version of the current Staking Rewards contract that will do the following:
/*
    * remove the time based component of the staking rewards.

    * When staker's mint and burn sUSD, the amount of debt shares they have will be updated in the liquidation rewards contract.

    * The debt shares mechanism will be used in the liquidation reward contract to distribute the liquidated SNX.
    (support tracking the debt shares of each staker, allowing them to claim the liquidated SNX at anytime).
*/

/// @title Liquidator Rewards Contract
/// @notice This contract handles the distribution and claiming of liquidated SNX as defined in SIP-148.
contract LiquidatorRewards is ILiquidatorRewards, ReentrancyGuard, Pausable {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;

    /* ========== STATE VARIABLES ========== */

    IERC20 public rewardsToken;

    mapping(address => uint256) public userRewardPerTokenPaid;
    mapping(address => uint256) public rewards;

    uint256 private _totalSupply;
    mapping(address => uint256) private _balances;

    /* ========== CONSTRUCTOR ========== */

    constructor(
        address _owner,
        address _rewardsToken
    ) public Owned(_owner) {
        rewardsToken = IERC20(_rewardsToken);
    }

    /* ========== VIEWS ========== */

    function totalSupply() external view returns (uint256) {
        return _totalSupply;
    }

    function balanceOf(address account) external view returns (uint256) {
        return _balances[account];
    }

    /* ========== MUTATIVE FUNCTIONS ========== */

    // TODO: Claiming liquidated SNX will create a vesting entry for 12 months on the escrow contract.
    function getReward() public nonReentrant {
        uint256 reward = rewards[msg.sender];
        if (reward > 0) {
            rewards[msg.sender] = 0;
            rewardsToken.safeTransfer(msg.sender, reward);
            emit RewardPaid(msg.sender, reward);
        }
    }

    /* ========== RESTRICTED FUNCTIONS ========== */

    // function notifyRewardAmount(uint256 reward) external onlyRewardsDistribution updateReward(address(0)) {
    //     if (block.timestamp >= periodFinish) {
    //         rewardRate = reward.div(rewardsDuration);
    //     } else {
    //         uint256 remaining = periodFinish.sub(block.timestamp);
    //         uint256 leftover = remaining.mul(rewardRate);
    //         rewardRate = reward.add(leftover).div(rewardsDuration);
    //     }

    //     // Ensure the provided reward amount is not more than the balance in the contract.
    //     // This keeps the reward rate in the right range, preventing overflows due to
    //     // very high values of rewardRate in the earned and rewardsPerToken functions;
    //     // Reward + leftover must be less than 2^256 / 10^18 to avoid overflow.
    //     uint balance = rewardsToken.balanceOf(address(this));
    //     require(rewardRate <= balance.div(rewardsDuration), "Provided reward too high");

    //     lastUpdateTime = block.timestamp;
    //     periodFinish = block.timestamp.add(rewardsDuration);
    //     emit RewardAdded(reward);
    // }

    /* ========== MODIFIERS ========== */

    // modifier updateReward(address account) {
    //     rewardPerTokenStored = rewardPerToken();
    //     lastUpdateTime = lastTimeRewardApplicable();
    //     if (account != address(0)) {
    //         rewards[account] = earned(account);
    //         userRewardPerTokenPaid[account] = rewardPerTokenStored;
    //     }
    //     _;
    // }

    /* ========== EVENTS ========== */

    event RewardAdded(uint256 reward);
    event RewardPaid(address indexed user, uint256 reward);
}
