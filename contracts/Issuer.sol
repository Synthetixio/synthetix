pragma solidity ^0.5.16;

// Inheritance
import "./Owned.sol";
import "./MixinResolver.sol";
import "./MixinSystemSettings.sol";
import "./interfaces/IIssuer.sol";

// Libraries
import "./SafeCast.sol";
import "./SafeDecimalMath.sol";

// Internal references
import "./interfaces/ISynth.sol";
import "./interfaces/ISynthetixDebtShare.sol";
import "./interfaces/IExchanger.sol";
import "./interfaces/IDelegateApprovals.sol";
import "./interfaces/IExchangeRates.sol";
import "./interfaces/ICircuitBreaker.sol";
import "./interfaces/IHasBalance.sol";
import "./interfaces/IERC20.sol";
import "./interfaces/ILiquidator.sol";
import "./interfaces/ILiquidatorRewards.sol";
import "./interfaces/ISynthRedeemer.sol";
import "./interfaces/ISystemStatus.sol";
import "./Proxyable.sol";

import "@chainlink/contracts-0.0.10/src/v0.5/interfaces/AggregatorV2V3Interface.sol";

interface IProxy {
    function target() external view returns (address);
}

interface IIssuerInternalDebtCache {
    function updateCachedSynthDebtWithRate(bytes32 currencyKey, uint currencyRate) external;

    function updateCachedSynthDebtsWithRates(bytes32[] calldata currencyKeys, uint[] calldata currencyRates) external;

    function updateDebtCacheValidity(bool currentlyInvalid) external;

    function totalNonSnxBackedDebt() external view returns (uint excludedDebt, bool isInvalid);

    function cacheInfo()
        external
        view
        returns (
            uint cachedDebt,
            uint timestamp,
            bool isInvalid,
            bool isStale
        );

    function updateCachedsUSDDebt(int amount) external;
}

