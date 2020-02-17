pragma solidity 0.4.25;

import "openzeppelin-solidity/contracts/math/SafeMath.sol";
import "./SafeDecimalMath.sol";
import "./MixinResolver.sol";
import "./interfaces/ISynthetix.sol";
import "./interfaces/IFeePool.sol";
import "./interfaces/ISynthetixState.sol";
import "./interfaces/IExchanger.sol";

contract Issuer is MixinResolver {
    using SafeMath for uint;
    using SafeDecimalMath for uint;

    bytes32 private constant sUSD = "sUSD";

    constructor(address _owner, address _resolver) public MixinResolver(_owner, _resolver) {}

    /* ========== VIEWS ========== */
    function synthetix() internal view returns (ISynthetix) {
        address _foundAddress = resolver.getAddress("Synthetix");
        require(_foundAddress != address(0), "Resolver is missing Synthetix address");
        return ISynthetix(_foundAddress);

    }

    function exchanger() internal view returns (IExchanger) {
        address _foundAddress = resolver.getAddress("Exchanger");
        require(_foundAddress != address(0), "Resolver is missing Exchanger address");
        return IExchanger(_foundAddress);

    }

    function synthetixState() internal view returns (ISynthetixState) {
        address _foundAddress = resolver.getAddress("SynthetixState");
        require(_foundAddress != address(0), "Resolver is missing the SynthetixState address");
        return ISynthetixState(_foundAddress);

    }

    function feePool() internal view returns (IFeePool) {
        address _foundAddress = resolver.getAddress("FeePool");
        require(_foundAddress != address(0), "Resolver is missing FeePool address");
        return IFeePool(_foundAddress);

    }

    /* ========== SETTERS ========== */

    /* ========== MUTATIVE FUNCTIONS ========== */

    function issueSynths(address from, uint amount)
        external
        onlySynthetix
    // No need to check if price is stale, as it is checked in issuableSynths.
    {
        // Get remaining issuable in sUSD and existingDebt
        (uint maxIssuable, uint existingDebt) = synthetix().remainingIssuableSynths(from);
        require(amount <= maxIssuable, "Amount too large");

        // Keep track of the debt they're about to create (in sUSD)
        _addToDebtRegister(from, amount, existingDebt);

        // Create their synths
        synthetix().synths(sUSD).issue(from, amount);

        // Store their locked SNX amount to determine their fee % for the period
        _appendAccountIssuanceRecord(from);
    }

    function issueMaxSynths(address from) external onlySynthetix {
        // Figure out the maximum we can issue in that currency
        (uint maxIssuable, uint existingDebt) = synthetix().remainingIssuableSynths(from);

        // Keep track of the debt they're about to create
        _addToDebtRegister(from, maxIssuable, existingDebt);

        // Create their synths
        synthetix().synths(sUSD).issue(from, maxIssuable);

        // Store their locked SNX amount to determine their fee % for the period
        _appendAccountIssuanceRecord(from);
    }

    function burnSynths(address from, uint amount)
        external
        onlySynthetix
    // No need to check for stale rates as effectiveValue checks rates
    {
        ISynthetix _synthetix = synthetix();
        IExchanger _exchanger = exchanger();

        // First settle anything pending into sUSD as burning or issuing impacts the size of the debt pool
        (, uint refunded) = _exchanger.settle(from, sUSD);

        // How much debt do they have?
        uint existingDebt = _synthetix.debtBalanceOf(from, sUSD);

        require(existingDebt > 0, "No debt to forgive");

        uint debtToRemoveAfterSettlement = _exchanger.calculateAmountAfterSettlement(from, sUSD, amount, refunded);

        // If they're trying to burn more debt than they actually owe, rather than fail the transaction, let's just
        // clear their debt and leave them be.
        uint amountToRemove = existingDebt < debtToRemoveAfterSettlement ? existingDebt : debtToRemoveAfterSettlement;

        // Remove their debt from the ledger
        _removeFromDebtRegister(from, amountToRemove, existingDebt);

        uint amountToBurn = amountToRemove;

        // synth.burn does a safe subtraction on balance (so it will revert if there are not enough synths).
        _synthetix.synths(sUSD).burn(from, amountToBurn);

        // Store their debtRatio against a feeperiod to determine their fee/rewards % for the period
        _appendAccountIssuanceRecord(from);
    }

    /* ========== INTERNAL FUNCTIONS ========== */

    /**
     * @notice Store in the FeePool the users current debt value in the system.
      * @dev debtBalanceOf(messageSender, "sUSD") to be used with totalIssuedSynthsExcludeEtherCollateral("sUSD") to get
     *  users % of the system within a feePeriod.
     */
    function _appendAccountIssuanceRecord(address from) internal {
        uint initialDebtOwnership;
        uint debtEntryIndex;
        (initialDebtOwnership, debtEntryIndex) = synthetixState().issuanceData(from);

        feePool().appendAccountIssuanceRecord(from, initialDebtOwnership, debtEntryIndex);
    }

    /**
     * @notice Function that registers new synth as they are issued. Calculate delta to append to synthetixState.
     * @dev Only internal calls from synthetix address.
     * @param amount The amount of synths to register with a base of UNIT
     */
    function _addToDebtRegister(address from, uint amount, uint existingDebt) internal {
        ISynthetixState state = synthetixState();

        // What is the value of all issued synths of the system, excluding ether collateral synths (priced in sUSD)?
        uint totalDebtIssued = synthetix().totalIssuedSynthsExcludeEtherCollateral(sUSD);

        // What will the new total be including the new value?
        uint newTotalDebtIssued = amount.add(totalDebtIssued);

        // What is their percentage (as a high precision int) of the total debt?
        uint debtPercentage = amount.divideDecimalRoundPrecise(newTotalDebtIssued);

        // And what effect does this percentage change have on the global debt holding of other issuers?
        // The delta specifically needs to not take into account any existing debt as it's already
        // accounted for in the delta from when they issued previously.
        // The delta is a high precision integer.
        uint delta = SafeDecimalMath.preciseUnit().sub(debtPercentage);

        // And what does their debt ownership look like including this previous stake?
        if (existingDebt > 0) {
            debtPercentage = amount.add(existingDebt).divideDecimalRoundPrecise(newTotalDebtIssued);
        }

        // Are they a new issuer? If so, record them.
        if (existingDebt == 0) {
            state.incrementTotalIssuerCount();
        }

        // Save the debt entry parameters
        state.setCurrentIssuanceData(from, debtPercentage);

        // And if we're the first, push 1 as there was no effect to any other holders, otherwise push
        // the change for the rest of the debt holders. The debt ledger holds high precision integers.
        if (state.debtLedgerLength() > 0) {
            state.appendDebtLedgerValue(state.lastDebtLedgerEntry().multiplyDecimalRoundPrecise(delta));
        } else {
            state.appendDebtLedgerValue(SafeDecimalMath.preciseUnit());
        }
    }

    /**
     * @notice Remove a debt position from the register
     * @param amount The amount (in UNIT base) being presented in sUSDs
     * @param existingDebt The existing debt (in UNIT base) of address presented in sUSDs
     */
    function _removeFromDebtRegister(address from, uint amount, uint existingDebt) internal {
        ISynthetixState state = synthetixState();

        uint debtToRemove = amount;

        // What is the value of all issued synths of the system, excluding ether collateral synths (priced in sUSDs)?
        uint totalDebtIssued = synthetix().totalIssuedSynthsExcludeEtherCollateral(sUSD);

        // What will the new total after taking out the withdrawn amount
        uint newTotalDebtIssued = totalDebtIssued.sub(debtToRemove);

        uint delta = 0;

        // What will the debt delta be if there is any debt left?
        // Set delta to 0 if no more debt left in system after user
        if (newTotalDebtIssued > 0) {
            // What is the percentage of the withdrawn debt (as a high precision int) of the total debt after?
            uint debtPercentage = debtToRemove.divideDecimalRoundPrecise(newTotalDebtIssued);

            // And what effect does this percentage change have on the global debt holding of other issuers?
            // The delta specifically needs to not take into account any existing debt as it's already
            // accounted for in the delta from when they issued previously.
            delta = SafeDecimalMath.preciseUnit().add(debtPercentage);
        }

        // Are they exiting the system, or are they just decreasing their debt position?
        if (debtToRemove == existingDebt) {
            state.setCurrentIssuanceData(from, 0);
            state.decrementTotalIssuerCount();
        } else {
            // What percentage of the debt will they be left with?
            uint newDebt = existingDebt.sub(debtToRemove);
            uint newDebtPercentage = newDebt.divideDecimalRoundPrecise(newTotalDebtIssued);

            // Store the debt percentage and debt ledger as high precision integers
            state.setCurrentIssuanceData(from, newDebtPercentage);
        }

        // Update our cumulative ledger. This is also a high precision integer.
        state.appendDebtLedgerValue(state.lastDebtLedgerEntry().multiplyDecimalRoundPrecise(delta));
    }

    /* ========== MODIFIERS ========== */

    modifier onlySynthetix() {
        require(msg.sender == address(synthetix()), "Issuer: Only the synthetix contract can perform this action");
        _;
    }
}
