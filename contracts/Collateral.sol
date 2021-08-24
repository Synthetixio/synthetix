pragma solidity ^0.5.16;

pragma experimental ABIEncoderV2;

// Inheritance
import "./Owned.sol";
import "./MixinSystemSettings.sol";
import "./interfaces/ICollateralLoan.sol";

// Libraries
import "./SafeDecimalMath.sol";

// Internal references
import "./interfaces/ICollateralUtil.sol";
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

    // Stores open loans.
    mapping(uint => Loan) public loans;

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
    uint public interactionDelay = 0;

    bool public canOpenLoans = true;

    /* ========== ADDRESS RESOLVER CONFIGURATION ========== */

    bytes32 private constant CONTRACT_SYSTEMSTATUS = "SystemStatus";
    bytes32 private constant CONTRACT_EXRATES = "ExchangeRates";
    bytes32 private constant CONTRACT_EXCHANGER = "Exchanger";
    bytes32 private constant CONTRACT_FEEPOOL = "FeePool";
    bytes32 private constant CONTRACT_SYNTHSUSD = "SynthsUSD";
    bytes32 private constant CONTRACT_COLLATERALUTIL = "CollateralUtil";

    /* ========== CONSTRUCTOR ========== */

    constructor(
        address _owner,
        ICollateralManager _manager,
        address _resolver,
        bytes32 _collateralKey,
        uint _minCratio,
        uint _minCollateral
    ) public Owned(_owner) MixinSystemSettings(_resolver) {
        manager = _manager;
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
        newAddresses[5] = CONTRACT_COLLATERALUTIL;

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

    function _collateralUtil() internal view returns (ICollateralUtil) {
        return ICollateralUtil(requireAndGetAddress(CONTRACT_COLLATERALUTIL));
    }

    /* ---------- Public Views ---------- */

    function collateralRatio(uint id) public view returns (uint cratio) {
        Loan memory loan = loans[id];
        return _collateralUtil().getCollateralRatio(loan, collateralKey);
    }

    function liquidationAmount(uint id) public view returns (uint liqAmount) {
        Loan memory loan = loans[id];
        return _collateralUtil().liquidationAmount(loan, minCratio, collateralKey);
    }

    // The maximum number of synths issuable for this amount of collateral
    function maxLoan(uint amount, bytes32 currency) public view returns (uint max) {
        return _collateralUtil().maxLoan(amount, currency, minCratio, collateralKey);
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
        require(IERC20(address(_synth(synthsByKey[key]))).balanceOf(payer) >= amount, "Not enough balance");
    }

    // We set the interest index to 0 to indicate the loan has been closed.
    function _checkLoanAvailable(Loan memory loan) internal view {
        require(loan.interestIndex > 0, "Loan does not exist");
        require(loan.lastInteraction.add(interactionDelay) <= block.timestamp, "Recently interacted");
    }

    function _issuanceRatio() internal view returns (uint ratio) {
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

    function _openInternal(
        uint collateral,
        uint amount,
        bytes32 currency,
        bool short
    ) internal rateIsValid returns (uint id) {
        // 0. Check the system is active.
        _systemStatus().requireIssuanceActive();

        // 1. Check if able to open loans.
        require(canOpenLoans, "Open disabled");

        // 2. We can only issue certain synths.
        require(synthsByKey[currency] > 0, "Not allowed to issue");

        // 3. Make sure the synth rate is not invalid.
        require(!_exchangeRates().rateIsInvalid(currency), "Invalid rate");

        // 4. Collateral >= minimum collateral size.
        require(collateral >= minCollateral, "Not enough collateral");

        // 5. Check we haven't hit the debt cap for non snx collateral.
        (bool canIssue, bool anyRateIsInvalid) = manager.exceedsDebtLimit(amount, currency);

        // 6. Check if we've hit the debt cap or any rate is invalid.
        require(canIssue && !anyRateIsInvalid, "Debt limit or invalid rate");

        // 7. Require requested loan < max loan.
        require(amount <= maxLoan(collateral, currency), "Exceed max borrow power");

        // 8. This fee is denominated in the currency of the loan.
        uint issueFee = amount.multiplyDecimalRound(getIssueFeeRate(address(this)));

        // 9. Calculate the minting fee and subtract it from the loan amount.
        uint loanAmountMinusFee = amount.sub(issueFee);

        // 10. Get a Loan ID.
        id = manager.getNewLoanId();

        // 11. Create the loan struct.
        loans[id] = Loan({
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

        // 12. Accrue interest on the loan.
        _accrueInterest(loans[id]);

        // 13. Pay the minting fees to the fee pool.
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

        // 15. Emit event for the newly opened loan.
        emit LoanCreated(msg.sender, id, amount, collateral, currency, issueFee);
    }

    function _closeInternal(address borrower, uint id) internal rateIsValid returns (uint amount, uint collateral) {
        // 0. Get the loan and accrue interest.
        Loan storage loan = _getLoanAndAccrueInterest(id, borrower);

        // 1. Check loan is open and last interaction time.
        _checkLoanAvailable(loan);

        // 2. Record loan as closed.
        (amount, collateral) = _closeLoan(borrower, borrower, loan);

        // 3. Emit the event for the closed loan.
        emit LoanClosed(borrower, id);
    }

    function _closeByLiquidationInternal(
        address borrower,
        address liquidator,
        Loan storage loan
    ) internal returns (uint amount, uint collateral) {
        (amount, collateral) = _closeLoan(borrower, liquidator, loan);

        // Emit the event for the loan closed by liquidation.
        emit LoanClosedByLiquidation(borrower, loan.id, liquidator, amount, collateral);
    }

    function _closeLoan(
        address borrower,
        address liquidator,
        Loan storage loan
    ) internal returns (uint amount, uint collateral) {
        // 0. Work out the total amount owing on the loan.
        uint total = loan.amount.add(loan.accruedInterest);

        // 1. Store this for the event.
        amount = loan.amount;

        // 2. Return collateral to the child class so it knows how much to transfer.
        collateral = loan.collateral;

        // 3. Check that the sender has enough synths.
        _checkSynthBalance(msg.sender, loan.currency, total);

        // 4. Burn the synths.
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

        // 6. Pay fees.
        _payFees(loan.accruedInterest, loan.currency);

        // 7. Record loan as closed.
        loan.amount = 0;
        loan.collateral = 0;
        loan.accruedInterest = 0;
        loan.interestIndex = 0;
        loan.lastInteraction = block.timestamp;
    }

    function _depositInternal(
        address account,
        uint id,
        uint amount
    ) internal rateIsValid returns (uint, uint) {
        // 0. Check the system is active.
        _systemStatus().requireIssuanceActive();

        // 1. They sent some value > 0
        require(amount > 0, "Deposit must be above 0");

        // 2. Get the loan.
        // Owner is not important here, as it is a donation to the collateral of the loan
        Loan storage loan = loans[id];

        // 3. Check loan is open and last interaction time.
        _checkLoanAvailable(loan);

        // 4. Accrue interest on the loan.
        _accrueInterest(loan);

        // 5. Add the collateral.
        loan.collateral = loan.collateral.add(amount);

        // 6. Emit the event for the deposited collateral.
        emit CollateralDeposited(account, id, amount, loan.collateral);

        return (loan.amount, loan.collateral);
    }

    function _withdrawInternal(uint id, uint amount) internal rateIsValid returns (uint, uint) {
        // 0. Get the loan and accrue interest.
        Loan storage loan = _getLoanAndAccrueInterest(id, msg.sender);

        // 1. Check loan is open and last interaction time.
        _checkLoanAvailable(loan);

        // 2. Subtract the collateral.
        loan.collateral = loan.collateral.sub(amount);

        // 3. Check that the new amount does not put them under the minimum c ratio.
        _checkLoanRatio(loan);

        // 4. Emit the event for the withdrawn collateral.
        emit CollateralWithdrawn(msg.sender, id, amount, loan.collateral);

        return (loan.amount, loan.collateral);
    }

    function _liquidateInternal(
        address borrower,
        uint id,
        uint payment
    ) internal rateIsValid returns (uint collateralLiquidated) {
        // 0. Get the loan and accrue interest.
        Loan storage loan = _getLoanAndAccrueInterest(id, borrower);

        // 1. Check loan is open and last interaction time.
        _checkLoanAvailable(loan);

        // 2. Check they have enough balance to make the payment.
        _checkSynthBalance(msg.sender, loan.currency, payment);

        // 3. Check the payment amount.
        require(payment > 0, "Payment must be above 0");

        // 4. Check they are eligible for liquidation.
        // Note: this will revert if collateral is 0, however that should only be possible if the loan amount is 0.
        require(_collateralUtil().getCollateralRatio(loan, collateralKey) < minCratio, "Cratio above liq ratio");

        // 5. Determine how much needs to be liquidated to fix their c ratio.
        uint liqAmount = _collateralUtil().liquidationAmount(loan, minCratio, collateralKey);

        // 6. Only allow them to liquidate enough to fix the c ratio.
        uint amountToLiquidate = liqAmount < payment ? liqAmount : payment;

        // 7. Work out the total amount owing on the loan.
        uint amountOwing = loan.amount.add(loan.accruedInterest);

        // 8. If its greater than the amount owing, we need to close the loan.
        if (amountToLiquidate >= amountOwing) {
            (, collateralLiquidated) = _closeByLiquidationInternal(borrower, msg.sender, loan);
            return collateralLiquidated;
        }

        // 9. Check they have enough balance to liquidate the loan.
        _checkSynthBalance(msg.sender, loan.currency, amountToLiquidate);

        // 10. Process the payment to workout interest/principal split.
        _processPayment(loan, amountToLiquidate);

        // 11. Work out how much collateral to redeem.
        collateralLiquidated = _collateralUtil().collateralRedeemed(loan.currency, amountToLiquidate, collateralKey);
        loan.collateral = loan.collateral.sub(collateralLiquidated);

        // 12. Burn the synths from the liquidator.
        _synth(synthsByKey[loan.currency]).burn(msg.sender, amountToLiquidate);

        // 13. Emit the event for the partial liquidation.
        emit LoanPartiallyLiquidated(borrower, id, msg.sender, amountToLiquidate, collateralLiquidated);
    }

    function _repayInternal(
        address borrower,
        address repayer,
        uint id,
        uint payment
    ) internal rateIsValid returns (uint, uint) {
        // 0. Get the loan and accrue interest.
        Loan storage loan = _getLoanAndAccrueInterest(id, borrower);

        // 1. Check loan is open and last interaction time.
        _checkLoanAvailable(loan);

        // 2. Check the spender has enough synths to make the repayment
        _checkSynthBalance(repayer, loan.currency, payment);

        // 3. Process the payment.
        require(payment > 0, "Payment must be above 0");
        _processPayment(loan, payment);

        // 4. Update the last interaction time.
        loan.lastInteraction = block.timestamp;

        // 5. Burn synths from the payer
        _synth(synthsByKey[loan.currency]).burn(repayer, payment);

        // 6. Emit the event the repayment.
        emit LoanRepaymentMade(borrower, repayer, id, payment, loan.amount);

        return (loan.amount, loan.collateral);
    }

    function _repayWithCollateralInternal(
        address borrower,
        address repayer,
        uint id,
        uint payment,
        bool payInterest
    ) internal rateIsValid returns (uint, uint) {
        // 0. Get the loan to repay and accrue interest.
        Loan storage loan = _getLoanAndAccrueInterest(id, borrower);

        // 1. Check loan is open and last interaction time.
        _checkLoanAvailable(loan);

        // 2. Check the payment amount.
        require(payment > 0, "Payment must be above 0");

        // 3. Repay the accruedInterest if payInterest == true.
        if (payInterest) {
            payment = payment.add(loan.accruedInterest);
        }

        // 4. Make sure they are not overpaying.
        require(payment <= loan.amount.add(loan.accruedInterest), "Payment too high");

        // 5. Get the expected amount for the exchange from borrowed synth -> sUSD.
        (uint expectedAmount, uint fee, ) = _exchanger().getAmountsForExchange(payment, loan.currency, sUSD);

        // 6. Reduce the collateral by the amount repaid (minus the exchange fees).
        loan.collateral = loan.collateral.sub(expectedAmount);

        // 7. Process the payment and pay the exchange fees if needed.
        _processPayment(loan, payment);
        _payFees(fee, sUSD);

        // 8. Update the last interaction time.
        loan.lastInteraction = block.timestamp;

        // 9. Emit the event for the collateral repayment.
        emit LoanRepaymentMade(borrower, repayer, id, payment, loan.amount);

        return (loan.amount, loan.collateral);
    }

    function _drawInternal(uint id, uint amount) internal rateIsValid returns (uint, uint) {
        // 0. Get the loan and accrue interest.
        Loan storage loan = _getLoanAndAccrueInterest(id, msg.sender);

        // 1. Check last interaction time.
        _checkLoanAvailable(loan);

        // 2. Add the requested amount.
        loan.amount = loan.amount.add(amount);

        // 3. If it is below the minimum, don't allow this draw.
        _checkLoanRatio(loan);

        // 4. This fee is denominated in the currency of the loan
        uint issueFee = amount.multiplyDecimalRound(getIssueFeeRate(address(this)));

        // 5. Calculate the minting fee and subtract it from the draw amount
        uint amountMinusFee = amount.sub(issueFee);

        // 6. If its short, let the child handle it, otherwise issue the synths.
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

        // 7. Pay the minting fees to the fee pool
        _payFees(issueFee, loan.currency);

        // 8. Update the last interaction time.
        loan.lastInteraction = block.timestamp;

        // 9. Emit the event for the draw down.
        emit LoanDrawnDown(msg.sender, id, amount);

        return (loan.amount, loan.collateral);
    }

    // Update the cumulative interest rate for the currency that was interacted with.
    function _accrueInterest(Loan storage loan) internal {
        (uint differential, uint newIndex) = manager.accrueInterest(loan.interestIndex, loan.currency, loan.short);

        // If the loan was just opened, don't record any interest. Otherwise multiple by the amount outstanding.
        uint interest = loan.interestIndex == 0 ? 0 : loan.amount.multiplyDecimal(differential);

        // Update the loan.
        loan.accruedInterest = loan.accruedInterest.add(interest);
        loan.interestIndex = newIndex;
    }

    // Works out the amount of interest and principal after a repayment is made.
    function _processPayment(Loan storage loan, uint payment) internal {
        if (payment > 0 && loan.accruedInterest > 0) {
            uint interestPaid = payment > loan.accruedInterest ? loan.accruedInterest : payment;
            loan.accruedInterest = loan.accruedInterest.sub(interestPaid);
            payment = payment.sub(interestPaid);

            _payFees(interestPaid, loan.currency);
        }

        // If there is more payment left after the interest, pay down the pr incipal.
        if (payment > 0) {
            loan.amount = loan.amount.sub(payment);

            // And get the manager to reduce the total long/short balance.
            if (loan.short) {
                manager.decrementShorts(loan.currency, payment);

                if (shortingRewards[loan.currency] != address(0)) {
                    IShortingRewards(shortingRewards[loan.currency]).withdraw(loan.account, payment);
                }
            } else {
                manager.decrementLongs(loan.currency, payment);
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

    function _getLoanAndAccrueInterest(uint id, address owner) internal returns (Loan storage loan) {
        loan = loans[id];
        _systemStatus().requireIssuanceActive();
        require(loan.account == owner, "Must be borrower");
        require(loan.interestIndex != 0);
        _accrueInterest(loan);
    }

    function _checkLoanRatio(Loan storage loan) internal view {
        if (loan.amount == 0) {
            return;
        }
        require(collateralRatio(loan.id) > minCratio, "Cratio too low");
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
