pragma solidity 0.4.25;

import "./Owned.sol";
import "./Pausable.sol";
import "./SafeDecimalMath.sol";
import "./interfaces/IFeePool.sol";
import "./interfaces/ISynth.sol";
import "./interfaces/IERC20.sol";
import "./interfaces/IDepot.sol";


// import "https://github.com/OpenZeppelin/openzeppelin-contracts/blob/v2.0.0/contracts/utils/ReentrancyGuard.sol";

contract EtherCollateral is Owned, Pausable {
    using SafeMath for uint256;
    using SafeDecimalMath for uint256;

    // ========== CONSTANTS ==========

    uint256 constant ONE_THOUSAND = SafeDecimalMath.unit() * 1000;
    uint256 constant ONE_HUNDRED = SafeDecimalMath.unit() * 100;

    uint256 constant ANNUAL_COMPOUNDING_RATE = 2718300000000000000; //2.7183
    uint256 constant SECONDS_IN_A_YEAR = 31536000;

    // Where fees are pooled in sUSD.
    address constant FEE_ADDRESS = 0xfeEFEEfeefEeFeefEEFEEfEeFeefEEFeeFEEFEeF;

    // ========== SETTER STATE VARIABLES ==========

    // The ratio of Collateral to synths issued
    uint256 public collateralizationRatio = SafeDecimalMath.unit() * 150;

    // If updated, all outstanding loans will pay this iterest rate in on closure of the loan. Default 5%
    uint256 public interestRate = 50000000000000000;

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

    // Array of Addresses with open loans
    // Allows for iterating for open loans to liquidate
    address[] public openLoanAccounts;

    // Array of Loan IDs
    uint256[] public openLoanIDs;

    // ========== CONSTRUCTOR ==========
    constructor(address _owner, address _synthProxy, address _sUSDProxy, address _depot)
        public
        Owned(_owner)
        Pausable(_owner)
    {
        synthProxy = _synthProxy;
        sUSDProxy = _sUSDProxy;
        depot = _depot;
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

    function currentInterestOnMyLoan(uint256 _loanID) public view returns (uint256) {
        // Get the loan from storage
        synthLoanStruct memory synthLoan = _getLoanFromStorage(msg.sender, _loanID);
        return _calculateInterestOnLoan(synthLoan);
    }

    function calculateMintingFee(uint256 _loanID) public view returns (uint256) {
        // Get the loan from storage
        synthLoanStruct memory synthLoan = _getLoanFromStorage(msg.sender, _loanID);
        return _calculateMintingFee(synthLoan);
    }

    function openLoansByAccount() public view returns (address[]) {
        // Create the fixed size array to return
        address[] memory _openLoans = new address[](openLoanAccounts.length);

        // Copy addresses from Dynamic array to fixed array
        for (uint256 i = 0; i < openLoanAccounts.length; i++) {
            _openLoans[i] = openLoanAccounts[i];
        }
        // Return an array with list of loan Ids
        return _openLoans;
    }

    function openLoansByID() public view returns (uint256[]) {
        // Create the fixed size array to return
        uint256[] memory _openLoans = new uint256[](openLoanIDs.length);

        // Copy addresses from Dynamic array to fixed array
        for (uint256 i = 0; i < openLoanIDs.length; i++) {
            _openLoans[i] = openLoanIDs[i];
        }
        // Return an array with list of loan Ids
        return _openLoans;
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

    // ========== PUBLIC FUNCTIONS ==========
    // TODO add reentrancy preventer here
    function openLoan() public payable notPaused returns (uint256 loanID) {
        // Require ETH sent to be greater than minLoanSize
        // emit LogInt("msg.value", msg.value);
        require(msg.value >= minLoanSize, "Not enough ETH to create this loan. Please see the minLoanSize");

        // Require sETH to mint does not exceed cap
        require(totalIssuedSynths < issueLimit, "Supply cap reached. No more loans can be created.");

        // Require loanLiquidationOpen to be false or we are in liquidation phase
        require(loanLiquidationOpen == false, "Loans are now being liquidated");

        // emit LogInt("issuanceRatio()", issuanceRatio());
        // Calculate issuance amount
        // uint256 issueAmount = msg.value.multiplyDecimal(issuanceRatio());
        uint256 loanAmount = loanAmountFromCollateral(msg.value);
        // emit LogInt("Calculate issuance amount", issueAmount);

        // Get a Loan ID
        loanID = _incrementTotalLoansCounter();
        // emit LogInt("loanID", loanID);

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

        // Tell the Dapps
        emit LoanCreated(msg.sender, loanID, loanAmount);
    }

    function closeLoan(uint256 loanID) public {
        _closeLoan(msg.sender, loanID);
    }

    function _closeLoan(address account, uint256 loanID) private {
        // Get the loan from storage
        emit LogInt("closeLoan", loanID);
        synthLoanStruct memory synthLoan = _getLoanFromStorage(account, loanID);
        require(synthLoan.loanID > 0, "Loan does not exist");
        emit LogInt("Got LoanID from Storage", synthLoan.loanID);
        require(
            IERC20(synthProxy).balanceOf(msg.sender) >= synthLoan.loanAmount,
            "You do not have the required Synth balance to close this loan."
        );

        // Mark loan as closed
        require(_recordLoanClosure(synthLoan), "Loan already closed");

        // // Decrement totalIssuedSynths
        totalIssuedSynths = totalIssuedSynths.sub(synthLoan.loanAmount);

        // // Burn all Synths issued for the loan
        ISynth(synthProxy).burn(account, synthLoan.loanAmount);

        // // Calculate and deduct interest(5%) and minting fee(50 bips) in ETH
        // uint256 interestAmount = _calculateInterestOnLoan(synthLoan);
        // uint256 mintingFee = _calculateMintingFee(synthLoan);
        // uint256 totalFees = interestAmount.add(mintingFee);
        uint256 totalFees = SafeDecimalMath.unit() * 2;

        // // Fee Distribution. Purchase sUSD with ETH from Depot
        IDepot(depot).exchangeEtherForSynths.value(totalFees)();

        // // Transfer the sUSD to  distribute to SNX holders.
        IERC20(sUSDProxy).transfer(FEE_ADDRESS, IERC20(sUSDProxy).balanceOf(this));

        // Send remainder ETH to caller
        require(address(msg.sender).call.value(synthLoan.collateralAmount.sub(totalFees)).gas(35000)());

        // Tell the Dapps
        emit LoanClosed(account, loanID, totalFees);
    }

    // Liquidation of an open loan available for anyone
    function liquidateUnclosedLoan(uint16 _loanID, address _loanCreatorsAddress) external {
        require(loanLiquidationOpen, "Liquidation is not open");

        // Close the creators loan and send collateral to the closer.
        _closeLoan(_loanCreatorsAddress, _loanID);

        // Tell the Dapps this loan was liquidated
        emit LoanLiquidated(_loanCreatorsAddress, _loanID, msg.sender);
    }

    // ========== PRIVATE FUNCTIONS ==========

    function storeLoan(address account, synthLoanStruct synthLoan) private {
        // Record loan in mapping to account in an array of the accounts open loans
        accountsSynthLoans[account].push(synthLoan);

        // Record the LoanID in the openLoanIDs array to iterate the list of open loans
        openLoanIDs.push(synthLoan.loanID);
    }

    function _getLoanFromStorage(address account, uint256 loanID) private returns (synthLoanStruct) {
        emit LogAddress("_getLoanFromStorage from account", account);
        synthLoanStruct[] storage synthLoans = accountsSynthLoans[account];
        emit LogInt("synthLoans.length", synthLoans.length);
        for (uint256 i = 0; i < synthLoans.length; i++) {
            if (synthLoans[i].loanID == loanID) {
                return synthLoans[i];
            }
        }
    }

    function _updateStoredLoan(synthLoanStruct synthLoan) private {
        synthLoanStruct[] storage synthLoans = accountsSynthLoans[synthLoan.account];
        for (uint256 i = 0; i < synthLoans.length; i++) {
            if (synthLoans[i].loanID == synthLoan.loanID) {
                // Overwrite this array item with the updated one
                synthLoans[i] = synthLoan;
            }
        }
    }

    function _recordLoanClosure(synthLoanStruct synthLoan) private returns (bool) {
        // Ensure we have a synthLoan and it is not already closed
        emit LogInt("synthLoan.timeClosed", synthLoan.timeClosed);

        if (synthLoan.timeClosed == 0) {
            // Record the time the loan was closed
            synthLoan.timeClosed = now;
            emit LogInt("Record the time the loan was closed", synthLoan.timeClosed);

            // Replace loan struct in storage
            _updateStoredLoan(synthLoan);

            // Remove from openLoanAccounts array
            _removeFromOpenLoanAccounts(synthLoan);

            // Decrease Loan count
            totalOpenLoanCount = totalOpenLoanCount.sub(1);
            emit LogInt("LOAN IS CLOSED", synthLoan.timeClosed);
            return true;
        }
        emit LogInt("LOAN NOT CLOSED", synthLoan.timeClosed);
        return false;
    }

    function _removeFromOpenLoanAccounts(synthLoanStruct synthLoan) private returns (bool) {
        address account = synthLoan.account;

        // Check if account has any open loans
        synthLoanStruct[] storage synthLoans = accountsSynthLoans[account];

        for (uint256 i = 0; i < synthLoans.length; i++) {
            // If account has an unclosed loan
            if (synthLoans[i].timeClosed == 0) {
                // return false as we did not need to remove this account from the openLoanAccounts array
                emit LogInt("_removeFromOpenLoanAccounts return false", openLoanAccounts.length);
                return false;
            }
        }

        // Remove account from openLoanAccounts array
        emit LogInt("openLoanAccounts.length", openLoanAccounts.length);
        for (uint256 j = 0; j < openLoanAccounts.length; j++) {
            if (openLoanAccounts[i] == account) {
                // Shift the last entry into this one
                openLoanAccounts[i] = openLoanAccounts[openLoanAccounts.length - 1];
                // Pop the last entry off the array
                delete openLoanAccounts[openLoanAccounts.length - 1];
                openLoanAccounts.length--;
                // return true as we did remove this account from the openLoanAccounts array
                emit LogInt("_removeFromOpenLoanAccounts return true", openLoanAccounts.length);
                return true;
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

    function _calculateInterestOnLoan(synthLoanStruct synthLoan) private returns (uint256 interestAmount) {
        // The interest is calculated continuously accounting for the high variability of sETH loans.
        // Using continuous compounding, the ETH interest on 100 sETH loan over a year
        // would be 100 × 2.7183 ^ (5.0% × 1) - 100 = 5.127 ETH
        uint256 compountInterest = synthLoan.loanAmount.multiplyDecimalRound(ANNUAL_COMPOUNDING_RATE);
        // emit LogInt("compountInterest", compountInterest);
        uint256 interestRateUnit = interestRate.multiplyDecimalRound(SafeDecimalMath.unit());
        // emit LogInt("interestRateUnit", interestRateUnit);
        uint256 annualInterestAmount = compountInterest**interestRateUnit.sub(synthLoan.loanAmount);
        // emit LogInt("interestAmount", interestAmount);
        // Split interest into seconds
        uint256 interestPerSecond = annualInterestAmount.divideDecimalRound(SECONDS_IN_A_YEAR);
        // emit LogInt("interestPerSecond", interestPerSecond);
        // Loan life span in seconds
        uint256 loanLifeSpan = now.sub(synthLoan.timeCreated);
        // emit LogInt("loanLifeSpan", loanLifeSpan);

        // Interest for life of the loan
        interestAmount = interestPerSecond.multiplyDecimalRound(loanLifeSpan);
        // emit LogInt("interestAmount", interestAmount);
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
