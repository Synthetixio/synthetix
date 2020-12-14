pragma solidity ^0.5.16;

import "./interfaces/ICollateralManager.sol";

contract EmptyCollateralManager is ICollateralManager {
    // Manager information
    function hasCollateral(address collateral) external view returns (bool) { return false; }

    function hasSynth(address synth) external view returns (bool) { return false; }

    function getLiquidationPenalty() external view returns (uint liquidationPenalty) { return 0; }

    // State information
    function long(bytes32 synth) external view returns (uint amount) { return 0; }

    function short(bytes32 synth) external view returns (uint amount) { return 0; }

    function totalLong() external view returns (uint debt, bool anyRateIsInvalid) { return (0, false); }

    function totalShort() external view returns (uint short, bool anyRateIsInvalid) { return (0, false); }

    function getBorrowRate() external view returns (uint scaledUtilisation) { return 0; }

    function getRatesAndTime(uint index) external view returns (uint entryRate, uint lastRate, uint lastUpdated, uint newIndex) { return (0, 0, 0, 0); }

    function getShortRatesAndTime(bytes32 currency, uint index) external view returns (uint entryRate, uint lastRate, uint lastUpdated, uint newIndex) { return (0, 0, 0, 0); }

    function getShortRate(address currency) external view returns (uint shortRate) { return 0; }

    // Manager mutative
    function addCollateral(address collateral) external {}

    function addSynth(address synth) external {}

    function addShortableSynth(address synth) external {}

    // State mutative
    function incrementLongs(bytes32 synth, uint amount) external {}

    function decrementLongs(bytes32 synth, uint amount) external {}

    function incrementShorts(bytes32 synth, uint amount) external {}

    function decrementShorts(bytes32 synth, uint amount) external {}

    function updateBorrowRates(uint rate) external {}

    function updateShortRates(bytes32 currency, uint rate) external {}

    function exceedsDebtLimit(uint amount, bytes32 currency) external view returns (bool canIssue) { return false; }
}
