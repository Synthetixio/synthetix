pragma solidity ^0.5.16;

pragma experimental ABIEncoderV2;

// Inheritance
import "./Owned.sol";
import "./State.sol";
import "./interfaces/ICollateralLoan.sol";

// Libraries
import "./SafeDecimalMath.sol";

contract CollateralState is Owned, State, ICollateralLoan {
    using SafeMath for uint;
    using SafeDecimalMath for uint;

    mapping(address => Loan[]) public loans;

    constructor(address _owner, address _associatedContract) public Owned(_owner) State(_associatedContract) {}

    /* ========== VIEWS ========== */
    // If we do not find the loan, this returns a struct with 0'd values.
    function getLoan(address account, uint256 loanID) external view returns (Loan memory) {
        Loan[] memory accountLoans = loans[account];
        for (uint i = 0; i < accountLoans.length; i++) {
            if (accountLoans[i].id == loanID) {
                require(accountLoans[i].interestIndex > 0);
                return (accountLoans[i]);
            }
        }
    }

    function getNumLoans(address account) external view returns (uint numLoans) {
        return loans[account].length;
    }

    /* ========== MUTATIVE FUNCTIONS ========== */

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
}
