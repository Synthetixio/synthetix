pragma solidity ^0.5.16;

interface ITradingRewards {
	// Views
    function getRewardsToken() external view returns (address);

    function getRewardsDistribution() external view returns (address);

    function getCurrentPeriod() external view returns (uint);

    function getPeriodIsClaimable(uint periodID) external view returns (bool);

    function getPeriodRecordedFees(uint periodID) external view returns (uint);

    function getPeriodTotalRewards(uint periodID) external view returns (uint);

    function getPeriodAvailableRewards(uint periodID) external view returns (uint);

    function getRecordedFeesForAccountForPeriod(address account, uint periodID) external view returns (uint);

    function getClaimedRewardsForAccountForPeriod(address account, uint periodID) external view returns (uint);

    function getAvailableRewardsForAccountForPeriod(address account, uint periodID) external view returns (uint);

    function getAvailableRewardsForAccountForPeriods(address account, uint[] calldata periodIDs)
        external
        view
        returns (uint totalRewards);

	// Mutative Functions
    function claimRewardsForPeriod(uint periodID) external;

    function claimRewardsForPeriods(uint[] calldata periodIDs) external;

	// Restricted Functions
    function recordExchangeFeeForAccount(uint amount, address account) external;

    function setRewardsDistribution(address newRewardsDistribution) external;

    function notifyRewardAmount(uint newRewards) external;

    function recoverTokens(address tokenAddress, uint amount) external;

    function recoverRewardsTokens(uint amount) external;
}
