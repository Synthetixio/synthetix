pragma solidity ^0.5.16;

// Inheritance
import "./Owned.sol";
import "./Pausable.sol";
import "openzeppelin-solidity-2.3.0/contracts/utils/ReentrancyGuard.sol";
import "./MixinResolver.sol";
import "./interfaces/IEtherCollateral.sol";

// Libraries
import "./SafeDecimalMath.sol";

// Internal references
import "./interfaces/ISystemStatus.sol";
import "./interfaces/IFeePool.sol";
import "./interfaces/ISynth.sol";
import "./interfaces/IERC20.sol";
import "./interfaces/IExchangeRates.sol";


// ETH Collateral v0.3 (sUSD)
// https://docs.synthetix.io/contracts/EtherCollateralsUSD
contract EtherCollateralsUSD is Owned, Pausable, ReentrancyGuard, MixinResolver, IEtherCollateral {
    using SafeMath for uint256;
    using SafeDecimalMath for uint256;

    // ========== CONSTANTS ==========
    uint256 internal constant ONE_THOUSAND = 1e18 * 1000;
    uint256 internal constant ONE_HUNDRED = 1e18 * 100;

    uint256 internal constant SECONDS_IN_A_YEAR = 31536000; // Common Year

    // Where fees are pooled in sUSD.
    address internal constant FEE_ADDRESS = 0xfeEFEEfeefEeFeefEEFEEfEeFeefEEFeeFEEFEeF;

    bytes32 private constant sUSD = "sUSD";
    bytes32 public constant COLLATERAL = "ETH";

    // ========== SETTER STATE VARIABLES ==========

    // The ratio of Collateral to synths issued
    uint256 public collateralizationRatio = SafeDecimalMath.unit() * 150;

    // If updated, all outstanding loans will pay this interest rate in on closure of the loan. Default 5%
    uint256 public interestRate = (5 * SafeDecimalMath.unit()) / 100;
    uint256 public interestPerSecond = interestRate.div(SECONDS_IN_A_YEAR);

    // Minting fee for issuing the synths. Default 50 bips.
    uint256 public issueFeeRate = (5 * SafeDecimalMath.unit()) / 1000;

    // Maximum amount of sUSD that can be issued by the EtherCollateral contract. Default 10MM
    uint256 public issueLimit = SafeDecimalMath.unit() * 10000000;

    // Minimum amount of ETH to create loan preventing griefing and gas consumption. Min 1ETH =
    uint256 public minLoanSize = SafeDecimalMath.unit() * 1;

    // Maximum number of loans an account can create
    uint256 public accountLoanLimit = 50;

    // If true then any wallet addres can close a loan not just the loan creator.
    bool public loanLiquidationOpen = false;

    // Time when remaining loans can be liquidated
    uint256 public liquidationDeadline;

    // Liquidation ratio when loans can be liquidated
    uint256 public liquidationRatio = SafeDecimalMath.unit() * 150;

    // Liquidation penalty when loans are liquidated. default 10%
    uint256 public liquidationPenalty = SafeDecimalMath.unit() / 10;

    // ========== STATE VARIABLES ==========

    // The total number of synths issued by the collateral in this contract
    uint256 public totalIssuedSynths;

    // Total number of loans ever created
    uint256 public totalLoansCreated;

    // Total number of open loans
    uint256 public totalOpenLoanCount;

    // Synth loan storage struct
    struct SynthLoanStruct {
        //  Acccount that created the loan
        address account;
        //  Amount (in collateral token ) that they deposited
        uint256 collateralAmount;
        //  Amount (in synths) that they issued to borrow
        uint256 loanAmount;
        // Minting Fee
        uint256 mintingFee;
        // When the loan was created
        uint256 timeCreated;
        // ID for the loan
        uint256 loanID;
        // When the loan was paidback (closed)
        uint256 timeClosed;
        // Applicable Interest rate
        uint256 loanInterestRate;
        // last timestamp interest amounts accrued
        uint40 lastInterestAccrued;
    }

    // Users Loans by address
    mapping(address => SynthLoanStruct[]) public accountsSynthLoans;

    // Account Open Loan Counter
    mapping(address => uint256) public accountOpenLoanCounter;

    /* ========== ADDRESS RESOLVER CONFIGURATION ========== */

    bytes32 private constant CONTRACT_SYSTEMSTATUS = "SystemStatus";
    bytes32 private constant CONTRACT_SYNTHSETH = "SynthsETH";
    bytes32 private constant CONTRACT_SYNTHSUSD = "SynthsUSD";
    bytes32 private constant CONTRACT_EXRATES = "ExchangeRates";
    bytes32 private constant CONTRACT_FEEPOOL = "FeePool";

    bytes32[24] private addressesToCache = [
        CONTRACT_SYSTEMSTATUS,
        CONTRACT_SYNTHSETH,
        CONTRACT_SYNTHSUSD,
        CONTRACT_EXRATES,
        CONTRACT_FEEPOOL
    ];

    // ========== CONSTRUCTOR ==========
    constructor(address _owner, address _resolver)
        public
        Owned(_owner)
        Pausable()
        MixinResolver(_resolver, addressesToCache)
    {
        liquidationDeadline = now + 92 days; // Time before loans can be open for liquidation to end the trial contract
    }

    // ========== SETTERS ==========

    function setCollateralizationRatio(uint256 ratio) external onlyOwner {
        require(ratio <= ONE_THOUSAND, "Too high");
        require(ratio >= ONE_HUNDRED, "Too low");
        collateralizationRatio = ratio;
        emit CollateralizationRatioUpdated(ratio);
    }

    function setInterestRate(uint256 _interestRate) external onlyOwner {
        require(_interestRate > SECONDS_IN_A_YEAR, "Interest rate cannot be less that the SECONDS_IN_A_YEAR");
        require(_interestRate <= SafeDecimalMath.unit(), "Interest cannot be more than 100% APR");
        interestRate = _interestRate;
        interestPerSecond = _interestRate.div(SECONDS_IN_A_YEAR);
        emit InterestRateUpdated(interestRate);
    }

    function setIssueFeeRate(uint256 _issueFeeRate) external onlyOwner {
        issueFeeRate = _issueFeeRate;
        emit IssueFeeRateUpdated(issueFeeRate);
    }

    function setIssueLimit(uint256 _issueLimit) external onlyOwner {
        issueLimit = _issueLimit;
        emit IssueLimitUpdated(issueLimit);
    }

    function setMinLoanSize(uint256 _minLoanSize) external onlyOwner {
        minLoanSize = _minLoanSize;
        emit MinLoanSizeUpdated(minLoanSize);
    }

    function setAccountLoanLimit(uint256 _loanLimit) external onlyOwner {
        uint256 HARD_CAP = 1000;
        require(_loanLimit < HARD_CAP, "Owner cannot set higher than HARD_CAP");
        accountLoanLimit = _loanLimit;
        emit AccountLoanLimitUpdated(accountLoanLimit);
    }

    function setLoanLiquidationOpen(bool _loanLiquidationOpen) external onlyOwner {
        require(now > liquidationDeadline, "Before liquidation deadline");
        loanLiquidationOpen = _loanLiquidationOpen;
        emit LoanLiquidationOpenUpdated(loanLiquidationOpen);
    }

    // ========== PUBLIC VIEWS ==========

    function getContractInfo()
        external
        view
        returns (
            uint256 _collateralizationRatio,
            uint256 _issuanceRatio,
            uint256 _interestRate,
            uint256 _interestPerSecond,
            uint256 _issueFeeRate,
            uint256 _issueLimit,
            uint256 _minLoanSize,
            uint256 _totalIssuedSynths,
            uint256 _totalLoansCreated,
            uint256 _totalOpenLoanCount,
            uint256 _ethBalance,
            uint256 _liquidationDeadline,
            bool _loanLiquidationOpen
        )
    {
        _collateralizationRatio = collateralizationRatio;
        _issuanceRatio = issuanceRatio();
        _interestRate = interestRate;
        _interestPerSecond = interestPerSecond;
        _issueFeeRate = issueFeeRate;
        _issueLimit = issueLimit;
        _minLoanSize = minLoanSize;
        _totalIssuedSynths = totalIssuedSynths;
        _totalLoansCreated = totalLoansCreated;
        _totalOpenLoanCount = totalOpenLoanCount;
        _ethBalance = address(this).balance;
        _liquidationDeadline = liquidationDeadline;
        _loanLiquidationOpen = loanLiquidationOpen;
    }

    // returns value of 100 / collateralizationRatio.
    // e.g. 100/150 = 0.6666666667
    function issuanceRatio() public view returns (uint256) {
        // this rounds so you get slightly more rather than slightly less
        return ONE_HUNDRED.divideDecimalRound(collateralizationRatio);
    }

    function loanAmountFromCollateral(uint256 collateralAmount) public view returns (uint256) {
        return collateralAmount.multiplyDecimal(issuanceRatio());
    }

    function collateralAmountForLoan(uint256 loanAmount) external view returns (uint256) {
        return loanAmount.multiplyDecimal(collateralizationRatio.divideDecimalRound(ONE_HUNDRED));
    }

    // TODO - update current interest on loan to reflect paid back interest from liquidations ?

    // loanAmount should be updated for compounding interest calculation restart when loanAmount updated after liquidation
    // compounding interest on remaining loanAmount * (now - lastTimestampInterestPaid)
    // store accrued interest as rollup value if want to show / calc "totalInterestOnLoan" OR emit event of the accrued interest during liquidation tx
    function currentInterestOnLoan(address _account, uint256 _loanID) external view returns (uint256) {
        // Get the loan from storage
        SynthLoanStruct memory synthLoan = _getLoanFromStorage(_account, _loanID);
        uint256 loanLifeSpan = _loanLifeSpan(synthLoan);
        return accruedInterestOnLoan(synthLoan.loanAmount, loanLifeSpan);
    }

    function accruedInterestOnLoan(uint256 _loanAmount, uint256 _seconds) public view returns (uint256 interestAmount) {
        // Simple interest calculated per second
        // Interest = Principal * rate * time
        interestAmount = _loanAmount.multiplyDecimalRound(interestPerSecond.mul(_seconds));
    }

    function calculateMintingFee(address _account, uint256 _loanID) external view returns (uint256) {
        // Get the loan from storage
        SynthLoanStruct memory synthLoan = _getLoanFromStorage(_account, _loanID);
        return _calculateMintingFee(synthLoan);
    }

    /**
     * r = target issuance ratio
     * D = debt balance
     * V = Collateral
     * P = liquidation penalty
     * Calculates amount of synths = (D - V * r) / (1 - (1 + P) * r)
     */
    function calculateAmountToLiquidate(uint debtBalance, uint collateral) public view returns (uint) {
        uint ratio = liquidationRatio;
        uint unit = SafeDecimalMath.unit();

        uint dividend = debtBalance.sub(collateral.multiplyDecimal(ratio));
        uint divisor = unit.sub(unit.add(liquidationPenalty).multiplyDecimal(ratio));

        return dividend.divideDecimal(divisor);
    }

    function openLoanIDsByAccount(address _account) external view returns (uint256[] memory) {
        SynthLoanStruct[] memory synthLoans = accountsSynthLoans[_account];

        uint256[] memory _openLoanIDs = new uint256[](synthLoans.length);
        uint256 _counter = 0;

        for (uint256 i = 0; i < synthLoans.length; i++) {
            if (synthLoans[i].timeClosed == 0) {
                _openLoanIDs[_counter] = synthLoans[i].loanID;
                _counter++;
            }
        }
        // Create the fixed size array to return
        uint256[] memory _result = new uint256[](_counter);

        // Copy loanIDs from dynamic array to fixed array
        for (uint256 j = 0; j < _counter; j++) {
            _result[j] = _openLoanIDs[j];
        }
        // Return an array with list of open Loan IDs
        return _result;
    }

    function getLoan(address _account, uint256 _loanID)
        external
        view
        returns (
            address account,
            uint256 collateralAmount,
            uint256 loanAmount,
            uint256 timeCreated,
            uint256 loanID,
            uint256 timeClosed,
            uint256 interest,
            uint256 totalFees
        )
    {
        SynthLoanStruct memory synthLoan = _getLoanFromStorage(_account, _loanID);
        account = synthLoan.account;
        collateralAmount = synthLoan.collateralAmount;
        loanAmount = synthLoan.loanAmount;
        timeCreated = synthLoan.timeCreated;
        loanID = synthLoan.loanID;
        timeClosed = synthLoan.timeClosed;
        interest = accruedInterestOnLoan(synthLoan.loanAmount, _loanLifeSpan(synthLoan));
        totalFees = interest.add(_calculateMintingFee(synthLoan));
    }

    function loanLifeSpan(address _account, uint256 _loanID) external view returns (uint256 loanLifeSpanResult) {
        SynthLoanStruct memory synthLoan = _getLoanFromStorage(_account, _loanID);
        loanLifeSpanResult = _loanLifeSpan(synthLoan);
    }

    function getLoanCollateralRatio(address _account, uint256 _loanID) external view returns (uint256 loanCollateralRatio) {
        // Get the loan from storage
        SynthLoanStruct memory synthLoan = _getLoanFromStorage(_account, _loanID);

        (loanCollateralRatio, , ) = _collateralRatio(synthLoan);
    }

    function _collateralRatio(SynthLoanStruct memory _loan)
        internal
        view
        returns (
            uint256 loanCollateralRatio,
            uint256 collateralValue,
            uint256 interestAmount
        )
    {
        interestAmount = accruedInterestOnLoan(_loan.loanAmount, _loanLifeSpan(_loan));

        collateralValue = _loan.collateralAmount.multiplyDecimal(exchangeRates().rateForCurrency(COLLATERAL));

        loanCollateralRatio = collateralValue.divideDecimal(_loan.loanAmount.add(interestAmount));
    }

    // ========== PUBLIC FUNCTIONS ==========

    function openLoan() external payable notPaused nonReentrant ETHRateNotInvalid returns (uint256 loanID) {
        systemStatus().requireIssuanceActive();

        // Require ETH sent to be greater than minLoanSize
        require(msg.value >= minLoanSize, "Not enough ETH to create this loan. Please see the minLoanSize");

        // Require loanLiquidationOpen to be false or we are in liquidation phase
        require(loanLiquidationOpen == false, "Loans are now being liquidated");

        // Each account is limted to creating 50 (accountLoanLimit) loans
        require(accountsSynthLoans[msg.sender].length < accountLoanLimit, "Each account is limted to 50 loans");

        // Calculate issuance amount
        uint256 loanAmount = loanAmountFromCollateral(msg.value);
        uint256 mintingFee = loanAmount.multiplyDecimalRound(issueFeeRate);
        uint256 loanAmountWithFee = loanAmount.add(mintingFee);

        // Require sUSD loan to mint does not exceed cap
        require(totalIssuedSynths.add(loanAmountWithFee) < issueLimit, "Loan Amount exceeds the supply cap.");

        // Get a Loan ID
        loanID = _incrementTotalLoansCounter();

        // Create Loan storage object
        SynthLoanStruct memory synthLoan = SynthLoanStruct({
            account: msg.sender,
            collateralAmount: msg.value,
            loanAmount: loanAmountWithFee,
            mintingFee: mintingFee,
            timeCreated: now,
            loanID: loanID,
            timeClosed: 0,
            loanInterestRate: interestRate,
            lastInterestAccrued: 0
        });

        // Fee distribution. Mint the sUSD fees into the FeePool and record fees paid
        if (mintingFee > 0) {
            synthsUSD().issue(FEE_ADDRESS, mintingFee);
            feePool().recordFeePaid(mintingFee);
        }

        // Record loan in mapping to account in an array of the accounts open loans
        accountsSynthLoans[msg.sender].push(synthLoan);

        // Increment totalIssuedSynths
        totalIssuedSynths = totalIssuedSynths.add(loanAmount);

        // Issue the synth
        synthsUSD().issue(msg.sender, loanAmount);

        // Tell the Dapps a loan was created
        emit LoanCreated(msg.sender, loanID, loanAmount);
    }

    function closeLoan(uint256 loanID) external nonReentrant ETHRateNotInvalid {
        _closeLoan(msg.sender, loanID);
    }

    // Liquidate loans at or below issuance ratio
    function liquidateLoan(
        address _loanCreatorsAddress,
        uint256 _loanID,
        uint256 _debtToCover
    ) external nonReentrant ETHRateNotInvalid {
        systemStatus().requireSystemActive();

        // check msg.sender (liquidator's wallet) has sufficient sUSD
        require(IERC20(address(synthsUSD())).balanceOf(msg.sender) >= _debtToCover, "Not enough sUSD balance");

        SynthLoanStruct memory loan = _getLoanFromStorage(_loanCreatorsAddress, _loanID);

        require(loan.loanID > 0, "Loan does not exist");
        require(loan.timeClosed == 0, "Loan already closed");

        (uint256 loanCollateralRatio, uint256 collateralValue, uint256 interestAmount) = _collateralRatio(loan);

        require(loanCollateralRatio < liquidationRatio, "Collateral ratio above liquidation ratio");

        // calculate amount to liquidate to fix ratio including accrued interest
        uint256 totalLoanAmount = loan.loanAmount.add(interestAmount);
        uint256 liquidationAmount = calculateAmountToLiquidate(totalLoanAmount, collateralValue);

        uint256 amountToLiquidate = liquidationAmount > _debtToCover ? liquidationAmount : _debtToCover;

        // burn sUSD from msg.sender for amount to liquidate
        synthsUSD().burn(msg.sender, amountToLiquidate);

        // Decrement totalIssuedSynths
        totalIssuedSynths = totalIssuedSynths.sub(amountToLiquidate);

        // Collateral value to redeem
        uint256 collateralLiquidated = exchangeRates().effectiveValue(sUSD, amountToLiquidate, COLLATERAL);

        // Add penalty
        uint256 totalCollateralLiquidated = collateralLiquidated.multiplyDecimal(
            SafeDecimalMath.unit().add(liquidationPenalty)
        );

        // update remaining loanAmount and last interest accrued
        _updateLoan(loan, totalLoanAmount.sub(amountToLiquidate), uint40(now));

        // Send liquidated ETH collateral to msg.sender
        msg.sender.transfer(totalCollateralLiquidated);

        // emit loan liquidation event
        emit LoanPartiallyLiquidated(
            _loanCreatorsAddress,
            _loanID,
            msg.sender,
            amountToLiquidate,
            totalCollateralLiquidated
        );
    }

    // Liquidation of an open loan available for anyone
    function liquidateUnclosedLoan(address _loanCreatorsAddress, uint256 _loanID) external nonReentrant ETHRateNotInvalid {
        require(loanLiquidationOpen, "Liquidation is not open");
        // Close the creators loan and send collateral to the closer.
        _closeLoan(_loanCreatorsAddress, _loanID);
        // Tell the Dapps this loan was liquidated
        emit LoanLiquidated(_loanCreatorsAddress, _loanID, msg.sender);
    }

    // ========== PRIVATE FUNCTIONS ==========

    function _closeLoan(address account, uint256 loanID) private {
        systemStatus().requireIssuanceActive();

        // Get the loan from storage
        SynthLoanStruct memory synthLoan = _getLoanFromStorage(account, loanID);

        require(synthLoan.loanID > 0, "Loan does not exist");
        require(synthLoan.timeClosed == 0, "Loan already closed");

        // Calculate and deduct accrued interest (5%) for fee pool
        // Include accrued interests
        uint256 interestAmount = accruedInterestOnLoan(synthLoan.loanAmount, _loanLifeSpan(synthLoan));
        uint256 repayAmount = synthLoan.loanAmount.add(interestAmount);

        require(
            IERC20(address(synthsUSD())).balanceOf(msg.sender) >= repayAmount,
            "You do not have the required Synth balance to close this loan."
        );

        // Record loan as closed
        _recordLoanClosure(synthLoan);

        // Decrement totalIssuedSynths
        totalIssuedSynths = totalIssuedSynths.sub(synthLoan.loanAmount);

        // Burn all Synths issued for the loan + the fees
        synthsUSD().burn(msg.sender, repayAmount);

        // Fee distribution. Mint the sUSD fees into the FeePool and record fees paid
        synthsUSD().issue(FEE_ADDRESS, interestAmount);
        feePool().recordFeePaid(interestAmount);

        // Send remainder ETH to caller (loan creater or liquidator)
        msg.sender.transfer(synthLoan.collateralAmount);

        // Tell the Dapps
        emit LoanClosed(account, loanID, interestAmount);
    }

    function _totalFeesOnLoan(SynthLoanStruct memory synthLoan)
        internal
        view
        returns (uint256 interestAmount, uint256 mintingFee)
    {
        interestAmount = accruedInterestOnLoan(synthLoan.loanAmount, _loanLifeSpan(synthLoan));
        mintingFee = _calculateMintingFee(synthLoan);
    }

    function _getLoanFromStorage(address account, uint256 loanID) private view returns (SynthLoanStruct memory) {
        SynthLoanStruct[] memory synthLoans = accountsSynthLoans[account];
        for (uint256 i = 0; i < synthLoans.length; i++) {
            if (synthLoans[i].loanID == loanID) {
                return synthLoans[i];
            }
        }
    }

    function _updateLoan(
        SynthLoanStruct memory _synthLoan,
        uint256 _newLoanAmount,
        uint40 _lastInterestAccrued
    ) private {
        // Get storage pointer to the accounts array of loans
        SynthLoanStruct[] storage synthLoans = accountsSynthLoans[_synthLoan.account];
        for (uint256 i = 0; i < synthLoans.length; i++) {
            if (synthLoans[i].loanID == _synthLoan.loanID) {
                synthLoans[i].loanAmount = _newLoanAmount;
                synthLoans[i].lastInterestAccrued = _lastInterestAccrued;
            }
        }
    }

    function _recordLoanClosure(SynthLoanStruct memory synthLoan) private {
        // Get storage pointer to the accounts array of loans
        SynthLoanStruct[] storage synthLoans = accountsSynthLoans[synthLoan.account];
        for (uint256 i = 0; i < synthLoans.length; i++) {
            if (synthLoans[i].loanID == synthLoan.loanID) {
                // Record the time the loan was closed
                synthLoans[i].timeClosed = now;
            }
        }

        // Reduce Total Open Loans Count
        totalOpenLoanCount = totalOpenLoanCount.sub(1);
    }

    function _incrementTotalLoansCounter() private returns (uint256) {
        // Increase the total Open loan count
        totalOpenLoanCount = totalOpenLoanCount.add(1);
        // Increase the total Loans Created count
        totalLoansCreated = totalLoansCreated.add(1);
        // Return total count to be used as a unique ID.
        return totalLoansCreated;
    }

    function _calculateMintingFee(SynthLoanStruct memory synthLoan) private view returns (uint256 mintingFee) {
        mintingFee = synthLoan.loanAmount.multiplyDecimalRound(issueFeeRate);
    }

    function _loanLifeSpan(SynthLoanStruct memory synthLoan) private view returns (uint256 loanLifeSpanResult) {
        // Get time loan is open for, and if closed from the timeClosed
        bool loanClosed = synthLoan.timeClosed > 0;
        // Calculate loan life span in seconds as (Now - Loan creation time)
        loanLifeSpanResult = loanClosed ? synthLoan.timeClosed.sub(synthLoan.timeCreated) : now.sub(synthLoan.timeCreated);
    }

    /* ========== INTERNAL VIEWS ========== */

    function systemStatus() internal view returns (ISystemStatus) {
        return ISystemStatus(requireAndGetAddress(CONTRACT_SYSTEMSTATUS, "Missing SystemStatus address"));
    }

    function synthsUSD() internal view returns (ISynth) {
        return ISynth(requireAndGetAddress(CONTRACT_SYNTHSUSD, "Missing SynthsUSD address"));
    }

    function exchangeRates() internal view returns (IExchangeRates) {
        return IExchangeRates(requireAndGetAddress(CONTRACT_EXRATES, "Missing ExchangeRates address"));
    }

    function feePool() internal view returns (IFeePool) {
        return IFeePool(requireAndGetAddress(CONTRACT_FEEPOOL, "Missing FeePool address"));
    }

    /* ========== MODIFIERS ========== */

    modifier ETHRateNotInvalid() {
        require(!exchangeRates().rateIsInvalid(COLLATERAL), "Blocked as ETH rate is invalid");
        _;
    }

    // ========== EVENTS ==========

    event CollateralizationRatioUpdated(uint256 ratio);
    event InterestRateUpdated(uint256 interestRate);
    event IssueFeeRateUpdated(uint256 issueFeeRate);
    event IssueLimitUpdated(uint256 issueLimit);
    event MinLoanSizeUpdated(uint256 minLoanSize);
    event AccountLoanLimitUpdated(uint256 loanLimit);
    event LoanLiquidationOpenUpdated(bool loanLiquidationOpen);
    event LoanCreated(address indexed account, uint256 loanID, uint256 amount);
    event LoanClosed(address indexed account, uint256 loanID, uint256 feesPaid);
    event LoanLiquidated(address indexed account, uint256 loanID, address liquidator);
    event LoanPartiallyLiquidated(
        address indexed account,
        uint256 loanID,
        address liquidator,
        uint256 liquidatedAmount,
        uint256 liquidatedCollateral
    );
}
