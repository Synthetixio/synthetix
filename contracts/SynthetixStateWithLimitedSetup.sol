pragma solidity ^0.5.16;

// Inheritance
import "./Owned.sol";
import "./State.sol";
import "./LimitedSetup.sol";
import "./SynthetixState.sol";

// Libraries
import "./SafeDecimalMath.sol";


// https://docs.synthetix.io/contracts/source/contracts/synthetixstate
contract SynthetixStateWithLimitedSetup is SynthetixState {
    using SafeMath for uint;
    using SafeDecimalMath for uint;

    uint public importedDebtAmount;

    constructor(address _owner, address _associatedContract) public SynthetixState(_owner, _associatedContract) {}

    /* ========== SETTERS ========== */

    // /**
    //  * @notice Import issuer data
    //  * @dev Only callable by the contract owner, and only for 1 week after deployment.
    //  */
    function importIssuerData(address[] calldata accounts, uint[] calldata sUSDAmounts) external onlyOwner onlyDuringSetup {
        require(accounts.length == sUSDAmounts.length, "Length mismatch");

        for (uint8 i = 0; i < accounts.length; i++) {
            _addToDebtRegister(accounts[i], sUSDAmounts[i]);
        }
    }

    // /**
    //  * @notice Import issuer debt data
    //  * @dev Only used from importIssuerData above, meant to be disposable
    //  */
    function _addToDebtRegister(address account, uint amount) internal {
        // What is the value that we've previously imported?
        uint totalDebtIssued = importedDebtAmount;

        // What will the new total be including the new value?
        uint newTotalDebtIssued = amount.add(totalDebtIssued);

        // Save that for the next import.
        importedDebtAmount = newTotalDebtIssued;

        // What is their percentage (as a high precision int) of the total debt?
        uint debtPercentage = amount.divideDecimalRoundPrecise(newTotalDebtIssued);

        // And what effect does this percentage change have on the global debt holding of other issuers?
        // The delta specifically needs to not take into account any existing debt as it's already
        // accounted for in the delta from when they issued previously.
        // The delta is a high precision integer.
        uint delta = SafeDecimalMath.preciseUnit().sub(debtPercentage);

        // We ignore any existingDebt as this is being imported in as amount

        // Are they a new issuer? If so, record them. (same as incrementTotalIssuerCount)
        if (issuanceData[account].initialDebtOwnership == 0) {
            totalIssuerCount = totalIssuerCount.add(1);
        }

        // Save the debt entry parameters (same as setCurrentIssuanceData)
        issuanceData[account].initialDebtOwnership = debtPercentage;
        issuanceData[account].debtEntryIndex = debtLedger.length;

        // And if we're the first, push 1 as there was no effect to any other holders, otherwise push
        // the change for the rest of the debt holders. The debt ledger holds high precision integers.
        if (debtLedger.length > 0) {
            debtLedger.push(debtLedger[debtLedger.length - 1].multiplyDecimalRoundPrecise(delta));
        } else {
            debtLedger.push(SafeDecimalMath.preciseUnit());
        }
    }
}
