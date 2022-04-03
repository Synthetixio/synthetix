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
import "./interfaces/ILiquidator.sol";
import "./interfaces/ISynthetixDebtShare.sol";
import "./interfaces/IIssuer.sol";
import "./interfaces/IRewardEscrowV2.sol";
import "./interfaces/ISynthetix.sol";

/// @title Liquidator Rewards (SIP-148)
/// @notice This contract holds SNX from liquidated positions.
/// @dev SNX stakers may claim their rewards based on their share of the debt pool.
contract LiquidatorRewards is ILiquidatorRewards, Owned, MixinSystemSettings, ReentrancyGuard {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;

    /* ========== STATE VARIABLES ========== */

    uint256 public rewardPerShareStored;

    mapping(address => uint256) public userRewardPerSharePaid;
    mapping(address => uint256) public rewards;

    bytes32 public constant CONTRACT_NAME = "LiquidatorRewards";

    /* ========== ADDRESS RESOLVER CONFIGURATION ========== */

    bytes32 private constant CONTRACT_LIQUIDATOR = "Liquidator";
    bytes32 private constant CONTRACT_SYNTHETIXDEBTSHARE = "SynthetixDebtShare";
    bytes32 private constant CONTRACT_ISSUER = "Issuer";
    bytes32 private constant CONTRACT_REWARDESCROW_V2 = "RewardEscrowV2";
    bytes32 private constant CONTRACT_SYNTHETIX = "Synthetix";

    /* ========== CONSTRUCTOR ========== */

    constructor(address _owner, address _resolver) public Owned(_owner) MixinSystemSettings(_resolver) {}

    /* ========== VIEWS ========== */

    function resolverAddressesRequired() public view returns (bytes32[] memory addresses) {
        bytes32[] memory existingAddresses = MixinSystemSettings.resolverAddressesRequired();
        bytes32[] memory newAddresses = new bytes32[](5);
        newAddresses[0] = CONTRACT_LIQUIDATOR;
        newAddresses[1] = CONTRACT_SYNTHETIXDEBTSHARE;
        newAddresses[2] = CONTRACT_ISSUER;
        newAddresses[3] = CONTRACT_REWARDESCROW_V2;
        newAddresses[4] = CONTRACT_SYNTHETIX;
        return combineArrays(existingAddresses, newAddresses);
    }

    function liquidator() internal view returns (ILiquidator) {
        return ILiquidator(requireAndGetAddress(CONTRACT_LIQUIDATOR));
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

    function rewardPerShare() public view returns (uint256) {
        (, uint sharesSupply, ) = issuer().allNetworksDebtInfo();

        if (sharesSupply == 0) {
            return 0;
        }

        return (IERC20(address(synthetix())).balanceOf(address(this))).div(sharesSupply);
    }

    function earned(address account) public view returns (uint256) {
        return
            synthetixDebtShare().balanceOf(account).mul(rewardPerShare().sub(userRewardPerSharePaid[account])).div(1e18).add(
                rewards[account]
            );
    }

    /* ========== MUTATIVE FUNCTIONS ========== */

    function getReward() external nonReentrant updateReward(msg.sender) {
        uint256 reward = rewards[msg.sender];
        if (reward > 0) {
            rewards[msg.sender] = 0;
            IERC20(address(synthetix())).approve(address(rewardEscrowV2()), reward);
            rewardEscrowV2().createEscrowEntry(msg.sender, reward, getLiquidationEscrowDuration());
            emit RewardPaid(msg.sender, reward);
        }
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

    /* ========== EVENTS ========== */

    event RewardPaid(address indexed user, uint256 reward);
}