// https://docs.synthetix.io/contracts/source/contracts/issuer
contract Issuer is Owned, MixinSystemSettings, IIssuer {
    using SafeMath for uint;
    using SafeDecimalMath for uint;

    bytes32 public constant CONTRACT_NAME = "Issuer";

    // Available Synths which can be used with the system
    ISynth[] public availableSynths;
    mapping(bytes32 => ISynth) public synths;
    mapping(address => bytes32) public synthsByAddress;

    /* ========== ENCODED NAMES ========== */

    bytes32 internal constant sUSD = "sUSD";
    bytes32 internal constant SNX = "SNX";

    // Flexible storage names

    bytes32 internal constant LAST_ISSUE_EVENT = "lastIssueEvent";

    /* ========== ADDRESS RESOLVER CONFIGURATION ========== */

    bytes32 private constant CONTRACT_SYNTHETIX = "Synthetix";
    bytes32 private constant CONTRACT_EXCHANGER = "Exchanger";
    bytes32 private constant CONTRACT_EXRATES = "ExchangeRates";
    bytes32 private constant CONTRACT_CIRCUIT_BREAKER = "CircuitBreaker";
    bytes32 private constant CONTRACT_SYNTHETIXDEBTSHARE = "SynthetixDebtShare";
    bytes32 private constant CONTRACT_FEEPOOL = "FeePool";
    bytes32 private constant CONTRACT_DELEGATEAPPROVALS = "DelegateApprovals";
    bytes32 private constant CONTRACT_REWARDESCROW_V2 = "RewardEscrowV2";
    bytes32 private constant CONTRACT_SYNTHETIXESCROW = "SynthetixEscrow";
    bytes32 private constant CONTRACT_LIQUIDATOR = "Liquidator";
    bytes32 private constant CONTRACT_LIQUIDATOR_REWARDS = "LiquidatorRewards";
    bytes32 private constant CONTRACT_DEBTCACHE = "DebtCache";
    bytes32 private constant CONTRACT_SYNTHREDEEMER = "SynthRedeemer";
    bytes32 private constant CONTRACT_SYNTHETIXBRIDGETOOPTIMISM = "SynthetixBridgeToOptimism";
    bytes32 private constant CONTRACT_SYNTHETIXBRIDGETOBASE = "SynthetixBridgeToBase";

    bytes32 private constant CONTRACT_EXT_AGGREGATOR_ISSUED_SYNTHS = "ext:AggregatorIssuedSynths";
    bytes32 private constant CONTRACT_EXT_AGGREGATOR_DEBT_RATIO = "ext:AggregatorDebtRatio";

    constructor(address _owner, address _resolver) public Owned(_owner) MixinSystemSettings(_resolver) {}

    /* ========== VIEWS ========== */
    function resolverAddressesRequired() public view returns (bytes32[] memory addresses) {
        bytes32[] memory existingAddresses = MixinSystemSettings.resolverAddressesRequired();
        bytes32[] memory newAddresses = new bytes32[](15);
        newAddresses[0] = CONTRACT_SYNTHETIX;
        newAddresses[1] = CONTRACT_EXCHANGER;
        newAddresses[2] = CONTRACT_EXRATES;
        newAddresses[3] = CONTRACT_CIRCUIT_BREAKER;
        newAddresses[4] = CONTRACT_SYNTHETIXDEBTSHARE;
        newAddresses[5] = CONTRACT_FEEPOOL;
        newAddresses[6] = CONTRACT_DELEGATEAPPROVALS;
        newAddresses[7] = CONTRACT_REWARDESCROW_V2;
        newAddresses[8] = CONTRACT_SYNTHETIXESCROW;
        newAddresses[9] = CONTRACT_LIQUIDATOR;
        newAddresses[10] = CONTRACT_LIQUIDATOR_REWARDS;
        newAddresses[11] = CONTRACT_DEBTCACHE;
        newAddresses[12] = CONTRACT_SYNTHREDEEMER;
        newAddresses[13] = CONTRACT_EXT_AGGREGATOR_ISSUED_SYNTHS;
        newAddresses[14] = CONTRACT_EXT_AGGREGATOR_DEBT_RATIO;
        return combineArrays(existingAddresses, newAddresses);
    }

    function synthetixERC20() internal view returns (IERC20) {
        return IERC20(requireAndGetAddress(CONTRACT_SYNTHETIX));
    }

    function exchanger() internal view returns (IExchanger) {
        return IExchanger(requireAndGetAddress(CONTRACT_EXCHANGER));
    }

    function exchangeRates() internal view returns (IExchangeRates) {
        return IExchangeRates(requireAndGetAddress(CONTRACT_EXRATES));
    }

    function circuitBreaker() internal view returns (ICircuitBreaker) {
        return ICircuitBreaker(requireAndGetAddress(CONTRACT_CIRCUIT_BREAKER));
    }

    function synthetixDebtShare() internal view returns (ISynthetixDebtShare) {
        return ISynthetixDebtShare(requireAndGetAddress(CONTRACT_SYNTHETIXDEBTSHARE));
    }

    function liquidator() internal view returns (ILiquidator) {
        return ILiquidator(requireAndGetAddress(CONTRACT_LIQUIDATOR));
    }

    function liquidatorRewards() internal view returns (ILiquidatorRewards) {
        return ILiquidatorRewards(requireAndGetAddress(CONTRACT_LIQUIDATOR_REWARDS));
    }

    function delegateApprovals() internal view returns (IDelegateApprovals) {
        return IDelegateApprovals(requireAndGetAddress(CONTRACT_DELEGATEAPPROVALS));
    }

    function rewardEscrowV2() internal view returns (IHasBalance) {
        return IHasBalance(requireAndGetAddress(CONTRACT_REWARDESCROW_V2));
    }

    function synthetixEscrow() internal view returns (IHasBalance) {
        return IHasBalance(requireAndGetAddress(CONTRACT_SYNTHETIXESCROW));
    }

    function debtCache() internal view returns (IIssuerInternalDebtCache) {
        return IIssuerInternalDebtCache(requireAndGetAddress(CONTRACT_DEBTCACHE));
    }

    function synthRedeemer() internal view returns (ISynthRedeemer) {
        return ISynthRedeemer(requireAndGetAddress(CONTRACT_SYNTHREDEEMER));
    }

    function allNetworksDebtInfo()
        public
        view
        returns (
            uint256 debt,
            uint256 sharesSupply,
            bool isStale
        )
    {
        (, int256 rawIssuedSynths, , uint issuedSynthsUpdatedAt, ) =
            AggregatorV2V3Interface(requireAndGetAddress(CONTRACT_EXT_AGGREGATOR_ISSUED_SYNTHS)).latestRoundData();

        (uint rawRatio, uint ratioUpdatedAt) = _rawDebtRatioAndUpdatedAt();

        debt = uint(rawIssuedSynths);
        sharesSupply = rawRatio == 0 ? 0 : debt.divideDecimalRoundPrecise(uint(rawRatio));

        uint stalePeriod = getRateStalePeriod();

        isStale =
            stalePeriod < block.timestamp &&
            (block.timestamp - stalePeriod > issuedSynthsUpdatedAt || block.timestamp - stalePeriod > ratioUpdatedAt);
    }

    function issuanceRatio() external view returns (uint) {
        return getIssuanceRatio();
    }

    function _rawDebtRatioAndUpdatedAt() internal view returns (uint, uint) {
        (, int256 rawRatioInt, , uint ratioUpdatedAt, ) =
            AggregatorV2V3Interface(requireAndGetAddress(CONTRACT_EXT_AGGREGATOR_DEBT_RATIO)).latestRoundData();
        return (uint(rawRatioInt), ratioUpdatedAt);
    }

    function _sharesForDebt(uint debtAmount) internal view returns (uint) {
        (uint rawRatio, ) = _rawDebtRatioAndUpdatedAt();
        return rawRatio == 0 ? 0 : debtAmount.divideDecimalRoundPrecise(rawRatio);
    }

    function _debtForShares(uint sharesAmount) internal view returns (uint) {
        (uint rawRatio, ) = _rawDebtRatioAndUpdatedAt();
        return sharesAmount.multiplyDecimalRoundPrecise(rawRatio);
    }

    function _availableCurrencyKeysWithOptionalSNX(bool withSNX) internal view returns (bytes32[] memory) {
        bytes32[] memory currencyKeys = new bytes32[](availableSynths.length + (withSNX ? 1 : 0));

        for (uint i = 0; i < availableSynths.length; i++) {
            currencyKeys[i] = synthsByAddress[address(availableSynths[i])];
        }

        if (withSNX) {
            currencyKeys[availableSynths.length] = SNX;
        }

        return currencyKeys;
    }

    // Returns the total value of the debt pool in currency specified by `currencyKey`.
    // To return only the SNX-backed debt, set `excludeCollateral` to true.
    function _totalIssuedSynths(bytes32 currencyKey, bool excludeCollateral)
        internal
        view
        returns (uint totalIssued, bool anyRateIsInvalid)
    {
        (uint debt, , bool cacheIsInvalid, bool cacheIsStale) = debtCache().cacheInfo();
        anyRateIsInvalid = cacheIsInvalid || cacheIsStale;

        IExchangeRates exRates = exchangeRates();

        // Add total issued synths from non snx collateral back into the total if not excluded
        if (!excludeCollateral) {
            (uint nonSnxDebt, bool invalid) = debtCache().totalNonSnxBackedDebt();
            debt = debt.add(nonSnxDebt);
            anyRateIsInvalid = anyRateIsInvalid || invalid;
        }

        if (currencyKey == sUSD) {
            return (debt, anyRateIsInvalid);
        }

        (uint currencyRate, bool currencyRateInvalid) = exRates.rateAndInvalid(currencyKey);
        return (debt.divideDecimalRound(currencyRate), anyRateIsInvalid || currencyRateInvalid);
    }

    function _debtBalanceOfAndTotalDebt(uint debtShareBalance, bytes32 currencyKey)
        internal
        view
        returns (
            uint debtBalance,
            uint totalSystemValue,
            bool anyRateIsInvalid
        )
    {
        // What's the total value of the system excluding ETH backed synths in their requested currency?
        (uint snxBackedAmount, , bool debtInfoStale) = allNetworksDebtInfo();

        if (debtShareBalance == 0) {
            return (0, snxBackedAmount, debtInfoStale);
        }

        // existing functionality requires for us to convert into the exchange rate specified by `currencyKey`
        (uint currencyRate, bool currencyRateInvalid) = exchangeRates().rateAndInvalid(currencyKey);

        debtBalance = _debtForShares(debtShareBalance).divideDecimalRound(currencyRate);
        totalSystemValue = snxBackedAmount;

        anyRateIsInvalid = currencyRateInvalid || debtInfoStale;
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
        (alreadyIssued, totalSystemDebt, anyRateIsInvalid) = _debtBalanceOfAndTotalDebt(
            synthetixDebtShare().balanceOf(_issuer),
            sUSD
        );
        (uint issuable, bool isInvalid) = _maxIssuableSynths(_issuer);
        maxIssuable = issuable;
        anyRateIsInvalid = anyRateIsInvalid || isInvalid;

        if (alreadyIssued >= maxIssuable) {
            maxIssuable = 0;
        } else {
            maxIssuable = maxIssuable.sub(alreadyIssued);
        }
    }

    function _snxToUSD(uint amount, uint snxRate) internal pure returns (uint) {
        return amount.multiplyDecimalRound(snxRate);
    }

    function _usdToSnx(uint amount, uint snxRate) internal pure returns (uint) {
        return amount.divideDecimalRound(snxRate);
    }

    function _maxIssuableSynths(address _issuer) internal view returns (uint, bool) {
        // What is the value of their SNX balance in sUSD
        (uint snxRate, bool isInvalid) = exchangeRates().rateAndInvalid(SNX);
        uint destinationValue = _snxToUSD(_collateral(_issuer), snxRate);

        // They're allowed to issue up to issuanceRatio of that value
        return (destinationValue.multiplyDecimal(getIssuanceRatio()), isInvalid);
    }

    function _collateralisationRatio(address _issuer) internal view returns (uint, bool) {
        uint totalOwnedSynthetix = _collateral(_issuer);

        (uint debtBalance, , bool anyRateIsInvalid) =
            _debtBalanceOfAndTotalDebt(synthetixDebtShare().balanceOf(_issuer), SNX);

        // it's more gas intensive to put this check here if they have 0 SNX, but it complies with the interface
        if (totalOwnedSynthetix == 0) return (0, anyRateIsInvalid);

        return (debtBalance.divideDecimalRound(totalOwnedSynthetix), anyRateIsInvalid);
    }

    function _collateral(address account) internal view returns (uint) {
        return
            synthetixERC20()
                .balanceOf(account)
                .add(synthetixEscrow().balanceOf(account))
                .add(rewardEscrowV2().balanceOf(account))
                .add(liquidatorRewards().earned(account));
    }

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
        (, anyRateInvalid) = exchangeRates().ratesAndInvalidForCurrencies(_availableCurrencyKeysWithOptionalSNX(true));
    }

    function totalIssuedSynths(bytes32 currencyKey, bool excludeOtherCollateral) external view returns (uint totalIssued) {
        (totalIssued, ) = _totalIssuedSynths(currencyKey, excludeOtherCollateral);
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
        ISynthetixDebtShare sds = synthetixDebtShare();

        // What was their initial debt ownership?
        uint debtShareBalance = sds.balanceOf(_issuer);

        // If it's zero, they haven't issued, and they have no debt.
        if (debtShareBalance == 0) return 0;

        (debtBalance, , ) = _debtBalanceOfAndTotalDebt(debtShareBalance, currencyKey);
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
        (uint maxIssuable, ) = _maxIssuableSynths(_issuer);
        return maxIssuable;
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
        (debtBalance, , anyRateIsInvalid) = _debtBalanceOfAndTotalDebt(synthetixDebtShare().balanceOf(account), SNX);
        uint lockedSynthetixValue = debtBalance.divideDecimalRound(getIssuanceRatio());

        // If we exceed the balance, no SNX are transferable, otherwise the difference is.
        if (lockedSynthetixValue >= balance) {
            transferable = 0;
        } else {
            transferable = balance.sub(lockedSynthetixValue);
        }
    }

    function getSynths(bytes32[] calldata currencyKeys) external view returns (ISynth[] memory) {
        uint numKeys = currencyKeys.length;
        ISynth[] memory addresses = new ISynth[](numKeys);

        for (uint i = 0; i < numKeys; i++) {
            addresses[i] = synths[currencyKeys[i]];
        }

        return addresses;
    }

    /// @notice Provide the results that would be returned by the mutative liquidateAccount() method (that's reserved to Synthetix)
    /// @param account The account to be liquidated
    /// @param isSelfLiquidation boolean to determine if this is a forced or self-invoked liquidation
    /// @return totalRedeemed the total amount of collateral (SNX) to redeem (liquid and escrow)
    /// @return debtToRemove the amount of debt (sUSD) to burn in order to fix the account's c-ratio
    /// @return escrowToLiquidate the amount of escrow SNX that will be revoked during liquidation
    /// @return initialDebtBalance the amount of initial (sUSD) debt the account has
    function liquidationAmounts(address account, bool isSelfLiquidation)
        external
        view
        returns (
            uint totalRedeemed,
            uint debtToRemove,
            uint escrowToLiquidate,
            uint initialDebtBalance
        )
    {
        return _liquidationAmounts(account, isSelfLiquidation);
    }

    /* ========== MUTATIVE FUNCTIONS ========== */

    function _addSynth(ISynth synth) internal {
        bytes32 currencyKey = synth.currencyKey();
        require(synths[currencyKey] == ISynth(0), "Synth exists");
        require(synthsByAddress[address(synth)] == bytes32(0), "Synth address already exists");

        availableSynths.push(synth);
        synths[currencyKey] = synth;
        synthsByAddress[address(synth)] = currencyKey;

        emit SynthAdded(currencyKey, address(synth));
    }

    function addSynth(ISynth synth) external onlyOwner {
        _addSynth(synth);
        // Invalidate the cache to force a snapshot to be recomputed. If a synth were to be added
        // back to the system and it still somehow had cached debt, this would force the value to be
        // updated.
        debtCache().updateDebtCacheValidity(true);
    }

    function addSynths(ISynth[] calldata synthsToAdd) external onlyOwner {
        uint numSynths = synthsToAdd.length;
        for (uint i = 0; i < numSynths; i++) {
            _addSynth(synthsToAdd[i]);
        }

        // Invalidate the cache to force a snapshot to be recomputed.
        debtCache().updateDebtCacheValidity(true);
    }

    function _removeSynth(bytes32 currencyKey) internal {
        address synthToRemove = address(synths[currencyKey]);
        require(synthToRemove != address(0), "Synth does not exist");
        require(currencyKey != sUSD, "Cannot remove synth");

        uint synthSupply = IERC20(synthToRemove).totalSupply();

        if (synthSupply > 0) {
            (uint amountOfsUSD, uint rateToRedeem, ) =
                exchangeRates().effectiveValueAndRates(currencyKey, synthSupply, "sUSD");
            require(rateToRedeem > 0, "Cannot remove without rate");
            ISynthRedeemer _synthRedeemer = synthRedeemer();
            synths[sUSD].issue(address(_synthRedeemer), amountOfsUSD);
            // ensure the debt cache is aware of the new sUSD issued
            debtCache().updateCachedsUSDDebt(SafeCast.toInt256(amountOfsUSD));
            _synthRedeemer.deprecate(IERC20(address(Proxyable(synthToRemove).proxy())), rateToRedeem);
        }

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
        delete synthsByAddress[synthToRemove];
        delete synths[currencyKey];

        emit SynthRemoved(currencyKey, synthToRemove);
    }

    function removeSynth(bytes32 currencyKey) external onlyOwner {
        // Remove its contribution from the debt pool snapshot, and
        // invalidate the cache to force a new snapshot.
        IIssuerInternalDebtCache cache = debtCache();
        cache.updateCachedSynthDebtWithRate(currencyKey, 0);
        cache.updateDebtCacheValidity(true);

        _removeSynth(currencyKey);
    }

    function removeSynths(bytes32[] calldata currencyKeys) external onlyOwner {
        uint numKeys = currencyKeys.length;

        // Remove their contributions from the debt pool snapshot, and
        // invalidate the cache to force a new snapshot.
        IIssuerInternalDebtCache cache = debtCache();
        uint[] memory zeroRates = new uint[](numKeys);
        cache.updateCachedSynthDebtsWithRates(currencyKeys, zeroRates);
        cache.updateDebtCacheValidity(true);

        for (uint i = 0; i < numKeys; i++) {
            _removeSynth(currencyKeys[i]);
        }
    }

    function issueSynthsWithoutDebt(
        bytes32 currencyKey,
        address to,
        uint amount
    ) external onlyTrustedMinters returns (bool rateInvalid) {
        require(address(synths[currencyKey]) != address(0), "Issuer: synth doesn't exist");
        require(amount > 0, "Issuer: cannot issue 0 synths");

        // record issue timestamp
        _setLastIssueEvent(to);

        // Create their synths
        synths[currencyKey].issue(to, amount);

        // Account for the issued debt in the cache
        (uint rate, bool rateInvalid) = exchangeRates().rateAndInvalid(currencyKey);
        debtCache().updateCachedsUSDDebt(SafeCast.toInt256(amount.multiplyDecimal(rate)));

        // returned so that the caller can decide what to do if the rate is invalid
        return rateInvalid;
    }

    function burnSynthsWithoutDebt(
        bytes32 currencyKey,
        address from,
        uint amount
    ) external onlyTrustedMinters returns (bool rateInvalid) {
        require(address(synths[currencyKey]) != address(0), "Issuer: synth doesn't exist");
        require(amount > 0, "Issuer: cannot issue 0 synths");

        exchanger().settle(from, currencyKey);

        // Burn some synths
        synths[currencyKey].burn(from, amount);

        // Account for the burnt debt in the cache. If rate is invalid, the user won't be able to exchange
        (uint rate, bool rateInvalid) = exchangeRates().rateAndInvalid(currencyKey);
        debtCache().updateCachedsUSDDebt(-SafeCast.toInt256(amount.multiplyDecimal(rate)));

        // returned so that the caller can decide what to do if the rate is invalid
        return rateInvalid;
    }

    /**
     * Function used to migrate balances from the CollateralShort contract
     * @param short The address of the CollateralShort contract to be upgraded
     * @param amount The amount of sUSD collateral to be burnt
     */
    function upgradeCollateralShort(address short, uint amount) external onlyOwner {
        require(short != address(0), "Issuer: invalid address");
        require(short == resolver.getAddress("CollateralShortLegacy"), "Issuer: wrong short address");
        require(address(synths[sUSD]) != address(0), "Issuer: synth doesn't exist");
        require(amount > 0, "Issuer: cannot burn 0 synths");

        exchanger().settle(short, sUSD);

        synths[sUSD].burn(short, amount);
    }

    function issueSynths(address from, uint amount) external onlySynthetix {
        require(amount > 0, "Issuer: cannot issue 0 synths");

        _issueSynths(from, amount, false);
    }

    function issueMaxSynths(address from) external onlySynthetix {
        _issueSynths(from, 0, true);
    }

    function issueSynthsOnBehalf(
        address issueForAddress,
        address from,
        uint amount
    ) external onlySynthetix {
        _requireCanIssueOnBehalf(issueForAddress, from);
        _issueSynths(issueForAddress, amount, false);
    }

    function issueMaxSynthsOnBehalf(address issueForAddress, address from) external onlySynthetix {
        _requireCanIssueOnBehalf(issueForAddress, from);
        _issueSynths(issueForAddress, 0, true);
    }

    function burnSynths(address from, uint amount) external onlySynthetix {
        _voluntaryBurnSynths(from, amount, false);
    }

    function burnSynthsOnBehalf(
        address burnForAddress,
        address from,
        uint amount
    ) external onlySynthetix {
        _requireCanBurnOnBehalf(burnForAddress, from);
        _voluntaryBurnSynths(burnForAddress, amount, false);
    }

    function burnSynthsToTarget(address from) external onlySynthetix {
        _voluntaryBurnSynths(from, 0, true);
    }

    function burnSynthsToTargetOnBehalf(address burnForAddress, address from) external onlySynthetix {
        _requireCanBurnOnBehalf(burnForAddress, from);
        _voluntaryBurnSynths(burnForAddress, 0, true);
    }

    function burnForRedemption(
        address deprecatedSynthProxy,
        address account,
        uint balance
    ) external onlySynthRedeemer {
        ISynth(IProxy(deprecatedSynthProxy).target()).burn(account, balance);
    }

    // SIP-148: Upgraded Liquidation Mechanism
    /// @notice This is where the core internal liquidation logic resides. This function can only be invoked by Synthetix.
    /// Reverts if liquidator().isLiquidationOpen() returns false (e.g. c-ratio is too high, delay hasn't passed,
    ///     account wasn't flagged etc)
    /// @param account The account to be liquidated
    /// @param isSelfLiquidation boolean to determine if this is a forced or self-invoked liquidation
    /// @return totalRedeemed the total amount of collateral (SNX) to redeem (liquid and escrow)
    /// @return debtRemoved the amount of debt (sUSD) to burn in order to fix the account's c-ratio
    /// @return escrowToLiquidate the amount of escrow SNX that will be revoked during liquidation
    function liquidateAccount(address account, bool isSelfLiquidation)
        external
        onlySynthetix
        returns (
            uint totalRedeemed,
            uint debtRemoved,
            uint escrowToLiquidate
        )
    {
        require(liquidator().isLiquidationOpen(account, isSelfLiquidation), "Not open for liquidation");

        // liquidationAmounts checks isLiquidationOpen for the account
        uint initialDebtBalance;
        (totalRedeemed, debtRemoved, escrowToLiquidate, initialDebtBalance) = _liquidationAmounts(
            account,
            isSelfLiquidation
        );

        // Reduce debt shares by amount to liquidate.
        _removeFromDebtRegister(account, debtRemoved, initialDebtBalance);

        // Remove liquidation flag
        liquidator().removeAccountInLiquidation(account);
    }

    function _liquidationAmounts(address account, bool isSelfLiquidation)
        internal
        view
        returns (
            uint totalRedeemed,
            uint debtToRemove,
            uint escrowToLiquidate,
            uint debtBalance
        )
    {
        // Get the account's debt balance
        bool anyRateIsInvalid;
        (debtBalance, , anyRateIsInvalid) = _debtBalanceOfAndTotalDebt(synthetixDebtShare().balanceOf(account), sUSD);

        // otherwise calculateAmountToFixCollateral reverts with unhelpful underflow error
        if (!liquidator().isLiquidationOpen(account, isSelfLiquidation)) {
            return (0, 0, 0, debtBalance);
        }

        // Get the penalty for the liquidation type
        uint penalty = isSelfLiquidation ? getSelfLiquidationPenalty() : getSnxLiquidationPenalty();

        // Get the SNX rate
        (uint snxRate, bool snxRateInvalid) = exchangeRates().rateAndInvalid(SNX);
        _requireRatesNotInvalid(anyRateIsInvalid || snxRateInvalid);

        // Get the total amount of SNX collateral (including escrows and rewards)
        uint collateralForAccount = _collateral(account);

        // Calculate the amount of debt to liquidate to fix c-ratio
        debtToRemove = liquidator().calculateAmountToFixCollateral(
            debtBalance,
            _snxToUSD(collateralForAccount, snxRate),
            penalty
        );

        // Get the equivalent amount of SNX for the amount to liquidate
        // Note: While calculateAmountToFixCollateral takes the penalty into account,
        // it only calculates the debt to be repaid (so that c-ratio is reached). The penalty still needs to be
        // applied on the collateral side (SNX) correctly. Which is why redeemTarget needs to be multiplied by 1 + penalty
        // to get the SNX amount calculateAmountToFixCollateral was using for its calculation.
        // This is a "target" because it may not be available, so will be adjusted
        uint redeemTarget = _usdToSnx(debtToRemove, snxRate).multiplyDecimal(SafeDecimalMath.unit().add(penalty));

        // calculate actually redeemable collateral for the conditions
        (totalRedeemed, escrowToLiquidate) = _redeemableCollateralForTarget(account, redeemTarget, isSelfLiquidation);

        // totalRedeemed == redeemTarget, all of the debtToRemove is removed, otherwise adjust it to redeemable collateral
        if (totalRedeemed < redeemTarget) {
            // Adjust debt amount to ratio of actual vs. target collateral amounts
            debtToRemove = debtToRemove.multiplyDecimal(totalRedeemed).divideDecimal(redeemTarget);

            // if all collateral is gone, erase the bad debt (some unliquidatable collateral can be in
            // legacy SynthetixEscrow or LiquidatorRewards (if Synthetix liquidation method didn't call getReward() before this)
            // Note that collateralForAccount cannot be < totalRedeemed, because totalRedeemed comes from an exact
            // calculation in _redeemableCollateralForTarget(). If the calculations change to create a possibility
            // for a rounding imprecision, this check may need to be changed to `<=`.
            if (collateralForAccount == totalRedeemed) {
                debtToRemove = debtBalance;
            }
        }

        return (totalRedeemed, debtToRemove, escrowToLiquidate, debtBalance);
    }

    // SIP-252
    // calculates the amount of SNX that can be liquidated (redeemed) for the various cases
    // of transferrable & escrowed collateral & self or forced liquidation
    function _redeemableCollateralForTarget(
        address account,
        uint redeemTarget,
        bool isSelfLiquidation
    ) internal view returns (uint totalRedeemed, uint escrowToLiquidate) {
        // The balanceOf here can be considered "transferable" since it's not escrowed,
        // and it is the only SNX that can potentially be transfered if unstaked.
        uint transferable = synthetixERC20().balanceOf(account);
        if (redeemTarget <= transferable) {
            // transferrable is enough
            return (redeemTarget, 0);
        } else {
            // if transferrable is not enough
            if (isSelfLiquidation) {
                // cannot use escrow because it's not available for self-liquidation
                return (transferable, 0);
            } else {
                // can use escrow if forced liquidation
                uint escrow = rewardEscrowV2().balanceOf(account);
                if (redeemTarget > transferable.add(escrow)) {
                    // all of escrow needs to be redeemed
                    return (transferable.add(escrow), escrow);
                } else {
                    // need only part of the escrow, add the needed part to redeemed
                    escrowToLiquidate = redeemTarget.sub(transferable);
                    return (transferable.add(escrowToLiquidate), escrowToLiquidate);
                }
            }
        }
    }

    function setCurrentPeriodId(uint128 periodId) external {
        require(msg.sender == requireAndGetAddress(CONTRACT_FEEPOOL), "Must be fee pool");

        ISynthetixDebtShare sds = synthetixDebtShare();

        if (sds.currentPeriodId() < periodId) {
            sds.takeSnapshot(periodId);
        }
    }

    /* ========== INTERNAL FUNCTIONS ========== */

    function _requireRatesNotInvalid(bool anyRateIsInvalid) internal pure {
        require(!anyRateIsInvalid, "A synth or SNX rate is invalid");
    }

    function _requireCanIssueOnBehalf(address issueForAddress, address from) internal view {
        require(delegateApprovals().canIssueFor(issueForAddress, from), "Not approved to act on behalf");
    }

    function _requireCanBurnOnBehalf(address burnForAddress, address from) internal view {
        require(delegateApprovals().canBurnFor(burnForAddress, from), "Not approved to act on behalf");
    }

    function _issueSynths(
        address from,
        uint amount,
        bool issueMax
    ) internal {
        if (_verifyCircuitBreakers()) {
            return;
        }

        (uint maxIssuable, , , bool anyRateIsInvalid) = _remainingIssuableSynths(from);
        _requireRatesNotInvalid(anyRateIsInvalid);

        if (!issueMax) {
            require(amount <= maxIssuable, "Amount too large");
        } else {
            amount = maxIssuable;
        }

        // Keep track of the debt they're about to create
        _addToDebtRegister(from, amount);

        // record issue timestamp
        _setLastIssueEvent(from);

        // Create their synths
        synths[sUSD].issue(from, amount);

        // Account for the issued debt in the cache
        debtCache().updateCachedsUSDDebt(SafeCast.toInt256(amount));
    }

    function _burnSynths(
        address debtAccount,
        address burnAccount,
        uint amount,
        uint existingDebt
    ) internal returns (uint amountBurnt) {
        if (_verifyCircuitBreakers()) {
            return 0;
        }

        // liquidation requires sUSD to be already settled / not in waiting period

        // If they're trying to burn more debt than they actually owe, rather than fail the transaction, let's just
        // clear their debt and leave them be.
        amountBurnt = existingDebt < amount ? existingDebt : amount;

        // Remove liquidated debt from the ledger
        _removeFromDebtRegister(debtAccount, amountBurnt, existingDebt);

        // synth.burn does a safe subtraction on balance (so it will revert if there are not enough synths).
        synths[sUSD].burn(burnAccount, amountBurnt);

        // Account for the burnt debt in the cache.
        debtCache().updateCachedsUSDDebt(-SafeCast.toInt256(amountBurnt));
    }

    // If burning to target, `amount` is ignored, and the correct quantity of sUSD is burnt to reach the target
    // c-ratio, allowing fees to be claimed. In this case, pending settlements will be skipped as the user
    // will still have debt remaining after reaching their target.
    function _voluntaryBurnSynths(
        address from,
        uint amount,
        bool burnToTarget
    ) internal {
        if (_verifyCircuitBreakers()) {
            return;
        }

        if (!burnToTarget) {
            // If not burning to target, then burning requires that the minimum stake time has elapsed.
            require(_canBurnSynths(from), "Minimum stake time not reached");
            // First settle anything pending into sUSD as burning or issuing impacts the size of the debt pool
            (, uint refunded, uint numEntriesSettled) = exchanger().settle(from, sUSD);
            if (numEntriesSettled > 0) {
                amount = exchanger().calculateAmountAfterSettlement(from, sUSD, amount, refunded);
            }
        }

        (uint existingDebt, , bool anyRateIsInvalid) =
            _debtBalanceOfAndTotalDebt(synthetixDebtShare().balanceOf(from), sUSD);
        (uint maxIssuableSynthsForAccount, bool snxRateInvalid) = _maxIssuableSynths(from);
        _requireRatesNotInvalid(anyRateIsInvalid || snxRateInvalid);
        require(existingDebt > 0, "No debt to forgive");

        if (burnToTarget) {
            amount = existingDebt.sub(maxIssuableSynthsForAccount);
        }

        uint amountBurnt = _burnSynths(from, from, amount, existingDebt);

        // Check and remove liquidation if existingDebt after burning is <= maxIssuableSynths
        // Issuance ratio is fixed so should remove any liquidations
        if (existingDebt.sub(amountBurnt) <= maxIssuableSynthsForAccount) {
            liquidator().removeAccountInLiquidation(from);
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

    function _addToDebtRegister(address from, uint amount) internal {
        // important: this has to happen before any updates to user's debt shares
        liquidatorRewards().updateEntry(from);

        ISynthetixDebtShare sds = synthetixDebtShare();

        // it is possible (eg in tests, system initialized with extra debt) to have issued debt without any shares issued
        // in which case, the first account to mint gets the debt. yw.
        uint debtShares = _sharesForDebt(amount);
        if (debtShares == 0) {
            sds.mintShare(from, amount);
        } else {
            sds.mintShare(from, debtShares);
        }
    }

    function _removeFromDebtRegister(
        address from,
        uint debtToRemove,
        uint existingDebt
    ) internal {
        // important: this has to happen before any updates to user's debt shares
        liquidatorRewards().updateEntry(from);

        ISynthetixDebtShare sds = synthetixDebtShare();

        uint currentDebtShare = sds.balanceOf(from);

        if (debtToRemove == existingDebt) {
            sds.burnShare(from, currentDebtShare);
        } else {
            uint sharesToRemove = _sharesForDebt(debtToRemove);
            sds.burnShare(from, sharesToRemove < currentDebtShare ? sharesToRemove : currentDebtShare);
        }
    }

    // trips the breaker and returns boolean, where true means the breaker has tripped state
    function _verifyCircuitBreakers() internal returns (bool) {
        address debtRatioAggregator = requireAndGetAddress(CONTRACT_EXT_AGGREGATOR_DEBT_RATIO);
        (, int256 rawRatio, , , ) = AggregatorV2V3Interface(debtRatioAggregator).latestRoundData();
        (, bool broken, ) = exchangeRates().rateWithSafetyChecks(SNX);

        return circuitBreaker().probeCircuitBreaker(debtRatioAggregator, uint(rawRatio)) || broken;
    }

    /* ========== MODIFIERS ========== */
    modifier onlySynthetix() {
        require(msg.sender == address(synthetixERC20()), "Issuer: Only Synthetix");
        _;
    }

    modifier onlyTrustedMinters() {
        address bridgeL1 = resolver.getAddress(CONTRACT_SYNTHETIXBRIDGETOOPTIMISM);
        address bridgeL2 = resolver.getAddress(CONTRACT_SYNTHETIXBRIDGETOBASE);
        require(msg.sender == bridgeL1 || msg.sender == bridgeL2, "Issuer: only trusted minters");
        require(bridgeL1 == address(0) || bridgeL2 == address(0), "Issuer: one minter must be 0x0");
        _;
    }

    function _onlySynthRedeemer() internal view {
        require(msg.sender == address(synthRedeemer()), "Issuer: Only SynthRedeemer");
    }

    modifier onlySynthRedeemer() {
        _onlySynthRedeemer();
        _;
    }

    /* ========== EVENTS ========== */

    event SynthAdded(bytes32 currencyKey, address synth);
    event SynthRemoved(bytes32 currencyKey, address synth);
}
