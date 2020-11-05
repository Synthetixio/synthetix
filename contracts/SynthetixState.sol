pragma solidity ^0.5.16;

// Inheritance
import "./Owned.sol";
import "./State.sol";
import "./LimitedSetup.sol";
import "./interfaces/ISynthetixState.sol";

// Libraries
import "./SafeDecimalMath.sol";


// https://docs.synthetix.io/contracts/source/contracts/synthetixstate
contract SynthetixState is Owned, State, LimitedSetup, ISynthetixState {
    using SafeMath for uint;
    using SafeDecimalMath for uint;

    // A struct for handing values associated with an individual user's debt position
    struct IssuanceData {
        // Percentage of the total debt owned at the time
        // of issuance. This number is modified by the global debt
        // delta array. You can figure out a user's exit price and
        // collateralisation ratio using a combination of their initial
        // debt and the slice of global debt delta which applies to them.
        uint initialDebtOwnership;
        // This lets us know when (in relative terms) the user entered
        // the debt pool so we can calculate their exit price and
        // collateralistion ratio
        uint debtEntryIndex;
    }

    // Issued synth balances for individual fee entitlements and exit price calculations
    mapping(address => IssuanceData) public issuanceData;

    // The total count of people that have outstanding issued synths in any flavour
    uint public totalIssuerCount;

    // Global debt pool tracking
    uint[] public debtLedger;

    constructor(address _owner, address _associatedContract)
        public
        Owned(_owner)
        State(_associatedContract)
        LimitedSetup(1 weeks)
    {}

    /* ========== SETTERS ========== */

    /**
     * @notice Set issuance data for an address
     * @dev Only the associated contract may call this.
     * @param account The address to set the data for.
     * @param initialDebtOwnership The initial debt ownership for this address.
     */
    function setCurrentIssuanceData(address account, uint initialDebtOwnership) external onlyAssociatedContract {
        issuanceData[account].initialDebtOwnership = initialDebtOwnership;
        issuanceData[account].debtEntryIndex = debtLedger.length;
    }

    /**
     * @notice Clear issuance data for an address
     * @dev Only the associated contract may call this.
     * @param account The address to clear the data for.
     */
    function clearIssuanceData(address account) external onlyAssociatedContract {
        delete issuanceData[account];
    }

    /**
     * @notice Increment the total issuer count
     * @dev Only the associated contract may call this.
     */
    function incrementTotalIssuerCount() external onlyAssociatedContract {
        totalIssuerCount = totalIssuerCount.add(1);
    }

    /**
     * @notice Decrement the total issuer count
     * @dev Only the associated contract may call this.
     */
    function decrementTotalIssuerCount() external onlyAssociatedContract {
        totalIssuerCount = totalIssuerCount.sub(1);
    }

    /**
     * @notice Append a value to the debt ledger
     * @dev Only the associated contract may call this.
     * @param value The new value to be added to the debt ledger.
     */
    function appendDebtLedgerValue(uint value) external onlyAssociatedContract {
        debtLedger.push(value);
    }

    // /**
    //  * @notice Import issuer data from the old Synthetix contract before multicurrency
    //  * @dev Only callable by the contract owner, and only for 1 week after deployment.
    //  */
    // function importIssuerData(address[] accounts, uint[] sUSDAmounts) external onlyOwner onlyDuringSetup {
    //     require(accounts.length == sUSDAmounts.length, "Length mismatch");

    //     for (uint8 i = 0; i < accounts.length; i++) {
    //         _addToDebtRegister(accounts[i], sUSDAmounts[i]);
    //     }
    // }

    // /**
    //  * @notice Import issuer data from the old Synthetix contract before multicurrency
    //  * @dev Only used from importIssuerData above, meant to be disposable
    //  */
    // function _addToDebtRegister(address account, uint amount) internal {
    //     // Note: this function's implementation has been removed from the current Synthetix codebase
    //     // as it could only habe been invoked during setup (see importIssuerData) which has since expired.
    //     // There have been changes to the functions it requires, so to ensure compiles, the below has been removed.
    //     // For the previous implementation, see Synthetix._addToDebtRegister()
    // }

    /* ========== VIEWS ========== */

    /**
     * @notice Retrieve the length of the debt ledger array
     */
    function debtLedgerLength() external view returns (uint) {
        return debtLedger.length;
    }

    /**
     * @notice Retrieve the most recent entry from the debt ledger
     */
    function lastDebtLedgerEntry() external view returns (uint) {
        return debtLedger[debtLedger.length - 1];
    }

    /**
     * @notice Query whether an account has issued and has an outstanding debt balance
     * @param account The address to query for
     */
    function hasIssued(address account) external view returns (bool) {
        return issuanceData[account].initialDebtOwnership > 0;
    }
}
