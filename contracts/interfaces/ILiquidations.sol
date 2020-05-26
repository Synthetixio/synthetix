pragma solidity >=0.4.24;


interface ILiquidations {
    // Views
    function isOpenForLiquidation(address _account) external view returns (bool);

    // Mutative Functions
    function flagAccountForLiquidation(address account) external;

    // Restricted: used internally to Synthetix
    function removeAccountInLiquidation(address account) external;

    function checkAndRemoveAccountInLiquidation(address account) external;

    // owner only
    function setLiquidationDelay(uint _time) external;

    function setLiquidationRatio(uint _liquidationRatio) external;

    function setLiquidationTargetRatio(uint _targetRatio) external;

    function setLiquidationPenalty(uint _penalty) external;
}
