pragma solidity >=0.4.24;

// https://docs.synthetix.io/contracts/source/interfaces/isynthetixdebtshare
interface ISynthetixDebtShare {
    // Views

    function balanceOf(address account) external view returns (uint);

    function balanceOfOnPeriod(address account, uint periodId) external view returns (uint);

    function totalSupply() external view returns (uint);

    function sharePercent(address account) external view returns (uint);

    function sharePercentOnPeriod(address account, uint periodId) external view returns (uint);

    function sharePercentToBalance(uint sharePercent) external view returns (uint);

    // Mutative functions

    function setCurrentPeriodId(uint newPeriodId) external;

    function mintShare(address account, uint256 amount) external;

    function mintSharePercentage(address account, uint256 sharePercentage) external;

    function burnShare(address account, uint256 amount) external;

    function burnSharePercentage(address account, uint256 sharePercentage) external;

    function transfer(address to, uint256 amount) external;

    function transferFrom(address from, address to, uint256 amount) external;
}
