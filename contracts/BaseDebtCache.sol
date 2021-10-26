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
import "./interfaces/IERC20.sol";
import "./interfaces/ICollateralManager.sol";
import "./interfaces/IEtherWrapper.sol";
import "./interfaces/IWrapperFactory.sol";

// https://docs.synthetix.io/contracts/source/contracts/debtcache
contract BaseDebtCache is Owned, MixinSystemSettings, IDebtCache {
    using SafeMath for uint;
    using SafeDecimalMath for uint;

    uint internal _cachedDebt;
    mapping(bytes32 => uint) internal _cachedSynthDebt;
    mapping(bytes32 => uint) internal _excludedIssuedDebt;
    uint internal _cacheTimestamp;
    bool internal _cacheInvalid = true;

    /* ========== ENCODED NAMES ========== */

    bytes32 internal constant sUSD = "sUSD";
    bytes32 internal constant sETH = "sETH";

    /* ========== ADDRESS RESOLVER CONFIGURATION ========== */

    bytes32 private constant CONTRACT_ISSUER = "Issuer";
    bytes32 private constant CONTRACT_EXCHANGER = "Exchanger";
    bytes32 private constant CONTRACT_EXRATES = "ExchangeRates";
    bytes32 private constant CONTRACT_SYSTEMSTATUS = "SystemStatus";
    bytes32 private constant CONTRACT_COLLATERALMANAGER = "CollateralManager";
    bytes32 private constant CONTRACT_ETHER_WRAPPER = "EtherWrapper";
    bytes32 private constant CONTRACT_WRAPPER_FACTORY = "WrapperFactory";

    constructor(address _owner, address _resolver) public Owned(_owner) MixinSystemSettings(_resolver) {}

    /* ========== VIEWS ========== */

    function resolverAddressesRequired() public view returns (bytes32[] memory addresses) {
        bytes32[] memory existingAddresses = MixinSystemSettings.resolverAddressesRequired();
        bytes32[] memory newAddresses = new bytes32[](7);
        newAddresses[0] = CONTRACT_ISSUER;
        newAddresses[1] = CONTRACT_EXCHANGER;
        newAddresses[2] = CONTRACT_EXRATES;
        newAddresses[3] = CONTRACT_SYSTEMSTATUS;
        newAddresses[4] = CONTRACT_COLLATERALMANAGER;
        newAddresses[5] = CONTRACT_WRAPPER_FACTORY;
        newAddresses[6] = CONTRACT_ETHER_WRAPPER;
        addresses = combineArrays(existingAddresses, newAddresses);
    }

    function issuer() internal view returns (IIssuer) {
        return IIssuer(requireAndGetAddress(CONTRACT_ISSUER));
    }

    function exchanger() internal view returns (IExchanger) {
        return IExchanger(requireAndGetAddress(CONTRACT_EXCHANGER));
    }

    function exchangeRates() internal view returns (IExchangeRates) {
        return IExchangeRates(requireAndGetAddress(CONTRACT_EXRATES));
    }

    function systemStatus() internal view returns (ISystemStatus) {
        return ISystemStatus(requireAndGetAddress(CONTRACT_SYSTEMSTATUS));
    }

    function collateralManager() internal view returns (ICollateralManager) {
        return ICollateralManager(requireAndGetAddress(CONTRACT_COLLATERALMANAGER));
    }

    function etherWrapper() internal view returns (IEtherWrapper) {
        return IEtherWrapper(requireAndGetAddress(CONTRACT_ETHER_WRAPPER));
    }

    function wrapperFactory() internal view returns (IWrapperFactory) {
        return IWrapperFactory(requireAndGetAddress(CONTRACT_WRAPPER_FACTORY));
    }

    function debtSnapshotStaleTime() external view returns (uint) {
        return getDebtSnapshotStaleTime();
    }

    function cachedDebt() external view returns (uint) {
        return _cachedDebt;
    }

    function cachedSynthDebt(bytes32 currencyKey) external view returns (uint) {
        return _cachedSynthDebt[currencyKey];
    }

    function cacheTimestamp() external view returns (uint) {
        return _cacheTimestamp;
    }

    function cacheInvalid() external view returns (bool) {
        return _cacheInvalid;
    }

    function _cacheStale(uint timestamp) internal view returns (bool) {
        // Note a 0 timestamp means that the cache is uninitialised.
        // We'll keep the check explicitly in case the stale time is
        // ever set to something higher than the current unix time (e.g. to turn off staleness).
        return getDebtSnapshotStaleTime() < block.timestamp - timestamp || timestamp == 0;
    }

    function cacheStale() external view returns (bool) {
        return _cacheStale(_cacheTimestamp);
    }

    function _issuedSynthValues(bytes32[] memory currencyKeys, uint[] memory rates)
        internal
        view
        returns (uint[] memory values)
    {
        uint numValues = currencyKeys.length;
        values = new uint[](numValues);
        ISynth[] memory synths = issuer().getSynths(currencyKeys);

        for (uint i = 0; i < numValues; i++) {
            address synthAddress = address(synths[i]);
            require(synthAddress != address(0), "Synth does not exist");
            uint supply = IERC20(synthAddress).totalSupply();
            values[i] = supply.multiplyDecimalRound(rates[i]);
        }

        return (values);
    }

    function _currentSynthDebts(bytes32[] memory currencyKeys)
        internal
        view
        returns (
            uint[] memory snxIssuedDebts,
            uint _excludedDebt,
            bool anyRateIsInvalid
        )
    {
        (uint[] memory rates, bool isInvalid) = exchangeRates().ratesAndInvalidForCurrencies(currencyKeys);
        uint[] memory values = _issuedSynthValues(currencyKeys, rates);
        (uint excludedDebt, bool isAnyNonSnxDebtRateInvalid) = _totalNonSnxBackedDebt(currencyKeys, rates, isInvalid);

        return (values, excludedDebt, isInvalid || isAnyNonSnxDebtRateInvalid);
    }

    function currentSynthDebts(bytes32[] calldata currencyKeys)
        external
        view
        returns (
            uint[] memory debtValues,
            uint excludedDebt,
            bool anyRateIsInvalid
        )
    {
        return _currentSynthDebts(currencyKeys);
    }

    function _cachedSynthDebts(bytes32[] memory currencyKeys) internal view returns (uint[] memory) {
        uint numKeys = currencyKeys.length;
        uint[] memory debts = new uint[](numKeys);
        for (uint i = 0; i < numKeys; i++) {
            debts[i] = _cachedSynthDebt[currencyKeys[i]];
        }
        return debts;
    }

    function cachedSynthDebts(bytes32[] calldata currencyKeys) external view returns (uint[] memory snxIssuedDebts) {
        return _cachedSynthDebts(currencyKeys);
    }

    function _excludedIssuedDebts(bytes32[] memory currencyKeys) internal view returns (uint[] memory) {
        uint numKeys = currencyKeys.length;
        uint[] memory debts = new uint[](numKeys);
        for (uint i = 0; i < numKeys; i++) {
            debts[i] = _excludedIssuedDebt[currencyKeys[i]];
        }
        return debts;
    }

    function excludedIssuedDebts(bytes32[] calldata currencyKeys) external view returns (uint[] memory excludedDebts) {
        return _excludedIssuedDebts(currencyKeys);
    }

    // Returns the total sUSD debt backed by non-SNX collateral, excluding debts recorded with _excludedIssuedDebt
    function totalNonSnxBackedDebt() external view returns (uint excludedDebt, bool isInvalid) {
        bytes32[] memory currencyKeys = issuer().availableCurrencyKeys();
        (uint[] memory rates, bool ratesAreInvalid) = exchangeRates().ratesAndInvalidForCurrencies(currencyKeys);

        return _totalNonSnxBackedDebt(currencyKeys, rates, ratesAreInvalid);
    }

    function _totalNonSnxBackedDebt(bytes32[] memory currencyKeys, uint[] memory rates, bool ratesAreInvalid) internal view returns (uint excludedDebt, bool isInvalid) {
        // Calculate excluded debt.
        // 1. MultiCollateral long debt + short debt.
        (uint longValue, bool anyTotalLongRateIsInvalid) = collateralManager().totalLong();
        (uint shortValue, bool anyTotalShortRateIsInvalid) = collateralManager().totalShort();
        isInvalid = ratesAreInvalid || anyTotalLongRateIsInvalid || anyTotalShortRateIsInvalid;
        excludedDebt = longValue.add(shortValue);

        // 2. EtherWrapper.
        // Subtract sETH and sUSD issued by EtherWrapper.
        excludedDebt = excludedDebt.add(etherWrapper().totalIssuedSynths());

        for (uint i = 0; i < currencyKeys.length; i++) {
            excludedDebt = excludedDebt.add(_excludedIssuedDebt[currencyKeys[i]].multiplyDecimalRound(rates[i]));
        }

        return (excludedDebt, isInvalid);
    }

    function _currentDebt() internal view returns (uint debt, bool anyRateIsInvalid) {
        bytes32[] memory currencyKeys = issuer().availableCurrencyKeys();
        (uint[] memory rates, bool isInvalid) = exchangeRates().ratesAndInvalidForCurrencies(currencyKeys);

        // Sum all issued synth values based on their supply.
        uint[] memory values = _issuedSynthValues(currencyKeys, rates);
        (uint excludedDebt, bool isAnyNonSnxDebtRateInvalid) = _totalNonSnxBackedDebt(currencyKeys, rates, isInvalid);

        uint numValues = values.length;
        uint total;
        for (uint i; i < numValues; i++) {
            total = total.add(values[i]);
        }
        total = total < excludedDebt ? 0 : total.sub(excludedDebt);

        return (total, isInvalid || isAnyNonSnxDebtRateInvalid);
    }

    function currentDebt() external view returns (uint debt, bool anyRateIsInvalid) {
        return _currentDebt();
    }

    function cacheInfo()
        external
        view
        returns (
            uint debt,
            uint timestamp,
            bool isInvalid,
            bool isStale
        )
    {
        uint time = _cacheTimestamp;
        return (_cachedDebt, time, _cacheInvalid, _cacheStale(time));
    }

    /* ========== MUTATIVE FUNCTIONS ========== */

    // Stub out all mutative functions as no-ops;
    // since they do nothing, there are no restrictions

    function updateCachedSynthDebts(bytes32[] calldata currencyKeys) external {}

    function updateCachedSynthDebtWithRate(bytes32 currencyKey, uint currencyRate) external {}

    function updateCachedSynthDebtsWithRates(bytes32[] calldata currencyKeys, uint[] calldata currencyRates) external {}

    function updateDebtCacheValidity(bool currentlyInvalid) external {}

    function purgeCachedSynthDebt(bytes32 currencyKey) external {}

    function takeDebtSnapshot() external {}

    function recordExcludedDebtChange(bytes32 currencyKey, int256 delta) external {}

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

    function _onlyIssuerOrExchanger() internal view {
        require(msg.sender == address(issuer()) || msg.sender == address(exchanger()), "Sender is not Issuer or Exchanger");
    }

    modifier onlyIssuerOrExchanger() {
        _onlyIssuerOrExchanger();
        _;
    }

    function _onlyDebtIssuer() internal view {
        bool isWrapper = wrapperFactory().isWrapper(msg.sender);

        // owner included for debugging and fixing in emergency situation
        bool isOwner = msg.sender == owner;

        require(isOwner || isWrapper, "Only debt issuers may call this");
    }

    modifier onlyDebtIssuer() {
        _onlyDebtIssuer();
        _;
    }
}
