pragma solidity ^0.5.16;

pragma experimental ABIEncoderV2;

// Inheritance
import "./Owned.sol";
import "./State.sol";
import "./interfaces/ICollateral.sol";

// Libraries
import "./SafeDecimalMath.sol";

contract CollateralState is Owned, State, ILoan {
    using SafeMath for uint;
    using SafeDecimalMath for uint;
 
    uint public totalLoans;

    mapping(bytes32 => uint) public rateLastUpdated;
    
    mapping(bytes32 => uint[]) public rates;

    mapping(address => Loan[]) public loans;

    constructor(address _owner, address _associatedContract) public Owned(_owner) State(_associatedContract) {}

    /* ========== VIEWS ========== */
    // If we do not find the loan, this returns a struct with 0'd values.
    function getLoan(address account, uint256 loanID) external view returns (Loan memory) {
        Loan[] memory accountLoans = loans[account];
        for (uint i = 0; i < accountLoans.length; i++) {
            if (accountLoans[i].id == loanID) {
                return (accountLoans[i]);
            }
        }
    }

    function getRates(bytes32 currency) external view returns (uint[] memory) {
        return rates[currency];
    }

    /* ========== MUTATIVE FUNCTIONS ========== */

    function addCurrency(bytes32 _synth) external onlyOwner {
        rates[_synth].push(0);
        rateLastUpdated[_synth] = block.timestamp;
    }

    function updateRates(bytes32 currency, uint rate) external onlyAssociatedContract {
        rates[currency].push(rate);
        rateLastUpdated[currency] = block.timestamp;
    }
    
    function createLoan(Loan memory loan) public onlyAssociatedContract {
        loans[loan.account].push(loan);
    }

    function updateLoan(Loan memory loan) public onlyAssociatedContract {
        Loan[] storage accountLoans = loans[loan.account];
        for (uint i = 0; i < accountLoans.length; i++) {
            if (accountLoans[i].id == loan.id) {
                loans[loan.account][i] = loan;
            }
        }
    }

    function incrementTotalLoans() external onlyAssociatedContract returns (uint) {
        totalLoans = totalLoans.add(1);
        return totalLoans;
    }
}