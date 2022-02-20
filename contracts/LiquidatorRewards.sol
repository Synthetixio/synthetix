pragma solidity ^0.5.16;

import "openzeppelin-solidity-2.3.0/contracts/math/SafeMath.sol";
import "openzeppelin-solidity-2.3.0/contracts/token/ERC20/ERC20Detailed.sol";
import "openzeppelin-solidity-2.3.0/contracts/token/ERC20/SafeERC20.sol";
import "openzeppelin-solidity-2.3.0/contracts/utils/ReentrancyGuard.sol";

// Inheritance
import "./Owned.sol";
import "./MixinResolver.sol";
import "./MixinSystemSettings.sol";
import "./interfaces/ILiquidatorRewards.sol";

// Internal references
import "./interfaces/ISynthetixDebtShare.sol";
import "./interfaces/IIssuer.sol";
import "./interfaces/IRewardEscrowV2.sol";
import "./interfaces/ISynthetix.sol";

// import "hardhat/console.sol";

/// @title Upgrade Liquidation Mechanism V2 (SIP-148)
/// @notice This contract is a modification to the existing liquidation mechanism defined in SIP-15.
contract LiquidatorRewards is ILiquidatorRewards, Owned, MixinSystemSettings, ReentrancyGuard {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;

    /* ========== STATE VARIABLES ========== */

    IERC20 public rewardsToken; // SNX
    IERC20 public stakingToken; // SDS

    uint public constant escrowDuration = 52 weeks;
    uint256 public accumulatedRewards = 0;
    uint256 public rewardPerTokenStored;
    uint256 public lastUpdateTime;

    mapping(address => uint256) public userRewardPerTokenPaid;
    mapping(address => uint256) public rewards;

    bytes32 public constant CONTRACT_NAME = "LiquidatorRewards";

    /* ========== ADDRESS RESOLVER CONFIGURATION ========== */

    bytes32 private constant CONTRACT_SYNTHETIXDEBTSHARE = "SynthetixDebtShare";
    bytes32 private constant CONTRACT_ISSUER = "Issuer";
    bytes32 private constant CONTRACT_REWARDESCROW_V2 = "RewardEscrowV2";
    bytes32 private constant CONTRACT_SYNTHETIX = "Synthetix";

    /* ========== CONSTRUCTOR ========== */

    constructor(
        address _owner,
        address _resolver,
        address _rewardsToken,
        address _stakingToken
    ) public Owned(_owner) MixinSystemSettings(_resolver) {
        rewardsToken = IERC20(_rewardsToken);
        stakingToken = IERC20(_stakingToken);
    }

    /* ========== VIEWS ========== */

    function resolverAddressesRequired() public view returns (bytes32[] memory addresses) {
        bytes32[] memory existingAddresses = MixinSystemSettings.resolverAddressesRequired();
        bytes32[] memory newAddresses = new bytes32[](4);
        newAddresses[0] = CONTRACT_SYNTHETIXDEBTSHARE;
        newAddresses[1] = CONTRACT_ISSUER;
        newAddresses[2] = CONTRACT_REWARDESCROW_V2;
        newAddresses[3] = CONTRACT_SYNTHETIX;
        return combineArrays(existingAddresses, newAddresses);
    }

    function synthetixDebtShare() internal view returns (ISynthetixDebtShare) {
        return ISynthetixDebtShare(requireAndGetAddress(CONTRACT_SYNTHETIXDEBTSHARE));
    }

    function issuer() internal view returns (IIssuer) {
        return IIssuer(requireAndGetAddress(CONTRACT_ISSUER));
    }

    function rewardEscrowV2() internal view returns (IRewardEscrowV2) {
        return IRewardEscrowV2(requireAndGetAddress(CONTRACT_REWARDESCROW_V2));
    }

    function synthetix() internal view returns (ISynthetix) {
        return ISynthetix(requireAndGetAddress(CONTRACT_SYNTHETIX));
    }

    function rewardPerToken() public view returns (uint256) {
        uint supply = synthetixDebtShare().totalSupply();
        // console.log("total debt share supply: %s", supply);
        // console.log("rewardPerTokenStored: %s", rewardPerTokenStored);
        if (supply == 0) {
            // console.log("supply is zero: %s", supply);
            return rewardPerTokenStored;
        }
        // console.log("lastUpdateTime: %s", lastUpdateTime);
        // console.log("accumulatedRewards: %s", accumulatedRewards);

        return
            rewardPerTokenStored.add(
                (lastUpdateTime).mul(accumulatedRewards).mul(1e18).div(supply)
            );
    }

    function earned(address account) public view returns (uint256) {
        return synthetixDebtShare().balanceOf(account).mul(rewardPerToken().sub(userRewardPerTokenPaid[account])).div(1e18).add(rewards[account]);
    }

    /* ========== MUTATIVE FUNCTIONS ========== */

    function getReward() external nonReentrant updateReward(msg.sender) {
        uint256 reward = rewards[msg.sender];
        if (reward > 0) {
            rewards[msg.sender] = 0;
            rewardsToken.approve(address(rewardEscrowV2()), reward);
            rewardEscrowV2().createEscrowEntry(msg.sender, reward, escrowDuration);
            emit RewardPaid(msg.sender, reward);
        }
    }

    /* ========== RESTRICTED FUNCTIONS ========== */

    // TODO: May need two functions for mint and burn.

    /// @notice This is called only by the Issuer to update when a given account's debt balance changes.
    function notifyDebtChange(address account) external onlyIssuer updateReward(account) { }

    /// @notice This is called only by Synthetix after an account is liquidated and the SNX rewards are sent to this contract.
    function notifyRewardAmount(uint256 reward) external onlySynthetix {        
        // Ensure the provided reward amount is not more than the balance in the contract.
        // console.log("reward: %s", reward);
        // console.log("accumulatedRewards: %s", accumulatedRewards);
        accumulatedRewards.add(reward);
        // console.log("accumulatedRewards: %s", accumulatedRewards);
        // console.log("about to call reward per token");
        rewardPerTokenStored = rewardPerToken();
        lastUpdateTime = block.timestamp;
        emit RewardAdded(reward);
    }

    // Added to support recovering LP Rewards from other systems such as BAL to be distributed to holders
    function recoverERC20(address tokenAddress, uint256 tokenAmount) external onlyOwner {
        require(tokenAddress != address(stakingToken), "Cannot withdraw the staking token");
        IERC20(tokenAddress).safeTransfer(owner, tokenAmount);
        emit Recovered(tokenAddress, tokenAmount);
    }

    /* ========== MODIFIERS ========== */

    modifier updateReward(address account) {
        rewardPerTokenStored = rewardPerToken();
        lastUpdateTime = block.timestamp;
        if (account != address(0)) {
            rewards[account] = earned(account);
            userRewardPerTokenPaid[account] = rewardPerTokenStored;
        }
        _;
    }

    modifier onlyIssuer {
        bool isIssuer = msg.sender == address(issuer());
        require(isIssuer, "Issuer only");
        _;
    }

    modifier onlySynthetix {
        bool isSynthetix = msg.sender == address(synthetix());
        require(isSynthetix, "Synthetix only");
        _;
    }

    /* ========== EVENTS ========== */

    event RewardAdded(uint256 reward);
    event RewardPaid(address indexed user, uint256 reward);
    event Recovered(address token, uint256 amount);
}
