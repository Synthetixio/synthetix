/*
-----------------------------------------------------------------
FILE INFORMATION
-----------------------------------------------------------------

file:       FeePool.sol
version:    1.0
author:     Kevin Brown
date:       2018-10-15

-----------------------------------------------------------------
MODULE DESCRIPTION
-----------------------------------------------------------------

The FeePool is a place for users to interact with the fees that
have been generated from the Synthetix system if they've helped
to create the economy.

Users stake Synthetix to create Synths. As Synth users transact,
a small fee is deducted from exchange transactions, which collects
in the fee pool. Fees are immediately converted to XDRs, a type
of reserve currency similar to SDRs used by the IMF:
https://www.imf.org/en/About/Factsheets/Sheets/2016/08/01/14/51/Special-Drawing-Right-SDR

Users are entitled to withdraw fees from periods that they participated
in fully, e.g. they have to stake before the period starts. They
can withdraw fees for the last 6 periods as a single lump sum.
Currently fee periods are 7 days long, meaning it's assumed
users will withdraw their fees approximately once a month. Fees
which are not withdrawn are redistributed to the whole pool,
enabling these non-claimed fees to go back to the rest of the commmunity.

Fees can be withdrawn in any synth currency.

-----------------------------------------------------------------
*/

pragma solidity 0.4.25;

import "./Proxyable.sol";
import "./SelfDestructible.sol";
import "./SafeDecimalMath.sol";
import "./Synthetix.sol";
import "./ISynthetixEscrow.sol";
import "./ISynthetixState.sol";
import "./Synth.sol";
import "./FeePoolState.sol";
import "./FeePoolEternalStorage.sol";
import "./DelegateApprovals.sol";

