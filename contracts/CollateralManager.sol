pragma solidity ^0.5.16;

// Inheritance
import "./Owned.sol";
import "./Pausable.sol";
import "./MixinResolver.sol";
import "./interfaces/ICollateralManager.sol";

// Libraries
import "./AddressListLib.sol";
import "./SafeDecimalMath.sol";

// Internal references
import "./CollateralManagerState.sol";
import "./interfaces/ISystemStatus.sol";
import "./interfaces/IIssuer.sol";
import "./interfaces/ICollateral.sol";
import "./interfaces/IExchangeRates.sol";
import "./interfaces/IDebtCache.sol";


contract CollateralManager is ICollateralManager, Owned, MixinResolver, Pausable {
    /* ========== LIBRARIES ========== */
    using SafeMath for uint;
    using SafeDecimalMath for uint;
    using AddressListLib for AddressListLib.AddressList;

    /* ========== CONSTANTS ========== */

    bytes32 private constant sUSD = "sUSD";

    uint private constant SECONDS_IN_A_YEAR = 31556926 * 1e18;

    /* ========== STATE VARIABLES ========== */

    // Stores debt balances and borrow rates.
    CollateralManagerState public state;

    // The set of all collateral contracts.
    AddressListLib.AddressList internal _collaterals;

    // The set of all synths issuable by the various collateral contracts
    AddressListLib.AddressList internal _synths;

    // The factor that will scale the utilisation ratio.
    uint public utilisationMultiplier = 1e18; 

    /* ---------- Address Resolver Configuration ---------- */

    bytes32 private constant CONTRACT_SYSTEMSTATUS = "SystemStatus";
    bytes32 private constant CONTRACT_ISSUER = "Issuer";
    bytes32 private constant CONTRACT_EXRATES = "ExchangeRates";
    bytes32 private constant CONTRACT_DEBTCACHE = "DebtCache";

    bytes32[24] private addressesToCache = [CONTRACT_SYSTEMSTATUS, CONTRACT_ISSUER, CONTRACT_EXRATES, CONTRACT_DEBTCACHE];

    /* ========== CONSTRUCTOR ========== */
    constructor(CollateralManagerState _state, address _owner, address _resolver) Owned(_owner) Pausable() MixinResolver(_resolver, addressesToCache) public {

        state = _state;    
    }

    /* ========== VIEWS ========== */

    /* ---------- External Contracts ---------- */

    function _systemStatus() internal view returns (ISystemStatus) {
        return ISystemStatus(requireAndGetAddress(CONTRACT_SYSTEMSTATUS, "Missing SystemStatus address"));
    }

    function _issuer() internal view returns (IIssuer) {
        return IIssuer(requireAndGetAddress(CONTRACT_ISSUER, "Missing Issuer address"));
    }

    function _exchangeRates() internal view returns (IExchangeRates) {
        return IExchangeRates(requireAndGetAddress(CONTRACT_EXRATES, "Missing ExchangeRates address"));
    }

    function _debtCache() internal view returns (IDebtCache) {
        return IDebtCache(requireAndGetAddress(CONTRACT_DEBTCACHE, "Missing DebtCache address"));
    }

    /* ---------- Manager ---------- */

    function collateralByAddress(address collateral) public view returns (bool) {
        return _collaterals.contains(collateral);
    }

    function synthByAddress(address synth) public view returns (bool) {
        return _synths.contains(synth);
    }

    function long(bytes32 synth) external view returns (uint amount) {
        return state.long(synth);
    }

    function short(bytes32 synth) external view returns (uint amount) {
        return state.short(synth);
    }

    function totalLong() public view returns (uint debt) {
        address[] memory synths = _synths.elements;

        for (uint i = 0; i < synths.length; i++) {
            bytes32 synth = ISynth(synths[i]).currencyKey();
            if (synth == sUSD) {
                debt = debt.add(state.long(synth));
            } else {
                uint amount = _exchangeRates().effectiveValue(synth, state.long(synth), sUSD);
                debt = debt.add(amount);
            }
        }
    }

    function getScaledUtilisation() external view returns (uint scaledUtilisation) {
        // get the snx backed debt.
        uint snxDebt = _issuer().totalIssuedSynths(sUSD, true);

        // now get the non snx backed debt.
        uint nonSnxDebt = totalLong();

        // the total.
        uint totalDebt = snxDebt.add(nonSnxDebt);

        // now work out the utilisation ratio, and divide through to get a per second value.
        uint utilisation = nonSnxDebt.divideDecimal(totalDebt).divideDecimal(SECONDS_IN_A_YEAR);

        // finally, scale it by the utilisation multiplier.
        scaledUtilisation = utilisation.multiplyDecimal(utilisationMultiplier);
    }

    /* ========== MUTATIVE FUNCTIONS ========== */

    /* ---------- SETTERS ---------- */

    function setUtilisationMultiplier(uint _utilisationMultiplier) public onlyOwner {
        utilisationMultiplier = _utilisationMultiplier;
    }

    /* ---------- MANAGER ---------- */

    function addCollateral(address collateral) external onlyOwner {
        _systemStatus().requireSystemActive();

        // Has one of the other contracts already added the collateral?
        require(!_collaterals.contains(collateral), "Collateral already added");

        // Add it to the address list lib.
        _collaterals.push(collateral);

        emit CollateralAdded(collateral);
    }

    function addSynth(address synth) external onlyOwner {
        _systemStatus().requireSystemActive();

        // Has one of the other contracts already added the synth?
        require(!_synths.contains(synth), "Synth already added");
        
        // Add it to the address list lib.
        _synths.push(synth);

        // Now tell the debt cache about it.
        _debtCache().addCollateralSynths(synth);

        emit SynthAdded(synth);
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
        bool isMultiCollateral = collateralByAddress(msg.sender);

        require(isMultiCollateral, "Only collateral contracts");
        _;
    }

    // ========== EVENTS ==========
    event CollateralAdded(address collateral);
    event SynthAdded(address synth);
}