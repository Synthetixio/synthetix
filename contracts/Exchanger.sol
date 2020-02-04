pragma solidity 0.4.25;

import "openzeppelin-solidity/contracts/math/SafeMath.sol";
import "./SafeDecimalMath.sol";
import "./MixinResolver.sol";
import "./ExchangeState.sol";
import "./interfaces/IExchangeRates.sol";
import "./interfaces/ISynthetix.sol";
import "./interfaces/IFeePool.sol";
import "./interfaces/IIssuer.sol";


contract Exchanger is MixinResolver {
    using SafeMath for uint;
    using SafeDecimalMath for uint;

    bool public exchangeEnabled;

    bytes32 private constant sUSD = "sUSD";

    uint public waitingPeriodSecs;

    constructor(address _owner, address _resolver) public MixinResolver(_owner, _resolver) {
        exchangeEnabled = true;
        waitingPeriodSecs = 3 minutes;
    }

    /* ========== VIEWS ========== */

    function exchangeState() public view returns (ExchangeState) {
        require(resolver.getAddress("ExchangeState") != address(0), "Resolver is missing ExchangeState address");
        return ExchangeState(resolver.getAddress("ExchangeState"));
    }

    function exchangeRates() internal view returns (IExchangeRates) {
        require(resolver.getAddress("ExchangeRates") != address(0), "Resolver is missing ExchangeRates address");
        return IExchangeRates(resolver.getAddress("ExchangeRates"));
    }

    function synthetix() internal view returns (ISynthetix) {
        require(resolver.getAddress("Synthetix") != address(0), "Resolver is missing Synthetix address");
        return ISynthetix(resolver.getAddress("Synthetix"));
    }

    function feePool() internal view returns (IFeePool) {
        require(resolver.getAddress("FeePool") != address(0), "Resolver is missing FeePool address");
        return IFeePool(resolver.getAddress("FeePool"));
    }

    function maxSecsLeftInWaitingPeriod(address account, bytes32 currencyKey) public view returns (uint) {
        return secsLeftInWaitingPeriodForExchange(exchangeState().getMaxTimestamp(account, currencyKey));
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

    function settlementOwing(address account, bytes32 currencyKey) public view returns (uint owing, uint owed) {
        // Need to sum up all owings
        uint numEntries = exchangeState().getLengthOfEntries(account, currencyKey);

        for (uint i = 0; i < numEntries; i++) {
            (bytes32 src, uint amount, bytes32 dest, uint amountReceived, , , ) = exchangeState().getEntryAt(
                account,
                currencyKey,
                i
            );

            (uint srcRoundIdAtPeriodEnd, uint destRoundIdAtPeriodEnd) = getRoundIdsAtPeriodEnd(account, currencyKey, i);

            uint destinationAmount = exchangeRates().effectiveValueAtRound(
                src,
                amount,
                dest,
                srcRoundIdAtPeriodEnd,
                destRoundIdAtPeriodEnd
            );

            (uint amountShouldHaveReceived, ) = calculateExchangeAmountMinusFees(src, dest, destinationAmount);

            if (amountReceived > amountShouldHaveReceived) {
                owing = owing.add(amountReceived.sub(amountShouldHaveReceived));
            } else if (amountShouldHaveReceived > amountReceived) {
                owed = owed.add(amountShouldHaveReceived.sub(amountReceived));
            }
        }

        return (owing, owed);
    }

    /* ========== SETTERS ========== */

    function setWaitingPeriodSecs(uint _waitingPeriodSecs) external onlyOwner {
        waitingPeriodSecs = _waitingPeriodSecs;
    }

    function setExchangeEnabled(bool _exchangeEnabled) external onlyOwner {
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

        (uint reclaimed, uint refunded) = _internalSettle(from, sourceCurrencyKey);

        uint sourceAmountAfterSettlement = sourceAmount;
        if (reclaimed > 0) {
            sourceAmountAfterSettlement = sourceAmountAfterSettlement.sub(reclaimed);
        }
        if (refunded > 0) {
            sourceAmountAfterSettlement = sourceAmountAfterSettlement.add(refunded);
        }

        // Note: We don't need to check their balance as the burn() below will do a safe subtraction which requires
        // the subtraction to not overflow, which would happen if their balance is not sufficient.

        // Burn the source amount
        synthetix().synths(sourceCurrencyKey).burn(from, sourceAmountAfterSettlement);

        uint destinationAmount = synthetix().effectiveValue(
            sourceCurrencyKey,
            sourceAmountAfterSettlement,
            destinationCurrencyKey
        );

        (uint amountReceived, uint fee) = calculateExchangeAmountMinusFees(
            sourceCurrencyKey,
            destinationCurrencyKey,
            destinationAmount
        );

        // // Issue their new synths
        synthetix().synths(destinationCurrencyKey).issue(from, amountReceived);

        // Remit the fee in sUSDs
        if (fee > 0) {
            uint usdFeeAmount = synthetix().effectiveValue(destinationCurrencyKey, fee, sUSD);
            synthetix().synths(sUSD).issue(feePool().FEE_ADDRESS(), usdFeeAmount);
            // Tell the fee pool about this.
            feePool().recordFeePaid(usdFeeAmount);
        }

        // Nothing changes as far as issuance data goes because the total value in the system hasn't changed.

        //Let the DApps know there was a Synth exchange
        synthetix().emitSynthExchange(
            from,
            sourceCurrencyKey,
            sourceAmountAfterSettlement,
            destinationCurrencyKey,
            amountReceived
        );

        // persist the exchange information for the dest key
        appendExchange(from, sourceCurrencyKey, sourceAmountAfterSettlement, destinationCurrencyKey, amountReceived);

        return true;
    }

    function settle(address from, bytes32 currencyKey) external returns (uint reclaimed, uint refunded) {
        // Note: this function can be called by anyone on behalf of anyone else

        return _internalSettle(from, currencyKey);
    }

    /* ========== INTERNAL FUNCTIONS ========== */

    function _internalSettle(address from, bytes32 currencyKey) internal returns (uint reclaimed, uint refunded) {
        require(maxSecsLeftInWaitingPeriod(from, currencyKey) == 0, "Cannot settle during waiting period");

        (uint owing, uint owed) = settlementOwing(from, currencyKey);

        if (owing > owed) {
            reclaimed = owing.sub(owed);
            // transfer dest synths from user to fee pool
            reclaim(from, currencyKey, reclaimed);
        } else if (owed > owing) {
            refunded = owed.sub(owing);
            // user is owed from the exchange
            refund(from, currencyKey, refunded);
        }

        // Now remove all entries, even if nothing showing as owing.
        exchangeState().removeEntries(from, currencyKey);

        return (reclaimed, refunded);
    }

    function reclaim(address from, bytes32 currencyKey, uint amount) internal {
        // burn amount from user
        synthetix().synths(currencyKey).burn(from, amount);
        synthetix().emitExchangeReclaim(from, currencyKey, amount);
    }

    function refund(address from, bytes32 currencyKey, uint amount) internal {
        // issue amount to user
        synthetix().synths(currencyKey).issue(from, amount);
        synthetix().emitExchangeRebate(from, currencyKey, amount);
    }

    function secsLeftInWaitingPeriodForExchange(uint timestamp) internal view returns (uint) {
        if (timestamp == 0 || now >= timestamp.add(waitingPeriodSecs)) {
            return 0;
        }

        return timestamp.add(waitingPeriodSecs).sub(now);
    }

    function calculateExchangeAmountMinusFees(
        bytes32 sourceCurrencyKey,
        bytes32 destinationCurrencyKey,
        uint destinationAmount
    ) internal view returns (uint, uint) {
        // What's the fee on that currency that we should deduct?
        uint amountReceived = destinationAmount;

        // Get the exchange fee rate
        uint exchangeFeeRate = feeRateForExchange(sourceCurrencyKey, destinationCurrencyKey);

        amountReceived = destinationAmount.multiplyDecimal(SafeDecimalMath.unit().sub(exchangeFeeRate));

        uint fee = destinationAmount.sub(amountReceived);

        return (amountReceived, fee);
    }

    function appendExchange(address account, bytes32 src, uint amount, bytes32 dest, uint amountReceived) internal {
        IExchangeRates exRates = exchangeRates();
        uint roundIdForSrc = exRates.getCurrentRoundId(src);
        uint roundIdForDest = exRates.getCurrentRoundId(dest);
        exchangeState().appendExchangeEntry(account, src, amount, dest, amountReceived, now, roundIdForSrc, roundIdForDest);
    }

    function getRoundIdsAtPeriodEnd(address account, bytes32 currencyKey, uint index) internal view returns (uint, uint) {
        (bytes32 src, , bytes32 dest, , uint timestamp, uint roundIdForSrc, uint roundIdForDest) = exchangeState()
            .getEntryAt(account, currencyKey, index);

        IExchangeRates exRates = exchangeRates();
        uint srcRoundIdAtPeriodEnd = exRates.getLastRoundIdWhenWaitingPeriodEnded(
            src,
            roundIdForSrc,
            timestamp,
            waitingPeriodSecs
        );
        uint destRoundIdAtPeriodEnd = exRates.getLastRoundIdWhenWaitingPeriodEnded(
            dest,
            roundIdForDest,
            timestamp,
            waitingPeriodSecs
        );

        return (srcRoundIdAtPeriodEnd, destRoundIdAtPeriodEnd);
    }

    // ========== MODIFIERS ==========

    modifier onlySynthetixorSynth() {
        require(
            msg.sender == address(synthetix()) || synthetix().getSynthByAddress(msg.sender) != bytes32(0),
            "Exchanger: Only synthetix or a synth contract can perform this action"
        );
        _;
    }
}
