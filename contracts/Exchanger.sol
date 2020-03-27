pragma solidity 0.4.25;

import "openzeppelin-solidity/contracts/math/SafeMath.sol";
import "./SafeDecimalMath.sol";
import "./MixinResolver.sol";
import "./interfaces/IExchangeState.sol";
import "./interfaces/IExchangeRates.sol";
import "./interfaces/ISynthetix.sol";
import "./interfaces/IFeePool.sol";
import "./interfaces/IIssuer.sol";
import "./interfaces/IDelegateApprovals.sol";

// https://docs.synthetix.io/contracts/Exchanger
contract Exchanger is MixinResolver {
    using SafeMath for uint;
    using SafeDecimalMath for uint;

    bytes32 private constant sUSD = "sUSD";

    uint public waitingPeriodSecs;

    /* ========== ADDRESS RESOLVER CONFIGURATION ========== */

    bytes32 private constant CONTRACT_SYSTEMSTATUS = "SystemStatus";
    bytes32 private constant CONTRACT_EXCHANGESTATE = "ExchangeState";
    bytes32 private constant CONTRACT_EXRATES = "ExchangeRates";
    bytes32 private constant CONTRACT_SYNTHETIX = "Synthetix";
    bytes32 private constant CONTRACT_FEEPOOL = "FeePool";
    bytes32 private constant CONTRACT_DELEGATEAPPROVALS = "DelegateApprovals";

    bytes32[24] private addressesToCache = [
        CONTRACT_SYSTEMSTATUS,
        CONTRACT_EXCHANGESTATE,
        CONTRACT_EXRATES,
        CONTRACT_SYNTHETIX,
        CONTRACT_FEEPOOL,
        CONTRACT_DELEGATEAPPROVALS
    ];

    constructor(address _owner, address _resolver) public MixinResolver(_owner, _resolver, addressesToCache) {
        waitingPeriodSecs = 3 minutes;
    }

    /* ========== VIEWS ========== */

    function systemStatus() internal view returns (ISystemStatus) {
        return ISystemStatus(requireAndGetAddress(CONTRACT_SYSTEMSTATUS, "Missing SystemStatus address"));
    }

    function exchangeState() internal view returns (IExchangeState) {
        return IExchangeState(requireAndGetAddress(CONTRACT_EXCHANGESTATE, "Missing ExchangeState address"));
    }

    function exchangeRates() internal view returns (IExchangeRates) {
        return IExchangeRates(requireAndGetAddress(CONTRACT_EXRATES, "Missing ExchangeRates address"));
    }

    function synthetix() internal view returns (ISynthetix) {
        return ISynthetix(requireAndGetAddress(CONTRACT_SYNTHETIX, "Missing Synthetix address"));
    }

    function feePool() internal view returns (IFeePool) {
        return IFeePool(requireAndGetAddress(CONTRACT_FEEPOOL, "Missing FeePool address"));
    }

    function delegateApprovals() internal view returns (IDelegateApprovals) {
        return IDelegateApprovals(requireAndGetAddress(CONTRACT_DELEGATEAPPROVALS, "Missing DelegateApprovals address"));
    }

    function maxSecsLeftInWaitingPeriod(address account, bytes32 currencyKey) public view returns (uint) {
        return secsLeftInWaitingPeriodForExchange(exchangeState().getMaxTimestamp(account, currencyKey));
    }

    // Determine the effective fee rate for the exchange, taking into considering swing trading
    function feeRateForExchange(bytes32 sourceCurrencyKey, bytes32 destinationCurrencyKey) public view returns (uint) {
        // Get the base exchange fee rate
        uint exchangeFeeRate = feePool().exchangeFeeRate();

        return exchangeFeeRate;
    }

    function settlementOwing(address account, bytes32 currencyKey)
        public
        view
        returns (uint reclaimAmount, uint rebateAmount, uint numEntries)
    {
        // Need to sum up all reclaim and rebate amounts for the user and the currency key
        numEntries = exchangeState().getLengthOfEntries(account, currencyKey);

        // For each unsettled exchange
        for (uint i = 0; i < numEntries; i++) {
            // fetch the entry from storage
            (bytes32 src, uint amount, bytes32 dest, uint amountReceived, , , , ) = exchangeState().getEntryAt(
                account,
                currencyKey,
                i
            );

            // determine the last round ids for src and dest pairs when period ended or latest if not over
            (uint srcRoundIdAtPeriodEnd, uint destRoundIdAtPeriodEnd) = getRoundIdsAtPeriodEnd(account, currencyKey, i);

            // given these round ids, determine what effective value they should have received
            uint destinationAmount = exchangeRates().effectiveValueAtRound(
                src,
                amount,
                dest,
                srcRoundIdAtPeriodEnd,
                destRoundIdAtPeriodEnd
            );

            // and deduct the fee from this amount
            (uint amountShouldHaveReceived, ) = calculateExchangeAmountMinusFees(src, dest, destinationAmount);

            if (amountReceived > amountShouldHaveReceived) {
                // if they received more than they should have, add to the reclaim tally
                reclaimAmount = reclaimAmount.add(amountReceived.sub(amountShouldHaveReceived));
            } else if (amountShouldHaveReceived > amountReceived) {
                // if less, add to the rebate tally
                rebateAmount = rebateAmount.add(amountShouldHaveReceived.sub(amountReceived));
            }
        }

        return (reclaimAmount, rebateAmount, numEntries);
    }

    /* ========== SETTERS ========== */

    function setWaitingPeriodSecs(uint _waitingPeriodSecs) external onlyOwner {
        waitingPeriodSecs = _waitingPeriodSecs;
    }

    function calculateAmountAfterSettlement(address from, bytes32 currencyKey, uint amount, uint refunded)
        public
        view
        returns (uint amountAfterSettlement)
    {
        amountAfterSettlement = amount;

        // balance of a synth will show an amount after settlement
        uint balanceOfSourceAfterSettlement = synthetix().synths(currencyKey).balanceOf(from);

        // when there isn't enough supply (either due to reclamation settlement or because the number is too high)
        if (amountAfterSettlement > balanceOfSourceAfterSettlement) {
            // then the amount to exchange is reduced to their remaining supply
            amountAfterSettlement = balanceOfSourceAfterSettlement;
        }

        if (refunded > 0) {
            amountAfterSettlement = amountAfterSettlement.add(refunded);
        }
    }

    /* ========== MUTATIVE FUNCTIONS ========== */
    function exchange(
        address from,
        bytes32 sourceCurrencyKey,
        uint sourceAmount,
        bytes32 destinationCurrencyKey,
        address destinationAddress
    ) external onlySynthetixorSynth returns (uint amountReceived) {
        amountReceived = _exchange(from, sourceCurrencyKey, sourceAmount, destinationCurrencyKey, destinationAddress);
    }

    function exchangeOnBehalf(
        address exchangeForAddress,
        address from,
        bytes32 sourceCurrencyKey,
        uint sourceAmount,
        bytes32 destinationCurrencyKey
    ) external onlySynthetixorSynth returns (uint amountReceived) {
        require(delegateApprovals().canExchangeFor(exchangeForAddress, from), "Not approved to act on behalf");
        amountReceived = _exchange(
            exchangeForAddress,
            sourceCurrencyKey,
            sourceAmount,
            destinationCurrencyKey,
            exchangeForAddress
        );
    }

    function _exchange(
        address from,
        bytes32 sourceCurrencyKey,
        uint sourceAmount,
        bytes32 destinationCurrencyKey,
        address destinationAddress
    )
        internal
        returns (
            // Note: We don't need to insist on non-stale rates because effectiveValue will do it for us.
            uint amountReceived
        )
    {
        require(sourceCurrencyKey != destinationCurrencyKey, "Can't be same synth");
        require(sourceAmount > 0, "Zero amount");

        (, uint refunded, uint numEntriesSettled) = _internalSettle(from, sourceCurrencyKey);

        uint sourceAmountAfterSettlement = sourceAmount;

        // when settlement was required
        if (numEntriesSettled > 0) {
            // ensure the sourceAmount takes this into account
            sourceAmountAfterSettlement = calculateAmountAfterSettlement(from, sourceCurrencyKey, sourceAmount, refunded);

            // If, after settlement the user has no balance left (highly unlikely), then return to prevent
            // emitting events of 0 and don't revert so as to ensure the settlement queue is emptied
            if (sourceAmountAfterSettlement == 0) {
                return 0;
            }
        }

        // Note: We don't need to check their balance as the burn() below will do a safe subtraction which requires
        // the subtraction to not overflow, which would happen if their balance is not sufficient.

        // Burn the source amount
        synthetix().synths(sourceCurrencyKey).burn(from, sourceAmountAfterSettlement);

        uint destinationAmount = exchangeRates().effectiveValue(
            sourceCurrencyKey,
            sourceAmountAfterSettlement,
            destinationCurrencyKey
        );

        uint fee;

        (amountReceived, fee) = calculateExchangeAmountMinusFees(
            sourceCurrencyKey,
            destinationCurrencyKey,
            destinationAmount
        );

        // Issue their new synths
        synthetix().synths(destinationCurrencyKey).issue(destinationAddress, amountReceived);

        // Remit the fee if required
        if (fee > 0) {
            remitFee(exchangeRates(), synthetix(), fee, destinationCurrencyKey);
        }

        // Nothing changes as far as issuance data goes because the total value in the system hasn't changed.

        // Let the DApps know there was a Synth exchange
        synthetix().emitSynthExchange(
            from,
            sourceCurrencyKey,
            sourceAmountAfterSettlement,
            destinationCurrencyKey,
            amountReceived,
            destinationAddress
        );

        // persist the exchange information for the dest key
        appendExchange(
            destinationAddress,
            sourceCurrencyKey,
            sourceAmountAfterSettlement,
            destinationCurrencyKey,
            amountReceived
        );
    }

    function settle(address from, bytes32 currencyKey)
        external
        returns (uint reclaimed, uint refunded, uint numEntriesSettled)
    {
        // Note: this function can be called by anyone on behalf of anyone else

        systemStatus().requireExchangeActive();

        systemStatus().requireSynthActive(currencyKey);

        return _internalSettle(from, currencyKey);
    }

    /* ========== INTERNAL FUNCTIONS ========== */

    function remitFee(IExchangeRates _exRates, ISynthetix _synthetix, uint fee, bytes32 currencyKey) internal {
        // Remit the fee in sUSDs
        uint usdFeeAmount = _exRates.effectiveValue(currencyKey, fee, sUSD);
        _synthetix.synths(sUSD).issue(feePool().FEE_ADDRESS(), usdFeeAmount);
        // Tell the fee pool about this.
        feePool().recordFeePaid(usdFeeAmount);
    }

    function _internalSettle(address from, bytes32 currencyKey)
        internal
        returns (uint reclaimed, uint refunded, uint numEntriesSettled)
    {
        require(maxSecsLeftInWaitingPeriod(from, currencyKey) == 0, "Cannot settle during waiting period");

        (uint reclaimAmount, uint rebateAmount, uint entries) = settlementOwing(from, currencyKey);

        if (reclaimAmount > rebateAmount) {
            reclaimed = reclaimAmount.sub(rebateAmount);
            reclaim(from, currencyKey, reclaimed);
        } else if (rebateAmount > reclaimAmount) {
            refunded = rebateAmount.sub(reclaimAmount);
            refund(from, currencyKey, refunded);
        }

        numEntriesSettled = entries;

        // Now remove all entries, even if no reclaim and no rebate
        exchangeState().removeEntries(from, currencyKey);
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
    ) internal view returns (uint amountReceived, uint fee) {
        // What's the fee on that currency that we should deduct?
        amountReceived = destinationAmount;

        // Get the exchange fee rate
        uint exchangeFeeRate = feeRateForExchange(sourceCurrencyKey, destinationCurrencyKey);

        amountReceived = destinationAmount.multiplyDecimal(SafeDecimalMath.unit().sub(exchangeFeeRate));

        fee = destinationAmount.sub(amountReceived);
    }

    function appendExchange(address account, bytes32 src, uint amount, bytes32 dest, uint amountReceived) internal {
        IExchangeRates exRates = exchangeRates();
        uint roundIdForSrc = exRates.getCurrentRoundId(src);
        uint roundIdForDest = exRates.getCurrentRoundId(dest);
        uint exchangeFeeRate = feePool().exchangeFeeRate();
        exchangeState().appendExchangeEntry(
            account,
            src,
            amount,
            dest,
            amountReceived,
            exchangeFeeRate,
            now,
            roundIdForSrc,
            roundIdForDest
        );
    }

    function getRoundIdsAtPeriodEnd(address account, bytes32 currencyKey, uint index)
        internal
        view
        returns (uint srcRoundIdAtPeriodEnd, uint destRoundIdAtPeriodEnd)
    {
        (bytes32 src, , bytes32 dest, , , uint timestamp, uint roundIdForSrc, uint roundIdForDest) = exchangeState()
            .getEntryAt(account, currencyKey, index);

        IExchangeRates exRates = exchangeRates();
        srcRoundIdAtPeriodEnd = exRates.getLastRoundIdBeforeElapsedSecs(src, roundIdForSrc, timestamp, waitingPeriodSecs);
        destRoundIdAtPeriodEnd = exRates.getLastRoundIdBeforeElapsedSecs(dest, roundIdForDest, timestamp, waitingPeriodSecs);
    }

    // ========== MODIFIERS ==========

    modifier onlySynthetixorSynth() {
        ISynthetix _synthetix = synthetix();
        require(
            msg.sender == address(_synthetix) || _synthetix.synthsByAddress(msg.sender) != bytes32(0),
            "Exchanger: Only synthetix or a synth contract can perform this action"
        );
        _;
    }
}
