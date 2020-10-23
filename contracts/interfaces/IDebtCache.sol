pragma solidity >=0.4.24;

import "../interfaces/ISynth.sol";


// https://docs.synthetix.io/contracts/source/interfaces/idebtcache
interface IDebtCache {
    // Views

    function cachedDebt() external view returns (uint);

    function cachedSynthDebt(bytes32 currencyKey) external view returns (uint);

    function cacheTimestamp() external view returns (uint);

    function cacheInvalid() external view returns (bool);

    function cacheStale() external view returns (bool);

    function currentSynthDebts(bytes32[] calldata currencyKeys)
        external
        view
        returns (uint[] memory debtValues, bool anyRateIsInvalid);

    function cachedSynthDebts(bytes32[] calldata currencyKeys) external view returns (uint[] memory debtValues);

    function currentDebt() external view returns (uint debt, bool anyRateIsInvalid);

    function cacheInfo()
        external
        view
        returns (
            uint debt,
            uint timestamp,
            bool isInvalid,
            bool isStale
        );

    // Mutative functions

    function takeDebtSnapshot() external;

    function updateCachedSynthDebts(bytes32[] calldata currencyKeys) external;
}
