pragma solidity >=0.4.24;

interface ICollateralManager {
    // Manager information
    function hasCollateral(address collateral) external view returns (bool);

    function hasSynth(address synth) external view returns (bool);

    // State information
    function long(bytes32 synth) external view returns (uint amount);

    function short(bytes32 synth) external view returns (uint amount);

    function totalLong() external view returns (uint susdValue, bool anyRateIsInvalid);

    function totalShort() external view returns (uint susdValue, bool anyRateIsInvalid);

    function getBorrowRate() external view returns (uint borrowRate, bool anyRateIsInvalid);

    function getShortRate(address currency) external view returns (uint shortRate, bool rateIsInvalid);

    function getRatesAndTime(uint index) external view returns (uint entryRate, uint lastRate, uint lastUpdated, uint newIndex);

    function getShortRatesAndTime(bytes32 currency, uint index) external view returns (uint entryRate, uint lastRate, uint lastUpdated, uint newIndex);

    function exceedsDebtLimit(uint amount, bytes32 currency) external view returns (bool canIssue, bool anyRateIsInvalid);

    // Manager mutative
    function addCollaterals(address[] calldata collaterals) external;

    function removeCollaterals(address[] calldata collaterals) external;

    function addSynth(address synth) external;

    function removeSynth(address synth) external;

    function addShortableSynth(address synth) external;

    function removeShortableSynth(address synth) external;

    // State mutative
    function incrementLongs(bytes32 synth, uint amount) external;

    function decrementLongs(bytes32 synth, uint amount) external;

    function incrementShorts(bytes32 synth, uint amount) external;

    function decrementShorts(bytes32 synth, uint amount) external;

    function updateBorrowRates(uint rate) external;

    function updateShortRates(bytes32 currency, uint rate) external;

}
