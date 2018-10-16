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


-----------------------------------------------------------------
*/

pragma solidity 0.4.25;

import "./Havven.sol";
import "./Owned.sol";
import "./SafeDecimalMath.sol";

contract FeePool is Owned, SafeDecimalMath {
    Havven public havven;

    // A percentage fee charged on each transfer.
    uint public transferFeeRate;

    // Transfer fee may not exceed 10%.
    uint constant MAX_TRANSFER_FEE_RATE = UNIT / 10;

    // A percentage fee charged on each exchange between currencies.
    uint public exchangeFeeRate;

    // Exchange fee may not exceed 10%.
    uint constant MAX_EXCHANGE_FEE_RATE = UNIT / 10;
    
    // The address with the authority to distribute fees.
    address public feeAuthority;

    // Where fees are pooled in HDRs.
    address public constant FEE_ADDRESS = 0xfeEFEEfeefEeFeefEEFEEfEeFeefEEFeeFEEFEeF;

    // This struct represents the issuance activity that's happened in a fee period.
    struct FeePeriod {
        uint feePeriodId;
        uint startingDebtIndex;
        uint startTime;
        uint feesToDistribute;
        uint feesClaimed;
    }

    // The last 6 fee periods are all that you can claim from. 
    // These are stored and managed from [0], such that [0] is always
    // the most recent fee period, and [5] is always the oldest fee
    // period that users can claim for.
    uint8 constant FEE_PERIOD_LENGTH = 6;
    FeePeriod[FEE_PERIOD_LENGTH] recentFeePeriods;

    // The next fee period will have this ID.
    uint public nextFeePeriodId;

    // How long a fee period lasts at a minimum. It is required for the
    // fee authority to roll over the periods, so they are not guaranteed
    // to roll over at exactly this duration, but the contract enforces
    // that they cannot roll over any quicker than this duration.
    uint public feePeriodDuration = 1 weeks;

    // The fee period must be between 1 day and 26 weeks.
    uint constant MIN_FEE_PERIOD_DURATION = 1 days;
    uint constant MAX_FEE_PERIOD_DURATION = 26 weeks;

    // The last period a user has withdrawn their fees in, identified by the feePeriodId
    mapping(address => uint) public lastFeeWithdrawal;

    // Users receive penalties if their collateralisation ratio drifts out of our desired brackets
    // We precompute the brackets and penalties to save gas.
    uint constant TWENTY_PERCENT = (20 * UNIT) / 100;
    uint constant TWENTY_FIVE_PERCENT = (25 * UNIT) / 100;
    uint constant THIRTY_PERCENT = (30 * UNIT) / 100;
    uint constant FOURTY_PERCENT = (40 * UNIT) / 100;
    uint constant FIFTY_PERCENT = (50 * UNIT) / 100;
    uint constant SEVENTY_FIVE_PERCENT = (75 * UNIT) / 100;

    constructor(address _owner, Havven _havven, address _feeAuthority, uint _transferFeeRate, uint _exchangeFeeRate)
        Owned(_owner)
        public
    {
        // Constructed fee rates should respect the maximum fee rates.
        require(_transferFeeRate <= MAX_TRANSFER_FEE_RATE, "Constructed transfer fee rate should respect the maximum fee rate");
        require(_exchangeFeeRate <= MAX_EXCHANGE_FEE_RATE, "Constructed exchange fee rate should respect the maximum fee rate");

        havven = _havven;
        feeAuthority = _feeAuthority;
        transferFeeRate = _transferFeeRate;
        exchangeFeeRate = _exchangeFeeRate;

        // Set our initial fee period
        recentFeePeriods[0].feePeriodId = 1;
        recentFeePeriods[0].startingDebtIndex = 0;
        recentFeePeriods[0].startTime = now;
        recentFeePeriods[0].feesToDistribute = 0;

        // And the next one starts at 2.
        nextFeePeriodId = 2;
    }


    /**
     * @notice Set the exchange fee, anywhere within the range 0-10%.
     * @dev The fee rate is in decimal format, with UNIT being the value of 100%.
     */
    function setExchangeFeeRate(uint _exchangeFeeRate)
        external
        onlyOwner
    {
        require(_exchangeFeeRate <= MAX_TRANSFER_FEE_RATE, "Exchange fee rate must be below MAX_EXCHANGE_FEE_RATE");

        exchangeFeeRate = _exchangeFeeRate;

        emit ExchangeFeeRateUpdated(_exchangeFeeRate);
    }

    /**
     * @notice Set the transfer fee, anywhere within the range 0-10%.
     * @dev The fee rate is in decimal format, with UNIT being the value of 100%.
     */
    function setTransferFeeRate(uint _transferFeeRate)
        external
        onlyOwner
    {
        require(_transferFeeRate <= MAX_TRANSFER_FEE_RATE, "Transfer fee rate must be below MAX_TRANSFER_FEE_RATE");

        transferFeeRate = _transferFeeRate;

        emit TransferFeeRateUpdated(_transferFeeRate);
    }

    /**
     * @notice Set the address of the user/contract responsible for collecting or
     * distributing fees.
     */
    function setFeeAuthority(address _feeAuthority)
        public
        onlyOwner
    {
        feeAuthority = _feeAuthority;

        emit FeeAuthorityUpdated(_feeAuthority);
    }

    /**
     * @notice Set the fee period duration
     */
    function setFeePeriodDuration(uint _feePeriodDuration)
        public
        onlyOwner
    {
        require(_feePeriodDuration >= MIN_FEE_PERIOD_DURATION, "New fee period cannot be less than minimum fee period duration");
        require(_feePeriodDuration <= MAX_FEE_PERIOD_DURATION, "New fee period cannot be greater than maximum fee period duration");

        feePeriodDuration = _feePeriodDuration;

        emit FeePeriodDurationUpdated(_feePeriodDuration);
    }

    /**
     * @notice Set the havven contract
     */
    function setHavven(Havven _havven)
        public
        onlyOwner
    {
        require(address(_havven) != address(0), "New Havven must be non-zero");

        havven = _havven;

        emit HavvenUpdated(_havven);
    }
    
    /**
     * @notice Close the current fee period and start a new one. Only callable by the fee authority.
     */
    function closeCurrentFeePeriod()
        external
        onlyFeeAuthority
    {
        require(recentFeePeriods[0].startTime <= (now - feePeriodDuration), "It is too early to close the current fee period");

        FeePeriod memory secondLastFeePeriod = recentFeePeriods[FEE_PERIOD_LENGTH - 2];
        FeePeriod memory lastFeePeriod = recentFeePeriods[FEE_PERIOD_LENGTH - 1];

        // Any unclaimed fees from the last period in the array roll back one period.
        recentFeePeriods[FEE_PERIOD_LENGTH - 2].feesToDistribute = safeAdd(
            safeSub(lastFeePeriod.feesToDistribute, lastFeePeriod.feesClaimed),
            secondLastFeePeriod.feesToDistribute
        );

        // Shift the previous fee periods across to make room for the new one.
        for (uint8 i = FEE_PERIOD_LENGTH - 2; i >= 0; i--) {
            recentFeePeriods[i + 1].feePeriodId = recentFeePeriods[i].feePeriodId;
            recentFeePeriods[i + 1].startingDebtIndex = recentFeePeriods[i].startingDebtIndex;
            recentFeePeriods[i + 1].startTime = recentFeePeriods[i].startTime;
            recentFeePeriods[i + 1].feesToDistribute = recentFeePeriods[i].feesToDistribute;
            recentFeePeriods[i + 1].feesClaimed = recentFeePeriods[i].feesClaimed;
        }

        // Clear the first element of the array to make sure we don't have any stale values.
        delete recentFeePeriods[0];

        // Open up the new fee period
        recentFeePeriods[0].feePeriodId = nextFeePeriodId;
        recentFeePeriods[0].startingDebtIndex = havven.debtLedgerLength();
        recentFeePeriods[0].startTime = now;

        nextFeePeriodId++;
    }

    function claimFees(bytes4 currencyKey)
        external
        returns (bool)
    {
        require(lastFeeWithdrawal[msg.sender] < recentFeePeriods[0].feePeriodId, "Fees already claimed");

        // Add up the fees
        uint[FEE_PERIOD_LENGTH] memory feesByPeriod = feesAvailableByPeriod(msg.sender);
        uint totalFees = 0;

        for (uint8 i = 0; i < FEE_PERIOD_LENGTH; i++) {
            totalFees = safeAdd(totalFees, feesByPeriod[i]);
            recentFeePeriods[i].feesClaimed = safeAdd(recentFeePeriods[i].feesClaimed, feesByPeriod[i]);
        }

        lastFeeWithdrawal[msg.sender] = recentFeePeriods[0].feePeriodId;

        // Send them their fees
        // _payFees(msg.sender, totalFees, currencyKey);

        emit FeesClaimed(msg.sender, totalFees);

        return true;
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
        return safeMul_dec(value, transferFeeRate);

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
    function transferPlusFee(uint value)
        external
        view
        returns (uint)
    {
        return safeAdd(value, transferFeeIncurred(value));
    }

    /**
     * @notice The amount the recipient will receive if you send a certain number of tokens.
     * @param value The amount of tokens you intend to send.
     */
    function amountReceivedFromTransfer(uint value)
        public
        view
        returns (uint)
    {
        return safeDiv_dec(value, safeAdd(UNIT, transferFeeRate));
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
        return safeMul_dec(value, exchangeFeeRate);

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
    function exchangePlusFee(uint value)
        external
        view
        returns (uint)
    {
        return safeAdd(value, exchangeFeeIncurred(value));
    }

    /**
     * @notice The amount the recipient will receive if you are performing an exchange and the
     * destination currency will be worth a certain number of tokens.
     * @param value The amount of destination currency tokens they received after the exchange.
     */
    function amountReceivedFromExchange(uint value)
        public
        view
        returns (uint)
    {
        return safeDiv_dec(value, safeAdd(UNIT, exchangeFeeRate));
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

        for (uint8 i = 0; i < FEE_PERIOD_LENGTH; i++) {
            totalFees = safeAdd(totalFees, recentFeePeriods[i].feesToDistribute);
            totalFees = safeSub(totalFees, recentFeePeriods[i].feesClaimed);
        }

        return havven.effectiveValue("HDR", totalFees, currencyKey);
    }

    /**
     * @notice The fees available to be withdrawn by a specific account, priced in currencyKey currency
     * @param currencyKey The currency you want to price the fees in
     */
    function feesAvailable(address account, bytes4 currencyKey)
        external
        view
        returns (uint)
    {
        // Add up the fees
        uint[FEE_PERIOD_LENGTH] memory feesByPeriod = feesAvailableByPeriod(account);

        uint totalFees = 0;

        for (uint8 i = 0; i < FEE_PERIOD_LENGTH; i++) {
            totalFees = safeAdd(totalFees, feesByPeriod[i]);
        }

        // And convert them to their desired currency
        return havven.effectiveValue("HDR", totalFees, currencyKey);
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
        uint ratio = havven.collateralisationRatio(account);

        // Users receive a different amount of fees depending on how their collateralisation ratio looks right now.
        // 0% - 20%: Fee is calculated based on percentage of economy issued.
        // 20% - 30%: 25% reduction in fees
        // 30% - 40%: 50% reduction in fees
        // 40% - 50%: 75% reduction in fees
        // >50%: 75% reduction in fees, and other users can execute a direct redemption to better manage that user's Havvens
        if (ratio <= TWENTY_PERCENT) {
            return 0;
        } else if (ratio > TWENTY_PERCENT && ratio <= THIRTY_PERCENT) {
            return TWENTY_FIVE_PERCENT;
        } else if (ratio > THIRTY_PERCENT && ratio <= FOURTY_PERCENT) {
            return FIFTY_PERCENT;
        } 

        return SEVENTY_FIVE_PERCENT;
    }

    /**
     * @notice Calculates fees by period for an account, priced in HDRs
     * @param account The address you want to query the fees by penalty for
     */
    function feesAvailableByPeriod(address account)
        public
        view
        returns (uint[FEE_PERIOD_LENGTH])
    {
        // What's the user's debt entry index and the debt they owe to the system
        uint initialDebtOwnership;
        uint debtEntryIndex;
        (initialDebtOwnership, debtEntryIndex) = havven.issuanceData(account);
        uint debtBalance = havven.debtBalanceOf(account, "HDR");
        uint totalNomins = havven.totalIssuedNomins("HDR");
        uint userOwnershipPercentage = safeDiv_dec(debtBalance, totalNomins);
        uint penalty = currentPenalty(account);

        uint[FEE_PERIOD_LENGTH] memory feesByPeriod;

        // If they don't have any debt ownership, they don't have any fees
        if (initialDebtOwnership == 0) return feesByPeriod;

        // Go through our fee periods and figure out what we owe them.
        // We start at the second fee period because the first period is still accumulating fees.
        for (uint8 i = 1; i < FEE_PERIOD_LENGTH; i++) {
            // Were they a part of this period in its entirety?
            // We don't allow pro-rata participation to reduce the ability to game the system by
            // issuing and burning multiple times in a period or close to the ends of periods.
            if (recentFeePeriods[i].startingDebtIndex >= debtEntryIndex &&
                lastFeeWithdrawal[account] < recentFeePeriods[i].feePeriodId) {

                // And since they were, they're entitled to their percentage of the fees in this period
                uint feesFromPeriodWithoutPenalty = safeMul_dec(recentFeePeriods[i].feesToDistribute, userOwnershipPercentage);

                // Less their penalty if they have one.
                uint penaltyFromPeriod = safeMul_dec(feesFromPeriodWithoutPenalty, penalty);
                uint feesFromPeriod = safeSub(feesFromPeriodWithoutPenalty, penaltyFromPeriod);

                feesByPeriod[i] = feesFromPeriod;
            }
        }

        return feesByPeriod;
    }

    modifier onlyFeeAuthority
    {
        require(msg.sender == feeAuthority, "Only the fee authority can perform this action");
        _;
    }

    event TransferFeeRateUpdated(uint newFeeRate);
    // bytes32 constant TRANSFERFEEUPDATED_SIG = keccak256("TransferFeeUpdated(uint256)");
    // function emitTransferFeeUpdated(uint newFeeRate) internal {
    //     proxy._emit(abi.encode(newFeeRate), 1, TRANSFERFEEUPDATED_SIG, 0, 0, 0);
    // }

    event ExchangeFeeRateUpdated(uint newFeeRate);
    // bytes32 constant EXCHANGEFEEUPDATED_SIG = keccak256("ExchangeFeeUpdated(uint256)");
    // function emitExchangeFeeUpdated(uint newFeeRate) internal {
    //     proxy._emit(abi.encode(newFeeRate), 1, EXCHANGEFEEUPDATED_SIG, 0, 0, 0);
    // }

    event FeePeriodDurationUpdated(uint newFeePeriodDuration);
    // bytes32 constant FEEPERIODDURATIONUPDATED_SIG = keccak256("FeePeriodDurationUpdated(uint256)");
    // function emitFeePeriodDurationUpdated(uint newFeePeriodDuration) internal {
    //     proxy._emit(abi.encode(newFeePeriodDuration), 1, FEEPERIODDURATIONUPDATED_SIG, 0, 0, 0);
    // }

    event FeeAuthorityUpdated(address newFeeAuthority);
    // bytes32 constant FEEAUTHORITYUPDATED_SIG = keccak256("FeeAuthorityUpdated(address)");
    // function emitFeeAuthorityUpdated(address newFeeAuthority) internal {
    //     proxy._emit(abi.encode(newFeeAuthority), 1, FEEAUTHORITYUPDATED_SIG, 0, 0, 0);
    // }

    event FeePeriodClosed(uint feePeriodId);
    // bytes32 constant FEEPERIODCLOSED_SIG = keccak256("FeePeriodClosed(uint256)");
    // function emitFeePeriodClosed(uint feePeriodId) internal {
    //     proxy._emit(abi.encode(feePeriodId), 1, FEEPERIODCLOSED_SIG, 0, 0, 0);
    // }

    event FeesClaimed(address account, uint hdrAmount);
    // bytes32 constant FEESCLAIMED_SIG = keccak256("FeesClaimed(address,uint256)");
    // function emitFeesClaimed(address account, uint hdrAmount) internal {
    //     proxy._emit(abi.encode(account, hdrAmount), 1, FEESCLAIMED_SIG, 0, 0, 0);
    // }

    event HavvenUpdated(Havven newHavven);
    // bytes32 constant FEESCLAIMED_SIG = keccak256("FeesClaimed(address,uint256)");
    // function emitFeesClaimed(address account, uint hdrAmount) internal {
    //     proxy._emit(abi.encode(account, hdrAmount), 1, FEESCLAIMED_SIG, 0, 0, 0);
    // }
}