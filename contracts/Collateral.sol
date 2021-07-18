pragma solidity ^0.5.16;

pragma experimental ABIEncoderV2;

// Inheritance
import "./Owned.sol";
import "./MixinSystemSettings.sol";
import "./interfaces/ICollateralLoan.sol";

// Libraries
import "./SafeDecimalMath.sol";

// Internal references
import "./CollateralState.sol";
import "./interfaces/ICollateralManager.sol";
import "./interfaces/ISystemStatus.sol";
import "./interfaces/IFeePool.sol";
import "./interfaces/IIssuer.sol";
import "./interfaces/ISynth.sol";
import "./interfaces/IERC20.sol";
import "./interfaces/IExchangeRates.sol";
import "./interfaces/IExchanger.sol";
import "./interfaces/IShortingRewards.sol";

contract Collateral is ICollateralLoan, Owned, MixinSystemSettings {
    /* ========== LIBRARIES ========== */
    using SafeMath for uint;
    using SafeDecimalMath for uint;

    /* ========== CONSTANTS ========== */

    bytes32 private constant sUSD = "sUSD";

    // ========== STATE VARIABLES ==========

    // The synth corresponding to the collateral.
    bytes32 public collateralKey;

    // Stores loans
    CollateralState public state;

    ICollateralManager public manager;

    // The synths that this contract can issue.
    bytes32[] public synths;

    // Map from currency key to synth contract name.
    mapping(bytes32 => bytes32) public synthsByKey;

    // Map from currency key to the shorting rewards contract
    mapping(bytes32 => address) public shortingRewards;

    // ========== SETTER STATE VARIABLES ==========

    // The minimum collateral ratio required to avoid liquidation.
    uint public minCratio;

    // The minimum amount of collateral to create a loan.
    uint public minCollateral;

    // The fee charged for issuing a loan.
    uint public issueFeeRate;

    // The maximum number of loans that an account can create with this collateral.
    uint public maxLoansPerAccount = 50;

    // Time in seconds that a user must wait between interacting with a loan.
    // Provides front running and flash loan protection.
    uint public interactionDelay = 300;

    bool public canOpenLoans = true;

    /* ========== ADDRESS RESOLVER CONFIGURATION ========== */

    bytes32 private constant CONTRACT_SYSTEMSTATUS = "SystemStatus";
    bytes32 private constant CONTRACT_EXRATES = "ExchangeRates";
    bytes32 private constant CONTRACT_EXCHANGER = "Exchanger";
    bytes32 private constant CONTRACT_FEEPOOL = "FeePool";
    bytes32 private constant CONTRACT_SYNTHSUSD = "SynthsUSD";
    bytes32 private constant CONTRACT_ISSUER = "Issuer";

    /* ========== CONSTRUCTOR ========== */

    constructor(
        CollateralState _state,
        address _owner,
        ICollateralManager _manager,
        address _resolver,
        bytes32 _collateralKey,
        uint _minCratio,
        uint _minCollateral
    ) public Owned(_owner) MixinSystemSettings(_resolver) {
        manager = _manager;
        state = _state;
        collateralKey = _collateralKey;
        minCratio = _minCratio;
        minCollateral = _minCollateral;
    }

    /* ========== VIEWS ========== */

    function resolverAddressesRequired() public view returns (bytes32[] memory addresses) {
        bytes32[] memory existingAddresses = MixinSystemSettings.resolverAddressesRequired();
        bytes32[] memory newAddresses = new bytes32[](6);
        newAddresses[0] = CONTRACT_FEEPOOL;
        newAddresses[1] = CONTRACT_EXRATES;
        newAddresses[2] = CONTRACT_EXCHANGER;
        newAddresses[3] = CONTRACT_SYSTEMSTATUS;
        newAddresses[4] = CONTRACT_SYNTHSUSD;
        newAddresses[5] = CONTRACT_ISSUER;

        bytes32[] memory combined = combineArrays(existingAddresses, newAddresses);

        addresses = combineArrays(combined, synths);
    }

    /* ---------- Related Contracts ---------- */

    function _systemStatus() internal view returns (ISystemStatus) {
        return ISystemStatus(requireAndGetAddress(CONTRACT_SYSTEMSTATUS));
    }

    function _synth(bytes32 synthName) internal view returns (ISynth) {
        return ISynth(requireAndGetAddress(synthName));
    }

    function _synthsUSD() internal view returns (ISynth) {
        return ISynth(requireAndGetAddress(CONTRACT_SYNTHSUSD));
    }

    function _exchangeRates() internal view returns (IExchangeRates) {
        return IExchangeRates(requireAndGetAddress(CONTRACT_EXRATES));
    }

    function _exchanger() internal view returns (IExchanger) {
        return IExchanger(requireAndGetAddress(CONTRACT_EXCHANGER));
    }

    function _feePool() internal view returns (IFeePool) {
        return IFeePool(requireAndGetAddress(CONTRACT_FEEPOOL));
    }

    function _issuer() internal view returns (IIssuer) {
        return IIssuer(requireAndGetAddress(CONTRACT_ISSUER));
    }

    function _issuer() internal view returns (IIssuer) {
        return IIssuer(requireAndGetAddress(CONTRACT_ISSUER));
    }

    /* ---------- Public Views ---------- */

    function collateralRatio(Loan memory loan) public view returns (uint cratio) {
        uint cvalue = _exchangeRates().effectiveValue(collateralKey, loan.collateral, sUSD);
        uint dvalue = _exchangeRates().effectiveValue(loan.currency, loan.amount.add(loan.accruedInterest), sUSD);
        cratio = cvalue.divideDecimal(dvalue);
    }

    // The maximum number of synths issuable for this amount of collateral
    function maxLoan(uint amount, bytes32 currency) public view returns (uint max) {
        max = issuanceRatio().multiplyDecimal(_exchangeRates().effectiveValue(collateralKey, amount, currency));
    }

    /**
     * r = target issuance ratio
     * D = debt value in sUSD
     * V = collateral value in sUSD
     * P = liquidation penalty
     * Calculates amount of synths = (D - V * r) / (1 - (1 + P) * r)
     * Note: if you pass a loan in here that is not eligible for liquidation it will revert.
     * We check the ratio first in liquidateInternal and only pass eligible loans in.
     */
    function liquidationAmount(Loan memory loan) public view returns (uint amount) {
        uint liquidationPenalty = getLiquidationPenalty();
        uint debtValue = _exchangeRates().effectiveValue(loan.currency, loan.amount.add(loan.accruedInterest), sUSD);
        uint collateralValue = _exchangeRates().effectiveValue(collateralKey, loan.collateral, sUSD);
        uint unit = SafeDecimalMath.unit();

        uint dividend = debtValue.sub(collateralValue.divideDecimal(minCratio));
        uint divisor = unit.sub(unit.add(liquidationPenalty).divideDecimal(minCratio));

        uint sUSDamount = dividend.divideDecimal(divisor);

        return _exchangeRates().effectiveValue(sUSD, sUSDamount, loan.currency);
    }

    // amount is the amount of synths we are liquidating
    function collateralRedeemed(bytes32 currency, uint amount) public view returns (uint collateral) {
        uint liquidationPenalty = getLiquidationPenalty();
        collateral = _exchangeRates().effectiveValue(currency, amount, collateralKey);

        collateral = collateral.multiplyDecimal(SafeDecimalMath.unit().add(liquidationPenalty));
    }

    function areSynthsAndCurrenciesSet(bytes32[] calldata _synthNamesInResolver, bytes32[] calldata _synthKeys)
        external
        view
        returns (bool)
    {
        if (synths.length != _synthNamesInResolver.length) {
            return false;
        }

        for (uint i = 0; i < _synthNamesInResolver.length; i++) {
            bytes32 synthName = _synthNamesInResolver[i];
            if (synths[i] != synthName) {
                return false;
            }
            if (synthsByKey[_synthKeys[i]] != synths[i]) {
                return false;
            }
        }

        return true;
    }

    /* ---------- UTILITIES ---------- */

    // Check the account has enough of the synth to make the payment
    function _checkSynthBalance(
        address payer,
        bytes32 key,
        uint amount
    ) internal view {
        require(IERC20(address(_synth(synthsByKey[key]))).balanceOf(payer) >= amount, "Not enough synths");
    }

    // Check the borrower has enough collateral to make the payment.
    function _checkLoanPayableWithCollateral(
        Loan memory _loan,
        address payer,
        uint amount
    ) internal view {
        require(_loan.account == payer, "Must be borrower");
        require(_loan.collateral >= amount, "Not enough collateral");
    }

    // Check the borrower has enough collateral to make the payment.
    function _checkLoanPayableWithCollateral(
        Loan memory _loan,
        address payer,
        uint amount
    ) internal view {
        require(_loan.account == payer, "Must be borrower");
        require(_loan.collateral >= amount, "Not enough collateral");
    }

    // We set the interest index to 0 to indicate the loan has been closed.
    function _checkLoanAvailable(Loan memory _loan) internal view {
        require(_loan.interestIndex > 0, "Loan does not exist");
        require(_loan.lastInteraction.add(interactionDelay) <= block.timestamp, "Recently interacted");
    }

    function issuanceRatio() internal view returns (uint ratio) {
        ratio = SafeDecimalMath.unit().divideDecimalRound(minCratio);
    }

    /* ========== MUTATIVE FUNCTIONS ========== */

    /* ---------- Synths ---------- */

    function addSynths(bytes32[] calldata _synthNamesInResolver, bytes32[] calldata _synthKeys) external onlyOwner {
        require(_synthNamesInResolver.length == _synthKeys.length, "Array length mismatch");

        for (uint i = 0; i < _synthNamesInResolver.length; i++) {
            bytes32 synthName = _synthNamesInResolver[i];
            synths.push(synthName);
            synthsByKey[_synthKeys[i]] = synthName;
        }

        // ensure cache has the latest
        rebuildCache();
    }

    /* ---------- Rewards Contracts ---------- */

    function addRewardsContracts(address rewardsContract, bytes32 synth) external onlyOwner {
        shortingRewards[synth] = rewardsContract;
    }

    /* ---------- LOAN INTERACTIONS ---------- */

    function openInternal(
        uint collateral,
        uint amount,
        bytes32 currency,
        bool short
    ) internal rateIsValid returns (uint id) {
        // 0. Check the system is active.
        _systemStatus().requireIssuanceActive();

        require(canOpenLoans, "Open disabled");

        // 1. We can only issue certain synths.
        require(synthsByKey[currency] > 0, "Not allowed to issue");

        // 2. Make sure the synth rate is not invalid.
        require(!_exchangeRates().rateIsInvalid(currency), "Invalid rate");

        // 3. Collateral >= minimum collateral size.
        require(collateral >= minCollateral, "Not enough collateral");

        // 4. Cap the number of loans so that the array doesn't get too big.
        require(state.getNumLoans(msg.sender) < maxLoansPerAccount, "Max loans exceeded");

        // 5. Check we haven't hit the debt cap for non snx collateral.
        (bool canIssue, bool anyRateIsInvalid) = manager.exceedsDebtLimit(amount, currency);

        require(canIssue && !anyRateIsInvalid, "Debt limit or invalid rate");

        // 6. Require requested loan < max loan
        require(amount <= maxLoan(collateral, currency), "Exceed max borrow power");

        // 7. This fee is denominated in the currency of the loan
        uint issueFee = amount.multiplyDecimalRound(issueFeeRate);

        // 8. Calculate the minting fee and subtract it from the loan amount
        uint loanAmountMinusFee = amount.sub(issueFee);

        // 9. Get a Loan ID
        id = manager.getNewLoanId();

        // 10. Create the loan struct.
        Loan memory loan =
            Loan({
                id: id,
                account: msg.sender,
                collateral: collateral,
                currency: currency,
                amount: amount,
                short: short,
                accruedInterest: 0,
                interestIndex: 0,
                lastInteraction: block.timestamp
            });

        // 11. Accrue interest on the loan.
        loan = accrueInterest(loan);

        // 12. Save the loan to storage
        state.createLoan(loan);

        // 13. Pay the minting fees to the fee pool
        _payFees(issueFee, currency);

        // 14. If its short, convert back to sUSD, otherwise issue the loan.
        if (short) {
            _synthsUSD().issue(msg.sender, _exchangeRates().effectiveValue(currency, loanAmountMinusFee, sUSD));
            manager.incrementShorts(currency, amount);

            if (shortingRewards[currency] != address(0)) {
                IShortingRewards(shortingRewards[currency]).enrol(msg.sender, amount);
            }
        } else {
            _synth(synthsByKey[currency]).issue(msg.sender, loanAmountMinusFee);
            manager.incrementLongs(currency, amount);
        }

        // 15. Emit event
        emit LoanCreated(msg.sender, id, amount, collateral, currency, issueFee);
    }

    function closeInternal(address borrower, uint id) internal rateIsValid returns (uint collateral) {
        // 0. Check the system is active.
        _systemStatus().requireIssuanceActive();

        // 1. Get the loan.
        Loan memory loan = state.getLoan(borrower, id);

        // 2. Check loan is open and the last interaction time.
        _checkLoanAvailable(loan);

        // 3. Accrue interest on the loan.
        loan = accrueInterest(loan);

        // 4. Work out the total amount owing on the loan.
        uint total = loan.amount.add(loan.accruedInterest);

        // 5. Check they have enough balance to close the loan.
        _checkSynthBalance(loan.account, loan.currency, total);

        // 6. Burn the synths
        require(!_exchanger().hasWaitingPeriodOrSettlementOwing(borrower, loan.currency), "Waiting or owing");
        _synth(synthsByKey[loan.currency]).burn(borrower, total);

        // 7. Tell the manager.
        if (loan.short) {
            manager.decrementShorts(loan.currency, loan.amount);

            if (shortingRewards[loan.currency] != address(0)) {
                IShortingRewards(shortingRewards[loan.currency]).withdraw(borrower, loan.amount);
            }
        } else {
            manager.decrementLongs(loan.currency, loan.amount);
        }

        // 8. Assign the collateral to be returned.
        collateral = loan.collateral;

        // 9. Pay fees
        _payFees(loan.accruedInterest, loan.currency);

        // 10. Record loan as closed
        loan.amount = 0;
        loan.collateral = 0;
        loan.accruedInterest = 0;
        loan.interestIndex = 0;
        loan.lastInteraction = block.timestamp;
        state.updateLoan(loan);

        // 11. Emit the event
        emit LoanClosed(borrower, id);
    }

    function closeByLiquidationInternal(
        address borrower,
        address liquidator,
        Loan memory loan
    ) internal returns (uint collateral) {
        // 1. Work out the total amount owing on the loan.
        uint total = loan.amount.add(loan.accruedInterest);

        // 2. Store this for the event.
        uint amount = loan.amount;

        // 3. Return collateral to the child class so it knows how much to transfer.
        collateral = loan.collateral;

        // 4. Burn the synths
        require(!_exchanger().hasWaitingPeriodOrSettlementOwing(liquidator, loan.currency), "Waiting or owing");
        _synth(synthsByKey[loan.currency]).burn(liquidator, total);

        // 5. Tell the manager.
        if (loan.short) {
            manager.decrementShorts(loan.currency, loan.amount);

            if (shortingRewards[loan.currency] != address(0)) {
                IShortingRewards(shortingRewards[loan.currency]).withdraw(borrower, loan.amount);
            }
        } else {
            manager.decrementLongs(loan.currency, loan.amount);
        }

        // 6. Pay fees
        _payFees(loan.accruedInterest, loan.currency);

        // 7. Record loan as closed
        loan.amount = 0;
        loan.collateral = 0;
        loan.accruedInterest = 0;
        loan.interestIndex = 0;
        loan.lastInteraction = block.timestamp;
        state.updateLoan(loan);

        // 8. Emit the event.
        emit LoanClosedByLiquidation(borrower, loan.id, liquidator, amount, collateral);
    }

    function depositInternal(
        address account,
        uint id,
        uint amount
    ) internal rateIsValid {
        // 0. Check the system is active.
        _systemStatus().requireIssuanceActive();

        // 1. They sent some value > 0
        require(amount > 0, "Must be above 0");

        // 2. Get the loan
        Loan memory loan = state.getLoan(account, id);

        // 3. Check loan is open and last interaction time.
        _checkLoanAvailable(loan);

        // 4. Accrue interest
        loan = accrueInterest(loan);

        // 5. Add the collateral
        loan.collateral = loan.collateral.add(amount);

        // 6. Update the last interaction time.
        loan.lastInteraction = block.timestamp;

        // 7. Store the loan
        state.updateLoan(loan);

        // 8. Emit the event
        emit CollateralDeposited(account, id, amount, loan.collateral);
    }

    function withdrawInternal(uint id, uint amount) internal rateIsValid returns (uint withdraw) {
        // 0. Check the system is active.
        _systemStatus().requireIssuanceActive();

        // 1. Get the loan.
        Loan memory loan = state.getLoan(msg.sender, id);

        // 2. Check loan is open and last interaction time.
        _checkLoanAvailable(loan);

        // 3. Accrue interest.
        loan = accrueInterest(loan);

        // 4. Subtract the collateral.
        loan.collateral = loan.collateral.sub(amount);

        // 5. Update the last interaction time.
        loan.lastInteraction = block.timestamp;

        // 6. Check that the new amount does not put them under the minimum c ratio.
        require(collateralRatio(loan) > minCratio, "Cratio too low");

        // 7. Store the loan.
        state.updateLoan(loan);

        // 8. Assign the return variable.
        withdraw = amount;

        // 9. Emit the event.
        emit CollateralWithdrawn(msg.sender, id, amount, loan.collateral);
    }

    function liquidateInternal(
        address borrower,
        uint id,
        uint payment
    ) internal rateIsValid returns (uint collateralLiquidated) {
        // 0. Check the system is active.
        _systemStatus().requireIssuanceActive();

        // 1. Check the payment amount.
        require(payment > 0, "Must be above 0");

        // 2. Get the loan.
        Loan memory loan = state.getLoan(borrower, id);

        // 3. Check loan is open and last interaction time.
        _checkLoanAvailable(loan);

        // 4. Accrue interest.
        loan = accrueInterest(loan);

        // 5. Check they have enough balance to make the payment.
        _checkSynthBalance(msg.sender, loan.currency, payment);

        // 6. Check they are eligible for liquidation.
        require(collateralRatio(loan) < minCratio, "Cratio above liq ratio");

        // 7. Determine how much needs to be liquidated to fix their c ratio.
        uint liqAmount = liquidationAmount(loan);

        // 8. Only allow them to liquidate enough to fix the c ratio.
        uint amountToLiquidate = liqAmount < payment ? liqAmount : payment;

        // 9. Work out the total amount owing on the loan.
        uint amountOwing = loan.amount.add(loan.accruedInterest);

        // 10. If its greater than the amount owing, we need to close the loan.
        if (amountToLiquidate >= amountOwing) {
            return closeByLiquidationInternal(borrower, msg.sender, loan);
        }

        // 11. Process the payment to workout interest/principal split.
        loan = _processPayment(loan, amountToLiquidate);

        // 12. Work out how much collateral to redeem.
        collateralLiquidated = collateralRedeemed(loan.currency, amountToLiquidate);
        loan.collateral = loan.collateral.sub(collateralLiquidated);

        // 13. Update the last interaction time.
        loan.lastInteraction = block.timestamp;

        // 14. Burn the synths from the liquidator.
        require(!_exchanger().hasWaitingPeriodOrSettlementOwing(msg.sender, loan.currency), "Waiting or owing");
        _synth(synthsByKey[loan.currency]).burn(msg.sender, amountToLiquidate);

        // 15. Store the loan.
        state.updateLoan(loan);

        // 16. Emit the event
        emit LoanPartiallyLiquidated(borrower, id, msg.sender, amountToLiquidate, collateralLiquidated);
    }

    function repayInternal(
        address borrower,
        address repayer,
        uint id,
        uint payment
    ) internal rateIsValid {
        // 0. Check the system is active.
        _systemStatus().requireIssuanceActive();

        // 1. Check the payment amount.
        require(payment > 0, "Must be above 0");

        // 2. Get loan
        Loan memory loan = state.getLoan(borrower, id);

        // 3. Check loan is open and last interaction time.
        _checkLoanAvailable(loan);

        // 4. Accrue interest.
        loan = accrueInterest(loan);

        // 5. Check the spender has enough synths to make the repayment
        _checkSynthBalance(repayer, loan.currency, payment);

        // 6. Process the payment.
        loan = _processPayment(loan, payment);

        // 7. Update the last interaction time.
        loan.lastInteraction = block.timestamp;

        // 8. Burn synths from the payer
        require(!_exchanger().hasWaitingPeriodOrSettlementOwing(repayer, loan.currency), "Waiting or owing");
        _synth(synthsByKey[loan.currency]).burn(repayer, payment);

        // 9. Store the loan
        state.updateLoan(loan);

        // 10. Emit the event.
        emit LoanRepaymentMade(borrower, repayer, id, payment, loan.amount);
    }

    function repayWithCollateralInternal(
        address borrower,
        address repayer,
        uint id,
        uint payment
    ) internal rateIsValid {
        // 0. Check the system is active.
        _systemStatus().requireIssuanceActive();

        // 1. Check the payment amount.
        require(payment > 0, "Must be above 0");

        // 2. Get loan
        Loan memory loan = state.getLoan(borrower, id);

        // 3. Check loan is open and last interaction time.
        _checkLoanAvailable(loan);

        // 4. Accrue interest.
        loan = accrueInterest(loan);

        // 5. Check the borrower has enough collateral to repay.
        _checkLoanPayableWithCollateral(loan, repayer, payment);

        // 6. Process the payment.
        loan = _processPayment(loan, payment);

        // 7. Update the last interaction time.
        loan.lastInteraction = block.timestamp;

        // 8. Get the amount for the exchange from sUSD -> borrowed synth.
        (uint amountReceived, uint fee, ) = _exchanger().getAmountsForExchange(payment, sUSD, loan.currency);

        // 9. Reduce the collateral used for paymewnt.
        require(!_exchanger().hasWaitingPeriodOrSettlementOwing(repayer, sUSD), "Waiting or owing");
        loan.collateral = loan.collateral.sub(payment);

        // 10. Burn the borrowed synth units by the amount repaid (minus the exchange fees).
        require(!_exchanger().hasWaitingPeriodOrSettlementOwing(repayer, loan.currency), "Waiting or owing");
        _synth(synthsByKey[loan.currency]).burn(repayer, amountReceived);

        // 11. Remit the fee if required.
        if (fee > 0) {
            // Normalize fee to sUSD
            // Note: `fee` is being reused to avoid stack too deep errors.
            fee = _exchangeRates().effectiveValue(loan.currency, fee, sUSD);

            // Remit the fee in sUSDs
            _issuer().synths(sUSD).issue(_feePool().FEE_ADDRESS(), fee);

            // Tell the fee pool about this
            _feePool().recordFeePaid(fee);
        }

        // 12. Store the loan
        state.updateLoan(loan);

        // 13. Emit the event.
        emit LoanRepaymentMade(borrower, repayer, id, payment, loan.amount);
    }

    function drawInternal(uint id, uint amount) internal rateIsValid {
        // 0. Check the system is active.
        _systemStatus().requireIssuanceActive();

        // 1. Get loan.
        Loan memory loan = state.getLoan(msg.sender, id);

        // 2. Check loan is open and last interaction time.
        _checkLoanAvailable(loan);

        // 3. Accrue interest.
        loan = accrueInterest(loan);

        // 4. Add the requested amount.
        loan.amount = loan.amount.add(amount);

        // 5. If it is below the minimum, don't allow this draw.
        require(collateralRatio(loan) > minCratio, "Cannot draw this much");

        // 6. This fee is denominated in the currency of the loan
        uint issueFee = amount.multiplyDecimalRound(issueFeeRate);

        // 7. Calculate the minting fee and subtract it from the draw amount
        uint amountMinusFee = amount.sub(issueFee);

        // 8. If its short, let the child handle it, otherwise issue the synths.
        if (loan.short) {
            manager.incrementShorts(loan.currency, amount);
            _synthsUSD().issue(msg.sender, _exchangeRates().effectiveValue(loan.currency, amountMinusFee, sUSD));

            if (shortingRewards[loan.currency] != address(0)) {
                IShortingRewards(shortingRewards[loan.currency]).enrol(msg.sender, amount);
            }
        } else {
            manager.incrementLongs(loan.currency, amount);
            _synth(synthsByKey[loan.currency]).issue(msg.sender, amountMinusFee);
        }

        // 9. Pay the minting fees to the fee pool
        _payFees(issueFee, loan.currency);

        // 10. Update the last interaction time.
        loan.lastInteraction = block.timestamp;

        // 11. Store the loan
        state.updateLoan(loan);

        // 12. Emit the event.
        emit LoanDrawnDown(msg.sender, id, amount);
    }

    // Update the cumulative interest rate for the currency that was interacted with.
    function accrueInterest(Loan memory loan) internal returns (Loan memory loanAfter) {
        loanAfter = loan;

        // 1. Get the rates we need.
        (uint entryRate, uint lastRate, uint lastUpdated, uint newIndex) =
            loan.short
                ? manager.getShortRatesAndTime(loan.currency, loan.interestIndex)
                : manager.getRatesAndTime(loan.interestIndex);

        // 2. Get the instantaneous rate.
        (uint rate, bool invalid) = loan.short ? manager.getShortRate(synthsByKey[loan.currency]) : manager.getBorrowRate();

        require(!invalid, "Invalid rates");

        // 3. Get the time since we last updated the rate.
        uint timeDelta = block.timestamp.sub(lastUpdated).mul(SafeDecimalMath.unit());

        // 4. Get the latest cumulative rate. F_n+1 = F_n + F_last
        uint latestCumulative = lastRate.add(rate.multiplyDecimal(timeDelta));

        // 5. If the loan was just opened, don't record any interest. Otherwise multiple by the amount outstanding.
        uint interest = loan.interestIndex == 0 ? 0 : loan.amount.multiplyDecimal(latestCumulative.sub(entryRate));

        // 7. Update rates with the lastest cumulative rate. This also updates the time.
        loan.short ? manager.updateShortRates(loan.currency, latestCumulative) : manager.updateBorrowRates(latestCumulative);

        // 8. Update loan
        loanAfter.accruedInterest = loan.accruedInterest.add(interest);
        loanAfter.interestIndex = newIndex;
        state.updateLoan(loanAfter);
    }

    // Works out the amount of interest and principal after a repayment is made.
    function _processPayment(Loan memory loanBefore, uint payment) internal returns (Loan memory loanAfter) {
        loanAfter = loanBefore;

        if (payment > 0 && loanBefore.accruedInterest > 0) {
            uint interestPaid = payment > loanBefore.accruedInterest ? loanBefore.accruedInterest : payment;
            loanAfter.accruedInterest = loanBefore.accruedInterest.sub(interestPaid);
            payment = payment.sub(interestPaid);

            _payFees(interestPaid, loanBefore.currency);
        }

        // If there is more payment left after the interest, pay down the principal.
        if (payment > 0) {
            loanAfter.amount = loanBefore.amount.sub(payment);

            // And get the manager to reduce the total long/short balance.
            if (loanAfter.short) {
                manager.decrementShorts(loanAfter.currency, payment);

                if (shortingRewards[loanAfter.currency] != address(0)) {
                    IShortingRewards(shortingRewards[loanAfter.currency]).withdraw(loanAfter.account, payment);
                }
            } else {
                manager.decrementLongs(loanAfter.currency, payment);
            }
        }
    }

    // Take an amount of fees in a certain synth and convert it to sUSD before paying the fee pool.
    function _payFees(uint amount, bytes32 synth) internal {
        if (amount > 0) {
            if (synth != sUSD) {
                amount = _exchangeRates().effectiveValue(synth, amount, sUSD);
            }
            _synthsUSD().issue(_feePool().FEE_ADDRESS(), amount);
            _feePool().recordFeePaid(amount);
        }
    }

    // ========== MODIFIERS ==========

    modifier rateIsValid() {
        _requireRateIsValid();
        _;
    }

    function _requireRateIsValid() private view {
        require(!_exchangeRates().rateIsInvalid(collateralKey), "Invalid rate");
    }

    // ========== EVENTS ==========
    // Setters
    event MinCratioRatioUpdated(uint minCratio);
    event MinCollateralUpdated(uint minCollateral);
    event IssueFeeRateUpdated(uint issueFeeRate);
    event MaxLoansPerAccountUpdated(uint maxLoansPerAccount);
    event InteractionDelayUpdated(uint interactionDelay);
    event ManagerUpdated(ICollateralManager manager);
    event CanOpenLoansUpdated(bool canOpenLoans);

    // Loans
    event LoanCreated(address indexed account, uint id, uint amount, uint collateral, bytes32 currency, uint issuanceFee);
    event LoanClosed(address indexed account, uint id);
    event CollateralDeposited(address indexed account, uint id, uint amountDeposited, uint collateralAfter);
    event CollateralWithdrawn(address indexed account, uint id, uint amountWithdrawn, uint collateralAfter);
    event LoanRepaymentMade(address indexed account, address indexed repayer, uint id, uint amountRepaid, uint amountAfter);
    event LoanDrawnDown(address indexed account, uint id, uint amount);
    event LoanPartiallyLiquidated(
        address indexed account,
        uint id,
        address liquidator,
        uint amountLiquidated,
        uint collateralLiquidated
    );
    event LoanClosedByLiquidation(
        address indexed account,
        uint id,
        address indexed liquidator,
        uint amountLiquidated,
        uint collateralLiquidated
    );
}
