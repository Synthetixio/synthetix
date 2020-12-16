pragma solidity ^0.5.16;

pragma experimental ABIEncoderV2;

// Inheritance
import "./Owned.sol";
import "./MixinSystemSettings.sol";
import "./Pausable.sol";
import "./interfaces/ICollateral.sol";
import "./interfaces/ICollateralLoan.sol";

// Libraries
import "./SafeDecimalMath.sol";

// Internal references
import "./CollateralState.sol";
import "./interfaces/ICollateralManager.sol";
import "./interfaces/ISystemStatus.sol";
import "./interfaces/IFeePool.sol";
import "./interfaces/ISynth.sol";
import "./interfaces/IERC20.sol";
import "./interfaces/IExchangeRates.sol";

contract Collateral is ICollateral, ICollateralLoan, Owned, MixinSystemSettings, Pausable {
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

    address public manager;

    // The synths that this contract can issue.
    bytes32[] public synths;

    // Map from currency key to synth.
    mapping(bytes32 => bytes32) public currencies;

    // ========== SETTER STATE VARIABLES ==========

    // The minimum collateral ratio required to avoid liquidation.
    uint public minCratio;

    // The minimum amount of collateral to create a loan.
    uint public minCollateral;

    // The fee charged for issuing a loan.
    uint public issueFeeRate;

    // The maximum number of loans that an account can create with this collateral.
    uint public maxLoansPerAccount = 50;

    /* ========== ADDRESS RESOLVER CONFIGURATION ========== */

    bytes32 private constant CONTRACT_SYSTEMSTATUS = "SystemStatus";
    bytes32 private constant CONTRACT_EXRATES = "ExchangeRates";
    bytes32 private constant CONTRACT_FEEPOOL = "FeePool";
    bytes32 private constant CONTRACT_SYNTHSUSD = "SynthsUSD";

    /* ========== CONSTRUCTOR ========== */

    constructor(
        CollateralState _state,
        address _owner,
        address _manager,
        address _resolver,
        bytes32 _collateralKey,
        bytes32[] memory _synths,
        uint _minCratio,
        uint _minCollateral
        ) public
        Owned(_owner)
        Pausable()
        MixinSystemSettings(_resolver)
    {
        owner = msg.sender;

        manager = _manager;
        state = _state;
        collateralKey = _collateralKey;
        setMinCratio(_minCratio);
        setMinCollateral(_minCollateral);

        for (uint i = 0; i < _synths.length; i++) {
            synths.push(_synths[i]);
        }

        owner = _owner;
    }

    /* ========== VIEWS ========== */

    function resolverAddressesRequired() public view returns (bytes32[] memory addresses) {
        bytes32[] memory existingAddresses = MixinSystemSettings.resolverAddressesRequired();
        bytes32[] memory newAddresses = new bytes32[](4);
        newAddresses[0] = CONTRACT_FEEPOOL;
        newAddresses[1] = CONTRACT_EXRATES;
        newAddresses[2] = CONTRACT_SYSTEMSTATUS;
        newAddresses[3] = CONTRACT_SYNTHSUSD;

        bytes32[] memory combined = combineArrays(existingAddresses, newAddresses);

        addresses = combineArrays(combined, synths);
    }

    /* ---------- Related Contracts ---------- */

    function _systemStatus() internal view returns (ISystemStatus) {
        return ISystemStatus(requireAndGetAddress(CONTRACT_SYSTEMSTATUS));
    }

    function _synths(bytes32 synth) internal view returns (ISynth) {
        return ISynth(requireAndGetAddress(synth));
    }

    function _synthsUSD() internal view returns (ISynth) {
        return ISynth(requireAndGetAddress(CONTRACT_SYNTHSUSD));
    }

    function _exchangeRates() internal view returns (IExchangeRates) {
        return IExchangeRates(requireAndGetAddress(CONTRACT_EXRATES));
    }

    function _feePool() internal view returns (IFeePool) {
        return IFeePool(requireAndGetAddress(CONTRACT_FEEPOOL));
    }

    function _manager() internal view returns (ICollateralManager) {
        return ICollateralManager(manager);
    }

    /* ---------- Public Views ---------- */

    function collateralRatio(Loan memory loan) public view returns (uint cratio) {
        uint cvalue = _exchangeRates().effectiveValue(collateralKey, loan.collateral, sUSD);
        uint debt = loan.amount.add(loan.accruedInterest);
        uint dvalue = _exchangeRates().effectiveValue(loan.currency, debt, sUSD);

        cratio = cvalue.divideDecimal(dvalue);
    }

    function issuanceRatio() public view returns (uint ratio) {
        ratio = SafeDecimalMath.unit().divideDecimalRound(minCratio);
    }

    // The maximum number of synths issuable for this amount of collateral
    function maxLoan(uint amount, bytes32 currency) public view returns (uint max) {
        max = issuanceRatio().multiplyDecimal(_exchangeRates().effectiveValue(collateralKey, amount, currency));
    }

    /**
     * r = target issuance ratio
     * D = debt value in sUSD
     * V = Collateral VALUE in sUSD
     * P = liquidation penalty
     * Calculates amount of synths = (D - V * r) / (1 - (1 + P) * r)
     */
    function liquidationAmount(Loan memory loan) public view returns (uint amount) {
        uint liquidationPenalty = getLiquidationPenalty();
        uint debtValue = loan.amount.add(loan.accruedInterest).multiplyDecimal(_exchangeRates().rateForCurrency(loan.currency));
        uint collateralValue = loan.collateral.multiplyDecimal(_exchangeRates().rateForCurrency(collateralKey));
        uint unit = SafeDecimalMath.unit();

        uint dividend = debtValue.sub(collateralValue.divideDecimal(minCratio));
        uint divisor = unit.sub(unit.add(liquidationPenalty).divideDecimal(minCratio));

        return dividend.divideDecimal(divisor);
    }

    // amount is the amount of synths we are liquidating
    function collateralRedeemed(bytes32 currency, uint amount) public view returns (uint collateral) {
        uint liquidationPenalty = getLiquidationPenalty();
        collateral = _exchangeRates().effectiveValue(currency, amount, collateralKey);

        collateral = collateral.multiplyDecimal(SafeDecimalMath.unit().add(liquidationPenalty));
    }

    /* ---------- UTILITIES ---------- */

    // Check the account has enough of the synth to make the payment
    function _checkSynthBalance(address payer, bytes32 _synth, uint amount) internal view returns (bool) {
        require(IERC20(address(_synths(currencies[_synth]))).balanceOf(payer) >= amount, "Not enough synth balance");
    }

    // We set the interest index to 0 to indicate the loan has been closed.
    function _checkLoanIsOpen(Loan memory _loan) internal pure {
        require(_loan.interestIndex > 0, "Loan does not exist");
    }

    /* ========== MUTATIVE FUNCTIONS ========== */

    /* ---------- Synths ---------- */

    function setCurrencies() external {
        for (uint i = 0; i < synths.length; i++) {
            ISynth synth = ISynth(requireAndGetAddress(synths[i]));
            currencies[synth.currencyKey()] = synths[i];
        }
    }

    function addSynth(bytes32 _synth) external onlyOwner {
        synths.push(_synth);
    }

    /* ---------- SETTERS ---------- */

    function setMinCratio(uint _minCratio) public onlyOwner {
        require(_minCratio > 1e18, "Must be greater than 1");
        minCratio = _minCratio;
        emit MinCratioRatioUpdated(minCratio);
    }

    function setMinCollateral(uint _minCollateral) public onlyOwner {
        require(_minCollateral > 0, "Must be greater than 0");
        minCollateral = _minCollateral;
        emit MinCollateralUpdated(minCollateral);
    }

    function setIssueFeeRate(uint _issueFeeRate) public onlyOwner {
        require(_issueFeeRate >= 0, "Must be greater than or equal to 0");
        issueFeeRate = _issueFeeRate;
        emit IssueFeeRateUpdated(issueFeeRate);
    }

    function setMaxLoansPerAccount(uint _maxLoansPerAccount) public onlyOwner {
        require(_maxLoansPerAccount > 0, "Must be greater than 0");
        maxLoansPerAccount = _maxLoansPerAccount;
        emit MaxLoansPerAccountUpdated(maxLoansPerAccount);
    }

    function setManager(address _newManager) public onlyOwner {
        manager = _newManager;
        emit ManagerUpdated(manager);
    }

    /* ---------- LOAN INTERACTIONS ---------- */

    function openInternal(uint collateral, uint amount, bytes32 currency, bool short)
        internal
        notPaused
        CollateralRateNotInvalid
        returns (uint id, uint issued)
    {
        // 0. Check the system is active.
        _systemStatus().requireIssuanceActive();

        // 1. We can only issue certain synths.
        require(currencies[currency] > 0, "Not allowed to issue this synth");

        // 2. Make sure the synth rate is not invalid.
        require(!_exchangeRates().rateIsInvalid(currency), "Currency rate is invalid");

        // 3. Collateral >= minimum collateral size.
        require(collateral >= minCollateral, "Not enough collateral to create a loan");

        // 4. Cap the number of loans so that the array doesn't get too big.
        require(state.getNumLoans(msg.sender) < maxLoansPerAccount, "You have reached the maximum number of loans");

        // 5. Check we haven't hit the debt cap for non snx collateral.
        require(_manager().exceedsDebtLimit(amount, currency), "The debt limit has been reached");

        // 6. Calculate max possible loan from collateral provided
        uint max = maxLoan(collateral, currency);

        // 7. Require requested loan < max loan
        require(amount <= max, "Loan amount exceeds max borrowing power");

        // 8. This fee is denominated in the currency of the loan
        uint issueFee = amount.multiplyDecimalRound(issueFeeRate);

        // 9. Calculate the minting fee and subtract it from the loan amount
        uint loanAmountMinusFee = amount.sub(issueFee);

        // 10. Get a Loan ID
        id = state.incrementTotalLoans();

        // 11. Create the loan struct.
        Loan memory loan = Loan({
            id: id,
            account: msg.sender,
            collateral: collateral,
            currency: currency,
            amount: amount,
            short: short,
            accruedInterest: 0,
            interestIndex: 0
        });

        // 12. Accrue interest on the loan.
        loan = accrueInterest(loan);

        // 13. Save the loan to storage
        state.createLoan(loan);

        // 14. Pay the minting fees to the fee pool
        _payFees(issueFee, currency);

        // 15. If its short, convert back to sUSD, otherwise issue the loan.
        if (short) {
            issued = _exchangeRates().effectiveValue(currency, loanAmountMinusFee, sUSD);
            _manager().incrementShorts(currency, amount);
        } else {
            _synths(currencies[currency]).issue(msg.sender, loanAmountMinusFee);
            _manager().incrementLongs(currency, amount);
        }

        // 16. Emit event
        emit LoanCreated(msg.sender, id, amount, collateral, currency, issueFee);
    }

    function closeInternal(address borrower, uint id) internal CollateralRateNotInvalid returns(uint collateral) {
        // 0. Check the system is active.
        _systemStatus().requireIssuanceActive();

        // 1. Get the loan.
        Loan memory loan = state.getLoan(borrower, id);

        // 2. Check loan is open.
        _checkLoanIsOpen(loan);

        // 3. Accrue interest on the loan.
        loan = accrueInterest(loan);

        // 4. Work out the total amount owing on the loan.
        uint total = loan.amount.add(loan.accruedInterest);

        // 5. Check they have enough balance to close the loan.
        _checkSynthBalance(loan.account, loan.currency, total);

        // 6. Burn the synths
        _synths(currencies[loan.currency]).burn(borrower, total);

        // 7. Tell the manager.
        if (loan.short) {
            _manager().decrementShorts(loan.currency, loan.amount);
        } else {
            _manager().decrementLongs(loan.currency, loan.amount);
        }

        // 8. Pay fees
        _payFees(loan.accruedInterest, loan.currency);

        // 9. Return collateral to the child class so it knows how much to transfer.
        collateral = loan.collateral;

        // 10. Record loan as closed
        loan.amount = 0;
        loan.collateral = 0;
        loan.accruedInterest = 0;
        loan.interestIndex = 0;
        state.updateLoan(loan);

        // 11. Emit the event
        emit LoanClosed(borrower, id);
    }

    function closeByLiquidationInternal(address borrower, address liquidator, Loan memory loan) internal notPaused CollateralRateNotInvalid returns(uint collateral) {
        // 1. Work out the total amount owing on the loan.
        uint total = loan.amount.add(loan.accruedInterest);

        // 2. Store this for the event.
        uint amount = loan.amount;

        // 3. Return collateral to the child class so it knows how much to transfer.
        collateral = loan.collateral;

        // 4. Burn the synths
        _synths(currencies[loan.currency]).burn(liquidator, total);

        // 5. Tell the manager.
        if (loan.short) {
            _manager().decrementShorts(loan.currency, loan.amount);
        } else {
            _manager().decrementLongs(loan.currency, loan.amount);
        }

        // 6. Pay fees
        _payFees(loan.accruedInterest, loan.currency);

        // 7. Record loan as closed
        loan.amount = 0;
        loan.collateral = 0;
        loan.accruedInterest = 0;
        loan.interestIndex = 0;
        state.updateLoan(loan);

        // 8. Emit the event.
        emit LoanClosedByLiquidation(borrower, loan.id, liquidator, amount, collateral);
    }

    function depositInternal(address account, uint id, uint amount) internal notPaused CollateralRateNotInvalid {
        // 0. Check the system is active.
        _systemStatus().requireIssuanceActive();

        // 1. They sent some value > 0
        require(amount > 0, "Deposit must be greater than 0");

        // 2. Get the loan
        Loan memory loan = state.getLoan(account, id);

        // 3. Check it is still open.
        _checkLoanIsOpen(loan);

        // 4. Accrue interest
        loan = accrueInterest(loan);

        // 5. Add the collateral
        loan.collateral = loan.collateral.add(amount);

        // 6. Store the loan
        state.updateLoan(loan);

        // 7. Emit the event
        emit CollateralDeposited(account, id, amount, loan.collateral);
    }

    function withdrawInternal(uint id, uint amount) internal notPaused CollateralRateNotInvalid returns (uint withdraw) {
        // 0. Check the system is active.
        _systemStatus().requireIssuanceActive();

        // 1. Check withdraw amount
        require(amount > 0, "Amount to withdraw must be greater than 0");

        // 2. Get the loan.
        Loan memory loan = state.getLoan(msg.sender, id);

        // 3. Check loan exists and is open
        _checkLoanIsOpen(loan);

        // 4. Check amount is less than collateral.
        require(amount < loan.collateral, "Request exceeds total collateral");

        // 5. Accrue interest.
        loan = accrueInterest(loan);

        // 6. Subtract the collateral.
        loan.collateral = loan.collateral.sub(amount);

        // 7. Workout what the new c ratio would be.
        uint cratioAfter = collateralRatio(loan);

        // 8. Check that the new amount does not put them under the minimum c ratio.
        require(cratioAfter > minCratio, "Collateral ratio below liquidation after withdraw");

        // 9. Store the loan.
        state.updateLoan(loan);

        // 10. Assign the return variable.
        withdraw = amount;

        // 10. Emit the event.
        emit CollateralWithdrawn(msg.sender, id, amount, loan.collateral);
    }

    function liquidateInternal(address borrower, uint id, uint payment) internal notPaused CollateralRateNotInvalid returns (uint collateralLiquidated) {
        // 0. Check the system is active.
        _systemStatus().requireIssuanceActive();

        // 1. Check the payment amount.
        require(payment > 0, "Payment must be greater than 0");

        // 2. Get the loan.
        Loan memory loan = state.getLoan(borrower, id);

        // 3. Check the loan is open.
        _checkLoanIsOpen(loan);

        // 4. Accrue interest.
        loan = accrueInterest(loan);

        // 5. Check they have enough balance to make the payment.
        _checkSynthBalance(msg.sender, loan.currency, payment);

        // 6. Get the collateral ratio.
        uint cratio = collateralRatio(loan);

        // 7 Check they are eligible for liquidation.
        require(cratio < minCratio, "Collateral ratio above liquidation ratio");

        // 8. Determine how much needs to be liquidated to fix their c ratio.
        uint liqAmount = liquidationAmount(loan);

        // 9. Only allow them to liquidate enough to fix the c ratio.
        uint amountToLiquidate = liqAmount < payment ? liqAmount : payment;

        // 10. Work out the total amount owing on the loan.
        uint amountOwing = loan.amount.add(loan.accruedInterest);

        // 11. If its greater than the amount owing, we need to close the loan.
        if (amountToLiquidate >= amountOwing) {
            return closeByLiquidationInternal(borrower, msg.sender, loan);
        }

        // 12. Process the payment to workout interest/principal split.
        loan = _processPayment(loan, amountToLiquidate);

        // 13. Work out how much collateral to redeem.
        collateralLiquidated = collateralRedeemed(loan.currency, amountToLiquidate);
        loan.collateral = loan.collateral.sub(collateralLiquidated);

        // 14. Burn the synths from the liquidator.
        _synths(currencies[loan.currency]).burn(msg.sender, amountToLiquidate);

        // 15. Store the loan.
        state.updateLoan(loan);

        // 16. Emit the event
        emit LoanPartiallyLiquidated(
            borrower,
            id,
            msg.sender,
            amountToLiquidate,
            collateralLiquidated
        );
    }

    function repayInternal(address borrower, address repayer, uint id, uint payment) internal notPaused CollateralRateNotInvalid {
        // 0. Check the system is active.
        _systemStatus().requireIssuanceActive();

        // 1. Check the payment amount.
        require(payment > 0, "Payment must be greater than 0");

        // 2. Get loan
        Loan memory loan = state.getLoan(borrower, id);

        // 3. Check the loan is still open
        _checkLoanIsOpen(loan);

        // 4. Accrue interest.
        loan = accrueInterest(loan);

        // 5. Check the spender has enough synths to make the repayment
        _checkSynthBalance(repayer, loan.currency, payment);

        // 6. Work out the total amount owing on the loan.
        uint amountOwing = loan.amount.add(loan.accruedInterest);

        // 7. Need to close the loan instead.
        require(payment < amountOwing, "Repayment would close loan. If you are the borrower then call close loan");

        // 8. Process the payment.
        loan = _processPayment(loan, payment);

        // 9. Burn synths from the payer
        _synths(currencies[loan.currency]).burn(repayer, payment);

        // 10. Store the loan
        state.updateLoan(loan);

        // 11. Emit the event.
        emit LoanRepaymentMade(borrower, repayer, id, payment, loan.amount);
    }

    function drawInternal(uint id, uint amount) internal notPaused CollateralRateNotInvalid returns (uint issued) {
        // 0. Check the system is active.
        _systemStatus().requireIssuanceActive();

        // 1. Get loan.
        Loan memory loan = state.getLoan(msg.sender, id);

        // 2. Check the loan is still open.
        _checkLoanIsOpen(loan);

        // 3. Accrue interest.
        loan = accrueInterest(loan);

        // 4. Add the requested amount.
        loan.amount = loan.amount.add(amount);

        // 5. Get the new c ratio.
        uint cratio = collateralRatio(loan);

        // 6. If it is below the minimum, don't allow this draw.
        require(cratio > minCratio, "Drawing this much would put the loan under minimum collateralisation");

        // 7. If its short, let the child handle it, otherwise issue the synths.
        if (loan.short) {
            _manager().incrementShorts(loan.currency, loan.amount);
            issued = _exchangeRates().effectiveValue(loan.currency, amount, sUSD);
        } else {
            _manager().incrementLongs(loan.currency, loan.amount);
            _synths(currencies[loan.currency]).issue(msg.sender, amount);
        }

        // 8. Store the loan
        state.updateLoan(loan);

        // 9. Emit the event.
        emit LoanDrawnDown(msg.sender, id, amount);
    }

     // Update the cumulative interest rate for the currency that was interacted with.
    function accrueInterest(Loan memory loan) internal returns (Loan memory loanAfter) {
        loanAfter = loan;

        // 1. Get the rates we need.
        (uint entryRate, uint lastRate, uint lastUpdated, uint newIndex) =  loan.short ? _manager().getShortRatesAndTime(loan.currency, loan.interestIndex) : _manager().getRatesAndTime(loan.interestIndex);

        // 2. Get the instantaneous rate.
        uint instantaneousRate = loan.short ? _manager().getShortRate(address(_synths(currencies[loan.currency]))) : _manager().getBorrowRate();

        // 3. Get the time since we last updated the rate.
        uint timeDelta = block.timestamp.sub(lastUpdated).mul(SafeDecimalMath.unit());

        // 4. Get the time its been applied for. F
        uint cumulativeRate = instantaneousRate.multiplyDecimal(timeDelta);

        // 5. Get the latest cumulative rate. F_n+1 = F_n + F_last
        uint latestCumulative = lastRate.add(cumulativeRate);

        // 6. If the loan was just opened, don't record any interest. Otherwise multiple by the amount outstanding. Simple interest.
        uint interest = loan.interestIndex == 0 ? 0 : loan.amount.multiplyDecimal(latestCumulative.sub(entryRate));

        // 7. Update rates with the lastest cumulative rate. This also updates the time.
        loan.short ? _manager().updateShortRates(loan.currency, latestCumulative) : _manager().updateBorrowRates(latestCumulative);

        // 8. Update loan
        loanAfter.accruedInterest = loan.accruedInterest.add(interest);
        loanAfter.interestIndex = newIndex;
        state.updateLoan(loanAfter);
    }

    // Works out the amount of interest and principal after a repayment is made.
    function _processPayment(Loan memory loanBefore, uint payment)
        internal
        returns (Loan memory loanAfter)
    {
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
                _manager().decrementShorts(loanAfter.currency, loanAfter.amount);
            } else {
                _manager().decrementLongs(loanAfter.currency, loanAfter.amount);
            }
        }
    }

    // Take an amount of fees in a certain synth and convert it to sUSD before paying the fee pool.
    function _payFees(uint amount, bytes32 _synth) internal {
        if (amount > 0) {
            if (_synth != sUSD) {
                amount = _exchangeRates().effectiveValue(_synth, amount, sUSD);
            }
            _synthsUSD().issue(_feePool().FEE_ADDRESS(), amount);
            _feePool().recordFeePaid(amount);
        }
    }

    /* ========== MODIFIERS ========== */

    modifier CollateralRateNotInvalid() {
        require(!_exchangeRates().rateIsInvalid(collateralKey), "Collateral rate is invalid");
        _;
    }

    // ========== EVENTS ==========
    // Setters
    event MinCratioRatioUpdated(uint minCratio);
    event MinCollateralUpdated(uint minCollateral);
    event IssueFeeRateUpdated(uint issueFeeRate);
    event MaxLoansPerAccountUpdated(uint maxLoansPerAccount);
    event ManagerUpdated(address manager);

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
    event LoanClosedByLiquidation(address indexed account, uint id, address indexed liquidator, uint amountLiquidated, uint collateralLiquidated);
}
