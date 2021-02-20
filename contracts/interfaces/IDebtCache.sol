pragma solidity >=0.4.24;

import "../interfaces/ISynth.sol";


// https://docs.synthetix.io/contracts/source/interfaces/idebtcache
interface IDebtCache {
    // Mutative functions

    function takeDebtSnapshot() external;

    function updateCachedSynthDebts(bytes32[] calldata currencyKeys) external;
}
