pragma solidity ^0.5.16;


interface ITradingRewards {

    /* ========== VIEWS ========== */

    function getAvailableRewards() external view returns (uint);

    function getRewardsToken() external view returns (address);

    function getRewardsDistribution() external view returns (address);

    function getCurrentPeriod() external view returns (uint);

    function getPeriodIsClaimable(uint periodID) external view returns (bool);

    function getPeriodIsFinalized(uint periodID) external view returns (bool);

    function getPeriodRecordedFees(uint periodID) external view returns (uint);

    function getPeriodTotalRewards(uint periodID) external view returns (uint);

    function getPeriodAvailableRewards(uint periodID) external view returns (uint);

    function getUnnacountedFeesForAccountForPeriod(address account, uint periodID) external view returns (uint);

    function getAvailableRewardsForAccountForPeriod(address account, uint periodID) external view returns (uint);

    function getAvailableRewardsForAccountForPeriods(address account, uint[] calldata periodIDs)
        external
        view
        returns (uint totalRewards);

    /* ========== MUTATIVE FUNCTIONS ========== */

    function claimRewardsForPeriod(uint periodID) external;

    function claimRewardsForPeriods(uint[] calldata periodIDs) external;

    // solhint-disable-next-line
    function() external;

    /* ========== RESTRICTED FUNCTIONS ========== */

    function recordExchangeFeeForAccount(uint amount, address account) external;

    function closeCurrentPeriodWithRewards(uint rewards) external;

    function recoverEther(address payable recoverAddress) external;

    function recoverTokens(
        address recoverAddress,
        address tokenAddress,
        uint amount
    ) external;

    function recoverFreeRewardTokens(address recoverAddress, uint amount) external;

    function recoverAllLockedRewardTokensFromPeriod(address recoverAddress, uint periodID) external;

    function setRewardsDistribution(address newRewardsDistribution) external;
}
