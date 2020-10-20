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

    uint public cachedDebt;
    mapping(bytes32 => uint) public cachedSynthDebt;
    uint public cacheTimestamp;
    bool public cacheInvalid = true;

    /* ========== ENCODED NAMES ========== */

    bytes32 internal constant sUSD = "sUSD";
    bytes32 internal constant sETH = "sETH";

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
            address synthAddress = address(synths[i]);
            require(synthAddress != address(0), "Synth does not exist");
            uint supply = IERC20(synthAddress).totalSupply();

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

    function _cacheIsStale(uint timestamp) internal view returns (bool) {
        // Note a 0 timestamp means that the cache is uninitialised.
        // We'll keep the check explicitly in case the stale time is
        // ever set to something higher than the current unix time (e.g. to turn off staleness).
        return getDebtSnapshotStaleTime() < block.timestamp - timestamp || timestamp == 0;
    }

    function _currentSNXIssuedDebtForCurrencies(bytes32[] memory currencyKeys)
        internal
        view
        returns (uint[] memory snxIssuedDebts, bool anyRateIsInvalid)
    {
        (uint[] memory rates, bool isInvalid) = exchangeRates().ratesAndInvalidForCurrencies(currencyKeys);
        return (_issuedSynthValues(currencyKeys, rates), isInvalid);
    }

    function currentSNXIssuedDebtForCurrencies(bytes32[] calldata currencyKeys)
        external
        view
        returns (uint[] memory snxIssuedDebts, bool anyRateIsInvalid)
    {
        return _currentSNXIssuedDebtForCurrencies(currencyKeys);
    }

    function _cachedSynthDebts(bytes32[] memory currencyKeys) internal view returns (uint[] memory) {
        uint numKeys = currencyKeys.length;
        uint[] memory debts = new uint[](numKeys);
        for (uint i = 0; i < numKeys; i++) {
            debts[i] = cachedSynthDebt[currencyKeys[i]];
        }
        return debts;
    }

    function cachedSNXIssuedDebtForCurrencies(bytes32[] calldata currencyKeys)
        external
        view
        returns (uint[] memory snxIssuedDebts)
    {
        return _cachedSynthDebts(currencyKeys);
    }

    function _currentSNXIssuedDebt() internal view returns (uint snxIssuedDebt, bool anyRateIsInvalid) {
        (uint[] memory values, bool isInvalid) = _currentSNXIssuedDebtForCurrencies(issuer().availableCurrencyKeys());
        uint numValues = values.length;
        uint total;
        for (uint i; i < numValues; i++) {
            total = total.add(values[i]);
        }
        return (total, isInvalid);
    }

    function currentSNXIssuedDebt() external view returns (uint snxIssuedDebt, bool anyRateIsInvalid) {
        return _currentSNXIssuedDebt();
    }

    function cachedSNXIssuedDebtInfo()
        external
        view
        returns (
            uint debt,
            uint timestamp,
            bool isInvalid,
            bool isStale
        )
    {
        uint time = cacheTimestamp;
        return (cachedDebt, time, cacheInvalid, _cacheIsStale(time));
    }

    /* ========== MUTATIVE FUNCTIONS ========== */

    // This function exists in case a synth is ever somehow removed without its snapshot being updated.
    function purgeDebtCacheForSynth(bytes32 currencyKey) external onlyOwner {
        require(issuer().synths(currencyKey) == ISynth(0), "Synth exists");
        delete cachedSynthDebt[currencyKey];
    }

    function cacheSNXIssuedDebt() external requireSystemActiveIfNotOwner {
        bytes32[] memory currencyKeys = issuer().availableCurrencyKeys();
        (uint[] memory values, bool isInvalid) = _currentSNXIssuedDebtForCurrencies(currencyKeys);

        uint numValues = values.length;
        uint snxCollateralDebt;
        for (uint i; i < numValues; i++) {
            uint value = values[i];
            snxCollateralDebt = snxCollateralDebt.add(value);
            cachedSynthDebt[currencyKeys[i]] = value;
        }
        cachedDebt = snxCollateralDebt;
        cacheTimestamp = block.timestamp;
        emit DebtCacheUpdated(snxCollateralDebt);
        emit DebtCacheSynchronised(block.timestamp);

        // (in)validate the cache if necessary
        _changeDebtCacheValidityIfNeeded(isInvalid);
    }

    function updateSNXIssuedDebtForCurrencies(bytes32[] calldata currencyKeys) external requireSystemActiveIfNotOwner {
        (uint[] memory rates, bool anyRateInvalid) = exchangeRates().ratesAndInvalidForCurrencies(currencyKeys);
        _updateSNXIssuedDebtForCurrenciesWithRates(currencyKeys, rates, anyRateInvalid);
    }

    function updateSNXIssuedDebtForCurrencyWithRate(bytes32 currencyKey, uint currencyRate) external onlyIssuer {
        bytes32[] memory synthKeyArray = new bytes32[](1);
        synthKeyArray[0] = currencyKey;
        uint[] memory synthRateArray = new uint[](1);
        synthRateArray[0] = currencyRate;
        _updateSNXIssuedDebtForCurrenciesWithRates(synthKeyArray, synthRateArray, false);
    }

    function updateSNXIssuedDebtForCurrenciesWithRates(bytes32[] calldata currencyKeys, uint[] calldata currencyRates)
        external
        onlyIssuerOrExchanger
    {
        _updateSNXIssuedDebtForCurrenciesWithRates(currencyKeys, currencyRates, false);
    }

    function changeDebtCacheValidityIfNeeded(bool currentlyInvalid) external onlyIssuer {
        _changeDebtCacheValidityIfNeeded(currentlyInvalid);
    }

    /* ========== INTERNAL FUNCTIONS ========== */

    function _changeDebtCacheValidityIfNeeded(bool currentlyInvalid) internal {
        if (cacheInvalid != currentlyInvalid) {
            cacheInvalid = currentlyInvalid;
            emit DebtCacheValidityChanged(currentlyInvalid);
        }
    }

    function _updateSNXIssuedDebtForCurrenciesWithRates(
        bytes32[] memory currencyKeys,
        uint[] memory currentRates,
        bool anyRateIsInvalid
    ) internal {
        uint numKeys = currencyKeys.length;
        require(numKeys == currentRates.length, "Input array lengths differ");

        // Update the cached values for each synth, saving the sums as we go.
        uint cachedSum;
        uint currentSum;
        uint[] memory currentValues = _issuedSynthValues(currencyKeys, currentRates);
        for (uint i = 0; i < numKeys; i++) {
            bytes32 key = currencyKeys[i];
            uint currentDebt = currentValues[i];
            cachedSum = cachedSum.add(cachedSynthDebt[key]);
            currentSum = currentSum.add(currentDebt);
            cachedSynthDebt[key] = currentDebt;
        }

        // Compute the difference and apply it to the snapshot
        if (cachedSum != currentSum) {
            uint debt = cachedDebt;
            // This requirement should never fail, as the total debt snapshot is the sum of the individual synth
            // debt snapshots.
            require(cachedSum <= debt, "Cached synth sum exceeds total debt");
            debt = debt.sub(cachedSum).add(currentSum);
            cachedDebt = debt;
            emit DebtCacheUpdated(debt);
        }

        // A partial update can invalidate the debt cache, but a full snapshot must be performed in order
        // to re-validate it.
        if (anyRateIsInvalid) {
            _changeDebtCacheValidityIfNeeded(anyRateIsInvalid);
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

    function _onlyExchanger() internal view {
        require(msg.sender == address(exchanger()), "Sender is not Exchanger");
    }

    modifier onlyExchanger() {
        _onlyExchanger();
        _;
    }

    function _onlyIssuerOrExchanger() internal view {
        require(msg.sender == address(issuer()) || msg.sender == address(exchanger()), "Sender is not Issuer or Exchanger");
    }

    modifier onlyIssuerOrExchanger() {
        _onlyIssuerOrExchanger();
        _;
    }

    /* ========== EVENTS ========== */

    event DebtCacheUpdated(uint cachedDebt);
    event DebtCacheSynchronised(uint timestamp);
    event DebtCacheValidityChanged(bool indexed isInvalid);
}
