pragma solidity 0.4.25;

import "./Owned.sol";
import "./Pausable.sol";
import "./SafeDecimalMath.sol";
import "./interfaces/IFeePool.sol";
import "./interfaces/ISynth.sol";
import "./interfaces/IERC20.sol";
import "./interfaces/IDepot.sol";
// import "https://github.com/OpenZeppelin/openzeppelin-contracts/blob/v2.0.0/contracts/utils/ReentrancyGuard.sol";


contract EtherCollateral is Owned, Pausable  {

    using SafeMath for uint;
    using SafeDecimalMath for uint;

    // ========== CONSTANTS ==========

    uint constant MAX_COLLATERALIZATION_RATIO = SafeDecimalMath.unit() * 1000;
    uint constant MIN_COLLATERALIZATION_RATIO = SafeDecimalMath.unit() * 100;

    
    // ========== SETTER STATE VARIABLES ==========

    // The ratio of Collateral to synths issued
    uint public collateralizationRatio = SafeDecimalMath.unit() * 150;

    // If updated, all outstanding loans will pay this iterest rate in on closure of the loan. Default 5%
    uint public interestRate = 500000000000000000;

    // Minting fee for issuing the synths. Default 50 bips.
    uint public issueFeeRate = 5000000000000000;

    // Maximum amount of sETH that can be issued by the EtherCollateral contract. Default 5000
    uint public issueLimit = SafeDecimalMath.unit() * 5000;

    // Minimum amount of ETH to create loan preventing griefing and gas consumption. Min 1ETH = 0.6666666667 sETH
    uint public minLoanSize = SafeDecimalMath.unit() * 1;

    // If true then any wallet addres can close a loan not just the loan creator. 
    bool public loanLiquidationOpen = false;

    // Address of the SynthProxy to Issue
    address public synthProxy;
    
    // Address of the FeePoolProxy to pay fees too
    address public feePoolProxy;
    
    // Address of the Depot to purchase sUSD for ETH 
    address public depot;

    // ========== STATE VARIABLES ==========

    // The total number of synths issued by the collateral in this contract
    uint public totalIssuedSynths;

    // Total number of loans ever created
    uint public totalLoansCreated;

    // Total number of open loans
    uint public totalOpenLoanCount;

    // Synth loan storage struct 
    struct synthLoanStruct {
        //  Acccount that created the loan
        address acccount;
        //  Amount (in collateral toke ) that they deposited
        uint collateralAmount;
        //  Amount (in synths) that they issued to borrow
        uint loanAmount;
        // When the loan was created
        uint timeCreated;
        // ID for the loan
        uint loanID;
        // When the loan was paidback (closed)
        uint timeClosed;
    }
    
    // Users Loans by address
    mapping(address => synthLoanStruct[]) public accountsSynthLoans;

    // Array of Addresses with open loans.
    // Allows for iterating for open loans to liquidate 
    address[] public openLoanAccounts;
    uint[] public openLoanIDs;

    // ========== CONSTRUCTOR ==========
    constructor(address _owner, address _synthProxy, address _feePoolProxy, address _depot)
        Owned(_owner)
        Pausable(_owner)
        public
    {
        synthProxy = _synthProxy;
        feePoolProxy = _feePoolProxy;
        depot = _depot;
    }

    // ========== SETTERS ==========

    function setCollateralizationRatio(uint ratio)
        external
        onlyOwner
    {
        require(ratio <= MAX_COLLATERALIZATION_RATIO, "Too high");
        require(ratio >= MIN_COLLATERALIZATION_RATIO, "Too low");
        collateralizationRatio = ratio;
        emit CollateralizationRatioUpdated(ratio);
    }

    function setInterestRate(uint _interestRate)
        external
        onlyOwner
    {
        interestRate = _interestRate;
        emit InterestRateUpdated(interestRate);
    }

    function setIssueFeeRate(uint _issueFeeRate)
        external
        onlyOwner
    {
        issueFeeRate = _issueFeeRate;
        emit IssueFeeRateUpdated(issueFeeRate);
    }

    function setIssueLimit(uint _issueLimit)
        external
        onlyOwner
    {
        issueLimit = _issueLimit;
        emit IssueLimitUpdated(issueFeeRate);
    }

    function setMinLoanSize(uint _minLoanSize)
        external
        onlyOwner
    {
        minLoanSize = _minLoanSize;
        emit MinLoanSize(minLoanSize);
    }

    function setLoanLiquidationOpen(bool _loanLiquidationOpen)
        external
        onlyOwner
    {
        loanLiquidationOpen = _loanLiquidationOpen;
        emit LoanLiquidationOpenUpdated(loanLiquidationOpen);
    }

    function setSynthProxy(address _synthProxy)
        external
        onlyOwner
    {
        synthProxy = _synthProxy;
        emit SynthProxyUpdated(synthProxy);
    }

    function setFeePoolProxy(address _feePoolProxy)
        external
        onlyOwner
    {
        feePoolProxy = _feePoolProxy;
        emit FeePoolProxyUpdated(feePoolProxy);
    }

    function setDepot(address _depotAddress)
        external
        onlyOwner
    {
        depot = _depotAddress;
        emit DepotAddressUpdated(depot);
    }
    
    // ========== PUBLIC VIEWS ==========

    // returns value of 1 / collateralizationRatio. 
    // e.g. 1/150 = 0.00666666666 
    // or in wei 1000000000000000000/150000000000000000000 = 0.00666666666666666666
    function issuanceRatio()
        public
        view
        returns (uint)
    {
        return SafeDecimalMath.unit().divideDecimalRound(collateralizationRatio);
    }
    
    function openLoansByID()
        public
        view
        returns (uint[])
    {
        // Create the fixed size array to return
        uint[] memory _openLoans = new uint[](openLoanIDs.length);

        // Copy addresses from Dynamic array to fixed array
        for (uint i = 0; i < openLoanIDs.length; i++) {
            _openLoans[i] = openLoanIDs[i];
        }
        // Return an array with list of loan Ids 
        return _openLoans;
    }
    
    function openLoansByAccount()
        public
        view
        returns (address[])
    {
        // Create the fixed size array to return
        address[] memory _openLoans = new address[](openLoanAccounts.length);

        // Copy addresses from Dynamic array to fixed array
        for (uint i = 0; i < openLoanAccounts.length; i++) {
            _openLoans[i] = openLoanAccounts[i];
        }
        // Return an array with list of loan Ids 
        return _openLoans;
    }

    // ========== PUBLIC FUNCTIONS ==========
    
    function openLoan() 
        public
        payable
        notPaused
    {
        // Require ETH sent to be greater than minLoanSize
        require(msg.value >= minLoanSize, "Not enough ETH to create this loan. Please see the minLoanSize");
        
        // Require sETH to mint does not exceed cap
        require(totalIssuedSynths < issueLimit, "Issue limit reached. No more loans can be created.");
        
        // Require loanLiquidationOpen to be false or we are in liquidation phase
        require(loanLiquidationOpen == false, "Loans are now being liquidated");
        
        // Calculate issuance amount
        uint issueAmount = msg.value.multiplyDecimal(issuanceRatio());
        emit LogInt("Calculate issuance amount", issueAmount);
        
        // Create Loan storage object
        synthLoanStruct memory synthLoan = synthLoanStruct({ 
            acccount : msg.sender,
            collateralAmount : msg.value,
            loanAmount : issueAmount,
            timeCreated : now,
            loanID : incrementTotalLoansCreatedCounter(), // will assign a unique uint
            timeClosed : 0 
        });
        
        // Record loan to storage
        storeLoan(msg.sender, synthLoan);
        
        // Issue the synth
        ISynth(synthProxy).issue(msg.sender, issueAmount);
    }

    function closeLoan(uint16 loanID) 
        public
    {
        // Get the loan from storage
        synthLoanStruct memory synthLoan = getLoan(msg.sender, loanID);

        // Mark loan as closed
        require(recordLoanClosure(msg.sender, synthLoan), "Loan already closed");

        // Burn all Synths issued for the loan 
        ISynth(synthProxy).burn(msg.sender, synthLoan.loanAmount);
        
        // Calculate and deduct interest(5%) and minting fee(50 bips) in ETH
        
        // Fee Distribution. Purchase sUSD with ETH from Depot then call FeePool.donateFees(feeAmount) to record fees to distribute to SNX holders.
        
        // The interest is calculated continuously accounting for the high variability of sETH loans.
        
        // Using continuous compounding, the ETH interest on 100 sETH loan over a year would be 100 × 2.7183 ^ (5.0% × 1) - 100 = 5.127 ETH
        
        // Send remainder ETH back to loan creator address
        
        // Remove from openLoans Array

    }

    // Liquidation of an open loan available for anyone
    function liquidateUnclosedLoan(uint16 loanID, address loanCreatorsAddress) 
        external
    {
        // Mark loan as closed
        
    }

    // ========== PRIVATE FUNCTIONS ==========
    
    function storeLoan(address account, synthLoanStruct synthLoan)
        private
    {
        // Record loan in mapping to account in an array of the accounts open loans
        accountsSynthLoans[account].push(synthLoan);

        // Record the account in the open loans array to iterate the list of open loans
        openLoanAccounts.push(account);
        
        // Record the account in the open loans array to iterate the list of open loans
        openLoanIDs.push(synthLoan.loanID);
    }
    
    function getLoan(address account, uint loanID)
        private
        returns (synthLoanStruct)
    {
        synthLoanStruct[] synthLoans = accountsSynthLoans[account];
        for (uint i = 0; i < synthLoans.length; i++) {
            if (synthLoans[i].loanID == loanID) {
                return synthLoans[i];
            }
        }
    }

    function recordLoanClosure(address closingAccount, synthLoanStruct synthLoan)
        private
        returns (bool)
    {
        // ensure we have a synthLoan and it is not already closed
        if (synthLoan.timeClosed != 0) {
            // Record the time the loan was closed
            synthLoan.timeClosed = now;
            return true;
        }
        return false;
    }

    function incrementTotalLoansCreatedCounter()
        private
        returns (uint)
    {
        totalLoansCreated = totalLoansCreated.add(1);
        return totalLoansCreated;
    }

    // ========== MODIFIERS ==========

    // ========== EVENTS ==========

    event CollateralizationRatioUpdated(uint ratio);
    event InterestRateUpdated(uint interestRate);
    event IssueFeeRateUpdated(uint issueFeeRate);
    event IssueLimitUpdated(uint issueFeeRate);
    event MinLoanSize(uint interestRate);
    event LoanLiquidationOpenUpdated(bool loanLiquidationOpen);
    event SynthProxyUpdated(address synthProxy);
    event FeePoolProxyUpdated(address feePoolProxy);
    event DepotAddressUpdated(address depotAddress);

    event LoanCreated(address indexed account, uint loanID);
    event LoanClosed(address indexed account, uint loanID);
    event LoanLiquidated(address indexed account, uint loanID, address liquidator);
    
    event LogInt(string name, uint value);
    event LogString(string name, string value);
    event LogAddress(string name, address value);
}
