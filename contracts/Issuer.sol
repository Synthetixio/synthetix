pragma solidity ^0.5.16;

// Inheritance
import "./Owned.sol";
import "./MixinResolver.sol";
import "./MixinSystemSettings.sol";
import "./interfaces/IIssuer.sol";

// Libraries
import "./SafeDecimalMath.sol";

// Internal references
import "./interfaces/ISynth.sol";
import "./interfaces/ISynthetix.sol";
import "./interfaces/IFeePool.sol";
import "./interfaces/ISynthetixState.sol";
import "./interfaces/IExchanger.sol";
import "./interfaces/IDelegateApprovals.sol";
import "./interfaces/IExchangeRates.sol";
import "./interfaces/IEtherCollateral.sol";
import "./interfaces/IEtherCollateralsUSD.sol";
import "./interfaces/IRewardEscrow.sol";
import "./interfaces/IHasBalance.sol";
import "./interfaces/IERC20.sol";
import "./interfaces/ILiquidations.sol";


// https://docs.synthetix.io/contracts/Issuer
contract Issuer is Owned, MixinResolver, MixinSystemSettings, IIssuer {
    using SafeMath for uint;
    using SafeDecimalMath for uint;

    bytes32 private constant sUSD = "sUSD";
    bytes32 public constant CONTRACT_NAME = "Issuer";
    bytes32 public constant LAST_ISSUE_EVENT = "LAST_ISSUE_EVENT";

    // Available Synths which can be used with the system
    ISynth[] public availableSynths;
    mapping(bytes32 => ISynth) public synths;
    mapping(address => bytes32) public synthsByAddress;

    /* ========== ADDRESS RESOLVER CONFIGURATION ========== */

    bytes32 private constant CONTRACT_SYNTHETIX = "Synthetix";
    bytes32 private constant CONTRACT_EXCHANGER = "Exchanger";
    bytes32 private constant CONTRACT_EXRATES = "ExchangeRates";
    bytes32 private constant CONTRACT_SYNTHETIXSTATE = "SynthetixState";
    bytes32 private constant CONTRACT_FEEPOOL = "FeePool";
    bytes32 private constant CONTRACT_DELEGATEAPPROVALS = "DelegateApprovals";
    bytes32 private constant CONTRACT_ETHERCOLLATERAL = "EtherCollateral";
    bytes32 private constant CONTRACT_ETHERCOLLATERAL_SUSD = "EtherCollateralsUSD";
    bytes32 private constant CONTRACT_REWARDESCROW = "RewardEscrow";
    bytes32 private constant CONTRACT_SYNTHETIXESCROW = "SynthetixEscrow";
    bytes32 private constant CONTRACT_LIQUIDATIONS = "Liquidations";

    bytes32[24] private addressesToCache = [
        CONTRACT_SYNTHETIX,
        CONTRACT_EXCHANGER,
        CONTRACT_EXRATES,
        CONTRACT_SYNTHETIXSTATE,
        CONTRACT_FEEPOOL,
        CONTRACT_DELEGATEAPPROVALS,
        CONTRACT_ETHERCOLLATERAL,
        CONTRACT_ETHERCOLLATERAL_SUSD,
        CONTRACT_REWARDESCROW,
        CONTRACT_SYNTHETIXESCROW,
        CONTRACT_LIQUIDATIONS
    ];

    constructor(address _owner, address _resolver)
        public
        Owned(_owner)
        MixinResolver(_resolver, addressesToCache)
        MixinSystemSettings()
    {}

    /* ========== VIEWS ========== */
    function synthetix() internal view returns (ISynthetix) {
        return ISynthetix(requireAndGetAddress(CONTRACT_SYNTHETIX, "Missing Synthetix address"));
    }

    function synthetixERC20() internal view returns (IERC20) {
        return IERC20(requireAndGetAddress(CONTRACT_SYNTHETIX, "Missing Synthetix address"));
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

    function etherCollateral() internal view returns (IEtherCollateral) {
        return IEtherCollateral(requireAndGetAddress(CONTRACT_ETHERCOLLATERAL, "Missing EtherCollateral address"));
    }

    function etherCollateralsUSD() internal view returns (IEtherCollateralsUSD) {
        return
            IEtherCollateralsUSD(requireAndGetAddress(CONTRACT_ETHERCOLLATERAL_SUSD, "Missing EtherCollateralsUSD address"));
    }

    function rewardEscrow() internal view returns (IRewardEscrow) {
        return IRewardEscrow(requireAndGetAddress(CONTRACT_REWARDESCROW, "Missing RewardEscrow address"));
    }

    function synthetixEscrow() internal view returns (IHasBalance) {
        return IHasBalance(requireAndGetAddress(CONTRACT_SYNTHETIXESCROW, "Missing SynthetixEscrow address"));
    }

    function issuanceRatio() external view returns (uint) {
        return getIssuanceRatio();
    }

    function _availableCurrencyKeysWithOptionalSNX(bool withSNX) internal view returns (bytes32[] memory) {
        bytes32[] memory currencyKeys = new bytes32[](availableSynths.length + (withSNX ? 1 : 0));

        for (uint i = 0; i < availableSynths.length; i++) {
            currencyKeys[i] = synthsByAddress[address(availableSynths[i])];
        }

        if (withSNX) {
            currencyKeys[availableSynths.length] = "SNX";
        }

        return currencyKeys;
    }

    function _totalIssuedSynths(bytes32 currencyKey, bool excludeEtherCollateral)
        internal
        view
        returns (uint totalIssued, bool anyRateIsInvalid)
    {
        uint total = 0;
        uint currencyRate;

        bytes32[] memory synthsAndSNX = _availableCurrencyKeysWithOptionalSNX(true);

        // In order to reduce gas usage, fetch all rates and invalid status at once
        (uint[] memory rates, bool anyRateInvalid) = exchangeRates().ratesAndInvalidForCurrencies(synthsAndSNX);

        // Then instead of invoking exchangeRates().effectiveValue() for each synth, use the rate already fetched
        for (uint i = 0; i < synthsAndSNX.length - 1; i++) {
            bytes32 synth = synthsAndSNX[i];
            if (synth == currencyKey) {
                currencyRate = rates[i];
            }
            uint totalSynths = IERC20(address(synths[synth])).totalSupply();

            if (excludeEtherCollateral) {
                // minus total issued synths from Ether Collateral from sETH.totalSupply()
                if (synth == "sETH") {
                    totalSynths = totalSynths.sub(etherCollateral().totalIssuedSynths());
                }

                // minus total issued synths from Ether Collateral from sUSD.totalSupply()
                if (synth == "sUSD") {
                    totalSynths = totalSynths.sub(etherCollateralsUSD().totalIssuedSynths());
                }
            }

            uint synthValue = totalSynths.multiplyDecimalRound(rates[i]);
            total = total.add(synthValue);
        }

        if (currencyKey == "SNX") {
            // if no rate while iterating through synths, then try SNX
            currencyRate = rates[synthsAndSNX.length - 1];
        } else if (currencyRate == 0) {
            // and, in an edge case where the requested rate isn't a synth or SNX, then do the lookup
            currencyRate = exchangeRates().rateForCurrency(currencyKey);
        }

        return (total.divideDecimalRound(currencyRate), anyRateInvalid);
    }

    function _debtBalanceOfAndTotalDebt(address _issuer, bytes32 currencyKey)
        internal
        view
        returns (
            uint debtBalance,
            uint totalSystemValue,
            bool anyRateIsInvalid
        )
    {
        ISynthetixState state = synthetixState();

        // What was their initial debt ownership?
        uint initialDebtOwnership;
        uint debtEntryIndex;
        (initialDebtOwnership, debtEntryIndex) = state.issuanceData(_issuer);

        // What's the total value of the system excluding ETH backed synths in their requested currency?
        (totalSystemValue, anyRateIsInvalid) = _totalIssuedSynths(currencyKey, true);

        // If it's zero, they haven't issued, and they have no debt.
        // Note: it's more gas intensive to put this check here rather than before _totalIssuedSynths
        // if they have 0 SNX, but it's a necessary trade-off
        if (initialDebtOwnership == 0) return (0, totalSystemValue, anyRateIsInvalid);

        // Figure out the global debt percentage delta from when they entered the system.
        // This is a high precision integer of 27 (1e27) decimals.
        uint currentDebtOwnership = state
            .lastDebtLedgerEntry()
            .divideDecimalRoundPrecise(state.debtLedger(debtEntryIndex))
            .multiplyDecimalRoundPrecise(initialDebtOwnership);

        // Their debt balance is their portion of the total system value.
        uint highPrecisionBalance = totalSystemValue.decimalToPreciseDecimal().multiplyDecimalRoundPrecise(
            currentDebtOwnership
        );

        // Convert back into 18 decimals (1e18)
        debtBalance = highPrecisionBalance.preciseDecimalToDecimal();
    }

    function _canBurnSynths(address account) internal view returns (bool) {
        return now >= _lastIssueEvent(account).add(getMinimumStakeTime());
    }

    function _lastIssueEvent(address account) internal view returns (uint) {
        //  Get the timestamp of the last issue this account made
        return flexibleStorage().getUIntValue(CONTRACT_NAME, keccak256(abi.encodePacked(LAST_ISSUE_EVENT, account)));
    }

    function _remainingIssuableSynths(address _issuer)
        internal
        view
        returns (
            uint maxIssuable,
            uint alreadyIssued,
            uint totalSystemDebt,
            bool anyRateIsInvalid
        )
    {
        (alreadyIssued, totalSystemDebt, anyRateIsInvalid) = _debtBalanceOfAndTotalDebt(_issuer, sUSD);
        maxIssuable = _maxIssuableSynths(_issuer);

        if (alreadyIssued >= maxIssuable) {
            maxIssuable = 0;
        } else {
            maxIssuable = maxIssuable.sub(alreadyIssued);
        }
    }

    function _maxIssuableSynths(address _issuer) internal view returns (uint) {
        // What is the value of their SNX balance in sUSD
        uint destinationValue = exchangeRates().effectiveValue("SNX", _collateral(_issuer), sUSD);

        // They're allowed to issue up to issuanceRatio of that value
        return destinationValue.multiplyDecimal(getIssuanceRatio());
    }

    function _collateralisationRatio(address _issuer) internal view returns (uint, bool) {
        uint totalOwnedSynthetix = _collateral(_issuer);

        (uint debtBalance, , bool anyRateIsInvalid) = _debtBalanceOfAndTotalDebt(_issuer, "SNX");

        // it's more gas intensive to put this check here if they have 0 SNX, but it complies with the interface
        if (totalOwnedSynthetix == 0) return (0, anyRateIsInvalid);

        return (debtBalance.divideDecimalRound(totalOwnedSynthetix), anyRateIsInvalid);
    }

    function _collateral(address account) internal view returns (uint) {
        uint balance = synthetixERC20().balanceOf(account);

        if (address(synthetixEscrow()) != address(0)) {
            balance = balance.add(synthetixEscrow().balanceOf(account));
        }

        if (address(rewardEscrow()) != address(0)) {
            balance = balance.add(rewardEscrow().balanceOf(account));
        }

        return balance;
    }

    /* ========== VIEWS ========== */

    function minimumStakeTime() external view returns (uint) {
        return getMinimumStakeTime();
    }

    function canBurnSynths(address account) external view returns (bool) {
        return _canBurnSynths(account);
    }

    function availableCurrencyKeys() external view returns (bytes32[] memory) {
        return _availableCurrencyKeysWithOptionalSNX(false);
    }

    function availableSynthCount() external view returns (uint) {
        return availableSynths.length;
    }

    function anySynthOrSNXRateIsInvalid() external view returns (bool anyRateInvalid) {
        bytes32[] memory currencyKeysWithSNX = _availableCurrencyKeysWithOptionalSNX(true);

        (, anyRateInvalid) = exchangeRates().ratesAndInvalidForCurrencies(currencyKeysWithSNX);
    }

    function totalIssuedSynths(bytes32 currencyKey, bool excludeEtherCollateral) external view returns (uint totalIssued) {
        (totalIssued, ) = _totalIssuedSynths(currencyKey, excludeEtherCollateral);
    }

    function lastIssueEvent(address account) external view returns (uint) {
        return _lastIssueEvent(account);
    }

    function collateralisationRatio(address _issuer) external view returns (uint cratio) {
        (cratio, ) = _collateralisationRatio(_issuer);
    }

    function collateralisationRatioAndAnyRatesInvalid(address _issuer)
        external
        view
        returns (uint cratio, bool anyRateIsInvalid)
    {
        return _collateralisationRatio(_issuer);
    }

    function collateral(address account) external view returns (uint) {
        return _collateral(account);
    }

    function debtBalanceOf(address _issuer, bytes32 currencyKey) external view returns (uint debtBalance) {
        ISynthetixState state = synthetixState();

        // What was their initial debt ownership?
        (uint initialDebtOwnership, ) = state.issuanceData(_issuer);

        // If it's zero, they haven't issued, and they have no debt.
        if (initialDebtOwnership == 0) return 0;

        (debtBalance, , ) = _debtBalanceOfAndTotalDebt(_issuer, currencyKey);
    }

    function remainingIssuableSynths(address _issuer)
        external
        view
        returns (
            uint maxIssuable,
            uint alreadyIssued,
            uint totalSystemDebt
        )
    {
        (maxIssuable, alreadyIssued, totalSystemDebt, ) = _remainingIssuableSynths(_issuer);
    }

    function maxIssuableSynths(address _issuer) external view returns (uint) {
        return _maxIssuableSynths(_issuer);
    }

    function transferableSynthetixAndAnyRateIsInvalid(address account, uint balance)
        external
        view
        returns (uint transferable, bool anyRateIsInvalid)
    {
        // How many SNX do they have, excluding escrow?
        // Note: We're excluding escrow here because we're interested in their transferable amount
        // and escrowed SNX are not transferable.

        // How many of those will be locked by the amount they've issued?
        // Assuming issuance ratio is 20%, then issuing 20 SNX of value would require
        // 100 SNX to be locked in their wallet to maintain their collateralisation ratio
        // The locked synthetix value can exceed their balance.
        uint debtBalance;
        (debtBalance, , anyRateIsInvalid) = _debtBalanceOfAndTotalDebt(account, "SNX");
        uint lockedSynthetixValue = debtBalance.divideDecimalRound(getIssuanceRatio());

        // If we exceed the balance, no SNX are transferable, otherwise the difference is.
        if (lockedSynthetixValue >= balance) {
            transferable = 0;
        } else {
            transferable = balance.sub(lockedSynthetixValue);
        }
    }

    /* ========== MUTATIVE FUNCTIONS ========== */

    function addSynth(ISynth synth) external onlyOwner {
        bytes32 currencyKey = synth.currencyKey();

        require(synths[currencyKey] == ISynth(0), "Synth already exists");
        require(synthsByAddress[address(synth)] == bytes32(0), "Synth address already exists");

        availableSynths.push(synth);
        synths[currencyKey] = synth;
        synthsByAddress[address(synth)] = currencyKey;

        emit SynthAdded(currencyKey, address(synth));
    }

    function removeSynth(bytes32 currencyKey) external onlyOwner {
        require(address(synths[currencyKey]) != address(0), "Synth does not exist");
        require(IERC20(address(synths[currencyKey])).totalSupply() == 0, "Synth supply exists");
        require(currencyKey != sUSD, "Cannot remove synth");

        // Save the address we're removing for emitting the event at the end.
        address synthToRemove = address(synths[currencyKey]);

        // Remove the synth from the availableSynths array.
        for (uint i = 0; i < availableSynths.length; i++) {
            if (address(availableSynths[i]) == synthToRemove) {
                delete availableSynths[i];

                // Copy the last synth into the place of the one we just deleted
                // If there's only one synth, this is synths[0] = synths[0].
                // If we're deleting the last one, it's also a NOOP in the same way.
                availableSynths[i] = availableSynths[availableSynths.length - 1];

                // Decrease the size of the array by one.
                availableSynths.length--;

                break;
            }
        }

        // And remove it from the synths mapping
        delete synthsByAddress[address(synths[currencyKey])];
        delete synths[currencyKey];

        emit SynthRemoved(currencyKey, synthToRemove);
    }

    function issueSynthsOnBehalf(
        address issueForAddress,
        address from,
        uint amount
    ) external onlySynthetix {
        require(delegateApprovals().canIssueFor(issueForAddress, from), "Not approved to act on behalf");

        (uint maxIssuable, uint existingDebt, uint totalSystemDebt, bool anyRateIsInvalid) = _remainingIssuableSynths(
            issueForAddress
        );

        require(!anyRateIsInvalid, "A synth or SNX rate is invalid");

        require(amount <= maxIssuable, "Amount too large");

        _internalIssueSynths(issueForAddress, amount, existingDebt, totalSystemDebt);
    }

    function issueMaxSynthsOnBehalf(address issueForAddress, address from) external onlySynthetix {
        require(delegateApprovals().canIssueFor(issueForAddress, from), "Not approved to act on behalf");

        (uint maxIssuable, uint existingDebt, uint totalSystemDebt, bool anyRateIsInvalid) = _remainingIssuableSynths(
            issueForAddress
        );

        require(!anyRateIsInvalid, "A synth or SNX rate is invalid");

        _internalIssueSynths(issueForAddress, maxIssuable, existingDebt, totalSystemDebt);
    }

    function issueSynths(address from, uint amount) external onlySynthetix {
        // Get remaining issuable in sUSD and existingDebt
        (uint maxIssuable, uint existingDebt, uint totalSystemDebt, bool anyRateIsInvalid) = _remainingIssuableSynths(from);

        require(!anyRateIsInvalid, "A synth or SNX rate is invalid");

        require(amount <= maxIssuable, "Amount too large");

        _internalIssueSynths(from, amount, existingDebt, totalSystemDebt);
    }

    function issueMaxSynths(address from) external onlySynthetix {
        // Figure out the maximum we can issue in that currency
        (uint maxIssuable, uint existingDebt, uint totalSystemDebt, bool anyRateIsInvalid) = _remainingIssuableSynths(from);

        require(!anyRateIsInvalid, "A synth or SNX rate is invalid");

        _internalIssueSynths(from, maxIssuable, existingDebt, totalSystemDebt);
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

    /* ========== INTERNAL FUNCTIONS ========== */

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
        synths[sUSD].issue(from, amount);

        // Store their locked SNX amount to determine their fee % for the period
        _appendAccountIssuanceRecord(from);
    }

    // Burn synths requires minimum stake time is elapsed
    function _burnSynths(address from, uint amount) internal {
        require(_canBurnSynths(from), "Minimum stake time not reached");

        // First settle anything pending into sUSD as burning or issuing impacts the size of the debt pool
        (, uint refunded, uint numEntriesSettled) = exchanger().settle(from, sUSD);

        // How much debt do they have?
        (uint existingDebt, uint totalSystemValue, bool anyRateIsInvalid) = _debtBalanceOfAndTotalDebt(from, sUSD);

        require(!anyRateIsInvalid, "A synth or SNX rate is invalid");

        require(existingDebt > 0, "No debt to forgive");

        uint debtToRemoveAfterSettlement = amount;

        if (numEntriesSettled > 0) {
            debtToRemoveAfterSettlement = exchanger().calculateAmountAfterSettlement(from, sUSD, amount, refunded);
        }

        uint maxIssuableSynthsForAccount = _maxIssuableSynths(from);

        _internalBurnSynths(from, debtToRemoveAfterSettlement, existingDebt, totalSystemValue, maxIssuableSynthsForAccount);
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
        synths[sUSD].burn(liquidator, amount);

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
        (uint existingDebt, uint totalSystemValue, bool anyRateIsInvalid) = _debtBalanceOfAndTotalDebt(from, sUSD);

        require(!anyRateIsInvalid, "A synth or SNX rate is invalid");

        require(existingDebt > 0, "No debt to forgive");

        uint maxIssuableSynthsForAccount = _maxIssuableSynths(from);

        // The amount of sUSD to burn to fix c-ratio. The safe sub will revert if its < 0
        uint amountToBurnToTarget = existingDebt.sub(maxIssuableSynthsForAccount);

        // Burn will fail if you dont have the required sUSD in your wallet
        _internalBurnSynths(from, amountToBurnToTarget, existingDebt, totalSystemValue, maxIssuableSynthsForAccount);
    }

    function _internalBurnSynths(
        address from,
        uint amount,
        uint existingDebt,
        uint totalSystemValue,
        uint maxIssuableSynthsForAccount
    ) internal {
        // If they're trying to burn more debt than they actually owe, rather than fail the transaction, let's just
        // clear their debt and leave them be.
        uint amountToRemove = existingDebt < amount ? existingDebt : amount;

        // Remove their debt from the ledger
        _removeFromDebtRegister(from, amountToRemove, existingDebt, totalSystemValue);

        uint amountToBurn = amountToRemove;

        // synth.burn does a safe subtraction on balance (so it will revert if there are not enough synths).
        synths[sUSD].burn(from, amountToBurn);

        // Store their debtRatio against a feeperiod to determine their fee/rewards % for the period
        _appendAccountIssuanceRecord(from);

        // Check and remove liquidation if existingDebt after burning is <= maxIssuableSynths
        // Issuance ratio is fixed so should remove any liquidations
        if (existingDebt.sub(amountToBurn) <= maxIssuableSynthsForAccount) {
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
        require(IERC20(address(synths[sUSD])).balanceOf(liquidator) >= susdAmount, "Not enough sUSD");

        uint liquidationPenalty = _liquidations.liquidationPenalty();

        uint collateralForAccount = _collateral(account);

        // What is the value of their SNX balance in sUSD?
        uint collateralValue = exchangeRates().effectiveValue("SNX", collateralForAccount, sUSD);

        // What is their debt in sUSD?
        (uint debtBalance, uint totalDebtIssued, bool anyRateIsInvalid) = _debtBalanceOfAndTotalDebt(account, sUSD);

        require(!anyRateIsInvalid, "A synth or SNX rate is invalid");

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
        if (totalRedeemed > collateralForAccount) {
            // set totalRedeemed to all collateral
            totalRedeemed = collateralForAccount;

            // whats the equivalent sUSD to burn for all collateral less penalty
            amountToLiquidate = exchangeRates().effectiveValue(
                "SNX",
                collateralForAccount.divideDecimal(SafeDecimalMath.unit().add(liquidationPenalty)),
                sUSD
            );
        }

        // burn sUSD from messageSender (liquidator) and reduce account's debt
        _burnSynthsForLiquidation(account, liquidator, amountToLiquidate, debtBalance, totalDebtIssued);

        if (amountToLiquidate == amountToFixRatio) {
            // Remove liquidation
            _liquidations.removeAccountInLiquidation(account);
        }
    }

    function _setLastIssueEvent(address account) internal {
        // Set the timestamp of the last issueSynths
        flexibleStorage().setUIntValue(
            CONTRACT_NAME,
            keccak256(abi.encodePacked(LAST_ISSUE_EVENT, account)),
            block.timestamp
        );
    }

    function _appendAccountIssuanceRecord(address from) internal {
        uint initialDebtOwnership;
        uint debtEntryIndex;
        (initialDebtOwnership, debtEntryIndex) = synthetixState().issuanceData(from);

        feePool().appendAccountIssuanceRecord(from, initialDebtOwnership, debtEntryIndex);
    }

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

    event SynthAdded(bytes32 currencyKey, address synth);
    event SynthRemoved(bytes32 currencyKey, address synth);
}
