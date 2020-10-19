pragma solidity ^0.5.16;

// Inheritance
import "./Owned.sol";
import "./MixinResolver.sol";
import "./MixinSystemSettings.sol";
import "./interfaces/IDebtCache.sol";

// Libraries
import "./SafeDecimalMath.sol";

// Internal references
import "./interfaces/IIssuer.sol";
import "./interfaces/IExchanger.sol";
import "./interfaces/IExchangeRates.sol";
import "./interfaces/ISystemStatus.sol";
import "./interfaces/IEtherCollateral.sol";
import "./interfaces/IEtherCollateralsUSD.sol";
import "./interfaces/IERC20.sol";


// https://docs.synthetix.io/contracts/DebtCache
contract DebtCache is Owned, MixinResolver, MixinSystemSettings, IDebtCache {
    using SafeMath for uint;
    using SafeDecimalMath for uint;

    /* ========== ENCODED NAMES ========== */

    bytes32 internal constant sUSD = "sUSD";
    bytes32 internal constant sETH = "sETH";

    // Flexible storage names

    bytes32 public constant CONTRACT_NAME = "DebtCache";
    bytes32 internal constant CACHED_SNX_ISSUED_DEBT = "cachedSNXIssuedDebt";
    bytes32 internal constant CACHED_SNX_ISSUED_DEBT_TIMESTAMP = "cachedSNXIssuedDebtTimestamp";
    bytes32 internal constant CACHED_SNX_ISSUED_DEBT_INVALID = "cachedSNXIssuedDebtInvalid";

    /* ========== ADDRESS RESOLVER CONFIGURATION ========== */

    bytes32 private constant CONTRACT_ISSUER = "Issuer";
    bytes32 private constant CONTRACT_EXCHANGER = "Exchanger";
    bytes32 private constant CONTRACT_EXRATES = "ExchangeRates";
    bytes32 private constant CONTRACT_SYSTEMSTATUS = "SystemStatus";
    bytes32 private constant CONTRACT_ETHERCOLLATERAL = "EtherCollateral";
    bytes32 private constant CONTRACT_ETHERCOLLATERAL_SUSD = "EtherCollateralsUSD";

    bytes32[24] private addressesToCache = [
        CONTRACT_ISSUER,
        CONTRACT_EXCHANGER,
        CONTRACT_EXRATES,
        CONTRACT_SYSTEMSTATUS,
        CONTRACT_ETHERCOLLATERAL,
        CONTRACT_ETHERCOLLATERAL_SUSD
    ];

    constructor(address _owner, address _resolver)
        public
        Owned(_owner)
        MixinResolver(_resolver, addressesToCache)
        MixinSystemSettings()
    {}

    /* ========== VIEWS ========== */

    function issuer() internal view returns (IIssuer) {
        return IIssuer(requireAndGetAddress(CONTRACT_ISSUER, "Missing Issuer address"));
    }

    function exchanger() internal view returns (IExchanger) {
        return IExchanger(requireAndGetAddress(CONTRACT_EXCHANGER, "Missing Exchanger address"));
    }

    function exchangeRates() internal view returns (IExchangeRates) {
        return IExchangeRates(requireAndGetAddress(CONTRACT_EXRATES, "Missing ExchangeRates address"));
    }

    function systemStatus() internal view returns (ISystemStatus) {
        return ISystemStatus(requireAndGetAddress(CONTRACT_SYSTEMSTATUS, "Missing SystemStatus address"));
    }

    function etherCollateral() internal view returns (IEtherCollateral) {
        return IEtherCollateral(requireAndGetAddress(CONTRACT_ETHERCOLLATERAL, "Missing EtherCollateral address"));
    }

    function etherCollateralsUSD() internal view returns (IEtherCollateralsUSD) {
        return
            IEtherCollateralsUSD(requireAndGetAddress(CONTRACT_ETHERCOLLATERAL_SUSD, "Missing EtherCollateralsUSD address"));
    }

    function debtSnapshotStaleTime() external view returns (uint) {
        return getDebtSnapshotStaleTime();
    }

    function _issuedSynthValues(bytes32[] memory currencyKeys, uint[] memory rates) internal view returns (uint[] memory) {
        uint numValues = currencyKeys.length;
        uint[] memory values = new uint[](numValues);
        ISynth[] memory synths = issuer().synthAddresses(currencyKeys);

        for (uint i = 0; i < numValues; i++) {
            bytes32 key = currencyKeys[i];
            uint supply = IERC20(address(synths[i])).totalSupply();

            bool isSUSD = key == sUSD;
            if (isSUSD || key == sETH) {
                IEtherCollateral etherCollateralContract = isSUSD
                    ? IEtherCollateral(address(etherCollateralsUSD()))
                    : etherCollateral();
                uint etherCollateralSupply = etherCollateralContract.totalIssuedSynths();
                supply = supply.sub(etherCollateralSupply);
            }

            values[i] = supply.multiplyDecimalRound(rates[i]);
        }
        return values;
    }

    function _cachedSNXIssuedDebtAndTimestamp(IFlexibleStorage store) internal view returns (uint debt, uint timestamp) {
        bytes32[] memory keys = new bytes32[](2);
        keys[0] = CACHED_SNX_ISSUED_DEBT;
        keys[1] = CACHED_SNX_ISSUED_DEBT_TIMESTAMP;

        uint[] memory values = store.getUIntValues(CONTRACT_NAME, keys);
        return (values[0], values[1]);
    }

    function _cacheIsInvalid(IFlexibleStorage store) internal view returns (bool) {
        return store.getBoolValue(CONTRACT_NAME, CACHED_SNX_ISSUED_DEBT_INVALID);
    }

    function _cacheIsStale(uint timestamp) internal view returns (bool) {
        // Note a 0 timestamp means that the cache is uninitialised.
        // We'll keep the check explicitly in case the stale time is
        // ever set to something higher than the current unix time (e.g. to turn off staleness).
        return timestamp == 0 || getDebtSnapshotStaleTime() < block.timestamp - timestamp;
    }

    function currentSNXIssuedDebtForCurrencies(bytes32[] memory currencyKeys)
        public
        view
        returns (uint[] memory snxIssuedDebts, bool anyRateIsInvalid)
    {
        (uint[] memory rates, bool isInvalid) = exchangeRates().ratesAndInvalidForCurrencies(currencyKeys);
        return (_issuedSynthValues(currencyKeys, rates), isInvalid);
    }

    function cachedSNXIssuedDebtForCurrencies(bytes32[] calldata currencyKeys)
        external
        view
        returns (uint[] memory snxIssuedDebts)
    {
        return flexibleStorage().getUIntValues(CONTRACT_NAME, currencyKeys);
    }

    function currentSNXIssuedDebt() external view returns (uint snxIssuedDebt, bool anyRateIsInvalid) {
        (uint[] memory values, bool isInvalid) = currentSNXIssuedDebtForCurrencies(issuer().availableCurrencyKeys());
        uint numValues = values.length;
        uint total;
        for (uint i; i < numValues; i++) {
            total = total.add(values[i]);
        }
        return (total, isInvalid);
    }

    function cachedSNXIssuedDebtInfo()
        external
        view
        returns (
            uint cachedDebt,
            uint timestamp,
            bool isInvalid,
            bool isStale
        )
    {
        IFlexibleStorage store = flexibleStorage();
        (uint debt, uint time) = _cachedSNXIssuedDebtAndTimestamp(store);
        return (debt, time, _cacheIsInvalid(store), _cacheIsStale(time));
    }

    /* ========== MUTATIVE FUNCTIONS ========== */

    // This function exists in case a synth is ever somehow removed without its snapshot being updated.
    function purgeDebtCacheForSynth(bytes32 currencyKey) external onlyOwner {
        require(issuer().synths(currencyKey) == ISynth(0), "Synth exists");
        flexibleStorage().setUIntValue(CONTRACT_NAME, currencyKey, 0);
    }

    function cacheSNXIssuedDebt() external requireSystemActiveIfNotOwner {
        bytes32[] memory currencyKeys = issuer().availableCurrencyKeys();
        (uint[] memory values, bool isInvalid) = currentSNXIssuedDebtForCurrencies(currencyKeys);

        uint numValues = values.length;
        uint snxCollateralDebt;
        for (uint i; i < numValues; i++) {
            snxCollateralDebt = snxCollateralDebt.add(values[i]);
        }

        bytes32[] memory debtKeys = new bytes32[](2);
        debtKeys[0] = CACHED_SNX_ISSUED_DEBT;
        debtKeys[1] = CACHED_SNX_ISSUED_DEBT_TIMESTAMP;
        uint[] memory debtValues = new uint[](2);
        debtValues[0] = snxCollateralDebt;
        debtValues[1] = block.timestamp;

        IFlexibleStorage store = flexibleStorage();
        store.setUIntValues(CONTRACT_NAME, currencyKeys, values);
        store.setUIntValues(CONTRACT_NAME, debtKeys, debtValues);
        emit DebtCacheUpdated(snxCollateralDebt);
        emit DebtCacheSynchronised(block.timestamp);

        // (in)validate the cache if necessary
        _changeDebtCacheValidityIfNeeded(store, isInvalid);
    }

    function updateSNXIssuedDebtForCurrencies(bytes32[] calldata currencyKeys) external requireSystemActiveIfNotOwner {
        (uint[] memory rates, bool anyRateInvalid) = exchangeRates().ratesAndInvalidForCurrencies(currencyKeys);
        _updateSNXIssuedDebtForCurrencies(currencyKeys, rates, anyRateInvalid);
    }

    function updateSNXIssuedDebtOnExchange(bytes32[2] calldata currencyKeys, uint[2] calldata currencyRates) external {
        require(msg.sender == address(exchanger()), "Sender is not Exchanger");

        bool includesSUSD = currencyKeys[0] == sUSD || currencyKeys[1] == sUSD;
        uint numKeys = includesSUSD ? 2 : 3;

        bytes32[] memory keys = new bytes32[](numKeys);
        keys[0] = currencyKeys[0];
        keys[1] = currencyKeys[1];

        uint[] memory rates = new uint[](numKeys);
        rates[0] = currencyRates[0];
        rates[1] = currencyRates[1];

        if (!includesSUSD) {
            keys[2] = sUSD; // And we'll also update sUSD to account for any fees if it wasn't one of the exchanged currencies
            rates[2] = SafeDecimalMath.unit();
        }

        // Exchanges can't invalidate the debt cache, since if a rate is invalid, the exchange will have failed already.
        _updateSNXIssuedDebtForCurrencies(keys, rates, false);
    }

    function updateSNXIssuedDebtForSynth(bytes32 currencyKey, uint currencyRate) external onlyIssuer {
        bytes32[] memory synthKeyArray = new bytes32[](1);
        synthKeyArray[0] = currencyKey;
        uint[] memory synthRateArray = new uint[](1);
        synthRateArray[0] = currencyRate;
        _updateSNXIssuedDebtForCurrencies(synthKeyArray, synthRateArray, false);
    }

    function changeDebtCacheValidityIfNeeded(bool currentlyInvalid) external onlyIssuer returns (bool) {
        IFlexibleStorage store = flexibleStorage();
        bool cacheInvalid = _cacheIsInvalid(store);
        if (cacheInvalid != currentlyInvalid) {
            store.setBoolValue(CONTRACT_NAME, CACHED_SNX_ISSUED_DEBT_INVALID, currentlyInvalid);
            emit DebtCacheValidityChanged(currentlyInvalid);
            return true;
        }
        return false;
    }

    /* ========== INTERNAL FUNCTIONS ========== */

    function _changeDebtCacheValidityIfNeeded(IFlexibleStorage store, bool currentlyInvalid) internal {
        bool cacheInvalid = _cacheIsInvalid(store);
        if (cacheInvalid != currentlyInvalid) {
            store.setBoolValue(CONTRACT_NAME, CACHED_SNX_ISSUED_DEBT_INVALID, currentlyInvalid);
            emit DebtCacheValidityChanged(currentlyInvalid);
        }
    }

    function _updateSNXIssuedDebtForCurrencies(
        bytes32[] memory currencyKeys,
        uint[] memory currentRates,
        bool anyRateIsInvalid
    ) internal {
        uint numKeys = currencyKeys.length;
        require(numKeys == currentRates.length, "Input array lengths differ");

        IFlexibleStorage store = flexibleStorage();

        // Retrieve previously-cached values and update them
        uint[] memory cachedValues = store.getUIntValues(CONTRACT_NAME, currencyKeys);
        uint[] memory currentValues = _issuedSynthValues(currencyKeys, currentRates);
        store.setUIntValues(CONTRACT_NAME, currencyKeys, currentValues);

        // Compute the difference and apply it to the snapshot
        uint cachedSum;
        uint currentSum;
        for (uint i = 0; i < numKeys; i++) {
            cachedSum = cachedSum.add(cachedValues[i]);
            currentSum = currentSum.add(currentValues[i]);
        }

        if (cachedSum != currentSum) {
            uint debt = store.getUIntValue(CONTRACT_NAME, CACHED_SNX_ISSUED_DEBT);

            // This requirement should never fail, as the total debt snapshot is the sum of the individual synth
            // debt snapshots.
            require(cachedSum <= debt, "Cached synth sum exceeds total debt");
            debt = debt.sub(cachedSum).add(currentSum);
            store.setUIntValue(CONTRACT_NAME, CACHED_SNX_ISSUED_DEBT, debt);
            emit DebtCacheUpdated(debt);
        }

        // A partial update can invalidate the debt cache, but a full snapshot must be performed in order
        // to re-validate it.
        if (anyRateIsInvalid) {
            _changeDebtCacheValidityIfNeeded(store, anyRateIsInvalid);
        }
    }

    /* ========== MODIFIERS ========== */

    function _requireSystemActiveIfNotOwner() internal view {
        if (msg.sender != owner) {
            systemStatus().requireSystemActive();
        }
    }

    modifier requireSystemActiveIfNotOwner() {
        _requireSystemActiveIfNotOwner();
        _;
    }

    function _onlyIssuer() internal view {
        require(msg.sender == address(issuer()), "Sender is not Issuer");
    }

    modifier onlyIssuer() {
        _onlyIssuer();
        _;
    }

    /* ========== EVENTS ========== */

    event DebtCacheUpdated(uint cachedDebt);
    event DebtCacheSynchronised(uint timestamp);
    event DebtCacheValidityChanged(bool indexed isInvalid);
}
