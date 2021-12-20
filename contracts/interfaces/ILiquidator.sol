pragma solidity >=0.4.24;

interface ILiquidator {
    // Views
    function liquidationOpen(address account) external view returns (bool);

    function instantLiquidationOpen(address account) external view returns (bool);

    // Mutative Functions
    function flagAccountForLiquidation(address account) external;

    // Restricted: used internally to Synthetix contracts
    function removeAccountInLiquidation(address account) external;

    function checkAndRemoveAccountInLiquidation(address account) external;
}