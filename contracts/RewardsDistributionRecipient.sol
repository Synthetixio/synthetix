pragma solidity ^0.5.16;

// Inheritance
import "./Owned.sol";

// https://docs.synthetix.io/contracts/source/contracts/rewardsdistributionrecipient
contract RewardsDistributionRecipient is Owned {
    address public rewardsDistribution;

    function notifyRewardAmount(uint256 reward) external;

    modifier onlyRewardsDistribution() {
        require(msg.sender == rewardsDistribution, "Caller is not RewardsDistribution contract");
        _;
    }

    function setRewardsDistribution(address _rewardsDistribution) external onlyOwner {
        rewardsDistribution = _rewardsDistribution;
    }

    /* ========== Math helpers ========== */

    /*
     * @dev copied from openzeppelin-solidity-2.3.0/contracts/math/Math.sol
     *  to avoid using OZ Math import because of contract name collision (Math)
     *  with the internal Math.sol contract which e.g. is confusing for slither-analyzer
     */
    function _min(uint256 a, uint256 b) internal pure returns (uint256) {
        return a < b ? a : b;
    }
}
