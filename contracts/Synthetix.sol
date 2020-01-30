pragma solidity 0.4.25;

import "./ExternStateToken.sol";
import "./TokenState.sol";
import "./SupplySchedule.sol";
import "./ExchangeRates.sol";
import "./SynthetixState.sol";
import "./Synth.sol";
import "./interfaces/ISynthetixEscrow.sol";
import "./interfaces/IFeePool.sol";
import "./interfaces/IRewardsDistribution.sol";


/**
 * @title Synthetix ERC20 contract.
 * @notice The Synthetix contracts not only facilitates transfers, exchanges, and tracks balances,
 * but it also computes the quantity of fees each synthetix holder is entitled to.
 */
contract Synthetix is ExternStateToken {
    // ========== STATE VARIABLES ==========

    // Available Synths which can be used with the system
    Synth[] public availableSynths;
    mapping(bytes32 => Synth) public synths;
    mapping(address => bytes32) public synthsByAddress;

    IFeePool public feePool;
    ISynthetixEscrow public escrow;
    ISynthetixEscrow public rewardEscrow;
    ExchangeRates public exchangeRates;
    SynthetixState public synthetixState;
    SupplySchedule public supplySchedule;
    IRewardsDistribution public rewardsDistribution;

    bool private protectionCircuit = false;

    string constant TOKEN_NAME = "Synthetix Network Token";
    string constant TOKEN_SYMBOL = "SNX";
    uint8 constant DECIMALS = 18;
    bytes32 constant sUSD = "sUSD";

    bool public exchangeEnabled = true;
    uint public gasPriceLimit;

    address public gasLimitOracle;

    // ========== CONSTRUCTOR ==========

    /**
     * @dev Constructor
     * @param _proxy The main token address of the Proxy contract. This will be ProxyERC20.sol
     * @param _tokenState Address of the external immutable contract containing token balances.
     * @param _synthetixState External immutable contract containing the SNX minters debt ledger.
     * @param _owner The owner of this contract.
     * @param _exchangeRates External immutable contract where the price oracle pushes prices onchain too.
     * @param _feePool External upgradable contract handling SNX Fees and Rewards claiming
     * @param _supplySchedule External immutable contract with the SNX inflationary supply schedule
     * @param _rewardEscrow External immutable contract for SNX Rewards Escrow
     * @param _escrow External immutable contract for SNX Token Sale Escrow
     * @param _rewardsDistribution External immutable contract managing the Rewards Distribution of the SNX inflationary supply
     * @param _totalSupply On upgrading set to reestablish the current total supply (This should be in SynthetixState if ever updated)
     */
    constructor(
        address _proxy,
        TokenState _tokenState,
        SynthetixState _synthetixState,
        address _owner,
        ExchangeRates _exchangeRates,
        IFeePool _feePool,
        SupplySchedule _supplySchedule,
        ISynthetixEscrow _rewardEscrow,
        ISynthetixEscrow _escrow,
        IRewardsDistribution _rewardsDistribution,
        uint _totalSupply
    ) public ExternStateToken(_proxy, _tokenState, TOKEN_NAME, TOKEN_SYMBOL, _totalSupply, DECIMALS, _owner) {
        synthetixState = _synthetixState;
        exchangeRates = _exchangeRates;
        feePool = _feePool;
        supplySchedule = _supplySchedule;
        rewardEscrow = _rewardEscrow;
        escrow = _escrow;
        rewardsDistribution = _rewardsDistribution;
    }

    // ========== SETTERS ========== */

    function setFeePool(IFeePool _feePool) external optionalProxy_onlyOwner {
        feePool = _feePool;
    }

    function setExchangeRates(ExchangeRates _exchangeRates) external optionalProxy_onlyOwner {
        exchangeRates = _exchangeRates;
    }

    function setProtectionCircuit(bool _protectionCircuitIsActivated) external onlyOracle {
        protectionCircuit = _protectionCircuitIsActivated;
    }

    function setExchangeEnabled(bool _exchangeEnabled) external optionalProxy_onlyOwner {
        exchangeEnabled = _exchangeEnabled;
    }

    function setGasLimitOracle(address _gasLimitOracle) external optionalProxy_onlyOwner {
        gasLimitOracle = _gasLimitOracle;
    }

    function setGasPriceLimit(uint _gasPriceLimit) external {
        require(msg.sender == gasLimitOracle, "Only gas limit oracle allowed");
        require(_gasPriceLimit > 0, "Needs to be greater than 0");
        gasPriceLimit = _gasPriceLimit;
    }

    /**
     * @notice Add an associated Synth contract to the Synthetix system
     * @dev Only the contract owner may call this.
     */
    function addSynth(Synth synth) external optionalProxy_onlyOwner {
        bytes32 currencyKey = synth.currencyKey();

        require(synths[currencyKey] == Synth(0), "Synth already exists");
        require(synthsByAddress[synth] == bytes32(0), "Synth address already exists");

        availableSynths.push(synth);
        synths[currencyKey] = synth;
        synthsByAddress[synth] = currencyKey;
    }

    /**
     * @notice Remove an associated Synth contract from the Synthetix system
     * @dev Only the contract owner may call this.
     */
    function removeSynth(bytes32 currencyKey) external optionalProxy_onlyOwner {
        require(synths[currencyKey] != address(0), "Synth does not exist");
        require(synths[currencyKey].totalSupply() == 0, "Synth supply exists");
        require(currencyKey != sUSD, "Cannot remove synth");

        // Save the address we're removing for emitting the event at the end.
        address synthToRemove = synths[currencyKey];

        // Remove the synth from the availableSynths array.
        for (uint i = 0; i < availableSynths.length; i++) {
            if (availableSynths[i] == synthToRemove) {
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
        delete synthsByAddress[synths[currencyKey]];
        delete synths[currencyKey];

        // Note: No event here as Synthetix contract exceeds max contract size
        // with these events, and it's unlikely people will need to
        // track these events specifically.
    }

    // ========== VIEWS ==========

    /**
     * @notice A function that lets you easily convert an amount in a source currency to an amount in the destination currency
     * @param sourceCurrencyKey The currency the amount is specified in
     * @param sourceAmount The source amount, specified in UNIT base
     * @param destinationCurrencyKey The destination currency
     */
    function effectiveValue(bytes32 sourceCurrencyKey, uint sourceAmount, bytes32 destinationCurrencyKey)
        public
        view
        returns (uint)
    {
        return exchangeRates.effectiveValue(sourceCurrencyKey, sourceAmount, destinationCurrencyKey);
    }

    /**
     * @notice Total amount of synths issued by the system, priced in currencyKey
     * @param currencyKey The currency to value the synths in
     */
    function totalIssuedSynths(bytes32 currencyKey) public view returns (uint) {
        uint total = 0;
        uint currencyRate = exchangeRates.rateForCurrency(currencyKey);

        (uint[] memory rates, bool anyRateStale) = exchangeRates.ratesAndStaleForCurrencies(availableCurrencyKeys());
        require(!anyRateStale, "Rates are stale");

        for (uint i = 0; i < availableSynths.length; i++) {
            // What's the total issued value of that synth in the destination currency?
            // Note: We're not using our effectiveValue function because we don't want to go get the
            //       rate for the destination currency and check if it's stale repeatedly on every
            //       iteration of the loop
            uint synthValue = availableSynths[i].totalSupply().multiplyDecimalRound(rates[i]);
            total = total.add(synthValue);
        }

        return total.divideDecimalRound(currencyRate);
    }

    /**
     * @notice Returns the currencyKeys of availableSynths for rate checking
     */
    function availableCurrencyKeys() public view returns (bytes32[]) {
        bytes32[] memory currencyKeys = new bytes32[](availableSynths.length);

        for (uint i = 0; i < availableSynths.length; i++) {
            currencyKeys[i] = synthsByAddress[availableSynths[i]];
        }

        return currencyKeys;
    }

    /**
     * @notice Returns the count of available synths in the system, which you can use to iterate availableSynths
     */
    function availableSynthCount() public view returns (uint) {
        return availableSynths.length;
    }

    /**
     * @notice Determine the effective fee rate for the exchange, taking into considering swing trading
     */
    function feeRateForExchange(bytes32 sourceCurrencyKey, bytes32 destinationCurrencyKey) public view returns (uint) {
        // Get the base exchange fee rate
        uint exchangeFeeRate = feePool.exchangeFeeRate();

        uint multiplier = 1;

        // Is this a swing trade? I.e. long to short or vice versa, excluding when going into or out of sUSD.
        // Note: this assumes shorts begin with 'i' and longs with 's'.
        if (
            (sourceCurrencyKey[0] == 0x73 && sourceCurrencyKey != sUSD && destinationCurrencyKey[0] == 0x69) ||
            (sourceCurrencyKey[0] == 0x69 && destinationCurrencyKey != sUSD && destinationCurrencyKey[0] == 0x73)
        ) {
            // If so then double the exchange fee multipler
            multiplier = 2;
        }

        return exchangeFeeRate.mul(multiplier);
    }

    // ========== MUTATIVE FUNCTIONS ==========

    /**
     * @notice ERC20 transfer function.
     */
    function transfer(address to, uint value) public optionalProxy returns (bool) {
        // Ensure they're not trying to exceed their staked SNX amount
        require(value <= transferableSynthetix(messageSender), "Cannot transfer staked or escrowed SNX");

        // Perform the transfer: if there is a problem an exception will be thrown in this call.
        _transfer_byProxy(messageSender, to, value);

        return true;
    }

    /**
     * @notice ERC20 transferFrom function.
     */
    function transferFrom(address from, address to, uint value) public optionalProxy returns (bool) {
        // Ensure they're not trying to exceed their locked amount
        require(value <= transferableSynthetix(from), "Cannot transfer staked or escrowed SNX");

        // Perform the transfer: if there is a problem,
        // an exception will be thrown in this call.
        return _transferFrom_byProxy(messageSender, from, to, value);
    }

    /**
     * @notice Function that allows you to exchange synths you hold in one flavour for another.
     * @param sourceCurrencyKey The source currency you wish to exchange from
     * @param sourceAmount The amount, specified in UNIT of source currency you wish to exchange
     * @param destinationCurrencyKey The destination currency you wish to obtain.
     * @return Boolean that indicates whether the transfer succeeded or failed.
     */
    function exchange(bytes32 sourceCurrencyKey, uint sourceAmount, bytes32 destinationCurrencyKey)
        external
        optionalProxy
        returns (
            // Note: We don't need to insist on non-stale rates because effectiveValue will do it for us.
            bool
        )
    {
        require(sourceCurrencyKey != destinationCurrencyKey, "Can't be same synth");
        require(sourceAmount > 0, "Zero amount");

        // verify gas price limit
        validateGasPrice(tx.gasprice);

        //  If the oracle has set protectionCircuit to true then burn the synths
        if (protectionCircuit) {
            synths[sourceCurrencyKey].burn(messageSender, sourceAmount);
            return true;
        } else {
            // Pass it along, defaulting to the sender as the recipient.
            return
                _internalExchange(
                    messageSender,
                    sourceCurrencyKey,
                    sourceAmount,
                    destinationCurrencyKey,
                    messageSender,
                    true // Charge fee on the exchange
                );
        }
    }

    /*
        @dev validate that the given gas price is less than or equal to the gas price limit
        @param _gasPrice tested gas price
    */
    function validateGasPrice(uint _givenGasPrice) public view {
        require(_givenGasPrice <= gasPriceLimit, "Gas price above limit");
    }

    /**
     * @notice Function that allows synth contract to delegate exchanging of a synth that is not the same sourceCurrency
     * @dev Only the synth contract can call this function
     * @param from The address to exchange / burn synth from
     * @param sourceCurrencyKey The source currency you wish to exchange from
     * @param sourceAmount The amount, specified in UNIT of source currency you wish to exchange
     * @param destinationCurrencyKey The destination currency you wish to obtain.
     * @param destinationAddress Where the result should go.
     * @return Boolean that indicates whether the transfer succeeded or failed.
     */
    function synthInitiatedExchange(
        address from,
        bytes32 sourceCurrencyKey,
        uint sourceAmount,
        bytes32 destinationCurrencyKey,
        address destinationAddress
    ) external optionalProxy returns (bool) {
        require(synthsByAddress[messageSender] != bytes32(0), "Only synth allowed");
        require(sourceCurrencyKey != destinationCurrencyKey, "Can't be same synth");
        require(sourceAmount > 0, "Zero amount");

        // Pass it along
        return
            _internalExchange(from, sourceCurrencyKey, sourceAmount, destinationCurrencyKey, destinationAddress, false);
    }

    /**
     * @notice Function that allows synth contract to delegate sending fee to the fee Pool.
     * @dev fee pool contract address is not allowed to call function
     * @param from The address to move synth from
     * @param sourceCurrencyKey source currency from.
     * @param sourceAmount The amount, specified in UNIT of source currency.
     * @param destinationCurrencyKey The destination currency to obtain.
     * @param destinationAddress Where the result should go.
     * @param chargeFee Boolean to charge a fee for exchange.
     * @return Boolean that indicates whether the transfer succeeded or failed.
     */
    function _internalExchange(
        address from,
        bytes32 sourceCurrencyKey,
        uint sourceAmount,
        bytes32 destinationCurrencyKey,
        address destinationAddress,
        bool chargeFee
    ) internal returns (bool) {
        require(exchangeEnabled, "Exchanging is disabled");

        // Note: We don't need to check their balance as the burn() below will do a safe subtraction which requires
        // the subtraction to not overflow, which would happen if their balance is not sufficient.

        // Burn the source amount
        synths[sourceCurrencyKey].burn(from, sourceAmount);

        // How much should they get in the destination currency?
        uint destinationAmount = effectiveValue(sourceCurrencyKey, sourceAmount, destinationCurrencyKey);

        // What's the fee on that currency that we should deduct?
        uint amountReceived = destinationAmount;
        uint fee = 0;

        if (chargeFee) {
            // Get the exchange fee rate
            uint exchangeFeeRate = feeRateForExchange(sourceCurrencyKey, destinationCurrencyKey);

            amountReceived = destinationAmount.multiplyDecimal(SafeDecimalMath.unit().sub(exchangeFeeRate));

            fee = destinationAmount.sub(amountReceived);
        }

        // Issue their new synths
        synths[destinationCurrencyKey].issue(destinationAddress, amountReceived);

        // Remit the fee in sUSDs
        if (fee > 0) {
            uint usdFeeAmount = effectiveValue(destinationCurrencyKey, fee, sUSD);
            synths[sUSD].issue(feePool.FEE_ADDRESS(), usdFeeAmount);
            // Tell the fee pool about this.
            feePool.recordFeePaid(usdFeeAmount);
        }

        // Nothing changes as far as issuance data goes because the total value in the system hasn't changed.

        //Let the DApps know there was a Synth exchange
        emitSynthExchange(
            from,
            sourceCurrencyKey,
            sourceAmount,
            destinationCurrencyKey,
            amountReceived,
            destinationAddress
        );

        return true;
    }

    /**
     * @notice Function that registers new synth as they are issued. Calculate delta to append to synthetixState.
     * @dev Only internal calls from synthetix address.
     * @param amount The amount of synths to register with a base of UNIT
     */
    function _addToDebtRegister(uint amount, uint existingDebt) internal {
        // What is the value of all issued synths of the system (priced in sUSD)?
        uint totalDebtIssued = totalIssuedSynths(sUSD);

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
            synthetixState.incrementTotalIssuerCount();
        }

        // Save the debt entry parameters
        synthetixState.setCurrentIssuanceData(messageSender, debtPercentage);

        // And if we're the first, push 1 as there was no effect to any other holders, otherwise push
        // the change for the rest of the debt holders. The debt ledger holds high precision integers.
        if (synthetixState.debtLedgerLength() > 0) {
            synthetixState.appendDebtLedgerValue(
                synthetixState.lastDebtLedgerEntry().multiplyDecimalRoundPrecise(delta)
            );
        } else {
            synthetixState.appendDebtLedgerValue(SafeDecimalMath.preciseUnit());
        }
    }

    /**
     * @notice Issue synths against the sender's SNX.
     * @dev Issuance is only allowed if the synthetix price isn't stale. Amount should be larger than 0.
     * @param amount The amount of synths you wish to issue with a base of UNIT
     */
    function issueSynths(uint amount)
        public
        optionalProxy
    // No need to check if price is stale, as it is checked in issuableSynths.
    {
        // Get remaining issuable in sUSD and existingDebt
        (uint maxIssuable, uint existingDebt) = remainingIssuableSynths(messageSender);
        require(amount <= maxIssuable, "Amount too large");

        // Keep track of the debt they're about to create (in sUSD)
        _addToDebtRegister(amount, existingDebt);

        // Create their synths
        synths[sUSD].issue(messageSender, amount);

        // Store their locked SNX amount to determine their fee % for the period
        _appendAccountIssuanceRecord();
    }

    /**
     * @notice Issue the maximum amount of Synths possible against the sender's SNX.
     * @dev Issuance is only allowed if the synthetix price isn't stale.
     */
    function issueMaxSynths() external optionalProxy {
        // Figure out the maximum we can issue in that currency
        (uint maxIssuable, uint existingDebt) = remainingIssuableSynths(messageSender);

        // Keep track of the debt they're about to create
        _addToDebtRegister(maxIssuable, existingDebt);

        // Create their synths
        synths[sUSD].issue(messageSender, maxIssuable);

        // Store their locked SNX amount to determine their fee % for the period
        _appendAccountIssuanceRecord();
    }

    /**
     * @notice Burn synths to clear issued synths/free SNX.
     * @param amount The amount (in UNIT base) you wish to burn
     * @dev The amount to burn is debased to sUSD's
     */
    function burnSynths(uint amount)
        external
        optionalProxy
    // No need to check for stale rates as effectiveValue checks rates
    {
        // How much debt do they have?
        uint debtToRemove = amount;
        uint existingDebt = debtBalanceOf(messageSender, sUSD);

        require(existingDebt > 0, "No debt to forgive");

        // If they're trying to burn more debt than they actually owe, rather than fail the transaction, let's just
        // clear their debt and leave them be.
        uint amountToRemove = existingDebt < debtToRemove ? existingDebt : debtToRemove;

        // Remove their debt from the ledger
        _removeFromDebtRegister(amountToRemove, existingDebt);

        uint amountToBurn = amountToRemove;

        // synth.burn does a safe subtraction on balance (so it will revert if there are not enough synths).
        synths[sUSD].burn(messageSender, amountToBurn);

        // Store their debtRatio against a feeperiod to determine their fee/rewards % for the period
        _appendAccountIssuanceRecord();
    }

    /**
     * @notice Store in the FeePool the users current debt value in the system.
     * @dev debtBalanceOf(messageSender, "sUSD") to be used with totalIssuedSynths("sUSD") to get
     *  users % of the system within a feePeriod.
     */
    function _appendAccountIssuanceRecord() internal {
        uint initialDebtOwnership;
        uint debtEntryIndex;
        (initialDebtOwnership, debtEntryIndex) = synthetixState.issuanceData(messageSender);

        feePool.appendAccountIssuanceRecord(messageSender, initialDebtOwnership, debtEntryIndex);
    }

    /**
     * @notice Remove a debt position from the register
     * @param amount The amount (in UNIT base) being presented in sUSDs
     * @param existingDebt The existing debt (in UNIT base) of address presented in sUSDs
     */
    function _removeFromDebtRegister(uint amount, uint existingDebt) internal {
        uint debtToRemove = amount;

        // What is the value of all issued synths of the system (priced in sUSDs)?
        uint totalDebtIssued = totalIssuedSynths(sUSD);

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
            synthetixState.setCurrentIssuanceData(messageSender, 0);
            synthetixState.decrementTotalIssuerCount();
        } else {
            // What percentage of the debt will they be left with?
            uint newDebt = existingDebt.sub(debtToRemove);
            uint newDebtPercentage = newDebt.divideDecimalRoundPrecise(newTotalDebtIssued);

            // Store the debt percentage and debt ledger as high precision integers
            synthetixState.setCurrentIssuanceData(messageSender, newDebtPercentage);
        }

        // Update our cumulative ledger. This is also a high precision integer.
        synthetixState.appendDebtLedgerValue(synthetixState.lastDebtLedgerEntry().multiplyDecimalRoundPrecise(delta));
    }

    // ========== Issuance/Burning ==========

    /**
     * @notice The maximum synths an issuer can issue against their total synthetix quantity.
     * This ignores any already issued synths, and is purely giving you the maximimum amount the user can issue.
     */
    function maxIssuableSynths(address issuer)
        public
        view
        returns (
            // We don't need to check stale rates here as effectiveValue will do it for us.
            uint
        )
    {
        // What is the value of their SNX balance in the destination currency?
        uint destinationValue = effectiveValue("SNX", collateral(issuer), sUSD);

        // They're allowed to issue up to issuanceRatio of that value
        return destinationValue.multiplyDecimal(synthetixState.issuanceRatio());
    }

    /**
     * @notice The current collateralisation ratio for a user. Collateralisation ratio varies over time
     * as the value of the underlying Synthetix asset changes,
     * e.g. based on an issuance ratio of 20%. if a user issues their maximum available
     * synths when they hold $10 worth of Synthetix, they will have issued $2 worth of synths. If the value
     * of Synthetix changes, the ratio returned by this function will adjust accordingly. Users are
     * incentivised to maintain a collateralisation ratio as close to the issuance ratio as possible by
     * altering the amount of fees they're able to claim from the system.
     */
    function collateralisationRatio(address issuer) public view returns (uint) {
        uint totalOwnedSynthetix = collateral(issuer);
        if (totalOwnedSynthetix == 0) return 0;

        uint debtBalance = debtBalanceOf(issuer, "SNX");
        return debtBalance.divideDecimalRound(totalOwnedSynthetix);
    }

    /**
     * @notice If a user issues synths backed by SNX in their wallet, the SNX become locked. This function
     * will tell you how many synths a user has to give back to the system in order to unlock their original
     * debt position. This is priced in whichever synth is passed in as a currency key, e.g. you can price
     * the debt in sUSD, or any other synth you wish.
     */
    function debtBalanceOf(address issuer, bytes32 currencyKey)
        public
        view
        returns (
            // Don't need to check for stale rates here because totalIssuedSynths will do it for us
            uint
        )
    {
        // What was their initial debt ownership?
        uint initialDebtOwnership;
        uint debtEntryIndex;
        (initialDebtOwnership, debtEntryIndex) = synthetixState.issuanceData(issuer);

        // If it's zero, they haven't issued, and they have no debt.
        if (initialDebtOwnership == 0) return 0;

        // Figure out the global debt percentage delta from when they entered the system.
        // This is a high precision integer of 27 (1e27) decimals.
        uint currentDebtOwnership = synthetixState
            .lastDebtLedgerEntry()
            .divideDecimalRoundPrecise(synthetixState.debtLedger(debtEntryIndex))
            .multiplyDecimalRoundPrecise(initialDebtOwnership);

        // What's the total value of the system in their requested currency?
        uint totalSystemValue = totalIssuedSynths(currencyKey);

        // Their debt balance is their portion of the total system value.
        uint highPrecisionBalance = totalSystemValue.decimalToPreciseDecimal().multiplyDecimalRoundPrecise(
            currentDebtOwnership
        );

        // Convert back into 18 decimals (1e18)
        return highPrecisionBalance.preciseDecimalToDecimal();
    }

    /**
     * @notice The remaining synths an issuer can issue against their total synthetix balance.
     * @param issuer The account that intends to issue
     */
    function remainingIssuableSynths(address issuer)
        public
        view
        returns (
            // Don't need to check for synth existing or stale rates because maxIssuableSynths will do it for us.
            uint,
            uint
        )
    {
        uint alreadyIssued = debtBalanceOf(issuer, sUSD);
        uint maxIssuable = maxIssuableSynths(issuer);

        if (alreadyIssued >= maxIssuable) {
            maxIssuable = 0;
        } else {
            maxIssuable = maxIssuable.sub(alreadyIssued);
        }
        return (maxIssuable, alreadyIssued);
    }

    /**
     * @notice The total SNX owned by this account, both escrowed and unescrowed,
     * against which synths can be issued.
     * This includes those already being used as collateral (locked), and those
     * available for further issuance (unlocked).
     */
    function collateral(address account) public view returns (uint) {
        uint balance = tokenState.balanceOf(account);

        if (escrow != address(0)) {
            balance = balance.add(escrow.balanceOf(account));
        }

        if (rewardEscrow != address(0)) {
            balance = balance.add(rewardEscrow.balanceOf(account));
        }

        return balance;
    }

    /**
     * @notice The number of SNX that are free to be transferred for an account.
     * @dev Escrowed SNX are not transferable, so they are not included
     * in this calculation.
     * @notice SNX rate not stale is checked within debtBalanceOf
     */
    function transferableSynthetix(address account)
        public
        view
        rateNotStale("SNX") // SNX is not a synth so is not checked in totalIssuedSynths
        returns (uint)
    {
        // How many SNX do they have, excluding escrow?
        // Note: We're excluding escrow here because we're interested in their transferable amount
        // and escrowed SNX are not transferable.
        uint balance = tokenState.balanceOf(account);

        // How many of those will be locked by the amount they've issued?
        // Assuming issuance ratio is 20%, then issuing 20 SNX of value would require
        // 100 SNX to be locked in their wallet to maintain their collateralisation ratio
        // The locked synthetix value can exceed their balance.
        uint lockedSynthetixValue = debtBalanceOf(account, "SNX").divideDecimalRound(synthetixState.issuanceRatio());

        // If we exceed the balance, no SNX are transferable, otherwise the difference is.
        if (lockedSynthetixValue >= balance) {
            return 0;
        } else {
            return balance.sub(lockedSynthetixValue);
        }
    }

    /**
     * @notice Mints the inflationary SNX supply. The inflation shedule is
     * defined in the SupplySchedule contract.
     * The mint() function is publicly callable by anyone. The caller will
     receive a minter reward as specified in supplySchedule.minterReward().
     */
    function mint() external returns (bool) {
        require(rewardsDistribution != address(0), "RewardsDistribution not set");

        uint supplyToMint = supplySchedule.mintableSupply();
        require(supplyToMint > 0, "No supply is mintable");

        // record minting event before mutation to token supply
        supplySchedule.recordMintEvent(supplyToMint);

        // Set minted SNX balance to RewardEscrow's balance
        // Minus the minterReward and set balance of minter to add reward
        uint minterReward = supplySchedule.minterReward();
        // Get the remainder
        uint amountToDistribute = supplyToMint.sub(minterReward);

        // Set the token balance to the RewardsDistribution contract
        tokenState.setBalanceOf(rewardsDistribution, tokenState.balanceOf(rewardsDistribution).add(amountToDistribute));
        emitTransfer(this, rewardsDistribution, amountToDistribute);

        // Kick off the distribution of rewards
        rewardsDistribution.distributeRewards(amountToDistribute);

        // Assign the minters reward.
        tokenState.setBalanceOf(msg.sender, tokenState.balanceOf(msg.sender).add(minterReward));
        emitTransfer(this, msg.sender, minterReward);

        totalSupply = totalSupply.add(supplyToMint);

        return true;
    }

    // ========== MODIFIERS ==========

    modifier rateNotStale(bytes32 currencyKey) {
        require(!exchangeRates.rateIsStale(currencyKey), "Rate stale or not a synth");
        _;
    }

    modifier onlyOracle {
        require(msg.sender == exchangeRates.oracle(), "Only oracle allowed");
        _;
    }

    // ========== EVENTS ==========
    /* solium-disable */
    event SynthExchange(
        address indexed account,
        bytes32 fromCurrencyKey,
        uint256 fromAmount,
        bytes32 toCurrencyKey,
        uint256 toAmount,
        address toAddress
    );
    bytes32 constant SYNTHEXCHANGE_SIG = keccak256("SynthExchange(address,bytes32,uint256,bytes32,uint256,address)");

    function emitSynthExchange(
        address account,
        bytes32 fromCurrencyKey,
        uint256 fromAmount,
        bytes32 toCurrencyKey,
        uint256 toAmount,
        address toAddress
    ) internal {
        proxy._emit(
            abi.encode(fromCurrencyKey, fromAmount, toCurrencyKey, toAmount, toAddress),
            2,
            SYNTHEXCHANGE_SIG,
            bytes32(account),
            0,
            0
        );
    }
    /* solium-enable */
}
