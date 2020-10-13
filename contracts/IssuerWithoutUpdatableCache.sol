pragma solidity ^0.5.16;

import "./Issuer.sol";


contract IssuerWithoutUpdatableCache is Issuer {
    constructor(address _owner, address _resolver) public Issuer(_owner, _resolver) {}

    function updateSNXIssuedDebtOnExchange(bytes32[2] calldata currencyKeys, uint[2] calldata currencyRates) external {}

    function updateSNXIssuedDebtForCurrencies(bytes32[] calldata currencyKeys) external {}

    function cacheSNXIssuedDebt() external requireSystemActiveIfNotOwner {
        IFlexibleStorage store = flexibleStorage();
        _updateSNXIssuedDebtForSynth(sUSD, SafeDecimalMath.unit());
        store.setUIntValue(CONTRACT_NAME, CACHED_SNX_ISSUED_DEBT_TIMESTAMP, now);
        _changeDebtCacheValidityIfNeeded(store, false);
    }
}
