pragma solidity ^0.5.16;

pragma experimental ABIEncoderV2;

// Inheritance
import "./Collateral.sol";

contract CollateralShort is Collateral {
    constructor(
        address _owner,
        ICollateralManager _manager,
        address _resolver,
        bytes32 _collateralKey,
        uint _minCratio,
        uint _minCollateral
    ) public Collateral(_owner, _manager, _resolver, _collateralKey, _minCratio, _minCollateral) {}

    function open(
        uint collateral,
        uint amount,
        bytes32 currency
    ) external returns (uint id) {
        // Transfer from will throw if they didn't set the allowance
        IERC20(address(_synthsUSD())).transferFrom(msg.sender, address(this), collateral);

        id = _open(collateral, amount, currency, true);
    }

    function close(uint id) external returns (uint amount, uint collateral) {
        (amount, collateral) = _close(msg.sender, id);

        IERC20(address(_synthsUSD())).transfer(msg.sender, collateral);
    }

    function deposit(
        address borrower,
        uint id,
        uint amount
    ) external returns (uint principal, uint collateral) {
        require(amount <= IERC20(address(_synthsUSD())).allowance(msg.sender, address(this)), "Allowance too low");

        IERC20(address(_synthsUSD())).transferFrom(msg.sender, address(this), amount);

        (principal, collateral) = _deposit(borrower, id, amount);
    }

    function withdraw(uint id, uint amount) external returns (uint principal, uint collateral) {
        (principal, collateral) = _withdraw(id, amount);

        IERC20(address(_synthsUSD())).transfer(msg.sender, amount);
    }

    function repay(
        address borrower,
        uint id,
        uint amount
    ) external returns (uint principal, uint collateral) {
        (principal, collateral) = _repay(borrower, msg.sender, id, amount);
    }

    function closeWithCollateral(uint id) external returns (uint amount, uint collateral) {
        (amount, collateral) = _closeLoanByRepayment(msg.sender, id);

        if (collateral > 0) {
            IERC20(address(_synthsUSD())).transfer(msg.sender, collateral);
        }
    }

    function repayWithCollateral(uint id, uint amount) external returns (uint principal, uint collateral) {
        (principal, collateral) = _repayWithCollateral(msg.sender, id, amount);
    }

    // Needed for Lyra.
    function getShortAndCollateral(
        address, /* borrower */
        uint id
    ) external view returns (uint principal, uint collateral) {
        Loan memory loan = loans[id];
        return (loan.amount, loan.collateral);
    }

    function draw(uint id, uint amount) external returns (uint principal, uint collateral) {
        (principal, collateral) = _draw(id, amount);
    }

    function liquidate(
        address borrower,
        uint id,
        uint amount
    ) external {
        uint collateralLiquidated = _liquidate(borrower, id, amount);

        IERC20(address(_synthsUSD())).transfer(msg.sender, collateralLiquidated);
    }

    function _closeLoanByRepayment(address borrower, uint id) internal returns (uint amount, uint collateral) {
        // 0. Get the loan.
        Loan storage loan = loans[id];

        // 1. Repay the loan with its collateral.
        (amount, collateral) = _repayWithCollateral(borrower, id, loan.amount);

        // 2. Pay the service fee for collapsing the loan.
        uint serviceFee = amount.multiplyDecimalRound(getCollapseFeeRate(address(this)));
        _payFees(serviceFee, sUSD);
        collateral = collateral.sub(serviceFee);

        // 3. Record loan as closed.
        _recordLoanAsClosed(loan);

        // 4. Emit the event for the loan closed by repayment.
        emit LoanClosedByRepayment(borrower, id, amount, collateral);
    }

    function _repayWithCollateral(
        address borrower,
        uint id,
        uint payment
    ) internal rateIsValid issuanceIsActive returns (uint amount, uint collateral) {
        // 0. Get the loan to repay and accrue interest.
        Loan storage loan = _getLoanAndAccrueInterest(id, borrower);

        // 1. Check loan is open and last interaction time.
        _checkLoanAvailable(loan);

        // 2. Repay the accrued interest.
        payment = payment.add(loan.accruedInterest);

        // 3. Make sure they are not overpaying.
        require(payment <= loan.amount.add(loan.accruedInterest), "Payment too high");

        // 4. Get the expected amount for the exchange from borrowed synth -> sUSD.
        (uint expectedAmount, uint fee, ) = _exchanger().getAmountsForExchange(payment, loan.currency, sUSD);

        // check returned amount is non zero (as exchange can have no-ops)
        require(expectedAmount > 0, "exchange will return 0 amount");

        // subsequent calculation assume collateral is sUSD, we should ensure this is the case
        require(collateralKey == sUSD);

        // 5. Reduce the collateral by the amount repaid (minus the exchange fees).
        loan.collateral = loan.collateral.sub(expectedAmount);

        // 6. Process the payment and pay the exchange fees if needed.
        _processPayment(loan, payment);
        _payFees(fee, sUSD);

        // 7. Update the last interaction time.
        loan.lastInteraction = block.timestamp;

        // 8. Emit the event for the collateral repayment.
        emit LoanRepaymentMade(borrower, borrower, id, payment, loan.amount);

        // 9. Return the amount repaid and the remaining collateral.
        return (payment, loan.collateral);
    }
}
