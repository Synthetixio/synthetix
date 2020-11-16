pragma solidity >=0.4.24;

interface IMultiCollateralManager {
    function collateralByAddress(address collateral) external view returns (bool);

    function issuedSynths(bytes32 synth) external view returns (uint256 long, uint256 short);

    function getUtilisation(bool exclude) external view returns (uint256 utilisation);

    function getShortRate(bytes32 synth) external view returns (uint256 rate);

    function getBorrowRate() external view returns (uint256 rate);
}