
pragma solidity 0.4.25;

import "openzeppelin-solidity/contracts/math/SafeMath.sol";
import "./SafeDecimalMath.sol";
import "./MixinResolver.sol";
import "./ExchangeState.sol";
import "./interfaces/IExchangeRates.sol";
import "./interfaces/ISynthetix.sol";
import "./interfaces/IFeePool.sol";
import "./Issuer.sol";

contract Exchanger is MixinResolver {

    using SafeMath for uint;
    using SafeDecimalMath for uint;

    bool public exchangeEnabled = true;

    uint public waitingPeriod = 3 minutes;

    bytes32 constant sUSD = "sUSD";

    constructor(address _owner, address _resolver)
        MixinResolver(_owner, _resolver)
        public
    {}

    /* ========== VIEWS ========== */

    // function exchangeState() public view returns (ExchangeState) {
    //     require(resolver.getAddress("ExchangeState") != address(0), "Resolver is missing ExchangeState address");
    //     return ExchangeState(resolver.getAddress("ExchangeState"));
    // }

    function issuer() internal view returns (Issuer) {
        require(resolver.getAddress("Issuer") != address(0), "Resolver is missing Issuer address");
        return Issuer(resolver.getAddress("Issuer"));
    }

    function exchangeRates() public view returns (IExchangeRates) {
        require(resolver.getAddress("ExchangeRates") != address(0), "Resolver is missing ExchangeRates address");
        return IExchangeRates(resolver.getAddress("ExchangeRates"));
    }

    function synthetix() public view returns (ISynthetix) {
        require(resolver.getAddress("Synthetix") != address(0), "Resolver is missing Synthetix address");
        return ISynthetix(resolver.getAddress("Synthetix"));
    }

    function feePool() public view returns (IFeePool) {
        require(resolver.getAddress("FeePool") != address(0), "Resolver is missing FeePool address");
        return IFeePool(resolver.getAddress("FeePool"));
    }

    function maxSecsLeftInWaitingPeriod(address account, bytes32 currencyKey) public view returns (uint) {
        return 0; // TEMP
        // return secsLeftInWaitingPeriodForExchange(exchangeState().getMaxTimestamp(account, currencyKey));
    }

    function calculateExchangeAmountMinusFees(bytes32 sourceCurrencyKey, bytes32 destinationCurrencyKey, uint destinationAmount) public view returns (uint, uint) {

        // What's the fee on that currency that we should deduct?
        uint amountReceived = destinationAmount;

        // Get the exchange fee rate
        uint exchangeFeeRate = feeRateForExchange(sourceCurrencyKey, destinationCurrencyKey);

        amountReceived = destinationAmount.multiplyDecimal(SafeDecimalMath.unit().sub(exchangeFeeRate));

        uint fee = destinationAmount.sub(amountReceived);

        return (amountReceived, fee);
    }

    // Determine the effective fee rate for the exchange, taking into considering swing trading
    function feeRateForExchange(bytes32 sourceCurrencyKey, bytes32 destinationCurrencyKey)
        public
        view
        returns (uint)
    {
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

    function settlementOwing(address account, bytes32 currencyKey) public view returns (int) {

        int owing = 0;

        // // Need to sum up all owings
        // uint numEntries = exchangeState().getLengthOfEntries(account, currencyKey);

        // for (uint i = 0; i < numEntries; i++) {

        //     (bytes32 src, uint amount, bytes32 dest, uint amountReceived,,,) = exchangeState().getEntryAt(account, currencyKey, i);

        //     (uint srcRoundIdAtPeriodEnd, uint destRoundIdAtPeriodEnd) = getRoundIdsAtPeriodEnd(account, currencyKey, i);

        //     uint destinationAmount = exchangeRates().effectiveValueAtRound(src, amount, dest, srcRoundIdAtPeriodEnd, destRoundIdAtPeriodEnd);

        //     (uint amountShouldHaveReceived, ) = calculateExchangeAmountMinusFees(src, dest, destinationAmount);

        //     owing = owing + int (amountReceived - amountShouldHaveReceived);
        // }

        return owing;

    }

    /* ========== SETTERS ========== */

    function setWaitingPeriod(uint _waitingPeriod) external onlyOwner {
        waitingPeriod = _waitingPeriod;
    }

    function setExchangeEnabled(bool _exchangeEnabled)
        external
        onlyOwner
    {
        exchangeEnabled = _exchangeEnabled;
    }

    /* ========== MUTATIVE FUNCTIONS ========== */


    function exchange(address from, bytes32 sourceCurrencyKey, uint sourceAmount, bytes32 destinationCurrencyKey)
        external
        // Note: We don't need to insist on non-stale rates because effectiveValue will do it for us.
        onlySynthetixorSynth
        returns (bool)
    {
        require(sourceCurrencyKey != destinationCurrencyKey, "Can't be same synth");
        require(sourceAmount > 0, "Zero amount");
        require(exchangeEnabled, "Exchanging is disabled");

        require(maxSecsLeftInWaitingPeriod(from, sourceCurrencyKey) == 0, "Cannot exchange during waiting period");

        _internalSettle(from, sourceCurrencyKey);

        // Note: We don't need to check their balance as the burn() below will do a safe subtraction which requires
        // the subtraction to not overflow, which would happen if their balance is not sufficient.

        // Burn the source amount
        synthetix().getSynthByCurrencyKey(sourceCurrencyKey).burn(from, sourceAmount);

        uint destinationAmount = synthetix().effectiveValue(sourceCurrencyKey, sourceAmount, destinationCurrencyKey);

        (uint amountReceived, uint fee) = calculateExchangeAmountMinusFees(sourceCurrencyKey, destinationCurrencyKey, destinationAmount);

        // // Issue their new synths
        synthetix().getSynthByCurrencyKey(destinationCurrencyKey).issue(from, amountReceived);

        // Remit the fee in sUSDs
        if (fee > 0) {
            uint usdFeeAmount = synthetix().effectiveValue(destinationCurrencyKey, fee, sUSD);
            synthetix().getSynthByCurrencyKey(sUSD).issue(feePool().FEE_ADDRESS(), usdFeeAmount);
            // Tell the fee pool about this.
            feePool().recordFeePaid(usdFeeAmount);
        }

        // Nothing changes as far as issuance data goes because the total value in the system hasn't changed.

        //Let the DApps know there was a Synth exchange
        synthetix().emitSynthExchange(from, sourceCurrencyKey, sourceAmount, destinationCurrencyKey, amountReceived, from);

        // persist the exchange information for the dest key
        appendExchange(from, sourceCurrencyKey, sourceAmount, destinationCurrencyKey, amountReceived);

        return true;
    }

    function settle(address from, bytes32 currencyKey) external onlySynthetixorIssuer returns (bool) {
        return _internalSettle(from, currencyKey);
    }

    /* ========== INTERNAL FUNCTIONS ========== */

    function _internalSettle(address from, bytes32 currencyKey) internal returns (bool) {

        return true;
        // require(maxSecsLeftInWaitingPeriod(from, currencyKey) == 0, "Cannot settle during waiting period");

        // int owing = settlementOwing(from, currencyKey);

        // if (owing > 0) {
        //     // transfer dest synths from user to fee pool
        //     reclaim(from, currencyKey, uint (owing));
        // } else if (owing < 0) {
        //     // user is owed from the exchange
        //     refund(from, currencyKey, uint (owing * -1));
        // }

        // // Now remove all entries, even if nothing showing as owing.
        // removeExchanges(from, currencyKey);

        // return owing != 0;
    }

    function reclaim(address from, bytes32 currencyKey, uint owing) internal {
        // burn amount from user
        synthetix().getSynthByCurrencyKey(currencyKey).burn(from, owing);

        synthetix().emitExchangeReclaim(from, currencyKey, owing);
    }

    function refund(address from, bytes32 currencyKey, uint owing) internal {
        // issue amount to user
        synthetix().getSynthByCurrencyKey(currencyKey).issue(from, owing);

        synthetix().emitExchangeRebate(from, currencyKey, owing);
    }

    function secsLeftInWaitingPeriodForExchange(uint timestamp) internal view returns (uint) {
        if (timestamp == 0) return 0;

        int remainingTime = int (now - timestamp - waitingPeriod);

        return remainingTime < 0 ? uint (-1 * remainingTime) : 0;
    }

    function appendExchange(address account, bytes32 src, uint amount, bytes32 dest, uint amountReceived) internal onlySynthetix {
        // IExchangeRates exRates = exchangeRates();
        // uint roundIdForSrc = exRates.getCurrentRoundId(src);
        // uint roundIdForDest = exRates.getCurrentRoundId(dest);
        // exchangeState().appendExchangeEntry(account, src, amount, dest, amountReceived, now, roundIdForSrc, roundIdForDest);
    }

    function removeExchanges(address account, bytes32 currencyKey) internal onlySynthetix {
        // exchangeState().removeEntries(account, currencyKey);
    }

    function getRoundIdsAtPeriodEnd(address account, bytes32 currencyKey, uint index) internal view returns (uint, uint) {
        return (0, 0); // TEMP
        // (bytes32 src,, bytes32 dest,, uint timestamp, uint roundIdForSrc, uint roundIdForDest) = exchangeState().getEntryAt(account, currencyKey, index);

        // IExchangeRates exRates = exchangeRates();
        // uint srcRoundIdAtPeriodEnd = exRates.getLastRoundIdWhenWaitingPeriodEnded(src, roundIdForSrc, timestamp, waitingPeriod);
        // uint destRoundIdAtPeriodEnd = exRates.getLastRoundIdWhenWaitingPeriodEnded(dest, roundIdForDest, timestamp, waitingPeriod);

        // return (srcRoundIdAtPeriodEnd, destRoundIdAtPeriodEnd);
    }

    // ========== MODIFIERS ==========

    modifier onlySynthetix() {
        require(msg.sender == address(synthetix()), "Exchanger: Only the synthetix contract can perform this action");
        _;
    }

    modifier onlySynthetixorSynth() {
        require(msg.sender == address(synthetix()) || synthetix().getSynthByAddress(msg.sender) != bytes32(0), "Exchanger: Only synthetix or a synth contract can perform this action");
        _;
    }

    modifier onlySynthetixorIssuer() {
        require(msg.sender == address(synthetix()) || msg.sender == address(issuer()), "Exchanger: Only synthetix or issuer can perform this action");
        _;
    }
}
