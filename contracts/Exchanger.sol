pragma solidity 0.4.25;

import "openzeppelin-solidity/contracts/math/SafeMath.sol";
import "./SafeDecimalMath.sol";
import "./MixinResolver.sol";
import "./interfaces/IExchangeRates.sol";
import "./interfaces/ISynthetix.sol";
import "./interfaces/IFeePool.sol";
import "./interfaces/IIssuer.sol";


contract Exchanger is MixinResolver {
    using SafeMath for uint;
    using SafeDecimalMath for uint;

    bool public exchangeEnabled = true;

    uint public gasPriceLimit;

    address public gasLimitOracle;

    bytes32 private constant sUSD = "sUSD";

    constructor(address _owner, address _resolver) public MixinResolver(_owner, _resolver) {}

    /* ========== VIEWS ========== */

    function synthetix() internal view returns (ISynthetix) {
        require(resolver.getAddress("Synthetix") != address(0), "Resolver is missing Synthetix address");
        return ISynthetix(resolver.getAddress("Synthetix"));
    }

    function feePool() internal view returns (IFeePool) {
        require(resolver.getAddress("FeePool") != address(0), "Resolver is missing FeePool address");
        return IFeePool(resolver.getAddress("FeePool"));
    }

    function exchangeRates() internal view returns (IExchangeRates) {
        require(resolver.getAddress("ExchangeRates") != address(0), "Resolver is missing ExchangeRates address");
        return IExchangeRates(resolver.getAddress("ExchangeRates"));
    }

    function calculateExchangeAmountMinusFees(
        bytes32 sourceCurrencyKey,
        bytes32 destinationCurrencyKey,
        uint destinationAmount
    ) public view returns (uint, uint) {
        // What's the fee on that currency that we should deduct?
        uint amountReceived = destinationAmount;

        // Get the exchange fee rate
        uint exchangeFeeRate = feeRateForExchange(sourceCurrencyKey, destinationCurrencyKey);

        amountReceived = destinationAmount.multiplyDecimal(SafeDecimalMath.unit().sub(exchangeFeeRate));

        uint fee = destinationAmount.sub(amountReceived);

        return (amountReceived, fee);
    }

    // Determine the effective fee rate for the exchange, taking into considering swing trading
    function feeRateForExchange(bytes32 sourceCurrencyKey, bytes32 destinationCurrencyKey) public view returns (uint) {
        // Get the base exchange fee rate
        uint exchangeFeeRate = feePool().exchangeFeeRate();

        uint multiplier = 1;

        // Is this a swing trade? I.e. long to short or vice versa, excluding when going into or out of sUSD.
        // Note: this assumes shorts begin with 'i' and longs with 's'.
        if (
            (sourceCurrencyKey[0] == 0x73 && sourceCurrencyKey != sUSD && destinationCurrencyKey[0] == 0x69) ||
            (sourceCurrencyKey[0] == 0x69 && destinationCurrencyKey != sUSD && destinationCurrencyKey[0] == 0x73)
        ) {
            // If so then double the exchange fee multipler
            multiplier = 2;
        }

        return exchangeFeeRate.mul(multiplier);
    }

    function validateGasPrice(uint _givenGasPrice) public view {
        require(_givenGasPrice <= gasPriceLimit, "Gas price above limit");
    }

    /* ========== SETTERS ========== */

    function setExchangeEnabled(bool _exchangeEnabled) external onlyOwner {
        exchangeEnabled = _exchangeEnabled;
    }

    function setGasLimitOracle(address _gasLimitOracle) external onlyOwner {
        gasLimitOracle = _gasLimitOracle;
    }

    function setGasPriceLimit(uint _gasPriceLimit) external {
        require(msg.sender == gasLimitOracle, "Only gas limit oracle allowed");
        require(_gasPriceLimit > 0, "Needs to be greater than 0");
        gasPriceLimit = _gasPriceLimit;
    }

    /* ========== MUTATIVE FUNCTIONS ========== */

    function exchange(
        address from,
        bytes32 sourceCurrencyKey,
        uint sourceAmount,
        bytes32 destinationCurrencyKey,
        address destinationAddress
    )
        external
        // Note: We don't need to insist on non-stale rates because effectiveValue will do it for us.
        onlySynthetixorSynth
        returns (uint)
    {
        require(sourceCurrencyKey != destinationCurrencyKey, "Can't be same synth");
        require(sourceAmount > 0, "Zero amount");
        require(exchangeEnabled, "Exchanging is disabled");

        // verify gas price limit
        validateGasPrice(tx.gasprice);

        IExchangeRates exRates = exchangeRates();
        ISynthetix _synthetix = synthetix();

        // Note: We don't need to check their balance as the burn() below will do a safe subtraction which requires
        // the subtraction to not overflow, which would happen if their balance is not sufficient.

        // Burn the source amount
        _synthetix.synths(sourceCurrencyKey).burn(from, sourceAmount);

        uint destinationAmount = exRates.effectiveValue(sourceCurrencyKey, sourceAmount, destinationCurrencyKey);

        (uint amountReceived, uint fee) = calculateExchangeAmountMinusFees(
            sourceCurrencyKey,
            destinationCurrencyKey,
            destinationAmount
        );

        // // Issue their new synths
        _synthetix.synths(destinationCurrencyKey).issue(destinationAddress, amountReceived);

        // Remit the fee in sUSDs
        if (fee > 0) {
            uint usdFeeAmount = exRates.effectiveValue(destinationCurrencyKey, fee, sUSD);
            _synthetix.synths(sUSD).issue(feePool().FEE_ADDRESS(), usdFeeAmount);
            // Tell the fee pool about this.
            feePool().recordFeePaid(usdFeeAmount);
        }

        // Nothing changes as far as issuance data goes because the total value in the system hasn't changed.

        //Let the DApps know there was a Synth exchange
        _synthetix.emitSynthExchange(
            from,
            sourceCurrencyKey,
            sourceAmount,
            destinationCurrencyKey,
            amountReceived,
            destinationAddress
        );

        return amountReceived;
    }

    /* ========== INTERNAL FUNCTIONS ========== */

    // ========== MODIFIERS ==========

    modifier onlySynthetixorSynth() {
        require(
            msg.sender == address(synthetix()) || synthetix().getSynthByAddress(msg.sender) != bytes32(0),
            "Exchanger: Only synthetix or a synth contract can perform this action"
        );
        _;
    }
}
