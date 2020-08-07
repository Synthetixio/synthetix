pragma solidity ^0.5.16;

interface ITradingRewards {
	// Views
	function rewards(address account, uint periodID) external view returns (uint);

	function rewardsForPeriods(address account, uint[] calldata periodIDs) external view returns (uint);

	// Mutative Functions
	function recordExchangeFee(uint amount, address account) external;

	function claimRewards(uint periodID) external;

	function claimRewardsForPeriods(uint[] calldata periodIDs) external;

	// Restricted Functions
	function notifyRewardAmount(uint reward) external;
}
