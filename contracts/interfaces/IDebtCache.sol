pragma solidity >=0.4.24;


// https://docs.synthetix.io/contracts/source/interfaces/idebtcache
interface IDebtCache {
    // Mutative functions

    function purgeCachedSynthDebt(bytes32 currencyKey) external;

    function takeDebtSnapshot() external;
}