contract FeePool is Proxyable, SelfDestructible, LimitedSetup {

    using SafeMath for uint;
    using SafeDecimalMath for uint;

    Synthetix public synthetix;
    ISynthetixState public synthetixState;
    ISynthetixEscrow public rewardEscrow;
    FeePoolEternalStorage public feePoolEternalStorage;

    // A percentage fee charged on each transfer.
    uint public transferFeeRate;

    // Transfer fee may not exceed 10%.
    uint constant public MAX_TRANSFER_FEE_RATE = SafeDecimalMath.unit() / 10;

    // A percentage fee charged on each exchange between currencies.
    uint public exchangeFeeRate;

    // Exchange fee may not exceed 10%.
    uint constant public MAX_EXCHANGE_FEE_RATE = SafeDecimalMath.unit() / 10;

    // The address with the authority to distribute fees.
    address public feeAuthority;

    // The address to the FeePoolState Contract.
    FeePoolState public feePoolState;

    // The address to the DelegateApproval contract.
    DelegateApprovals public delegates;

    // Where fees are pooled in XDRs.
    address public constant FEE_ADDRESS = 0xfeEFEEfeefEeFeefEEFEEfEeFeefEEFeeFEEFEeF;

    // This struct represents the issuance activity that's happened in a fee period.
    struct FeePeriod {
        uint feePeriodId;
        uint startingDebtIndex;
        uint startTime;
        uint feesToDistribute;
        uint feesClaimed;
        uint rewardsToDistribute;
        uint rewardsClaimed;
    }

    // The last 6 fee periods are all that you can claim from.
    // These are stored and managed from [0], such that [0] is always
    // the most recent fee period, and [5] is always the oldest fee
    // period that users can claim for.
    uint8 constant public FEE_PERIOD_LENGTH = 6;

    FeePeriod[FEE_PERIOD_LENGTH] public recentFeePeriods;

    // How long a fee period lasts at a minimum. It is required for the
    // fee authority to roll over the periods, so they are not guaranteed
    // to roll over at exactly this duration, but the contract enforces
    // that they cannot roll over any quicker than this duration.
    uint public feePeriodDuration = 1 weeks;
    // The fee period must be between 1 day and 60 days.
    uint public constant MIN_FEE_PERIOD_DURATION = 1 days;
    uint public constant MAX_FEE_PERIOD_DURATION = 60 days;

    // Users receive penalties if their collateralisation ratio drifts out of our desired brackets
    // We precompute the brackets and penalties to save gas.
    uint constant TWENTY_PERCENT = (20 * SafeDecimalMath.unit()) / 100;
    uint constant TWENTY_TWO_PERCENT = (22 * SafeDecimalMath.unit()) / 100;
    uint constant TWENTY_FIVE_PERCENT = (25 * SafeDecimalMath.unit()) / 100;
    uint constant THIRTY_PERCENT = (30 * SafeDecimalMath.unit()) / 100;
    uint constant FOURTY_PERCENT = (40 * SafeDecimalMath.unit()) / 100;
    uint constant FIFTY_PERCENT = (50 * SafeDecimalMath.unit()) / 100;
    uint constant SEVENTY_FIVE_PERCENT = (75 * SafeDecimalMath.unit()) / 100;
    uint constant NINETY_PERCENT = (90 * SafeDecimalMath.unit()) / 100;
    uint constant ONE_HUNDRED_PERCENT = (100 * SafeDecimalMath.unit()) / 100;

    /* ========== ETERNAL STORAGE CONSTANTS ========== */

    bytes32 constant LAST_FEE_WITHDRAWAL = "last_fee_withdrawal";

    constructor(
        address _proxy,
        address _owner,
        Synthetix _synthetix,
        FeePoolState _feePoolState,
        FeePoolEternalStorage _feePoolEternalStorage,
        ISynthetixState _synthetixState,
        ISynthetixEscrow _rewardEscrow,
        address _feeAuthority,
        uint _transferFeeRate,
        uint _exchangeFeeRate)
        SelfDestructible(_owner)
        Proxyable(_proxy, _owner)
        LimitedSetup(3 weeks)
        public
    {
        // Constructed fee rates should respect the maximum fee rates.
        require(_transferFeeRate <= MAX_TRANSFER_FEE_RATE, "Constructed transfer fee rate should respect the maximum fee rate");
        require(_exchangeFeeRate <= MAX_EXCHANGE_FEE_RATE, "Constructed exchange fee rate should respect the maximum fee rate");

        synthetix = _synthetix;
        feePoolState = _feePoolState;
        feePoolEternalStorage = _feePoolEternalStorage;
        rewardEscrow = _rewardEscrow;
        synthetixState = _synthetixState;
        feeAuthority = _feeAuthority;
        transferFeeRate = _transferFeeRate;
        exchangeFeeRate = _exchangeFeeRate;

        // Set our initial fee period
        recentFeePeriods[0].feePeriodId = 1;
        recentFeePeriods[0].startTime = now;
    }

    /**
     * @notice Logs an accounts issuance data per fee period
     * @param account Message.Senders account address
     * @param debtRatio Debt percentage this account has locked after minting or burning their synth
     * @param debtEntryIndex The index in the global debt ledger. synthetix.synthetixState().issuanceData(account)
     * @dev onlySynthetix to call me on synthetix.issue() & synthetix.burn() calls to store the locked SNX
     * per fee period so we know to allocate the correct proportions of fees and rewards per period
     */
    function appendAccountIssuanceRecord(address account, uint debtRatio, uint debtEntryIndex)
        external
        onlySynthetix
    {
        feePoolState.appendAccountIssuanceRecord(account, debtRatio, debtEntryIndex, recentFeePeriods[0].startingDebtIndex);

        emitIssuanceDebtRatioEntry(account, debtRatio, debtEntryIndex, recentFeePeriods[0].startingDebtIndex);
    }

    /**
     * @notice Set the exchange fee, anywhere within the range 0-10%.
     * @dev The fee rate is in decimal format, with UNIT being the value of 100%.
     */
    function setExchangeFeeRate(uint _exchangeFeeRate)
        external
        optionalProxy_onlyOwner
    {
        require(_exchangeFeeRate <= MAX_EXCHANGE_FEE_RATE, "Exchange fee rate must be below MAX_EXCHANGE_FEE_RATE");

        exchangeFeeRate = _exchangeFeeRate;

        emitExchangeFeeUpdated(_exchangeFeeRate);
    }

    /**
     * @notice Set the transfer fee, anywhere within the range 0-10%.
     * @dev The fee rate is in decimal format, with UNIT being the value of 100%.
     */
    function setTransferFeeRate(uint _transferFeeRate)
        external
        optionalProxy_onlyOwner
    {
        require(_transferFeeRate <= MAX_TRANSFER_FEE_RATE, "Transfer fee rate must be below MAX_TRANSFER_FEE_RATE");

        transferFeeRate = _transferFeeRate;

        emitTransferFeeUpdated(_transferFeeRate);
    }

    /**
     * @notice Set the address of the user/contract responsible for collecting or
     * distributing fees.
     */
    function setFeeAuthority(address _feeAuthority)
        external
        optionalProxy_onlyOwner
    {
        feeAuthority = _feeAuthority;

        emitFeeAuthorityUpdated(_feeAuthority);
    }

    /**
     * @notice Set the address of the contract for feePool state
     */
    function setFeePoolState(FeePoolState _feePoolState)
        external
        optionalProxy_onlyOwner
    {
        feePoolState = _feePoolState;

        emitFeePoolStateUpdated(_feePoolState);
    }

    /**
     * @notice Set the address of the contract for delegate approvals
     */
    function setDelegateApprovals(DelegateApprovals _delegates)
        external
        optionalProxy_onlyOwner
    {
        delegates = _delegates;

        emitDelegateApprovalsUpdated(_delegates);
    }

    /**
     * @notice Set the fee period duration
     */
    function setFeePeriodDuration(uint _feePeriodDuration)
        external
        optionalProxy_onlyOwner
    {
        require(_feePeriodDuration >= MIN_FEE_PERIOD_DURATION, "New fee period cannot be less than minimum fee period duration");
        require(_feePeriodDuration <= MAX_FEE_PERIOD_DURATION, "New fee period cannot be greater than maximum fee period duration");

        feePeriodDuration = _feePeriodDuration;

        emitFeePeriodDurationUpdated(_feePeriodDuration);
    }

    /**
     * @notice Set the synthetix contract
     */
    function setSynthetix(Synthetix _synthetix)
        external
        optionalProxy_onlyOwner
    {
        require(address(_synthetix) != address(0), "New Synthetix must be non-zero");

        synthetix = _synthetix;

        emitSynthetixUpdated(_synthetix);
    }

    /**
     * @notice The Synthetix contract informs us when fees are paid.
     */
    function feePaid(bytes4 currencyKey, uint amount)
        external
        onlySynthetix
    {
        uint xdrAmount;

        if (currencyKey != "XDR") {
            xdrAmount = synthetix.effectiveValue(currencyKey, amount, "XDR");
        } else {
            xdrAmount = amount;
        }

        // Keep track of in XDRs in our fee pool.
        recentFeePeriods[0].feesToDistribute = recentFeePeriods[0].feesToDistribute.add(xdrAmount);
    }

    /**
     * @notice The Synthetix contract informs us when SNX Rewards are minted to RewardEscrow to be claimed.
     */
    function rewardsMinted(uint amount)
        external
        onlySynthetix
    {
        // Add the newly minted SNX rewards on top of the rolling unclaimed amount
        recentFeePeriods[0].rewardsToDistribute = recentFeePeriods[0].rewardsToDistribute.add(amount);
    }

    /**
     * @notice Close the current fee period and start a new one. Only callable by the fee authority.
     */
    function closeCurrentFeePeriod()
        external
        optionalProxy_onlyFeeAuthority
    {
        require(recentFeePeriods[0].startTime <= (now - feePeriodDuration), "It is too early to close the current fee period");

        FeePeriod memory secondLastFeePeriod = recentFeePeriods[FEE_PERIOD_LENGTH - 2];
        FeePeriod memory lastFeePeriod = recentFeePeriods[FEE_PERIOD_LENGTH - 1];

        // Any unclaimed fees from the last period in the array roll back one period.
        // Because of the subtraction here, they're effectively proportionally redistributed to those who
        // have already claimed from the old period, available in the new period.
        // The subtraction is important so we don't create a ticking time bomb of an ever growing
        // number of fees that can never decrease and will eventually overflow at the end of the fee pool.
        recentFeePeriods[FEE_PERIOD_LENGTH - 2].feesToDistribute = lastFeePeriod.feesToDistribute
            .sub(lastFeePeriod.feesClaimed)
            .add(secondLastFeePeriod.feesToDistribute);
        recentFeePeriods[FEE_PERIOD_LENGTH - 2].rewardsToDistribute = lastFeePeriod.rewardsToDistribute
            .sub(lastFeePeriod.rewardsClaimed)
            .add(secondLastFeePeriod.rewardsToDistribute);

        // Shift the previous fee periods across to make room for the new one.
        // Condition checks for overflow when uint subtracts one from zero
        // Could be written with int instead of uint, but then we have to convert everywhere
        // so it felt better from a gas perspective to just change the condition to check
        // for overflow after subtracting one from zero.
        for (uint i = FEE_PERIOD_LENGTH - 2; i < FEE_PERIOD_LENGTH; i--) {
            uint next = i + 1;
            recentFeePeriods[next].feePeriodId = recentFeePeriods[i].feePeriodId;
            recentFeePeriods[next].startingDebtIndex = recentFeePeriods[i].startingDebtIndex;
            recentFeePeriods[next].startTime = recentFeePeriods[i].startTime;
            recentFeePeriods[next].feesToDistribute = recentFeePeriods[i].feesToDistribute;
            recentFeePeriods[next].feesClaimed = recentFeePeriods[i].feesClaimed;
            recentFeePeriods[next].rewardsToDistribute = recentFeePeriods[i].rewardsToDistribute;
            recentFeePeriods[next].rewardsClaimed = recentFeePeriods[i].rewardsClaimed;
        }

        // Clear the first element of the array to make sure we don't have any stale values.
        delete recentFeePeriods[0];

        // Open up the new fee period. Take a snapshot of the total value of the system.
        // Increment periodId from the recent closed period feePeriodId
        recentFeePeriods[0].feePeriodId = recentFeePeriods[1].feePeriodId.add(1);
        recentFeePeriods[0].startingDebtIndex = synthetixState.debtLedgerLength();
        recentFeePeriods[0].startTime = now;

        emitFeePeriodClosed(recentFeePeriods[1].feePeriodId);
    }

    /**
    * @notice Claim fees for last period when available or not already withdrawn.
    * @param currencyKey Synth currency you wish to receive the fees in.
    */
    function claimFees(bytes4 currencyKey)
        external
        optionalProxy
        returns (bool)
    {
        return _claimFees(messageSender, currencyKey);
    }

    function claimOnBehalf(address claimingForAddress, bytes4 currencyKey)
        external
        optionalProxy
        returns (bool)
    {
        require(delegates.approval(claimingForAddress, messageSender), "Not approved to claim on behalf this address");

        return _claimFees(claimingForAddress, currencyKey);
    }

    function _claimFees(address claimingAddress, bytes4 currencyKey)
        internal
        returns (bool)
    {
        uint availableFees;
        uint availableRewards;
        (availableFees, availableRewards) = feesAvailable(claimingAddress, "XDR");

        require(availableFees > 0 || availableRewards > 0, "No fees or rewards available for period, or fees already claimed");

        _setLastFeeWithdrawal(claimingAddress, recentFeePeriods[1].feePeriodId);

        if (availableFees > 0) {
            // Record the fee payment in our recentFeePeriods
            uint feesPaid = _recordFeePayment(availableFees);

            // Send them their fees
            _payFees(claimingAddress, feesPaid, currencyKey);

            emitFeesClaimed(claimingAddress, feesPaid);
        }

        if (availableRewards > 0) {
            // Record the reward payment in our recentFeePeriods
            uint rewardPaid = _recordRewardPayment(availableRewards);

            // Send them their rewards
            _payRewards(claimingAddress, rewardPaid);

            emitRewardsClaimed(claimingAddress, rewardPaid);
        }

        return true;
    }

    function importFeePeriod(
        uint feePeriodIndex, uint feePeriodId, uint startingDebtIndex, uint startTime,
        uint feesToDistribute, uint feesClaimed, uint rewardsToDistribute, uint rewardsClaimed)
        public
        optionalProxy_onlyOwner
        onlyDuringSetup
    {
        recentFeePeriods[feePeriodIndex].feePeriodId = feePeriodId;
        recentFeePeriods[feePeriodIndex].startingDebtIndex = startingDebtIndex;
        recentFeePeriods[feePeriodIndex].startTime = startTime;
        recentFeePeriods[feePeriodIndex].feesToDistribute = feesToDistribute;
        recentFeePeriods[feePeriodIndex].feesClaimed = feesClaimed;
        recentFeePeriods[feePeriodIndex].rewardsToDistribute = rewardsToDistribute;
        recentFeePeriods[feePeriodIndex].rewardsClaimed = rewardsClaimed;
    }

    function approveClaimOnBehalf(address account)
        public
        optionalProxy
    {
        require(delegates != address(0), "Delegates Approval destination missing");
        require(account != address(0), "Can't delegate to address(0)");
        delegates.setApproval(messageSender, account);
    }

    function removeClaimOnBehalf(address account)
        public
        optionalProxy
    {
        require(delegates != address(0), "Delegates Approval destination missing");
        delegates.withdrawApproval(messageSender, account);
    }

    /**
     * @notice Record the fee payment in our recentFeePeriods.
     * @param xdrAmount The amount of fees priced in XDRs.
     */
    function _recordFeePayment(uint xdrAmount)
        internal
        returns (uint)
    {
        // Don't assign to the parameter
        uint remainingToAllocate = xdrAmount;

        uint feesPaid;
        // Start at the oldest period and record the amount, moving to newer periods
        // until we've exhausted the amount.
        // The condition checks for overflow because we're going to 0 with an unsigned int.
        for (uint i = FEE_PERIOD_LENGTH - 1; i < FEE_PERIOD_LENGTH; i--) {
            uint delta = recentFeePeriods[i].feesToDistribute.sub(recentFeePeriods[i].feesClaimed);

            if (delta > 0) {
                // Take the smaller of the amount left to claim in the period and the amount we need to allocate
                uint amountInPeriod = delta < remainingToAllocate ? delta : remainingToAllocate;

                recentFeePeriods[i].feesClaimed = recentFeePeriods[i].feesClaimed.add(amountInPeriod);
                remainingToAllocate = remainingToAllocate.sub(amountInPeriod);
                feesPaid = feesPaid.add(amountInPeriod);

                // No need to continue iterating if we've recorded the whole amount;
                if (remainingToAllocate == 0) return feesPaid;

                // We've exhausted feePeriods to distribute and no fees remain in last period
                // User last to claim would in this scenario have their remainder slashed
                if (i == 0 && remainingToAllocate > 0) {
                    remainingToAllocate = 0;
                }
            }
        }

        return feesPaid;
    }

    /**
     * @notice Record the reward payment in our recentFeePeriods.
     * @param snxAmount The amount of SNX tokens.
     */
    function _recordRewardPayment(uint snxAmount)
        internal
        returns (uint)
    {
        // Don't assign to the parameter
        uint remainingToAllocate = snxAmount;

        uint rewardPaid;

        // Start at the oldest period and record the amount, moving to newer periods
        // until we've exhausted the amount.
        // The condition checks for overflow because we're going to 0 with an unsigned int.
        for (uint i = FEE_PERIOD_LENGTH - 1; i < FEE_PERIOD_LENGTH; i--) {
            uint toDistribute = recentFeePeriods[i].rewardsToDistribute.sub(recentFeePeriods[i].rewardsClaimed);

            if (toDistribute > 0) {
                // Take the smaller of the amount left to claim in the period and the amount we need to allocate
                uint amountInPeriod = toDistribute < remainingToAllocate ? toDistribute : remainingToAllocate;

                recentFeePeriods[i].rewardsClaimed = recentFeePeriods[i].rewardsClaimed.add(amountInPeriod);
                remainingToAllocate = remainingToAllocate.sub(amountInPeriod);
                rewardPaid = rewardPaid.add(amountInPeriod);

                // No need to continue iterating if we've recorded the whole amount;
                if (remainingToAllocate == 0) return rewardPaid;

                // We've exhausted feePeriods to distribute and no rewards remain in last period
                // User last to claim would in this scenario have their remainder slashed
                // due to rounding up of PreciseDecimal
                if (i == 0 && remainingToAllocate > 0) {
                    remainingToAllocate = 0;
                }
            }
        }
        return rewardPaid;
    }

    /**
    * @notice Send the fees to claiming address.
    * @param account The address to send the fees to.
    * @param xdrAmount The amount of fees priced in XDRs.
    * @param destinationCurrencyKey The synth currency the user wishes to receive their fees in (convert to this currency).
    */
    function _payFees(address account, uint xdrAmount, bytes4 destinationCurrencyKey)
        internal
        notFeeAddress(account)
    {
        require(account != address(0), "Account can't be 0");
        require(account != address(this), "Can't send fees to fee pool");
        require(account != address(proxy), "Can't send fees to proxy");
        require(account != address(synthetix), "Can't send fees to synthetix");

        Synth xdrSynth = synthetix.synths("XDR");
        Synth destinationSynth = synthetix.synths(destinationCurrencyKey);

        // Note: We don't need to check the fee pool balance as the burn() below will do a safe subtraction which requires
        // the subtraction to not overflow, which would happen if the balance is not sufficient.

        // Burn the source amount
        xdrSynth.burn(FEE_ADDRESS, xdrAmount);

        // How much should they get in the destination currency?
        uint destinationAmount = synthetix.effectiveValue("XDR", xdrAmount, destinationCurrencyKey);

        // There's no fee on withdrawing fees, as that'd be way too meta.

        // Mint their new synths
        destinationSynth.issue(account, destinationAmount);

        // Nothing changes as far as issuance data goes because the total value in the system hasn't changed.

        // Call the ERC223 transfer callback if needed
        destinationSynth.triggerTokenFallbackIfNeeded(FEE_ADDRESS, account, destinationAmount);
    }

    /**
    * @notice Send the rewards to claiming address - will be locked in rewardEscrow.
    * @param account The address to send the fees to.
    * @param snxAmount The amount of SNX.
    */
    function _payRewards(address account, uint snxAmount)
        internal
        notFeeAddress(account)
    {
        require(account != address(0), "Account can't be 0");
        require(account != address(this), "Can't send rewards to fee pool");
        require(account != address(proxy), "Can't send rewards to proxy");
        require(account != address(synthetix), "Can't send rewards to synthetix");

        // Record vesting entry for claiming address and amount
        // SNX already minted to rewardEscrow balance
        rewardEscrow.appendVestingEntry(account, snxAmount);
    }

    /**
     * @notice Calculate the Fee charged on top of a value being sent
     * @return Return the fee charged
     */
    function transferFeeIncurred(uint value)
        public
        view
        returns (uint)
    {
        return value.multiplyDecimal(transferFeeRate);

        // Transfers less than the reciprocal of transferFeeRate should be completely eaten up by fees.
        // This is on the basis that transfers less than this value will result in a nil fee.
        // Probably too insignificant to worry about, but the following code will achieve it.
        //      if (fee == 0 && transferFeeRate != 0) {
        //          return _value;
        //      }
        //      return fee;
    }

    /**
     * @notice The value that you would need to send so that the recipient receives
     * a specified value.
     * @param value The value you want the recipient to receive
     */
    function transferredAmountToReceive(uint value)
        external
        view
        returns (uint)
    {
        return value.add(transferFeeIncurred(value));
    }

    /**
     * @notice The amount the recipient will receive if you send a certain number of tokens.
     * @param value The amount of tokens you intend to send.
     */
    function amountReceivedFromTransfer(uint value)
        external
        view
        returns (uint)
    {
        return value.divideDecimal(transferFeeRate.add(SafeDecimalMath.unit()));
    }

    /**
     * @notice Calculate the fee charged on top of a value being sent via an exchange
     * @return Return the fee charged
     */
    function exchangeFeeIncurred(uint value)
        public
        view
        returns (uint)
    {
        return value.multiplyDecimal(exchangeFeeRate);

        // Exchanges less than the reciprocal of exchangeFeeRate should be completely eaten up by fees.
        // This is on the basis that exchanges less than this value will result in a nil fee.
        // Probably too insignificant to worry about, but the following code will achieve it.
        //      if (fee == 0 && exchangeFeeRate != 0) {
        //          return _value;
        //      }
        //      return fee;
    }

    /**
     * @notice The value that you would need to get after currency exchange so that the recipient receives
     * a specified value.
     * @param value The value you want the recipient to receive
     */
    function exchangedAmountToReceive(uint value)
        external
        view
        returns (uint)
    {
        return value.add(exchangeFeeIncurred(value));
    }

    /**
     * @notice The amount the recipient will receive if you are performing an exchange and the
     * destination currency will be worth a certain number of tokens.
     * @param value The amount of destination currency tokens they received after the exchange.
     */
    function amountReceivedFromExchange(uint value)
        external
        view
        returns (uint)
    {
        return value.multiplyDecimal(SafeDecimalMath.unit().sub(exchangeFeeRate));
    }

    /**
     * @notice The total fees available in the system to be withdrawn, priced in currencyKey currency
     * @param currencyKey The currency you want to price the fees in
     */
    function totalFeesAvailable(bytes4 currencyKey)
        external
        view
        returns (uint)
    {
        uint totalFees = 0;

        // Fees in fee period [0] are not yet available for withdrawal
        for (uint i = 1; i < FEE_PERIOD_LENGTH; i++) {
            totalFees = totalFees.add(recentFeePeriods[i].feesToDistribute);
            totalFees = totalFees.sub(recentFeePeriods[i].feesClaimed);
        }

        return synthetix.effectiveValue("XDR", totalFees, currencyKey);
    }

    /**
     * @notice The total SNX rewards available in the system to be withdrawn
     */
    function totalRewardsAvailable()
        external
        view
        returns (uint)
    {
        uint totalRewards = 0;

        // Rewards in fee period [0] are not yet available for withdrawal
        for (uint i = 1; i < FEE_PERIOD_LENGTH; i++) {
            totalRewards = totalRewards.add(recentFeePeriods[i].rewardsToDistribute);
            totalRewards = totalRewards.sub(recentFeePeriods[i].rewardsClaimed);
        }

        return totalRewards;
    }

    /**
     * @notice The fees available to be withdrawn by a specific account, priced in currencyKey currency
     * @dev Returns two amounts, one for fees and one for SNX rewards
     * @param currencyKey The currency you want to price the fees in
     */
    function feesAvailable(address account, bytes4 currencyKey)
        public
        view
        returns (uint, uint)
    {
        // Add up the fees
        uint[2][FEE_PERIOD_LENGTH] memory userFees = feesByPeriod(account);

        uint totalFees = 0;
        uint totalRewards = 0;

        // Fees & Rewards in fee period [0] are not yet available for withdrawal
        for (uint i = 1; i < FEE_PERIOD_LENGTH; i++) {
            totalFees = totalFees.add(userFees[i][0]);
            totalRewards = totalRewards.add(userFees[i][1]);
        }

        // And convert totalFees to their desired currency
        // Return totalRewards as is in SNX amount
        return (
            synthetix.effectiveValue("XDR", totalFees, currencyKey),
            totalRewards
        );
    }

    /**
     * @notice The penalty a particular address would incur if its fees were withdrawn right now
     * @param account The address you want to query the penalty for
     */
    function currentPenalty(address account)
        public
        view
        returns (uint)
    {
        uint ratio = synthetix.collateralisationRatio(account);

        // Users receive a different amount of fees depending on how their collateralisation ratio looks right now.
        //  0% < 20% (∞ - 500%):    Fee is calculated based on percentage of economy issued.
        // 20% - 22% (500% - 454%):  0% reduction in fees
        // 22% - 30% (454% - 333%): 25% reduction in fees
        // 30% - 40% (333% - 250%): 50% reduction in fees
        // 40% - 50% (250% - 200%): 75% reduction in fees
        //     > 50% (200% - 100%): 90% reduction in fees
        //     > 100%(100% -   0%):100% reduction in fees
        if (ratio <= TWENTY_PERCENT) {
            return 0;
        } else if (ratio > TWENTY_PERCENT && ratio <= TWENTY_TWO_PERCENT) {
            return 0;
        } else if (ratio > TWENTY_TWO_PERCENT && ratio <= THIRTY_PERCENT) {
            return TWENTY_FIVE_PERCENT;
        } else if (ratio > THIRTY_PERCENT && ratio <= FOURTY_PERCENT) {
            return FIFTY_PERCENT;
        } else if (ratio > FOURTY_PERCENT && ratio <= FIFTY_PERCENT) {
            return SEVENTY_FIVE_PERCENT;
        } else if (ratio > FIFTY_PERCENT && ratio <= ONE_HUNDRED_PERCENT) {
            return NINETY_PERCENT;
        }
        return ONE_HUNDRED_PERCENT;
    }

    /**
     * @notice Calculates fees by period for an account, priced in XDRs
     * @param account The address you want to query the fees by penalty for
     */
    function feesByPeriod(address account)
        public
        view
        returns (uint[2][FEE_PERIOD_LENGTH] memory results)
    {
        // What's the user's debt entry index and the debt they owe to the system at current feePeriod
        uint userOwnershipPercentage;
        uint debtEntryIndex;
        (userOwnershipPercentage, debtEntryIndex) = feePoolState.getAccountsDebtEntry(account, 0);

        // If they don't have any debt ownership and they haven't minted, they don't have any fees
        if (debtEntryIndex == 0 && userOwnershipPercentage == 0) return;

        // If there are no XDR synths, then they don't have any fees
        if (synthetix.totalIssuedSynths("XDR") == 0) return;

        uint penalty = currentPenalty(account);

        // The [0] fee period is not yet ready to claim, but it is a fee period that they can have
        // fees owing for, so we need to report on it anyway.
        uint feesFromPeriod;
        uint rewardsFromPeriod;
        (feesFromPeriod, rewardsFromPeriod) = _feesAndRewardsFromPeriod(0, userOwnershipPercentage, debtEntryIndex, penalty);

        results[0][0] = feesFromPeriod;
        results[0][1] = rewardsFromPeriod;

        // Go through our fee periods from the oldest feePeriod[FEE_PERIOD_LENGTH - 1] and figure out what we owe them.
        // Condition checks for periods > 0
        for (uint i = FEE_PERIOD_LENGTH - 1; i > 0; i--) {
            uint next = i - 1;
            FeePeriod memory nextPeriod = recentFeePeriods[next];

            // We can skip period if no debt minted during period
            if (nextPeriod.startingDebtIndex > 0 &&
            getLastFeeWithdrawal(account) < recentFeePeriods[i].feePeriodId) {

                // We calculate a feePeriod's closingDebtIndex by looking at the next feePeriod's startingDebtIndex
                // we can use the most recent issuanceData[0] for the current feePeriod
                // else find the applicableIssuanceData for the feePeriod based on the StartingDebtIndex of the period
                uint closingDebtIndex = nextPeriod.startingDebtIndex.sub(1);

                // Gas optimisation - to reuse debtEntryIndex if found new applicable one
                // if applicable is 0,0 (none found) we keep most recent one from issuanceData[0]
                // return if userOwnershipPercentage = 0)
                (userOwnershipPercentage, debtEntryIndex) = feePoolState.applicableIssuanceData(account, closingDebtIndex);

                (feesFromPeriod, rewardsFromPeriod) = _feesAndRewardsFromPeriod(i, userOwnershipPercentage, debtEntryIndex, penalty);

                results[i][0] = feesFromPeriod;
                results[i][1] = rewardsFromPeriod;
            }
        }
    }

    /**
     * @notice ownershipPercentage is a high precision decimals uint based on
     * wallet's debtPercentage. Gives a precise amount of the feesToDistribute
     * for fees in the period. Precision factor is removed before results are
     * returned.
     */
    function _feesAndRewardsFromPeriod(uint period, uint ownershipPercentage, uint debtEntryIndex, uint penalty)
        internal
        returns (uint, uint)
    {
        // If it's zero, they haven't issued, and they have no fees OR rewards.
        if (ownershipPercentage == 0) return (0, 0);

        uint debtOwnershipForPeriod = ownershipPercentage;

        // If period has closed we want to calculate debtPercentage for the period
        if (period > 0) {
            uint closingDebtIndex = recentFeePeriods[period - 1].startingDebtIndex.sub(1);
            debtOwnershipForPeriod = _effectiveDebtRatioForPeriod(closingDebtIndex, ownershipPercentage, debtEntryIndex);
        }

        // Calculate their percentage of the fees / rewards in this period
        // This is a high precision integer.
        uint feesFromPeriodWithoutPenalty = recentFeePeriods[period].feesToDistribute
            .multiplyDecimal(debtOwnershipForPeriod);

        uint rewardsFromPeriodWithoutPenalty = recentFeePeriods[period].rewardsToDistribute
            .multiplyDecimal(debtOwnershipForPeriod);

        // Less their penalty if they have one.
        uint feesFromPeriod = feesFromPeriodWithoutPenalty.sub(feesFromPeriodWithoutPenalty.multiplyDecimal(penalty));

        uint rewardsFromPeriod = rewardsFromPeriodWithoutPenalty.sub(rewardsFromPeriodWithoutPenalty.multiplyDecimal(penalty));

        return (
            feesFromPeriod.preciseDecimalToDecimal(),
            rewardsFromPeriod.preciseDecimalToDecimal()
        );
    }

    function _effectiveDebtRatioForPeriod(uint closingDebtIndex, uint ownershipPercentage, uint debtEntryIndex)
        internal
        view
        returns (uint)
    {
        // Condition to check if debtLedger[] has value otherwise return 0
        if (closingDebtIndex > synthetixState.debtLedgerLength()) return 0;

        // Figure out their global debt percentage delta at end of fee Period.
        // This is a high precision integer.
        uint feePeriodDebtOwnership = synthetixState.debtLedger(closingDebtIndex)
            .divideDecimalRoundPrecise(synthetixState.debtLedger(debtEntryIndex))
            .multiplyDecimalRoundPrecise(ownershipPercentage);

        return feePeriodDebtOwnership;
    }

    function effectiveDebtRatioForPeriod(address account, uint period)
        external
        view
        returns (uint)
    {
        require(period != 0, "Current period has not closed yet");
        require(period < FEE_PERIOD_LENGTH, "Period exceeds the FEE_PERIOD_LENGTH");

        // No debt minted during period as next period starts at 0
        if (recentFeePeriods[period - 1].startingDebtIndex == 0) return;

        uint closingDebtIndex = recentFeePeriods[period - 1].startingDebtIndex.sub(1);

        uint ownershipPercentage;
        uint debtEntryIndex;
        (ownershipPercentage, debtEntryIndex) = feePoolState.applicableIssuanceData(account, closingDebtIndex);

        // internal function will check closingDebtIndex has corresponding debtLedger entry
        return _effectiveDebtRatioForPeriod(closingDebtIndex, ownershipPercentage, debtEntryIndex);
    }

    /**
     * @notice Get the feePeriodID of the last claim this account made
     * @param _claimingAddress account to check the last fee period ID claim for
     * @return uint of the feePeriodID this account last claimed
     */
    function getLastFeeWithdrawal(address _claimingAddress)
        public
        view
        returns (uint)
    {
        return feePoolEternalStorage.getUIntValue(keccak256(abi.encodePacked(LAST_FEE_WITHDRAWAL, _claimingAddress)));
    }

    /**
     * @notice Set the feePeriodID of the last claim this account made
     * @param _claimingAddress account to set the last feePeriodID claim for
     * @param _feePeriodID the feePeriodID this account claimed fees for
     */
    function _setLastFeeWithdrawal(address _claimingAddress, uint _feePeriodID)
        internal
    {
        feePoolEternalStorage.setUIntValue(keccak256(abi.encodePacked(LAST_FEE_WITHDRAWAL, _claimingAddress)), _feePeriodID);
    }

    /* ========== Modifiers ========== */

    modifier optionalProxy_onlyFeeAuthority
    {
        if (Proxy(msg.sender) != proxy) {
            messageSender = msg.sender;
        }
        require(msg.sender == feeAuthority, "Only the fee authority can perform this action");
        _;
    }

    modifier onlySynthetix
    {
        require(msg.sender == address(synthetix), "Only the synthetix contract can perform this action");
        _;
    }

    modifier notFeeAddress(address account) {
        require(account != FEE_ADDRESS, "Fee address not allowed");
        _;
    }

    /* ========== Events ========== */

    event IssuanceDebtRatioEntry(address indexed account, uint debtRatio, uint debtEntryIndex, uint feePeriodStartingDebtIndex);
    bytes32 constant ISSUANCEDEBTRATIOENTRY_SIG = keccak256("IssuanceDebtRatioEntry(address,uint256,uint256,uint256)");
    function emitIssuanceDebtRatioEntry(address account, uint debtRatio, uint debtEntryIndex, uint feePeriodStartingDebtIndex) internal {
        proxy._emit(abi.encode(debtRatio, debtEntryIndex, feePeriodStartingDebtIndex), 2, ISSUANCEDEBTRATIOENTRY_SIG, bytes32(account), 0, 0);
    }

    event TransferFeeUpdated(uint newFeeRate);
    bytes32 constant TRANSFERFEEUPDATED_SIG = keccak256("TransferFeeUpdated(uint256)");
    function emitTransferFeeUpdated(uint newFeeRate) internal {
        proxy._emit(abi.encode(newFeeRate), 1, TRANSFERFEEUPDATED_SIG, 0, 0, 0);
    }

    event ExchangeFeeUpdated(uint newFeeRate);
    bytes32 constant EXCHANGEFEEUPDATED_SIG = keccak256("ExchangeFeeUpdated(uint256)");
    function emitExchangeFeeUpdated(uint newFeeRate) internal {
        proxy._emit(abi.encode(newFeeRate), 1, EXCHANGEFEEUPDATED_SIG, 0, 0, 0);
    }

    event FeePeriodDurationUpdated(uint newFeePeriodDuration);
    bytes32 constant FEEPERIODDURATIONUPDATED_SIG = keccak256("FeePeriodDurationUpdated(uint256)");
    function emitFeePeriodDurationUpdated(uint newFeePeriodDuration) internal {
        proxy._emit(abi.encode(newFeePeriodDuration), 1, FEEPERIODDURATIONUPDATED_SIG, 0, 0, 0);
    }

    event FeeAuthorityUpdated(address newFeeAuthority);
    bytes32 constant FEEAUTHORITYUPDATED_SIG = keccak256("FeeAuthorityUpdated(address)");
    function emitFeeAuthorityUpdated(address newFeeAuthority) internal {
        proxy._emit(abi.encode(newFeeAuthority), 1, FEEAUTHORITYUPDATED_SIG, 0, 0, 0);
    }

    event FeePoolStateUpdated(address newFeePoolState);
    bytes32 constant FEEPOOLSTATEUPDATED_SIG = keccak256("FeePoolStateUpdated(address)");
    function emitFeePoolStateUpdated(address newFeePoolState) internal {
        proxy._emit(abi.encode(newFeePoolState), 1, FEEPOOLSTATEUPDATED_SIG, 0, 0, 0);
    }

    event DelegateApprovalsUpdated(address newDelegateApprovals);
    bytes32 constant DELEGATEAPPROVALSUPDATED_SIG = keccak256("DelegateApprovalsUpdated(address)");
    function emitDelegateApprovalsUpdated(address newDelegateApprovals) internal {
        proxy._emit(abi.encode(newDelegateApprovals), 1, DELEGATEAPPROVALSUPDATED_SIG, 0, 0, 0);
    }

    event FeePeriodClosed(uint feePeriodId);
    bytes32 constant FEEPERIODCLOSED_SIG = keccak256("FeePeriodClosed(uint256)");
    function emitFeePeriodClosed(uint feePeriodId) internal {
        proxy._emit(abi.encode(feePeriodId), 1, FEEPERIODCLOSED_SIG, 0, 0, 0);
    }

    event FeesClaimed(address account, uint xdrAmount);
    bytes32 constant FEESCLAIMED_SIG = keccak256("FeesClaimed(address,uint256)");
    function emitFeesClaimed(address account, uint xdrAmount) internal {
        proxy._emit(abi.encode(account, xdrAmount), 1, FEESCLAIMED_SIG, 0, 0, 0);
    }

    event RewardsClaimed(address account, uint snxAmount);
    bytes32 constant REWARDSCLAIMED_SIG = keccak256("RewardsClaimed(address,uint256)");
    function emitRewardsClaimed(address account, uint snxAmount) internal {
        proxy._emit(abi.encode(account, snxAmount), 1, REWARDSCLAIMED_SIG, 0, 0, 0);
    }

    event SynthetixUpdated(address newSynthetix);
    bytes32 constant SYNTHETIXUPDATED_SIG = keccak256("SynthetixUpdated(address)");
    function emitSynthetixUpdated(address newSynthetix) internal {
        proxy._emit(abi.encode(newSynthetix), 1, SYNTHETIXUPDATED_SIG, 0, 0, 0);
    }
}
