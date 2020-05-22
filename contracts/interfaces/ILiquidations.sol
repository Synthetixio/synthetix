pragma solidity >=0.4.24;


interface ILiquidations {
    // Views
    function isOpenForLiquidation(address account) external view returns (bool);

    // Mutative Functions
    function flagAccountForLiquidation(address account) external;

    // Restricted: used internally to Synthetix
    function removeAccountInLiquidation(address account) external;

    function checkAndRemoveAccountInLiquidation(address account) external;

    // owner only
    function setLiquidationDelay(uint time) external;

    function setLiquidationRatio(uint ratio) external;

    function setLiquidationTargetRatio(uint target) external;
}
