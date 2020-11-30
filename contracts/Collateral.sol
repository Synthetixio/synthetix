pragma solidity ^0.5.16;

pragma experimental ABIEncoderV2;

// Inheritance
import "./Owned.sol";
import "./MixinResolver.sol";
import "./Pausable.sol";
import "./interfaces/ICollateral.sol";

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

contract Collateral is ICollateral, ILoan, Owned, MixinResolver, Pausable {
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
    mapping(bytes32 => bytes32) public synths;

    // ========== SETTER STATE VARIABLES ==========

    uint public minimumCollateralisation;
    
    uint public baseInterestRate;

    uint public liquidationPenalty;
    
    uint public issueFeeRate;

    /* ========== ADDRESS RESOLVER CONFIGURATION ========== */

    bytes32 private constant CONTRACT_SYSTEMSTATUS = "SystemStatus";
    bytes32 private constant CONTRACT_EXRATES = "ExchangeRates";
    bytes32 private constant CONTRACT_FEEPOOL = "FeePool";
    bytes32 private constant CONTRACT_SYNTHSUSD = "SynthsUSD";

    bytes32[24] private addressesToCache = [CONTRACT_SYSTEMSTATUS, CONTRACT_EXRATES, CONTRACT_FEEPOOL, CONTRACT_SYNTHSUSD];

    /* ========== CONSTRUCTOR ========== */

    constructor(
        CollateralState _state,
        address _owner,
        address _manager,
        address _resolver,
        bytes32 _collateralKey,
        bytes32[] memory _synths,
        uint _minimumCollateralisation,
        uint _interestRate,
        uint _liquidationPenalty
        ) public
        Owned(_owner)
        Pausable()
        MixinResolver(_resolver, addressesToCache)
    {
        owner = msg.sender;

        manager = _manager;
        state = _state;
        collateralKey = _collateralKey;
        setMinimumCollateralisation(_minimumCollateralisation);
        setBaseInterestRate(_interestRate);
        setLiquidationPenalty(_liquidationPenalty);

        for (uint i = 0; i < _synths.length; i++) {
            appendToAddressCache(_synths[i]);
            ISynth synth = ISynth(requireAndGetAddress(_synths[i], "Missing address"));
            synths[synth.currencyKey()] = _synths[i];
        }

        owner = _owner;
    }

    /* ========== VIEWS ========== */

    /* ---------- Related Contracts ---------- */

    function _systemStatus() internal view returns (ISystemStatus) {
        return ISystemStatus(requireAndGetAddress(CONTRACT_SYSTEMSTATUS, "Missing SystemStatus address"));
    }

    function _synths(bytes32 synth) internal view returns (ISynth) {
        return ISynth(requireAndGetAddress(synth, "Missing synths address"));
    }

    function _synthsUSD() internal view returns (ISynth) {
        return ISynth(requireAndGetAddress(CONTRACT_SYNTHSUSD, "Missing synthsUSD address"));
    }

    function _exchangeRates() internal view returns (IExchangeRates) {
        return IExchangeRates(requireAndGetAddress(CONTRACT_EXRATES, "Missing ExchangeRates address"));
    }

    function _feePool() internal view returns (IFeePool) {
        return IFeePool(requireAndGetAddress(CONTRACT_FEEPOOL, "Missing FeePool address"));
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
        // this rounds so you get slightly more rather than slightly less
        ratio = SafeDecimalMath.unit().divideDecimalRound(minimumCollateralisation);
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
        uint debtValue = loan.amount.add(loan.accruedInterest).multiplyDecimal(_exchangeRates().rateForCurrency(loan.currency));
        uint collateralValue = loan.collateral.multiplyDecimal(_exchangeRates().rateForCurrency(collateralKey));

        uint unit = SafeDecimalMath.unit();
        uint ratio = minimumCollateralisation;

        uint dividend = debtValue.sub(collateralValue.divideDecimal(ratio));
        uint divisor = unit.sub(unit.add(liquidationPenalty).divideDecimal(ratio));

        return dividend.divideDecimal(divisor);
    }

    // amount is the amount of synths we are liquidating
    function collateralRedeemed(bytes32 currency, uint amount) public view returns (uint collateral) {
        collateral = _exchangeRates().effectiveValue(currency, amount, collateralKey);

        collateral = collateral.multiplyDecimal(SafeDecimalMath.unit().add(liquidationPenalty));
    }

    /* ---------- UTILITIES ---------- */
    
    // Check the account has enough of the synth to make the payment
    function _checkSynthBalance(address payer, bytes32 _synth, uint amount) internal view returns (bool) {
        require(IERC20(address(_synths(synths[_synth]))).balanceOf(payer) >= amount, "Not enough synth balance");
    }

    function _checkLoanIsOpen(Loan memory _loan) internal pure {
        require(_loan.interestIndex > 0, "Loan does not exist");
    }

    /* ========== MUTATIVE FUNCTIONS ========== */

    /* ---------- SETTERS ---------- */

    function setMinimumCollateralisation(uint _minimumCollateralisation) public onlyOwner {
        require(_minimumCollateralisation > 1e18, "Minimum collateralisation must be greater than 1");
        minimumCollateralisation = _minimumCollateralisation;
        emit MinimumCollateralisationRatioUpdated(minimumCollateralisation);  
    }

    function setBaseInterestRate(uint _baseInterestRate) public onlyOwner {
        require(_baseInterestRate >= 0, "Must be greater than or equal to 0");
        baseInterestRate = _baseInterestRate;
        emit BaseInterestRateUpdated(baseInterestRate);
    }

    function setLiquidationPenalty(uint _liquidationPenalty) public onlyOwner {
        require(_liquidationPenalty > 0, "Must be greater than 0");
        liquidationPenalty = _liquidationPenalty;
        emit LiquidationPenaltyUpdated(liquidationPenalty);
    }

    function setIssueFeeRate(uint _issueFeeRate) public onlyOwner {
        require(_issueFeeRate >= 0, "Must be greater than or equal to 0");
        issueFeeRate = _issueFeeRate;
        emit IssueFeeRateUpdated(issueFeeRate);
    }

    function setManager(address _newManager) public onlyOwner {
        manager = _newManager;
        emit ManagerUpdated(manager);
    }

    /* ---------- LOAN INTERACTIONS ---------- */

    function openInternal(uint collateral, uint amount, bytes32 currency) 
        internal         
        notPaused
        CollateralRateNotInvalid  
        returns (uint id) 
    {
        _systemStatus().requireIssuanceActive();

        // 1. We can only issue certain synths.
        require(synths[currency] > 0, "Not allowed to issue this synth");

        // 2. Collateral > minimum collateral size.
        require(collateral > 0, "Not enough collateral to create a loan");

        // 3. Calculate max possible loan from collateral provided
        uint max = maxLoan(collateral, currency);

        // 4. Require requested loan < max loan
        require(amount <= max, "Loan amount exceeds max borrowing power");

        // 5. This fee is denominated in the currency of the loan
        uint issueFee = amount.multiplyDecimalRound(issueFeeRate);

        // 6. Calculate the minting fee and subtract it from the loan amount
        uint loanAmountMinusFee = amount.sub(issueFee);

        // 7. Get a Loan ID
        id = state.incrementTotalLoans();

        // 8. Create the loan struct.
        Loan memory loan = Loan({
            id: id,
            account: msg.sender,
            collateral: collateral, 
            currency: currency,
            amount: amount,
            accruedInterest: 0,
            interestIndex: 0
        });

        // 9. Accrue interest on the loan.
        loan = accrueInterest(loan);

        // 10. Save the loan to storage
        state.createLoan(loan);

        // 11. Pay the minting fees to the fee pool
        _payFees(issueFee, currency); 
        
        // 12. Issue synths to the borrower.
        _synths(synths[currency]).issue(msg.sender, loanAmountMinusFee);
        
        // 13. Tell the manager.
        _manager().incrementLongs(currency, amount);

        // 14. Emit event
        emit LoanCreated(msg.sender, id, amount, collateral, currency, issueFee);
    }

    function closeInternal(address borrower, uint id) internal returns(uint collateral) {
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
        _synths(synths[loan.currency]).burn(borrower, total);

        // 7. Tell the manager.
        _manager().decrementLongs(loan.currency, loan.amount);

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

        emit LoanClosed(borrower, id);
    }

    function closeByLiquidationInternal(address borrower, address liquidator, Loan memory loan) internal returns(uint collateral) {
        // 1. Work out the total amount owing on the loan.
        uint total = loan.amount.add(loan.accruedInterest);

        // 2. Store this for the event.
        uint amount = loan.amount;
        
        // 3. Return collateral to the child class so it knows how much to transfer.
        collateral = loan.collateral;
        
        // 4. Burn the synths
        _synths(synths[loan.currency]).burn(liquidator, total);

        // 5. Tell the manager.
        _manager().decrementLongs(loan.currency, loan.amount);

        // 6. Pay fees
        _payFees(loan.accruedInterest, loan.currency);

        // 7. Record loan as closed
        loan.amount = 0;
        loan.collateral = 0;
        loan.accruedInterest = 0;
        loan.interestIndex = 0;
        state.updateLoan(loan);

        emit LoanClosedByLiquidation(borrower, loan.id, liquidator, amount, collateral);
    }

    function depositInternal(address account, uint id, uint amount) internal {
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

    // Withdraws collateral from the specified loan
    function withdrawInternal(uint id, uint amount) internal returns (uint withdraw) {
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
        require(cratioAfter > minimumCollateralisation, "Collateral ratio below liquidation after withdraw");

        // 9. Store the loan.
        state.updateLoan(loan);

        withdraw = amount;
        
        // 10. Emit the event.
        emit CollateralWithdrawn(msg.sender, id, amount, loan.collateral);
    }
    
    function liquidateInternal(address borrower, uint id, uint payment) internal returns (uint) {
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
        require(cratio < minimumCollateralisation, "Collateral ratio above liquidation ratio");

        // 8. Determine how much needs to be liquidated to fix their c ratio.
        uint liquidationAmount = liquidationAmount(loan);

        // 9. Only allow them to liquidate enough to fix the c ratio
        uint amountToLiquidate = liquidationAmount < payment ? liquidationAmount : payment;

        // 4. Work out the total amount owing on the loan.
        uint amountOwing = loan.amount.add(loan.accruedInterest);

        // We need to close the loan if this is the case.
        if (amountToLiquidate >= amountOwing) {
            return closeByLiquidationInternal(borrower, msg.sender, loan);
        }

        // 10. Process the payment to workout interest/principal split.
        loan = _processPayment(loan, amountToLiquidate);

        // 11. Work out how much collateral to redeem
        uint collateralLiquidated = collateralRedeemed(loan.currency, amountToLiquidate);
        loan.collateral = loan.collateral.sub(collateralLiquidated);

        // 12. burn synths from msg.sender for amount to liquidate
        _synths(synths[loan.currency]).burn(msg.sender, amountToLiquidate);

        // 13. Store the loan.
        state.updateLoan(loan);

        // 14. Emit the event
        emit LoanPartiallyLiquidated(
            borrower,
            id,
            msg.sender,
            amountToLiquidate,
            collateralLiquidated
        );

        return collateralLiquidated;
    }

    function repayInternal(address borrower, address repayer, uint id, uint payment) internal {
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
        _synths(synths[loan.currency]).burn(repayer, payment);

        // 10. Store the loan
        state.updateLoan(loan);

        // 11. Emit the event.
        emit LoanRepaymentMade(borrower, repayer, id, payment, loan.amount);
    }

     // Update the cumulative interest rate for the currency that was interacted with.
    function accrueInterest(Loan memory loan) internal returns (Loan memory loanAfter) {
        loanAfter = loan;

        // 1. Get the rates time series for this currency.
        uint[] memory rates = state.getRates(loan.currency);

        // 2. Get the timestamp of the last rate update.
        uint lastTime = state.rateLastUpdated(loan.currency);

        // 4. Get the instantaneous rate. i = mU + b
        uint instantaneousRate = baseInterestRate.add(_manager().getScaledUtilisation());

        // 5. Get the time since we last updated the rate.
        uint timeDelta = block.timestamp.sub(lastTime).mul(SafeDecimalMath.unit());

        // 6. Get the time its been applied for. F
        uint cumulativeRate = instantaneousRate.multiplyDecimal(timeDelta);

        // 7. Get the latest cumulative rate. F_n+1 = F_n + F_last
        uint latestCumulative = rates[rates.length - 1].add(cumulativeRate);

        // 8. Get the cumulative rate when the loan was last interacted with.
        uint entryCumulativeRate = rates[loan.interestIndex];

        // 9. If the loan was just opened, don't record any interest.
        uint interest = loan.interestIndex == 0 ? 0 : loan.amount.multiplyDecimal(latestCumulative.sub(entryCumulativeRate));

        // 10. Update rates with the lastest cumulative rate. This also updates the time.
        state.updateRates(loan.currency, latestCumulative);

        // 11. Update loan
        loanAfter.accruedInterest = loan.accruedInterest.add(interest);
        loanAfter.interestIndex = rates.length;
        state.updateLoan(loanAfter);

        return loanAfter;
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
            _manager().decrementLongs(loanAfter.currency, payment);

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
        require(!_exchangeRates().rateIsInvalid(collateralKey), "Blocked as collateral rate is invalid");
        _;
    }

    // ========== EVENTS ==========
    // Setters
    event MinimumCollateralisationRatioUpdated(uint minimumCollateralisation);
    event BaseInterestRateUpdated(uint baseInterestRate);
    event LiquidationPenaltyUpdated(uint liquidationPenalty);
    event IssueFeeRateUpdated(uint issueFeeRate);
    event ManagerUpdated(address manager);

    // Loans
    event LoanCreated(address indexed account, uint id, uint amount, uint collateral, bytes32 currency, uint issuanceFee);
    event LoanClosed(address indexed account, uint id);
    event CollateralDeposited(address indexed account, uint id, uint amountDeposited, uint collateralAfter);
    event CollateralWithdrawn(address indexed account, uint id, uint amountWithdrawn, uint collateralAfter);
    event LoanRepaymentMade(address indexed account, address indexed repayer, uint id, uint amountRepaid, uint amountAfter);
    event LoanPartiallyLiquidated(
        address indexed account,
        uint id,
        address liquidator,
        uint amountLiquidated,
        uint collateralLiquidated
    );
    event LoanClosedByLiquidation(address indexed account, uint id, address indexed liquidator, uint amountLiquidated, uint collateralLiquidated);
}