pragma solidity ^0.5.16;

import "openzeppelin-solidity-2.3.0/contracts/math/SafeMath.sol";
import "openzeppelin-solidity-2.3.0/contracts/token/ERC20/SafeERC20.sol";
import "openzeppelin-solidity-2.3.0/contracts/utils/ReentrancyGuard.sol";

// Inheritance
import "./Owned.sol";
import "./MixinResolver.sol";
import "./MixinSystemSettings.sol";
import "./interfaces/ILiquidatorRewards.sol";

// Libraries
import "./SafeDecimalMath.sol";

// Internal references
import "./interfaces/IIssuer.sol";
import "./interfaces/IRewardEscrowV2.sol";
import "./interfaces/ISynthetixDebtShare.sol";

/// @title Liquidator Rewards (SIP-148)
/// @notice This contract holds SNX from liquidated positions.
/// @dev SNX stakers may claim their rewards based on their share of the debt pool.
contract LiquidatorRewards is ILiquidatorRewards, Owned, MixinSystemSettings, ReentrancyGuard {
    using SafeMath for uint256;
    using SafeDecimalMath for uint256;
    using SafeERC20 for IERC20;

    /* ========== STATE VARIABLES ========== */

    uint256 public accumulatedRewards;
    uint256 public rewardPerShareStored;

    mapping(address => uint256) public userRewardPerSharePaid;
    mapping(address => uint256) public rewards;

    bytes32 public constant CONTRACT_NAME = "LiquidatorRewards";

    /* ========== ADDRESS RESOLVER CONFIGURATION ========== */

    bytes32 private constant CONTRACT_SYNTHETIXDEBTSHARE = "SynthetixDebtShare";
    bytes32 private constant CONTRACT_ISSUER = "Issuer";
    bytes32 private constant CONTRACT_REWARDESCROW_V2 = "RewardEscrowV2";
    bytes32 private constant CONTRACT_SYNTHETIX = "Synthetix";

    /* ========== CONSTRUCTOR ========== */

    constructor(address _owner, address _resolver) public Owned(_owner) MixinSystemSettings(_resolver) {}

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

    function synthetix() internal view returns (IERC20) {
        return IERC20(requireAndGetAddress(CONTRACT_SYNTHETIX));
    }

    function rewardPerShare() public view returns (uint256) {
        (, uint sharesSupply, ) = issuer().allNetworksDebtInfo();

        if (sharesSupply == 0) {
            return 0;
        }

        return accumulatedRewards.divideDecimal(sharesSupply);
    }

    function earned(address account) public view returns (uint256) {
        return
            synthetixDebtShare()
                .balanceOf(account)
                .multiplyDecimal(rewardPerShare().sub(userRewardPerSharePaid[account]))
                .add(rewards[account]);
    }

    /* ========== MUTATIVE FUNCTIONS ========== */

    function getReward() external nonReentrant updateReward(msg.sender) {
        uint256 reward = rewards[msg.sender];
        if (reward > 0) {
            rewards[msg.sender] = 0;
            synthetix().approve(address(rewardEscrowV2()), reward);
            rewardEscrowV2().createEscrowEntry(msg.sender, reward, getLiquidationEscrowDuration());
            emit RewardPaid(msg.sender, reward);
        }
    }

    /* ========== RESTRICTED FUNCTIONS ========== */

    /// @notice This is called only after an account is liquidated and the SNX rewards are sent to this contract.
    function notifyRewardAmount(uint256 reward) external onlySynthetix {
        accumulatedRewards = accumulatedRewards.add(reward);
        rewardPerShareStored = rewardPerShare();
    }

    /* ========== MODIFIERS ========== */

    modifier updateReward(address account) {
        rewardPerShareStored = rewardPerShare();
        if (account != address(0)) {
            rewards[account] = earned(account);
            userRewardPerSharePaid[account] = rewardPerShareStored;
        }
        _;
    }

    modifier onlySynthetix {
        bool isSynthetix = msg.sender == address(synthetix());
        require(isSynthetix, "Synthetix only");
        _;
    }

    /* ========== EVENTS ========== */

    event RewardPaid(address indexed user, uint256 reward);
}
