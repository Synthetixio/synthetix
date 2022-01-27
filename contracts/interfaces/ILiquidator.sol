pragma solidity >=0.4.24;

interface ILiquidator {
    // Views
    function liquidationPenalty() external view returns (uint);

    function selfLiquidationPenalty() external view returns (uint);

    function forcedLiquidationOpen(address account) external view returns (bool);

    function selfLiquidationOpen(address account) external view returns (bool);

    function calculateAmountToFixCollateral(uint debtBalance, uint collateral, bool isSelfLiquidation) external view returns (uint);

    // Mutative Functions
    function flagAccountForLiquidation(address account) external;

    // Restricted: used internally to Synthetix contracts
    function removeAccountInLiquidation(address account) external;

    function checkAndRemoveAccountInLiquidation(address account) external;
}