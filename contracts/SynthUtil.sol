pragma solidity ^0.5.16;

// Inheritance
import "./interfaces/ISynth.sol";
import "./interfaces/ISynthetix.sol";
import "./interfaces/IExchangeRates.sol";
import "./interfaces/IAddressResolver.sol";
import "./interfaces/IERC20.sol";
import "./interfaces/ICollateralManager.sol";
import "./interfaces/ISynthetixState.sol";
import "./SafeDecimalMath.sol";


// https://docs.synthetix.io/contracts/source/contracts/synthutil
contract SynthUtil {
    using SafeDecimalMath for uint;
    IAddressResolver public addressResolverProxy;

    bytes32 internal constant CONTRACT_SYNTHETIX = "Synthetix";
    bytes32 internal constant CONTRACT_SYNTHETIXSTATE = "SynthetixState";
    bytes32 internal constant CONTRACT_COLLATERALMANAGER = "CollateralManager";
    bytes32 internal constant CONTRACT_EXRATES = "ExchangeRates";
    bytes32 internal constant SUSD = "sUSD";

    constructor(address resolver) public {
        addressResolverProxy = IAddressResolver(resolver);
    }

    function _synthetix() internal view returns (ISynthetix) {
        return ISynthetix(addressResolverProxy.requireAndGetAddress(CONTRACT_SYNTHETIX, "Missing Synthetix address"));
    }

    function synthetixState() internal view returns (ISynthetixState) {
        return
            ISynthetixState(
                addressResolverProxy.requireAndGetAddress(CONTRACT_SYNTHETIXSTATE, "Missing SynthetixState address")
            );
    }

    function collateralManager() internal view returns (ICollateralManager) {
        return
            ICollateralManager(
                addressResolverProxy.requireAndGetAddress(CONTRACT_COLLATERALMANAGER, "Missing CollateralManager address")
            );
    }

    function _exchangeRates() internal view returns (IExchangeRates) {
        return IExchangeRates(addressResolverProxy.requireAndGetAddress(CONTRACT_EXRATES, "Missing ExchangeRates address"));
    }

    function totalSynthsInKey(address account, bytes32 currencyKey) external view returns (uint total) {
        ISynthetix synthetix = _synthetix();
        IExchangeRates exchangeRates = _exchangeRates();
        uint numSynths = synthetix.availableSynthCount();
        for (uint i = 0; i < numSynths; i++) {
            ISynth synth = synthetix.availableSynths(i);
            total += exchangeRates.effectiveValue(
                synth.currencyKey(),
                IERC20(address(synth)).balanceOf(account),
                currencyKey
            );
        }
        return total;
    }

    function currentOwnershipDebt(address issuer) external view returns (uint) {
        ISynthetixState state = synthetixState();
        (uint initialDebtOwnership, uint debtEntryIndex) = state.issuanceData(issuer);

        return
            state
                .lastDebtLedgerEntry()
                .divideDecimalRoundPrecise(state.debtLedger(debtEntryIndex))
                .multiplyDecimalRoundPrecise(initialDebtOwnership);
    }

    function shortAmountForSynth(bytes32 synth) external view returns (uint amount) {
        ICollateralManager cm = collateralManager();
        return cm.short(synth);
    }

    function synthsBalances(address account)
        external
        view
        returns (
            bytes32[] memory,
            uint[] memory,
            uint[] memory
        )
    {
        ISynthetix synthetix = _synthetix();
        IExchangeRates exchangeRates = _exchangeRates();
        uint numSynths = synthetix.availableSynthCount();
        bytes32[] memory currencyKeys = new bytes32[](numSynths);
        uint[] memory balances = new uint[](numSynths);
        uint[] memory sUSDBalances = new uint[](numSynths);
        for (uint i = 0; i < numSynths; i++) {
            ISynth synth = synthetix.availableSynths(i);
            currencyKeys[i] = synth.currencyKey();
            balances[i] = IERC20(address(synth)).balanceOf(account);
            sUSDBalances[i] = exchangeRates.effectiveValue(currencyKeys[i], balances[i], SUSD);
        }
        return (currencyKeys, balances, sUSDBalances);
    }

    function frozenSynths() external view returns (bytes32[] memory) {
        ISynthetix synthetix = _synthetix();
        IExchangeRates exchangeRates = _exchangeRates();
        uint numSynths = synthetix.availableSynthCount();
        bytes32[] memory frozenSynthsKeys = new bytes32[](numSynths);
        for (uint i = 0; i < numSynths; i++) {
            ISynth synth = synthetix.availableSynths(i);
            if (exchangeRates.rateIsFrozen(synth.currencyKey())) {
                frozenSynthsKeys[i] = synth.currencyKey();
            }
        }
        return frozenSynthsKeys;
    }

    function synthsRates() external view returns (bytes32[] memory, uint[] memory) {
        bytes32[] memory currencyKeys = _synthetix().availableCurrencyKeys();
        return (currencyKeys, _exchangeRates().ratesForCurrencies(currencyKeys));
    }

    function synthsTotalSupplies()
        external
        view
        returns (
            bytes32[] memory,
            uint256[] memory,
            uint256[] memory
        )
    {
        ISynthetix synthetix = _synthetix();
        IExchangeRates exchangeRates = _exchangeRates();

        uint256 numSynths = synthetix.availableSynthCount();
        bytes32[] memory currencyKeys = new bytes32[](numSynths);
        uint256[] memory balances = new uint256[](numSynths);
        uint256[] memory sUSDBalances = new uint256[](numSynths);
        for (uint256 i = 0; i < numSynths; i++) {
            ISynth synth = synthetix.availableSynths(i);
            currencyKeys[i] = synth.currencyKey();
            balances[i] = IERC20(address(synth)).totalSupply();
            sUSDBalances[i] = exchangeRates.effectiveValue(currencyKeys[i], balances[i], SUSD);
        }
        return (currencyKeys, balances, sUSDBalances);
    }
}
