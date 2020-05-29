pragma solidity >=0.4.24;


interface ILiquidations {
    // Views
    function isOpenForLiquidation(address account) external view returns (bool);

    function liquidationDelay() external view returns (uint);

    function liquidationRatio() external view returns (uint);

    function liquidationPenalty() external view returns (uint);

    // Mutative Functions
    function flagAccountForLiquidation(address account) external;

    // Restricted: used internally to Synthetix
    function removeAccountInLiquidation(address account) external;

    function checkAndRemoveAccountInLiquidation(address account) external;

    // owner only
    function setLiquidationDelay(uint time) external;

    function setLiquidationRatio(uint _liquidationRatio) external;

    function setLiquidationTargetRatio(uint _targetRatio) external;

    function setLiquidationPenalty(uint _penalty) external;
}
