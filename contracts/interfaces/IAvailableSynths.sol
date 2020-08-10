pragma solidity >=0.4.24;

import "../interfaces/ISynth.sol";


interface IAvailableSynths {
    // Views
    function availableCurrencyKeys() external view returns (bytes32[] memory);

    function availableCurrencyKeysWithSNX() external view returns (bytes32[] memory);

    function availableCurrencyKeysWithSNXAndTotalSupply()
        external
        view
        returns (bytes32[] memory synthsAndSNX, uint[] memory totalSupplies);

    function availableSynthCount() external view returns (uint);

    function availableSynths(uint index) external view returns (ISynth);

    function synths(bytes32 currencyKey) external view returns (ISynth);

    function synthsByAddress(address synthAddress) external view returns (bytes32);

    // Restricted functions

    function addSynth(bytes32 contractName, ISynth synth) external;

    function removeSynth(bytes32 contractName, bytes32 currencyKey) external;
}
