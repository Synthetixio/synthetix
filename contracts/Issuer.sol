pragma solidity ^0.5.16;

// Inheritance
import "./Owned.sol";
import "./MixinResolver.sol";
import "./interfaces/IIssuer.sol";

// Libraries
import "./SafeDecimalMath.sol";

// Inheritance
import "./IssuanceEternalStorage.sol";
import "./interfaces/ISynthetix.sol";
import "./interfaces/IFeePool.sol";
import "./interfaces/ISynthetixState.sol";
import "./interfaces/IExchanger.sol";
import "./interfaces/IDelegateApprovals.sol";
import "./interfaces/ILiquidations.sol";
import "./interfaces/IERC20.sol";
import "./interfaces/IExchangeRates.sol";


// https://docs.synthetix.io/contracts/Issuer
contract Issuer is Owned, MixinResolver, IIssuer {
    using SafeMath for uint;
    using SafeDecimalMath for uint;

    bytes32 private constant sUSD = "sUSD";
    bytes32 public constant LAST_ISSUE_EVENT = "LAST_ISSUE_EVENT";

    // Minimum Stake time may not exceed 1 weeks.
    uint public constant MAX_MINIMUM_STAKING_TIME = 1 weeks;

    uint public minimumStakeTime = 24 hours; // default minimum waiting period after issuing synths

    /* ========== ADDRESS RESOLVER CONFIGURATION ========== */

    bytes32 private constant CONTRACT_SYNTHETIX = "Synthetix";
    bytes32 private constant CONTRACT_EXCHANGER = "Exchanger";
    bytes32 private constant CONTRACT_EXRATES = "ExchangeRates";
    bytes32 private constant CONTRACT_SYNTHETIXSTATE = "SynthetixState";
    bytes32 private constant CONTRACT_FEEPOOL = "FeePool";
    bytes32 private constant CONTRACT_DELEGATEAPPROVALS = "DelegateApprovals";
    bytes32 private constant CONTRACT_ISSUANCEETERNALSTORAGE = "IssuanceEternalStorage";
    bytes32 private constant CONTRACT_LIQUIDATIONS = "Liquidations";

    bytes32[24] private addressesToCache = [
        CONTRACT_SYNTHETIX,
        CONTRACT_EXCHANGER,
        CONTRACT_EXRATES,
        CONTRACT_SYNTHETIXSTATE,
        CONTRACT_FEEPOOL,
        CONTRACT_DELEGATEAPPROVALS,
        CONTRACT_ISSUANCEETERNALSTORAGE,
        CONTRACT_LIQUIDATIONS
    ];

    constructor(address _owner, address _resolver) public Owned(_owner) MixinResolver(_resolver, addressesToCache) {}

    /* ========== VIEWS ========== */
    function synthetix() internal view returns (ISynthetix) {
        return ISynthetix(requireAndGetAddress(CONTRACT_SYNTHETIX, "Missing Synthetix address"));
    }

    function exchanger() internal view returns (IExchanger) {
        return IExchanger(requireAndGetAddress(CONTRACT_EXCHANGER, "Missing Exchanger address"));
    }

    function exchangeRates() internal view returns (IExchangeRates) {
        return IExchangeRates(requireAndGetAddress(CONTRACT_EXRATES, "Missing ExchangeRates address"));
    }

    function synthetixState() internal view returns (ISynthetixState) {
        return ISynthetixState(requireAndGetAddress(CONTRACT_SYNTHETIXSTATE, "Missing SynthetixState address"));
    }

    function feePool() internal view returns (IFeePool) {
        return IFeePool(requireAndGetAddress(CONTRACT_FEEPOOL, "Missing FeePool address"));
    }

    function liquidations() internal view returns (ILiquidations) {
        return ILiquidations(requireAndGetAddress(CONTRACT_LIQUIDATIONS, "Missing Liquidations address"));
    }

    function delegateApprovals() internal view returns (IDelegateApprovals) {
        return IDelegateApprovals(requireAndGetAddress(CONTRACT_DELEGATEAPPROVALS, "Missing DelegateApprovals address"));
    }

    function issuanceEternalStorage() internal view returns (IssuanceEternalStorage) {
        return
            IssuanceEternalStorage(
                requireAndGetAddress(CONTRACT_ISSUANCEETERNALSTORAGE, "Missing IssuanceEternalStorage address")
            );
    }

    /* ========== VIEWS ========== */

    function canBurnSynths(address account) public view returns (bool) {
        return now >= lastIssueEvent(account).add(minimumStakeTime);
    }

    function lastIssueEvent(address account) public view returns (uint) {
        //  Get the timestamp of the last issue this account made
        return issuanceEternalStorage().getUIntValue(keccak256(abi.encodePacked(LAST_ISSUE_EVENT, account)));
    }

    /* ========== SETTERS ========== */

    function setMinimumStakeTime(uint _seconds) external onlyOwner {
        // Set the min stake time on locking synthetix
        require(_seconds <= MAX_MINIMUM_STAKING_TIME, "stake time exceed maximum 1 week");
        minimumStakeTime = _seconds;
        emit MinimumStakeTimeUpdated(minimumStakeTime);
    }

    /* ========== MUTATIVE FUNCTIONS ========== */
    function _setLastIssueEvent(address account) internal {
        // Set the timestamp of the last issueSynths
        issuanceEternalStorage().setUIntValue(keccak256(abi.encodePacked(LAST_ISSUE_EVENT, account)), block.timestamp);
    }

    function issueSynthsOnBehalf(
        address issueForAddress,
        address from,
        uint amount
    ) external onlySynthetix {
        require(delegateApprovals().canIssueFor(issueForAddress, from), "Not approved to act on behalf");

        (uint maxIssuable, uint existingDebt, uint totalSystemDebt) = synthetix().remainingIssuableSynths(issueForAddress);
        require(amount <= maxIssuable, "Amount too large");
        _internalIssueSynths(issueForAddress, amount, existingDebt, totalSystemDebt);
    }

    function issueMaxSynthsOnBehalf(address issueForAddress, address from) external onlySynthetix {
        require(delegateApprovals().canIssueFor(issueForAddress, from), "Not approved to act on behalf");

        (uint maxIssuable, uint existingDebt, uint totalSystemDebt) = synthetix().remainingIssuableSynths(issueForAddress);
        _internalIssueSynths(issueForAddress, maxIssuable, existingDebt, totalSystemDebt);
    }

    function issueSynths(address from, uint amount) external onlySynthetix {
        // Get remaining issuable in sUSD and existingDebt
        (uint maxIssuable, uint existingDebt, uint totalSystemDebt) = synthetix().remainingIssuableSynths(from);
        require(amount <= maxIssuable, "Amount too large");

        _internalIssueSynths(from, amount, existingDebt, totalSystemDebt);
    }

    function issueMaxSynths(address from) external onlySynthetix {
        // Figure out the maximum we can issue in that currency
        (uint maxIssuable, uint existingDebt, uint totalSystemDebt) = synthetix().remainingIssuableSynths(from);

        _internalIssueSynths(from, maxIssuable, existingDebt, totalSystemDebt);
    }

    // No need to check if price is stale, as it is checked in issuableSynths.
    function _internalIssueSynths(
        address from,
        uint amount,
        uint existingDebt,
        uint totalSystemDebt
    ) internal {
        // Keep track of the debt they're about to create
        _addToDebtRegister(from, amount, existingDebt, totalSystemDebt);

        // record issue timestamp
        _setLastIssueEvent(from);

        // Create their synths
        synthetix().synths(sUSD).issue(from, amount);

        // Store their locked SNX amount to determine their fee % for the period
        _appendAccountIssuanceRecord(from);
    }

    function burnSynthsOnBehalf(
        address burnForAddress,
        address from,
        uint amount
    ) external onlySynthetix {
        require(delegateApprovals().canBurnFor(burnForAddress, from), "Not approved to act on behalf");
        _burnSynths(burnForAddress, amount);
    }

    function burnSynths(address from, uint amount) external onlySynthetix {
        _burnSynths(from, amount);
    }

    // Burn synths requires minimum stake time is elapsed
    function _burnSynths(address from, uint amount) internal {
        require(canBurnSynths(from), "Minimum stake time not reached");

        // First settle anything pending into sUSD as burning or issuing impacts the size of the debt pool
        (, uint refunded, uint numEntriesSettled) = exchanger().settle(from, sUSD);

        // How much debt do they have?
        (uint existingDebt, uint totalSystemValue) = synthetix().debtBalanceOfAndTotalDebt(from, sUSD);

        require(existingDebt > 0, "No debt to forgive");

        uint debtToRemoveAfterSettlement = amount;

        if (numEntriesSettled > 0) {
            debtToRemoveAfterSettlement = exchanger().calculateAmountAfterSettlement(from, sUSD, amount, refunded);
        }

        uint maxIssuable = synthetix().maxIssuableSynths(from);

        _internalBurnSynths(from, debtToRemoveAfterSettlement, existingDebt, totalSystemValue, maxIssuable);
    }

    function _burnSynthsForLiquidation(
        address burnForAddress,
        address liquidator,
        uint amount,
        uint existingDebt,
        uint totalDebtIssued
    ) internal {
        // liquidation requires sUSD to be already settled / not in waiting period

        // Remove liquidated debt from the ledger
        _removeFromDebtRegister(burnForAddress, amount, existingDebt, totalDebtIssued);

        // synth.burn does a safe subtraction on balance (so it will revert if there are not enough synths).
        synthetix().synths(sUSD).burn(liquidator, amount);

        // Store their debtRatio against a feeperiod to determine their fee/rewards % for the period
        _appendAccountIssuanceRecord(burnForAddress);
    }

    function burnSynthsToTargetOnBehalf(address burnForAddress, address from) external onlySynthetix {
        require(delegateApprovals().canBurnFor(burnForAddress, from), "Not approved to act on behalf");
        _burnSynthsToTarget(burnForAddress);
    }

    function burnSynthsToTarget(address from) external onlySynthetix {
        _burnSynthsToTarget(from);
    }

    // Burns your sUSD to the target c-ratio so you can claim fees
    // Skip settle anything pending into sUSD as user will still have debt remaining after target c-ratio
    function _burnSynthsToTarget(address from) internal {
        // How much debt do they have?
        (uint existingDebt, uint totalSystemValue) = synthetix().debtBalanceOfAndTotalDebt(from, sUSD);

        require(existingDebt > 0, "No debt to forgive");

        // The maximum amount issuable against their total SNX balance.
        uint maxIssuable = synthetix().maxIssuableSynths(from);

        // The amount of sUSD to burn to fix c-ratio. The safe sub will revert if its < 0
        uint amountToBurnToTarget = existingDebt.sub(maxIssuable);

        // Burn will fail if you dont have the required sUSD in your wallet
        _internalBurnSynths(from, amountToBurnToTarget, existingDebt, totalSystemValue, maxIssuable);
    }

    // No need to check for stale rates as effectiveValue checks rates
    function _internalBurnSynths(
        address from,
        uint amount,
        uint existingDebt,
        uint totalSystemValue,
        uint maxIssuableSynths
    ) internal {
        // If they're trying to burn more debt than they actually owe, rather than fail the transaction, let's just
        // clear their debt and leave them be.
        uint amountToRemove = existingDebt < amount ? existingDebt : amount;

        // Remove their debt from the ledger
        _removeFromDebtRegister(from, amountToRemove, existingDebt, totalSystemValue);

        uint amountToBurn = amountToRemove;

        // synth.burn does a safe subtraction on balance (so it will revert if there are not enough synths).
        synthetix().synths(sUSD).burn(from, amountToBurn);

        // Store their debtRatio against a feeperiod to determine their fee/rewards % for the period
        _appendAccountIssuanceRecord(from);

        // Check and remove liquidation if existingDebt after burning is <= maxIssuableSynths
        // Issuance ratio is fixed so should remove any liquidations
        if (existingDebt.sub(amountToBurn) <= maxIssuableSynths) {
            liquidations().removeAccountInLiquidation(from);
        }
    }

    function liquidateDelinquentAccount(
        address account,
        uint susdAmount,
        address liquidator
    ) external onlySynthetix returns (uint totalRedeemed, uint amountToLiquidate) {
        // Ensure waitingPeriod and sUSD balance is settled as burning impacts the size of debt pool
        require(!exchanger().hasWaitingPeriodOrSettlementOwing(liquidator, sUSD), "sUSD needs to be settled");
        ILiquidations _liquidations = liquidations();

        // Check account is liquidation open
        require(_liquidations.isOpenForLiquidation(account), "Account not open for liquidation");

        // require liquidator has enough sUSD
        require(IERC20(address(synthetix().synths(sUSD))).balanceOf(liquidator) >= susdAmount, "Not enough sUSD");

        uint liquidationPenalty = _liquidations.liquidationPenalty();

        uint collateral = synthetix().collateral(account);

        // What is the value of their SNX balance in sUSD?
        uint collateralValue = exchangeRates().effectiveValue("SNX", collateral, sUSD);

        // What is their debt in sUSD?
        (uint debtBalance, uint totalDebtIssued) = synthetix().debtBalanceOfAndTotalDebt(account, sUSD);

        uint amountToFixRatio = _liquidations.calculateAmountToFixCollateral(debtBalance, collateralValue);

        // Cap amount to liquidate to repair collateral ratio based on issuance ratio
        amountToLiquidate = amountToFixRatio < susdAmount ? amountToFixRatio : susdAmount;

        // what's the equivalent amount of snx for the amountToLiquidate?
        uint snxRedeemed = exchangeRates().effectiveValue(sUSD, amountToLiquidate, "SNX");

        // Add penalty
        totalRedeemed = snxRedeemed.multiplyDecimal(SafeDecimalMath.unit().add(liquidationPenalty));

        // if total SNX to redeem is greater than account's collateral
        // account is under collateralised, liquidate all collateral and reduce sUSD to burn
        // an insurance fund will be added to cover these undercollateralised positions
        if (totalRedeemed > collateral) {
            // set totalRedeemed to all collateral
            totalRedeemed = collateral;

            // whats the equivalent sUSD to burn for all collateral less penalty
            amountToLiquidate = exchangeRates().effectiveValue("SNX", collateral.divideDecimal(SafeDecimalMath.unit().add(liquidationPenalty)), sUSD);
        }

        // burn sUSD from messageSender (liquidator) and reduce account's debt
        _burnSynthsForLiquidation(account, liquidator, amountToLiquidate, debtBalance, totalDebtIssued);

        if (amountToLiquidate == amountToFixRatio) {
            // Remove liquidation
            _liquidations.removeAccountInLiquidation(account);
        }
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
    function _addToDebtRegister(
        address from,
        uint amount,
        uint existingDebt,
        uint totalDebtIssued
    ) internal {
        ISynthetixState state = synthetixState();

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
     * @param totalDebtIssued The existing system debt (in UNIT base) presented in sUSDs
     */
    function _removeFromDebtRegister(
        address from,
        uint amount,
        uint existingDebt,
        uint totalDebtIssued
    ) internal {
        ISynthetixState state = synthetixState();

        uint debtToRemove = amount;

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

    /* ========== EVENTS ========== */

    event MinimumStakeTimeUpdated(uint minimumStakeTime);
}
