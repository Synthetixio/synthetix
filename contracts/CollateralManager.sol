pragma solidity ^0.5.16;

// Inheritance
import "./Owned.sol";
import "./Pausable.sol";
import "./MixinSystemSettings.sol";
import "./interfaces/ICollateralManager.sol";

// Libraries
import "./AddressSetLib.sol";
import "./SafeDecimalMath.sol";

// Internal references
import "./CollateralManagerState.sol";
import "./interfaces/ISystemStatus.sol";
import "./interfaces/IIssuer.sol";
import "./interfaces/ICollateral.sol";
import "./interfaces/IExchangeRates.sol";
import "./interfaces/IDebtCache.sol";
import "./interfaces/IERC20.sol";
import "./interfaces/ISynth.sol";


contract CollateralManager is ICollateralManager, Owned, Pausable, MixinSystemSettings {
    /* ========== LIBRARIES ========== */
    using SafeMath for uint;
    using SafeDecimalMath for uint;
    using AddressSetLib for AddressSetLib.AddressSet;

    /* ========== CONSTANTS ========== */

    bytes32 private constant sUSD = "sUSD";

    uint private constant SECONDS_IN_A_YEAR = 31556926 * 1e18;

    // Flexible storage names

    bytes32 public constant CONTRACT_NAME = "CollateralManager";
    bytes32 internal constant COLLATERAL_SYNTHS = "collateralSynth";
    bytes32 internal constant COLLATERAL_SHORTS = "collateralShort";

    /* ========== STATE VARIABLES ========== */

    // Stores debt balances and borrow rates.
    CollateralManagerState public state;

    // The set of all collateral contracts.
    AddressSetLib.AddressSet internal _collaterals;

    // The set of all synths issuable by the various collateral contracts
    AddressSetLib.AddressSet internal _synths;

    // The set of all synths that are shortable.
    AddressSetLib.AddressSet internal _shortableSynths;

    // The factor that will scale the utilisation ratio.
    uint public utilisationMultiplier = 1e18;

    // The maximum amount of debt in sUSD that can be issued by non snx collateral.
    uint public maxDebt;

    // The base interest rate applied to all borrows.
    uint public baseBorrowRate;

    // The base interest rate applied to all shorts.
    uint public baseShortRate;

    /* ---------- Address Resolver Configuration ---------- */

    bytes32 private constant CONTRACT_SYSTEMSTATUS = "SystemStatus";
    bytes32 private constant CONTRACT_ISSUER = "Issuer";
    bytes32 private constant CONTRACT_EXRATES = "ExchangeRates";
    bytes32 private constant CONTRACT_DEBTCACHE = "DebtCache";

    bytes32[24] private addressesToCache = [CONTRACT_SYSTEMSTATUS, CONTRACT_ISSUER, CONTRACT_EXRATES, CONTRACT_DEBTCACHE];

    /* ========== CONSTRUCTOR ========== */
    constructor(
        CollateralManagerState _state,
        address _owner,
        address _resolver,
        uint _maxDebt,
        uint _baseBorrowRate,
        uint _baseShortRate
    ) public Owned(_owner) Pausable() MixinSystemSettings(_resolver) {
        owner = msg.sender;
        state = _state;

        setMaxDebt(_maxDebt);
        setBaseBorrowRate(_baseBorrowRate);
        setBaseShortRate(_baseShortRate);

        owner = _owner;
    }

    /* ========== VIEWS ========== */

    function resolverAddressesRequired() public view returns (bytes32[] memory addresses) {
        bytes32[] memory existingAddresses = MixinSystemSettings.resolverAddressesRequired();
        bytes32[] memory newAddresses = new bytes32[](4);
        newAddresses[0] = CONTRACT_ISSUER;
        newAddresses[1] = CONTRACT_EXRATES;
        newAddresses[2] = CONTRACT_SYSTEMSTATUS;
        newAddresses[3] = CONTRACT_DEBTCACHE;

        addresses = combineArrays(existingAddresses, newAddresses);
    }

    /* ---------- Related Contracts ---------- */

    function _systemStatus() internal view returns (ISystemStatus) {
        return ISystemStatus(requireAndGetAddress(CONTRACT_SYSTEMSTATUS));
    }

    function _issuer() internal view returns (IIssuer) {
        return IIssuer(requireAndGetAddress(CONTRACT_ISSUER));
    }

    function _exchangeRates() internal view returns (IExchangeRates) {
        return IExchangeRates(requireAndGetAddress(CONTRACT_EXRATES));
    }

    function _debtCache() internal view returns (IDebtCache) {
        return IDebtCache(requireAndGetAddress(CONTRACT_DEBTCACHE));
    }

    /* ---------- Manager Information ---------- */

    function hasCollateral(address collateral) public view returns (bool) {
        return _collaterals.contains(collateral);
    }

    function hasSynth(address synth) public view returns (bool) {
        return _synths.contains(synth);
    }

    function hasShortableSynth(address synth) public view returns (bool) {
        return _shortableSynths.contains(synth);
    }

    /* ---------- State Information ---------- */

    function long(bytes32 synth) external view returns (uint amount) {
        return state.long(synth);
    }

    function short(bytes32 synth) external view returns (uint amount) {
        return state.short(synth);
    }

    function totalLong() public view returns (uint susdValue, bool anyRateIsInvalid) {
        address[] memory synths = _synths.elements;

        if (synths.length > 0) {
            for (uint i = 0; i < synths.length; i++) {
                bytes32 synth = ISynth(synths[i]).currencyKey();
                if (synth == sUSD) {
                    susdValue = susdValue.add(state.long(synth));
                } else {
                    (uint rate, bool invalid) = _exchangeRates().rateAndInvalid(synth);
                    uint amount = state.long(synth).multiplyDecimal(rate);
                    susdValue = susdValue.add(amount);
                    if (invalid) {
                        anyRateIsInvalid = true;
                    }
                }
            }
        }
    }

    function totalShort() public view returns (uint susdValue, bool anyRateIsInvalid) {
        address[] memory synths = _shortableSynths.elements;

        if (synths.length > 0) {
            for (uint i = 0; i < synths.length; i++) {
                bytes32 synth = ISynth(synths[i]).currencyKey();
                (uint rate, bool invalid) = _exchangeRates().rateAndInvalid(synth);
                uint amount = state.short(synth).multiplyDecimal(rate);
                susdValue = susdValue.add(amount);
                if (invalid) {
                    anyRateIsInvalid = true;
                }
            }
        }
    }

    function getBorrowRate() external view returns (uint borrowRate, bool anyRateIsInvalid) {
        // get the snx backed debt.
        uint snxDebt = _issuer().totalIssuedSynths(sUSD, true);

        // now get the non snx backed debt.
        (uint nonSnxDebt, bool ratesInvalid) = totalLong();

        // the total.
        uint totalDebt = snxDebt.add(nonSnxDebt);

        // now work out the utilisation ratio, and divide through to get a per second value.
        uint utilisation = nonSnxDebt.divideDecimal(totalDebt).divideDecimal(SECONDS_IN_A_YEAR);

        // scale it by the utilisation multiplier.
        uint scaledUtilisation = utilisation.multiplyDecimal(utilisationMultiplier);

        // finally, add the base borrow rate.
        borrowRate = scaledUtilisation.add(baseBorrowRate);

        anyRateIsInvalid = ratesInvalid;
    }

    function getShortRate(address synthAddress) external view returns (uint shortRate, bool rateIsInvalid) {
        IERC20 synth = IERC20(synthAddress);
        bytes32 synthKey = ISynth(synthAddress).currencyKey();

        rateIsInvalid = _exchangeRates().rateIsInvalid(synthKey);

        // get the spot supply of the synth and the outstanding short balance
        uint longSupply = synth.totalSupply();
        uint shortSupply = state.short(synthKey);

        // in this case, the market is skewed long so its free to short.
        if (longSupply > shortSupply) {
            return (0, rateIsInvalid);
        }

        // otherwise workout the skew towards the short side.
        uint skew = shortSupply.sub(longSupply);

        // divide through by the size of the market
        uint proportionalSkew = skew.divideDecimal(longSupply.add(shortSupply)).divideDecimal(SECONDS_IN_A_YEAR);

        // finally, add the base short rate.
        shortRate = proportionalSkew.add(baseShortRate);
    }

    function getRatesAndTime(uint index)
        external
        view
        returns (
            uint entryRate,
            uint lastRate,
            uint lastUpdated,
            uint newIndex
        )
    {
        (entryRate, lastRate, lastUpdated, newIndex) = state.getRatesAndTime(index);
    }

    function getShortRatesAndTime(bytes32 currency, uint index)
        external
        view
        returns (
            uint entryRate,
            uint lastRate,
            uint lastUpdated,
            uint newIndex
        )
    {
        (entryRate, lastRate, lastUpdated, newIndex) = state.getShortRatesAndTime(currency, index);
    }

    function exceedsDebtLimit(uint amount, bytes32 currency) external view returns (bool canIssue, bool anyRateIsInvalid) {
        uint usdAmount = _exchangeRates().effectiveValue(currency, amount, sUSD);

        (uint longValue, bool longInvalid) = totalLong();
        (uint shortValue, bool shortInvalid) = totalShort();

        anyRateIsInvalid = longInvalid || shortInvalid;

        return (longValue.add(shortValue).add(usdAmount) <= maxDebt, anyRateIsInvalid);
    }

    /* ========== MUTATIVE FUNCTIONS ========== */

    /* ---------- SETTERS ---------- */

    function setUtilisationMultiplier(uint _utilisationMultiplier) public onlyOwner {
        require(_utilisationMultiplier > 0, "Must be greater than 0");
        utilisationMultiplier = _utilisationMultiplier;
    }

    function setMaxDebt(uint _maxDebt) public onlyOwner {
        require(_maxDebt > 0, "Must be greater than 0");
        maxDebt = _maxDebt;
        emit MaxDebtUpdated(maxDebt);
    }

    function setBaseBorrowRate(uint _baseBorrowRate) public onlyOwner {
        require(_baseBorrowRate >= 0, "Must be greater than or equal to 0");
        baseBorrowRate = _baseBorrowRate;
        emit BaseBorrowRateUpdated(baseBorrowRate);
    }

    function setBaseShortRate(uint _baseShortRate) public onlyOwner {
        require(_baseShortRate >= 0, "Must be greater than or equal to 0");
        baseShortRate = _baseShortRate;
        emit BaseShortRateUpdated(baseShortRate);
    }

    /* ---------- MANAGER ---------- */

    function addCollaterals(address[] calldata collaterals) external onlyOwner {
        _systemStatus().requireSystemActive();

        for (uint i = 0; i < collaterals.length; i++) {
            if (!_collaterals.contains(collaterals[i])) {
                _collaterals.add(collaterals[i]);
                emit CollateralAdded(collaterals[i]);
            }
        }
    }

    function removeCollaterals(address[] calldata collaterals) external onlyOwner {
        _systemStatus().requireSystemActive();

        for (uint i = 0; i < collaterals.length; i++) {
            if (_collaterals.contains(collaterals[i])) {
                _collaterals.remove(collaterals[i]);
                emit CollateralRemoved(collaterals[i]);
            }
        }
    }

    function addSynths(address[] calldata synths) external onlyOwner {
        _systemStatus().requireSystemActive();

        for (uint i = 0; i < synths.length; i++) {
            if (!_synths.contains(synths[i])) {
                // Add it to the address set lib.
                _synths.add(synths[i]);

                // Now tell flexible storage which the debt cache will read from.
                flexibleStorage().setBoolValue(
                    CONTRACT_NAME,
                    keccak256(abi.encodePacked(COLLATERAL_SYNTHS, synths[i])),
                    true
                );

                emit SynthAdded(synths[i]);
            }
        }
    }

    function removeSynths(address[] calldata synths) external onlyOwner {
        _systemStatus().requireSystemActive();

        for (uint i = 0; i < synths.length; i++) {
            if (_synths.contains(synths[i])) {
                // Remove it from the the address set lib.
                _synths.remove(synths[i]);

                // Now tell flexible storage which the debt cache will read from.
                flexibleStorage().setBoolValue(
                    CONTRACT_NAME,
                    keccak256(abi.encodePacked(COLLATERAL_SYNTHS, synths[i])),
                    false
                );

                emit SynthRemoved(synths[i]);
            }
        }
    }

    function addShortableSynths(address[] calldata synths) external onlyOwner {
        _systemStatus().requireSystemActive();

        for (uint i = 0; i < synths.length; i++) {
            if (!_shortableSynths.contains(synths[i])) {
                // Add it to the address set lib.
                _shortableSynths.add(synths[i]);

                // Now tell flexible storage which the debt cache will read from.
                flexibleStorage().setBoolValue(
                    CONTRACT_NAME,
                    keccak256(abi.encodePacked(COLLATERAL_SHORTS, synths[i])),
                    true
                );

                bytes32 synthKey = ISynth(synths[i]).currencyKey();
                state.addShortCurrency(synthKey);

                emit ShortableSynthAdded(synths[i]);
            }
        }
    }

    function removeShortableSynths(address[] calldata synths) external onlyOwner {
        _systemStatus().requireSystemActive();

        for (uint i = 0; i < synths.length; i++) {
            if (_shortableSynths.contains(synths[i])) {
                // Remove it from the the address set lib.
                _shortableSynths.remove(synths[i]);

                bytes32 synthKey = ISynth(synths[i]).currencyKey();

                state.addShortCurrency(synthKey);

                emit ShortableSynthRemoved(synths[i]);
            }
        }
    }

    /* ---------- STATE MUTATIONS ---------- */

    function updateBorrowRates(uint rate) external onlyCollateral {
        state.updateBorrowRates(rate);
    }

    function updateShortRates(bytes32 currency, uint rate) external onlyCollateral {
        state.updateShortRates(currency, rate);
    }

    function incrementLongs(bytes32 synth, uint amount) external onlyCollateral {
        state.incrementLongs(synth, amount);
    }

    function decrementLongs(bytes32 synth, uint amount) external onlyCollateral {
        state.decrementLongs(synth, amount);
    }

    function incrementShorts(bytes32 synth, uint amount) external onlyCollateral {
        state.incrementShorts(synth, amount);
    }

    function decrementShorts(bytes32 synth, uint amount) external onlyCollateral {
        state.decrementShorts(synth, amount);
    }

    /* ========== MODIFIERS ========== */

    modifier onlyCollateral {
        bool isMultiCollateral = hasCollateral(msg.sender);

        require(isMultiCollateral, "Only collateral contracts");
        _;
    }

    // ========== EVENTS ==========
    event MaxDebtUpdated(uint maxDebt);
    event LiquidationPenaltyUpdated(uint liquidationPenalty);
    event BaseBorrowRateUpdated(uint baseBorrowRate);
    event BaseShortRateUpdated(uint baseShortRate);

    event CollateralAdded(address collateral);
    event CollateralRemoved(address collateral);

    event SynthAdded(address synth);
    event SynthRemoved(address synth);

    event ShortableSynthAdded(address synth);
    event ShortableSynthRemoved(address synth);
}
