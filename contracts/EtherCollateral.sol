pragma solidity 0.4.25;

import "./Owned.sol";
import "./Pausable.sol";
import "./SafeDecimalMath.sol";
import "./interfaces/IFeePool.sol";
import "./interfaces/ISynth.sol";

contract EtherCollateral is Owned, Pausable  {

    using SafeMath for uint;
    using SafeDecimalMath for uint;

    // ========== CONSTANTS ==========

    uint constant MAX_COLLATERALIZATION_RATIO = SafeDecimalMath.unit() * 1000;
    uint constant MIN_COLLATERALIZATION_RATIO = SafeDecimalMath.unit() * 100;

    
    // ========== STATE VARIABLES ==========

    // The ratio of Collateral to synths issued
    uint public collateralizationRatio = SafeDecimalMath.unit() * 150;

    // If updated, all outstanding loans will pay this iterest rate in on closure of the loan. Default 5%
    uint public interestRate = 500000000000000000;

    // Minting fee for issuing the synths. Default 50 bips.
    uint public issueFeeRate = 5000000000000000;

    // If true then any wallet addres can close a loan not just the loan creator. 
    bool public openLoanClosing = false;

    // Maximum amount of sETH that can be issued by the EtherCollateral contract. Default 5000
    uint public issueLimit = SafeDecimalMath.unit() * 5000;

    // Minimum amount of ETH to create loan preventing griefing and gas consumption. Min 1ETH = 0.6666666667 sETH
    uint public minLoanSize = SafeDecimalMath.unit() * 1;

    // Address of the FeePoolProxy to pay fees too
    address public feePoolProxy;

    // Address of the SynthProxy to Issue
    address public synthProxy;

    // The total number of synths issued by the collateral in this contract
    uint public totalIssuedSynths;

    // Total number of open loans
    uint public totalLoanCount;

    // Total number of loans ever created
    uint public totalLoansCreated;

    // Synth loan storage struct 
    struct synthLoan {
        //  Acccount that created the loan
        address acccount;
        //  Amount (in collateral toke ) that they deposited
        uint collateralAmount;
        //  Amount (in synths) that they issued to borrow
        uint loanAmount;
        // When the loan was created
        uint64 timeCreated;
        // ID for the loan
        uint64 loanID;
        // When the loan was paidback (closed)
        uint64 timeClosed;
    }
    
    // Users Loans by address
    mapping(address => synthLoan[]) public accountsSynthLoans;

    // ========== CONSTRUCTOR ==========
    constructor(address _owner)
        Owned(_owner)
        public
    {}

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

    function setSynthProxy(address _synthProxy)
        external
        onlyOwner
    {
        synthProxy = _synthProxy;
    }

    function setFeePoolProxy(address _feePoolProxy)
        external
        onlyOwner
    {
        feePoolProxy = _feePoolProxy;
    }

    // ========== PUBLIC VIEWS ==========
    function issuanceRatio()
        public
        view
        returns (uint)
    {
        // returns value of 1 / collateralizationRatio. 
        // e.g. 1/150 = 0.006666666667 
        // or in wei 1000000000000000000/150000000000000000000 = 6666666667000000
        return SafeDecimalMath.unit() / collateralizationRatio;
    }

    // ========== PUBLIC FUNCTIONS ==========
    
    function openLoan() 
        public
        payable
    {
        // Require ETH sent to be greater than minLoanSize
        require(msg.value >= minLoanSize, "Not enough ETH to create this loan. Please see the minLoanSize");
        
        // Require sETH to mint does not exceed cap
        require(totalIssuedSynths < issueLimit, "Issue limit reached. No more loans can be created.");
        
        // Require openLoanClosing to be false
        require(openLoanClosing = false, "Loans are now being liquidated");
        
        // Calculate issuance ratio. 
        uint issueAmount = msg.value.multiplyDecimal(issuanceRatio());

        // Issue the synth
        ISynth(synthProxy).issue(msg.sender, issueAmount);

        // Update how many loans have been created
        incrementTotalLoanCount();

        // Store Loan: account address, creation timestamp, sETH amount issued
        synthLoan memory loan = synthLoan{ 
            acccount : msg.sender,
            collateralAmount : msg.value,
            loanAmount : issueAmount,
            timeCreated : now,
            loanID = totalLoansCreated // will assign a unique uint
        };
        
        storeLoan(msg.sender, synthLoan);
    }

    function closeLoan(uint16 loanID) 
        public
    {
        // Mark loan as closed
        require(recordLoanClosure(msg.sender, loanID))
        // Require sETH loan balance in wallet
        // Burn all sETH
        
        // Calculate and deduct interest(5%) and minting fee(50 bips) in ETH
        // Fee Distribution. Purchase sUSD with ETH from Depot then call FeePool.donateFees(feeAmount) to record fees to distribute to SNX holders.
        // The interest is calculated continuously accounting for the high variability of sETH loans.
        // Using continuous compounding, the ETH interest on 100 sETH loan over a year would be 100 × 2.7183 ^ (5.0% × 1) - 100 = 5.127 ETH
        // Send remainder ETH back to loan creator address

        decrementTotalLoanCount();
    }

    // Liquidation of an open loan available for anyone
    function liquidateUnclosedLoan(uint16 loanID, address loanCreatorsAddress) 
        public
    {
        // Mark loan as closed
        require(recordLoanClosure(loanCreatorsAddress, loanID))
    }

    // ========== PRIVATE FUNCTIONS ==========
    function storeLoan(address account, synthLoan loan)
        private
    {
        accountsSynthLoans[account].push(synthLoan(loan));
    }
    function recordLoanClosure(address account, uint loanID)
        private
        returns (bool closed)
    {
        synthLoan[] loans = accountsSynthLoans[account];
        for (uint i = 0; i< loans.length; i++) {
            if (loans[i].loanID == loanID) {
                loans[i].timeClosed = now;  
                closed = true;
            }
        }
        closed = false;
    }

    function deleteLoan(address account, synthLoan loan)
        private
    {
        synthLoans[account].push(synthLoan(loan));
    }

    function incrementTotalLoanCount()
        private
    {
        totalLoanCount = totalLoanCount.add(1);
        totalLoansCreated = totalLoansCreated.add(1);
    }

    function decrementTotalLoanCount()
        private
    {
        totalLoanCount = totalLoanCount.sub(1);
    }

    // ========== MODIFIERS ==========

    // ========== EVENTS ==========

    event CollateralizationRatioUpdated(uint ratio);
    event LoanCreated(uint loanID, address account);
    event LoanClosed(uint loanID, address account);
}
