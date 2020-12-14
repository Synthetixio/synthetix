pragma solidity >=0.4.24;

pragma experimental ABIEncoderV2;

interface ICollateral {
    function setCurrencies() external;

    function addSynth(bytes32 _synth) external;

    function issuanceRatio() external view returns (uint iratio);

    function maxLoan(uint amount, bytes32 currency) external view returns (uint max);
}
