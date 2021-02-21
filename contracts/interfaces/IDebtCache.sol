pragma solidity >=0.4.24;

import "../interfaces/ISynth.sol";


// https://docs.synthetix.io/contracts/source/interfaces/idebtcache
interface IBaseDebtCache {
    // Mutative functions

    function purgeCachedSynthDebt(bytes32 currencyKey) external;
}
