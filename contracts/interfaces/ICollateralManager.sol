pragma solidity >=0.4.24;

interface ICollateralManager {
    // Manager information
    function hasCollateral(address collateral) external view returns (bool);

    function hasSynth(address synth) external view returns (bool);

    // State information
    function long(bytes32 synth) external view returns (uint amount);

    function short(bytes32 synth) external view returns (uint amount);

    function totalLong() external view returns (uint debt, bool anyRateIsInvalid);

    function totalShort() external view returns (uint short, bool anyRateIsInvalid);

    function getBorrowRate() external view returns (uint scaledUtilisation);

    function getRatesAndTime(uint index) external view returns (uint entryRate, uint lastRate, uint lastUpdated, uint newIndex);

    function getShortRatesAndTime(bytes32 currency, uint index) external view returns (uint entryRate, uint lastRate, uint lastUpdated, uint newIndex);

    function getShortRate(address currency) external view returns (uint shortRate);

    function exceedsDebtLimit(uint amount, bytes32 currency) external view returns (bool canIssue);

    // Manager mutative
    function addCollaterals(address[] calldata collaterals) external;

    function addSynth(address synth) external;

    function addShortableSynth(address synth) external;

    // State mutative
    function incrementLongs(bytes32 synth, uint amount) external;

    function decrementLongs(bytes32 synth, uint amount) external;

    function incrementShorts(bytes32 synth, uint amount) external;

    function decrementShorts(bytes32 synth, uint amount) external;

    function updateBorrowRates(uint rate) external;

    function updateShortRates(bytes32 currency, uint rate) external;

}
