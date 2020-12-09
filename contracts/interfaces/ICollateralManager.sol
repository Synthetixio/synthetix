pragma solidity >=0.4.24;

interface ICollateralManager {
    function hasCollateral(address collateral) external view returns (bool);

    function hasSynth(address synth) external view returns (bool);

    function long(bytes32 synth) external view returns (uint amount);
    
    function short(bytes32 synth) external view returns (uint amount);

    function totalLong() external view returns (uint debt, bool anyRateIsInvalid);

    function getScaledUtilisation() external view returns (uint scaledUtilisation);

    function addCollateral(address collateral) external;

    function addSynth(address synth) external;
    
    function incrementLongs(bytes32 synth, uint amount) external;

    function decrementLongs(bytes32 synth, uint amount) external;

    function incrementShorts(bytes32 synth, uint amount) external; 

    function decrementShorts(bytes32 synth, uint amount) external; 

    function getRatesAndTime(uint index) external view returns (uint entryRate, uint lastRate, uint lastUpdated, uint newIndex);

    function updateRates(uint rate) external;

    function getLiquidationPenalty() external view returns (uint liquidationPenalty);

    function exceedsDebtLimit(uint amount, bytes32 currency) external view returns (bool canIssue);
}