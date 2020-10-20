pragma solidity >=0.4.24;

import "../interfaces/ISynth.sol";


interface IDebtCache {
    // Views

    function currentSNXIssuedDebtForCurrencies(bytes32[] calldata currencyKeys)
        external
        view
        returns (uint[] memory snxIssuedDebts, bool anyRateIsInvalid);

    function cachedSNXIssuedDebtForCurrencies(bytes32[] calldata currencyKeys)
        external
        view
        returns (uint[] memory snxIssuedDebts);

    function currentSNXIssuedDebt() external view returns (uint snxIssuedDebt, bool anyRateIsInvalid);

    function cachedSNXIssuedDebtInfo()
        external
        view
        returns (
            uint debt,
            uint timestamp,
            bool isInvalid,
            bool isStale
        );

    // Mutative functions

    function cacheSNXIssuedDebt() external;

    function updateSNXIssuedDebtForCurrencies(bytes32[] calldata currencyKeys) external;
}
