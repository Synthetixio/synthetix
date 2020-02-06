pragma solidity 0.4.25;

import "openzeppelin-solidity/contracts/utils/ReentrancyGuard.sol";
import "./Owned.sol";
import "./Pausable.sol";
import "./SafeDecimalMath.sol";
import "./interfaces/IFeePool.sol";
import "./interfaces/ISynth.sol";
import "./interfaces/IERC20.sol";
import "./interfaces/IDepot.sol";


contract EtherCollateral is Owned, Pausable, ReentrancyGuard {
    using SafeMath for uint256;
    using SafeDecimalMath for uint256;

    // ========== CONSTANTS ==========

    uint256 constant ONE_THOUSAND = SafeDecimalMath.unit() * 1000;
    uint256 constant ONE_HUNDRED = SafeDecimalMath.unit() * 100;

    uint256 constant SECONDS_IN_A_YEAR = 31536000; // Common Year

    // Where fees are pooled in sUSD.
    address constant FEE_ADDRESS = 0xfeEFEEfeefEeFeefEEFEEfEeFeefEEFeeFEEFEeF;

    // ========== SETTER STATE VARIABLES ==========

    // The ratio of Collateral to synths issued
    uint256 public collateralizationRatio = SafeDecimalMath.unit() * 150;

    // If updated, all outstanding loans will pay this iterest rate in on closure of the loan. Default 5%
    uint256 public interestRate = 50000000000000000;
    uint256 public interestPerSecond = interestRate.div(SECONDS_IN_A_YEAR);

    // Minting fee for issuing the synths. Default 50 bips.
    uint256 public issueFeeRate = 5000000000000000;

    // Maximum amount of sETH that can be issued by the EtherCollateral contract. Default 5000
    uint256 public issueLimit = SafeDecimalMath.unit() * 5000;

    // Minimum amount of ETH to create loan preventing griefing and gas consumption. Min 1ETH = 0.6666666667 sETH
    uint256 public minLoanSize = SafeDecimalMath.unit() * 1;

    // If true then any wallet addres can close a loan not just the loan creator.
    bool public loanLiquidationOpen = false;

    // Address of the SynthProxy to Issue
    address public synthProxy;

    // Address of the Depot to purchase sUSD for ETH
    address public depot;

    // Address of the sUSD token for Fee distribution
    address public sUSDProxy;

    // Time when remaining loans can be liquidated
    uint256 public liquidationDeadline;

    // ========== STATE VARIABLES ==========

    // The total number of synths issued by the collateral in this contract
    uint256 public totalIssuedSynths;

    // Total number of loans ever created
    uint256 public totalLoansCreated;

    // Total number of open loans
    uint256 public totalOpenLoanCount;

    // Synth loan storage struct
    struct synthLoanStruct {
        //  Acccount that created the loan
        address account;
        //  Amount (in collateral toke ) that they deposited
        uint256 collateralAmount;
        //  Amount (in synths) that they issued to borrow
        uint256 loanAmount;
        // When the loan was created
        uint256 timeCreated;
        // ID for the loan
        uint256 loanID;
        // When the loan was paidback (closed)
        uint256 timeClosed;
    }

    // Users Loans by address
    mapping(address => synthLoanStruct[]) public accountsSynthLoans;

    // Allows for iterating for open loans
    address[] public accountsWithOpenLoans;

    // ========== CONSTRUCTOR ==========
    constructor(address _owner, address _synthProxy, address _sUSDProxy, address _depot)
        public
        Owned(_owner)
        Pausable(_owner)
    {
        synthProxy = _synthProxy;
        sUSDProxy = _sUSDProxy;
        depot = _depot;
        liquidationDeadline = now + 92 days; // Time before loans can be liquidated
    }

    // ========== SETTERS ==========

    function setCollateralizationRatio(uint256 ratio) external onlyOwner {
        require(ratio <= ONE_THOUSAND, "Too high");
        require(ratio >= ONE_HUNDRED, "Too low");
        collateralizationRatio = ratio;
        emit CollateralizationRatioUpdated(ratio);
    }

    function setInterestRate(uint256 _interestRate) external onlyOwner {
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
        emit MinLoanSize(minLoanSize);
    }

    function setLoanLiquidationOpen(bool _loanLiquidationOpen) external onlyOwner {
        require(now > liquidationDeadline, "Before liquidation deadline");
        loanLiquidationOpen = _loanLiquidationOpen;
        emit LoanLiquidationOpenUpdated(loanLiquidationOpen);
    }

    function setSynthProxy(address _synthProxy) external onlyOwner {
        synthProxy = _synthProxy;
        emit SynthProxyUpdated(synthProxy);
    }

    function setsUSDProxy(address _sUSDProxy) external onlyOwner {
        sUSDProxy = _sUSDProxy;
        emit sUSDProxyUpdated(sUSDProxy);
    }

    function setDepot(address _depotAddress) external onlyOwner {
        depot = _depotAddress;
        emit DepotAddressUpdated(depot);
    }

    // ========== PUBLIC VIEWS ==========

    // returns value of 100 / collateralizationRatio.
    // e.g. 100/150 = 0.666666666666666667
    // or in wei 100000000000000000000/150000000000000000000 = 666666666666666667
    function issuanceRatio() public view returns (uint256) {
        return ONE_HUNDRED.divideDecimalRound(collateralizationRatio);
    }

    function loanAmountFromCollateral(uint collateralAmount) public view returns (uint256) {
        return collateralAmount.multiplyDecimal(issuanceRatio());
    }

    function currentInterestOnLoan(address _account, uint256 _loanID) public view returns (uint256) {
        // Get the loan from storage
        synthLoanStruct memory synthLoan = _getLoanFromStorage(_account, _loanID);
        uint256 loanLifeSpan = _loanLifeSpan(synthLoan);
        return accruedInterestOnLoan(synthLoan.loanAmount, loanLifeSpan);
    }

    function calculateMintingFee(address _account, uint256 _loanID) public view returns (uint256) {
        // Get the loan from storage
        synthLoanStruct memory synthLoan = _getLoanFromStorage(_account, _loanID);
        return _calculateMintingFee(synthLoan);
    }

    function accountsWithOpenLoans() public view returns (address[]) {
        // Create the fixed size array to return
        address[] memory _accountsWithOpenLoans = new address[](accountsWithOpenLoans.length);

        // Copy addresses from Dynamic array to fixed array
        for (uint256 i = 0; i < accountsWithOpenLoans.length; i++) {
            _accountsWithOpenLoans[i] = accountsWithOpenLoans[i];
        }
        // Return an array with list addresses with open loans
        return _accountsWithOpenLoans;
    }

    function openLoanIDsByAccount(address _account) public view returns (uint[]) {
        uint256[] _openLoanIDs;
        uint256 _counter = 0;

        synthLoanStruct[] memory synthLoans = accountsSynthLoans[_account];

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
        public
        view
        returns (
            address account,
            uint256 collateralAmount,
            uint256 loanAmount,
            uint256 timeCreated,
            uint256 loanID,
            uint256 timeClosed
        )
    {
        synthLoanStruct memory synthLoan = _getLoanFromStorage(_account, _loanID);
        account = synthLoan.account;
        collateralAmount = synthLoan.collateralAmount;
        loanAmount = synthLoan.loanAmount;
        timeCreated = synthLoan.timeCreated;
        loanID = synthLoan.loanID;
        timeClosed = synthLoan.timeClosed;
    }

    function loanLifeSpan(address _account, uint256 _loanID) public view returns (uint256 loanLifeSpan) {
        synthLoanStruct memory synthLoan = _getLoanFromStorage(_account, _loanID);

        loanLifeSpan = _loanLifeSpan(synthLoan);
    }

    // ========== PUBLIC FUNCTIONS ==========

    function openLoan() external payable notPaused nonReentrant returns (uint256 loanID) {
        // Require ETH sent to be greater than minLoanSize
        require(msg.value >= minLoanSize, "Not enough ETH to create this loan. Please see the minLoanSize");

        // Require sETH to mint does not exceed cap
        require(totalIssuedSynths < issueLimit, "Supply cap reached. No more loans can be created.");

        // Require loanLiquidationOpen to be false or we are in liquidation phase
        require(loanLiquidationOpen == false, "Loans are now being liquidated");

        // Calculate issuance amount
        uint256 loanAmount = loanAmountFromCollateral(msg.value);

        // Get a Loan ID
        loanID = _incrementTotalLoansCounter();

        // Create Loan storage object
        synthLoanStruct memory synthLoan = synthLoanStruct({
            account: msg.sender,
            collateralAmount: msg.value,
            loanAmount: loanAmount,
            timeCreated: now,
            loanID: loanID,
            timeClosed: 0
        });

        // Record loan to storage
        storeLoan(msg.sender, synthLoan);

        // Increment totalIssuedSynths
        totalIssuedSynths = totalIssuedSynths.add(loanAmount);

        // Issue the synth
        ISynth(synthProxy).issue(msg.sender, loanAmount);

        // Tell the Dapps a loan was created
        emit LoanCreated(msg.sender, loanID, loanAmount);
    }

    function closeLoan(uint256 loanID) external nonReentrant {
        _closeLoan(msg.sender, loanID);
    }

    // Liquidation of an open loan available for anyone
    function liquidateUnclosedLoan(address _loanCreatorsAddress, uint256 _loanID) external nonReentrant {
        require(loanLiquidationOpen, "Liquidation is not open");
        // Close the creators loan and send collateral to the closer.
        _closeLoan(_loanCreatorsAddress, _loanID);
        // Tell the Dapps this loan was liquidated
        emit LoanLiquidated(_loanCreatorsAddress, _loanID, msg.sender);
    }

    // ========== PRIVATE FUNCTIONS ==========

    function _closeLoan(address account, uint256 loanID) private {
        // Get the loan from storage
        synthLoanStruct memory synthLoan = _getLoanFromStorage(account, loanID);

        require(synthLoan.loanID > 0, "Loan does not exist");
        require(synthLoan.timeClosed == 0, "Loan already closed");
        require(
            IERC20(synthProxy).balanceOf(msg.sender) >= synthLoan.loanAmount,
            "You do not have the required Synth balance to close this loan."
        );

        // Record loan as closed
        _recordLoanClosure(synthLoan);

        // Decrement totalIssuedSynths
        totalIssuedSynths = totalIssuedSynths.sub(synthLoan.loanAmount);

        // Calculate and deduct interest(5%) and minting fee(50 bips) in ETH
        uint256 interestAmount = accruedInterestOnLoan(synthLoan.loanAmount, _loanLifeSpan(synthLoan));
        uint256 mintingFee = _calculateMintingFee(synthLoan);
        uint256 totalFees = interestAmount.add(mintingFee);

        // Burn all Synths issued for the loan
        ISynth(synthProxy).burn(account, synthLoan.loanAmount);

        // Fee Distribution. Purchase sUSD with ETH from Depot
        IDepot(depot).exchangeEtherForSynths.value(totalFees)();

        // Transfer the sUSD to distribute to SNX holders.
        IERC20(sUSDProxy).transfer(FEE_ADDRESS, IERC20(sUSDProxy).balanceOf(this));

        // Send remainder ETH to caller
        address(msg.sender).transfer(synthLoan.collateralAmount.sub(totalFees));

        // Tell the Dapps
        emit LoanClosed(account, loanID, totalFees);
    }

    function storeLoan(address account, synthLoanStruct synthLoan) private {
        // Record loan in mapping to account in an array of the accounts open loans
        accountsSynthLoans[account].push(synthLoan);
        // Store address in accountsWithOpenLoans
        accountsWithOpenLoans.push(account);
    }

    function _getLoanFromStorage(address account, uint256 loanID) private returns (synthLoanStruct) {
        synthLoanStruct[] storage synthLoans = accountsSynthLoans[account];
        for (uint256 i = 0; i < synthLoans.length; i++) {
            if (synthLoans[i].loanID == loanID) {
                return synthLoans[i];
            }
        }
    }

    function _recordLoanClosure(synthLoanStruct synthLoan) private returns (bool loanClosed) {
        bool hasOpenLoans = false;
        // Ensure we have a synthLoan and it is not already closed
        if (synthLoan.timeClosed == 0) {
            // Get storage pointer to the accounts array of loans
            synthLoanStruct[] storage synthLoans = accountsSynthLoans[synthLoan.account];
            for (uint256 i = 0; i < synthLoans.length; i++) {
                if (synthLoans[i].loanID == synthLoan.loanID) {
                    // Record the time the loan was closed
                    synthLoans[i].timeClosed = now;
                } else if (synthLoans[i].timeClosed == 0) {
                    // If account has an unclosed loan
                    hasOpenLoans = true;
                }
            }
            if (!hasOpenLoans) {
                _removeFromOpenLoanAccounts(synthLoan.account);
            }
            // Reduce Total Open Loans Count
            totalOpenLoanCount = totalOpenLoanCount.sub(1);
            loanClosed = true;
        }
        loanClosed = false;
    }

    function _removeFromOpenLoanAccounts(address _account) private {
        // Account does not have any open loans so remove from the accountsWithOpenLoans array
        for (uint256 i = 0; i < accountsWithOpenLoans.length; i++) {
            if (accountsWithOpenLoans[i] == _account) {
                // Shift the last entry into this one
                accountsWithOpenLoans[i] = accountsWithOpenLoans[accountsWithOpenLoans.length - 1];
                // Pop the last entry off the array
                delete accountsWithOpenLoans[accountsWithOpenLoans.length - 1];
                accountsWithOpenLoans.length--;
                break;
            }
        }
    }

    function _incrementTotalLoansCounter() private returns (uint256) {
        // Increase the total Open loan count
        totalOpenLoanCount = totalOpenLoanCount.add(1);
        // Increase the total Loans Created count
        totalLoansCreated = totalLoansCreated.add(1);
        // Return total count to be used as a unique ID.
        return totalLoansCreated;
    }

    function _calculateMintingFee(synthLoanStruct synthLoan) private view returns (uint256 mintingFee) {
        mintingFee = synthLoan.loanAmount.multiplyDecimalRound(issueFeeRate);
    }

    function accruedInterestOnLoan(uint256 _loanAmount, uint256 _seconds) public view returns (uint256 interestAmount) {
        // Simple interest calculated per second
        // Interest = Principal * rate * time
        interestAmount = _loanAmount.multiplyDecimalRound(interestPerSecond.mul(_seconds));
    }

    function _loanLifeSpan(synthLoanStruct synthLoan) private view returns (uint256 loanLifeSpan) {
        // Get time loan is open for, and if closed from the timeClosed
        bool loanClosed = synthLoan.timeClosed > 0;
        // Calculate loan life span in seconds as (Now - Loan creation time)
        loanLifeSpan = loanClosed ? synthLoan.timeClosed.sub(synthLoan.timeCreated) : now.sub(synthLoan.timeCreated);
    }

    // ========== MODIFIERS ==========

    // ========== EVENTS ==========

    event CollateralizationRatioUpdated(uint256 ratio);
    event InterestRateUpdated(uint256 interestRate);
    event IssueFeeRateUpdated(uint256 issueFeeRate);
    event IssueLimitUpdated(uint256 issueFeeRate);
    event MinLoanSize(uint256 interestRate);
    event LoanLiquidationOpenUpdated(bool loanLiquidationOpen);
    event SynthProxyUpdated(address synthProxy);
    event sUSDProxyUpdated(address sUSDProxy);
    event DepotAddressUpdated(address depotAddress);

    event LoanCreated(address indexed account, uint256 loanID, uint256 amount);
    event LoanClosed(address indexed account, uint256 loanID, uint256 feesPaid);
    event LoanLiquidated(address indexed account, uint256 loanID, address liquidator);

    event LogInt(string name, uint256 value);
    event LogString(string name, string value);
    event LogAddress(string name, address value);
}
