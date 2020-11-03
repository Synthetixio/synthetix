pragma solidity ^0.5.16;

pragma experimental ABIEncoderV2;

// Inheritance
import "./Owned.sol";
import "./State.sol";
import "./interfaces/IMultiCollateral.sol";

import "./SafeDecimalMath.sol";


contract MultiCollateralState is Owned, State, IMultiCollateral {

    using SafeMath for uint256;
    using SafeDecimalMath for uint256;

    // The address of the associated collateral contract
    address public collateral;

    uint public totalCollateral;

    uint public openLoans;
    uint public totalLoans;

    mapping(bytes32 => uint) public rateLastUpdated;
    
    mapping(bytes32 => uint[]) public rates;

    struct balance {
        uint long;
        uint short;
    }

    // The total amount of long and short for a synth,
    mapping(bytes32 => balance) totalIssuedSynths;


    mapping(address => Loan[]) public loans;


    constructor(address _owner, address _associatedContract) public Owned(_owner) State(_associatedContract) {}

    /* ========== VIEWS ========== */

    function getLoan(address account, uint256 loanID) external view returns (Loan memory) {
        Loan[] memory synthLoans = loans[account];
        for (uint256 i = 0; i < synthLoans.length; i++) {
            if (synthLoans[i].id == loanID) {
                return (synthLoans[i]);
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
        for (uint256 i = 0; i < accountLoans.length; i++) {
            if (accountLoans[i].id == loan.id) {
                loans[loan.account][i] = loan;
             }
        }
    }

    function incrementTotalLoans() external onlyAssociatedContract returns (uint256) {
        openLoans = openLoans.add(1);
        totalLoans = totalLoans.add(1);
        // Return total count to be used as a unique ID.
        return totalLoans;
    }

    function incrementCollateral(uint256 amount) external onlyAssociatedContract {
        totalCollateral = totalCollateral.add(amount);
    }

    function decrementCollateral(uint256 amount) external onlyAssociatedContract {
        totalCollateral = totalCollateral.sub(amount);
    }

    function incrementLongs(bytes32 synth, uint256 amount) external onlyAssociatedContract {
        totalIssuedSynths[synth].long = totalIssuedSynths[synth].long.add(amount);
    }

    function decrementLongs(bytes32 synth, uint256 amount) external onlyAssociatedContract {
        totalIssuedSynths[synth].long = totalIssuedSynths[synth].long.sub(amount);
    }

    function incrementShorts(bytes32 synth, uint256 amount) external onlyAssociatedContract {
        totalIssuedSynths[synth].short = totalIssuedSynths[synth].short.add(amount);
    }

    function decrementShorts(bytes32 synth, uint256 amount) external onlyAssociatedContract {
        totalIssuedSynths[synth].short = totalIssuedSynths[synth].short.sub(amount);
    }

}