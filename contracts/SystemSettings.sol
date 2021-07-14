pragma solidity ^0.5.16;

// Inheritance
import "./Owned.sol";
import "./MixinResolver.sol";
import "./MixinSystemSettings.sol";
import "./interfaces/ISystemSettings.sol";
import "./interfaces/IFuturesMarketManager.sol";

// Libraries
import "./SafeDecimalMath.sol";

// https://docs.synthetix.io/contracts/source/contracts/systemsettings
contract SystemSettings is Owned, MixinSystemSettings, ISystemSettings {
    using SafeMath for uint;
    using SafeDecimalMath for uint;

    // No more synths may be issued than the value of SNX backing them.
    uint public constant MAX_ISSUANCE_RATIO = 1e18;

    // The fee period must be between 1 day and 60 days.
    uint public constant MIN_FEE_PERIOD_DURATION = 1 days;
    uint public constant MAX_FEE_PERIOD_DURATION = 60 days;

    uint public constant MAX_TARGET_THRESHOLD = 50;

    uint public constant MAX_LIQUIDATION_RATIO = 1e18; // 100% issuance ratio

    uint public constant MAX_LIQUIDATION_PENALTY = 1e18 / 4; // Max 25% liquidation penalty / bonus

    uint public constant RATIO_FROM_TARGET_BUFFER = 2e18; // 200% - mininimum buffer between issuance ratio and liquidation ratio

    uint public constant MAX_LIQUIDATION_DELAY = 30 days;
    uint public constant MIN_LIQUIDATION_DELAY = 1 days;

    // Exchange fee may not exceed 10%.
    uint public constant MAX_EXCHANGE_FEE_RATE = 1e18 / 10;

    // Minimum Stake time may not exceed 1 weeks.
    uint public constant MAX_MINIMUM_STAKE_TIME = 1 weeks;

    uint public constant MAX_CROSS_DOMAIN_GAS_LIMIT = 8e6;
    uint public constant MIN_CROSS_DOMAIN_GAS_LIMIT = 3e6;

    // TODO(liamz): these are simple bounds for the mint/burn fee rates (max 100%).
    // Can we come up with better values?
    uint public constant MAX_ETHER_WRAPPER_MINT_FEE_RATE = 1e18;
    uint public constant MAX_ETHER_WRAPPER_BURN_FEE_RATE = 1e18;

    /* ---------- Address Resolver Configuration ---------- */
    bytes32 internal constant CONTRACT_FUTURESMARKETMANAGER = "FuturesMarketManager";

    constructor(address _owner, address _resolver) public Owned(_owner) MixinSystemSettings(_resolver) {}

    function resolverAddressesRequired() public view returns (bytes32[] memory addresses) {
        bytes32[] memory existingAddresses = MixinSystemSettings.resolverAddressesRequired();
        bytes32[] memory newAddresses = new bytes32[](1);
        newAddresses[0] = CONTRACT_FUTURESMARKETMANAGER;
        addresses = combineArrays(existingAddresses, newAddresses);
    }

    function futuresMarketManager() internal view returns (IFuturesMarketManager) {
        return IFuturesMarketManager(requireAndGetAddress(CONTRACT_FUTURESMARKETMANAGER));
    }

    // ========== VIEWS ==========

    // SIP-37 Fee Reclamation
    // The number of seconds after an exchange is executed that must be waited
    // before settlement.
    function waitingPeriodSecs() external view returns (uint) {
        return getWaitingPeriodSecs();
    }

    // SIP-65 Decentralized Circuit Breaker
    // The factor amount expressed in decimal format
    // E.g. 3e18 = factor 3, meaning movement up to 3x and above or down to 1/3x and below
    function priceDeviationThresholdFactor() external view returns (uint) {
        return getPriceDeviationThresholdFactor();
    }

    // The raio of collateral
    // Expressed in 18 decimals. So 800% cratio is 100/800 = 0.125 (0.125e18)
    function issuanceRatio() external view returns (uint) {
        return getIssuanceRatio();
    }

    // How long a fee period lasts at a minimum. It is required for
    // anyone to roll over the periods, so they are not guaranteed
    // to roll over at exactly this duration, but the contract enforces
    // that they cannot roll over any quicker than this duration.
    function feePeriodDuration() external view returns (uint) {
        return getFeePeriodDuration();
    }

    // Users are unable to claim fees if their collateralisation ratio drifts out of target threshold
    function targetThreshold() external view returns (uint) {
        return getTargetThreshold();
    }

    // SIP-15 Liquidations
    // liquidation time delay after address flagged (seconds)
    function liquidationDelay() external view returns (uint) {
        return getLiquidationDelay();
    }

    // SIP-15 Liquidations
    // issuance ratio when account can be flagged for liquidation (with 18 decimals), e.g 0.5 issuance ratio
    // when flag means 1/0.5 = 200% cratio
    function liquidationRatio() external view returns (uint) {
        return getLiquidationRatio();
    }

    // SIP-15 Liquidations
    // penalty taken away from target of liquidation (with 18 decimals). E.g. 10% is 0.1e18
    function liquidationPenalty() external view returns (uint) {
        return getLiquidationPenalty();
    }

    // How long will the ExchangeRates contract assume the rate of any asset is correct
    function rateStalePeriod() external view returns (uint) {
        return getRateStalePeriod();
    }

    function exchangeFeeRate(bytes32 currencyKey) external view returns (uint) {
        return getExchangeFeeRate(currencyKey);
    }

    function minimumStakeTime() external view returns (uint) {
        return getMinimumStakeTime();
    }

    function debtSnapshotStaleTime() external view returns (uint) {
        return getDebtSnapshotStaleTime();
    }

    function futuresLiquidationFee() external view returns (uint) {
        return getFuturesLiquidationFee();
    }

    function futuresMinInitialMargin() external view returns (uint) {
        return getFuturesMinInitialMargin();
    }

    function aggregatorWarningFlags() external view returns (address) {
        return getAggregatorWarningFlags();
    }

    // SIP-63 Trading incentives
    // determines if Exchanger records fee entries in TradingRewards
    function tradingRewardsEnabled() external view returns (bool) {
        return getTradingRewardsEnabled();
    }

    function crossDomainMessageGasLimit(CrossDomainMessageGasLimits gasLimitType) external view returns (uint) {
        return getCrossDomainMessageGasLimit(gasLimitType);
    }

    // SIP 112: ETH Wrappr
    // The maximum amount of ETH held by the EtherWrapper.
    function etherWrapperMaxETH() external view returns (uint) {
        return getEtherWrapperMaxETH();
    }

    // SIP 112: ETH Wrappr
    // The fee for depositing ETH into the EtherWrapper.
    function etherWrapperMintFeeRate() external view returns (uint) {
        return getEtherWrapperMintFeeRate();
    }

    // SIP 112: ETH Wrappr
    // The fee for burning sETH and releasing ETH from the EtherWrapper.
    function etherWrapperBurnFeeRate() external view returns (uint) {
        return getEtherWrapperBurnFeeRate();
    }

    function futuresTakerFee(bytes32 _baseAsset) external view returns (uint) {
        return getFuturesTakerFee(_baseAsset);
    }

    function futuresMakerFee(bytes32 _baseAsset) external view returns (uint) {
        return getFuturesMakerFee(_baseAsset);
    }

    function futuresMaxLeverage(bytes32 _baseAsset) external view returns (uint) {
        return getFuturesMaxLeverage(_baseAsset);
    }

    function futuresMaxMarketValue(bytes32 _baseAsset) external view returns (uint) {
        return getFuturesMaxMarketValue(_baseAsset);
    }

    function futuresMaxFundingRate(bytes32 _baseAsset) external view returns (uint) {
        return getFuturesMaxFundingRate(_baseAsset);
    }

    function futuresMaxFundingRateSkew(bytes32 _baseAsset) external view returns (uint) {
        return getFuturesMaxFundingRateSkew(_baseAsset);
    }

    function futuresMaxFundingRateDelta(bytes32 _baseAsset) external view returns (uint) {
        return getFuturesMaxFundingRateDelta(_baseAsset);
    }

    // ========== RESTRICTED ==========

    function setCrossDomainMessageGasLimit(CrossDomainMessageGasLimits _gasLimitType, uint _crossDomainMessageGasLimit)
        external
        onlyOwner
    {
        require(
            _crossDomainMessageGasLimit >= MIN_CROSS_DOMAIN_GAS_LIMIT &&
                _crossDomainMessageGasLimit <= MAX_CROSS_DOMAIN_GAS_LIMIT,
            "Out of range xDomain gasLimit"
        );
        flexibleStorage().setUIntValue(
            SETTING_CONTRACT_NAME,
            _getGasLimitSetting(_gasLimitType),
            _crossDomainMessageGasLimit
        );
        emit CrossDomainMessageGasLimitChanged(_gasLimitType, _crossDomainMessageGasLimit);
    }

    function setTradingRewardsEnabled(bool _tradingRewardsEnabled) external onlyOwner {
        flexibleStorage().setBoolValue(SETTING_CONTRACT_NAME, SETTING_TRADING_REWARDS_ENABLED, _tradingRewardsEnabled);
        emit TradingRewardsEnabled(_tradingRewardsEnabled);
    }

    function setWaitingPeriodSecs(uint _waitingPeriodSecs) external onlyOwner {
        flexibleStorage().setUIntValue(SETTING_CONTRACT_NAME, SETTING_WAITING_PERIOD_SECS, _waitingPeriodSecs);
        emit WaitingPeriodSecsUpdated(_waitingPeriodSecs);
    }

    function setPriceDeviationThresholdFactor(uint _priceDeviationThresholdFactor) external onlyOwner {
        flexibleStorage().setUIntValue(
            SETTING_CONTRACT_NAME,
            SETTING_PRICE_DEVIATION_THRESHOLD_FACTOR,
            _priceDeviationThresholdFactor
        );
        emit PriceDeviationThresholdUpdated(_priceDeviationThresholdFactor);
    }

    function setIssuanceRatio(uint _issuanceRatio) external onlyOwner {
        require(_issuanceRatio <= MAX_ISSUANCE_RATIO, "New issuance ratio cannot exceed MAX_ISSUANCE_RATIO");
        flexibleStorage().setUIntValue(SETTING_CONTRACT_NAME, SETTING_ISSUANCE_RATIO, _issuanceRatio);
        emit IssuanceRatioUpdated(_issuanceRatio);
    }

    function setFeePeriodDuration(uint _feePeriodDuration) external onlyOwner {
        require(_feePeriodDuration >= MIN_FEE_PERIOD_DURATION, "value < MIN_FEE_PERIOD_DURATION");
        require(_feePeriodDuration <= MAX_FEE_PERIOD_DURATION, "value > MAX_FEE_PERIOD_DURATION");

        flexibleStorage().setUIntValue(SETTING_CONTRACT_NAME, SETTING_FEE_PERIOD_DURATION, _feePeriodDuration);

        emit FeePeriodDurationUpdated(_feePeriodDuration);
    }

    function setTargetThreshold(uint _percent) external onlyOwner {
        require(_percent <= MAX_TARGET_THRESHOLD, "Threshold too high");

        uint _targetThreshold = _percent.mul(SafeDecimalMath.unit()).div(100);

        flexibleStorage().setUIntValue(SETTING_CONTRACT_NAME, SETTING_TARGET_THRESHOLD, _targetThreshold);

        emit TargetThresholdUpdated(_targetThreshold);
    }

    function setLiquidationDelay(uint time) external onlyOwner {
        require(time <= MAX_LIQUIDATION_DELAY, "Must be less than 30 days");
        require(time >= MIN_LIQUIDATION_DELAY, "Must be greater than 1 day");

        flexibleStorage().setUIntValue(SETTING_CONTRACT_NAME, SETTING_LIQUIDATION_DELAY, time);

        emit LiquidationDelayUpdated(time);
    }

    // The collateral / issuance ratio ( debt / collateral ) is higher when there is less collateral backing their debt
    // Upper bound liquidationRatio is 1 + penalty (100% + 10% = 110%) to allow collateral value to cover debt and liquidation penalty
    function setLiquidationRatio(uint _liquidationRatio) external onlyOwner {
        require(
            _liquidationRatio <= MAX_LIQUIDATION_RATIO.divideDecimal(SafeDecimalMath.unit().add(getLiquidationPenalty())),
            "liquidationRatio > MAX_LIQUIDATION_RATIO / (1 + penalty)"
        );

        // MIN_LIQUIDATION_RATIO is a product of target issuance ratio * RATIO_FROM_TARGET_BUFFER
        // Ensures that liquidation ratio is set so that there is a buffer between the issuance ratio and liquidation ratio.
        uint MIN_LIQUIDATION_RATIO = getIssuanceRatio().multiplyDecimal(RATIO_FROM_TARGET_BUFFER);
        require(_liquidationRatio >= MIN_LIQUIDATION_RATIO, "liquidationRatio < MIN_LIQUIDATION_RATIO");

        flexibleStorage().setUIntValue(SETTING_CONTRACT_NAME, SETTING_LIQUIDATION_RATIO, _liquidationRatio);

        emit LiquidationRatioUpdated(_liquidationRatio);
    }

    function setLiquidationPenalty(uint penalty) external onlyOwner {
        require(penalty <= MAX_LIQUIDATION_PENALTY, "penalty > MAX_LIQUIDATION_PENALTY");

        flexibleStorage().setUIntValue(SETTING_CONTRACT_NAME, SETTING_LIQUIDATION_PENALTY, penalty);

        emit LiquidationPenaltyUpdated(penalty);
    }

    function setRateStalePeriod(uint period) external onlyOwner {
        flexibleStorage().setUIntValue(SETTING_CONTRACT_NAME, SETTING_RATE_STALE_PERIOD, period);

        emit RateStalePeriodUpdated(period);
    }

    function setExchangeFeeRateForSynths(bytes32[] calldata synthKeys, uint256[] calldata exchangeFeeRates)
        external
        onlyOwner
    {
        require(synthKeys.length == exchangeFeeRates.length, "Array lengths dont match");
        for (uint i = 0; i < synthKeys.length; i++) {
            require(exchangeFeeRates[i] <= MAX_EXCHANGE_FEE_RATE, "MAX_EXCHANGE_FEE_RATE exceeded");
            flexibleStorage().setUIntValue(
                SETTING_CONTRACT_NAME,
                keccak256(abi.encodePacked(SETTING_EXCHANGE_FEE_RATE, synthKeys[i])),
                exchangeFeeRates[i]
            );
            emit ExchangeFeeUpdated(synthKeys[i], exchangeFeeRates[i]);
        }
    }

    function setMinimumStakeTime(uint _seconds) external onlyOwner {
        require(_seconds <= MAX_MINIMUM_STAKE_TIME, "stake time exceed maximum 1 week");
        flexibleStorage().setUIntValue(SETTING_CONTRACT_NAME, SETTING_MINIMUM_STAKE_TIME, _seconds);
        emit MinimumStakeTimeUpdated(_seconds);
    }

    function setDebtSnapshotStaleTime(uint _seconds) external onlyOwner {
        flexibleStorage().setUIntValue(SETTING_CONTRACT_NAME, SETTING_DEBT_SNAPSHOT_STALE_TIME, _seconds);
        emit DebtSnapshotStaleTimeUpdated(_seconds);
    }

    function setFuturesLiquidationFee(uint _sUSD) external onlyOwner {
        require(_sUSD <= getFuturesMinInitialMargin(), "fee is greater than min margin");
        flexibleStorage().setUIntValue(SETTING_CONTRACT_NAME, SETTING_FUTURES_LIQUIDATION_FEE, _sUSD);
        emit FuturesLiquidationFeeUpdated(_sUSD);
    }

    function setFuturesMinInitialMargin(uint _minMargin) external onlyOwner {
        require(getFuturesLiquidationFee() <= _minMargin, "fee is greater than min margin");
        flexibleStorage().setUIntValue(SETTING_CONTRACT_NAME, SETTING_FUTURES_MIN_INITIAL_MARGIN, _minMargin);
        emit FuturesMinInitialMarginUpdated(_minMargin);
    }

    function setAggregatorWarningFlags(address _flags) external onlyOwner {
        require(_flags != address(0), "Valid address must be given");
        flexibleStorage().setAddressValue(SETTING_CONTRACT_NAME, SETTING_AGGREGATOR_WARNING_FLAGS, _flags);
        emit AggregatorWarningFlagsUpdated(_flags);
    }

    function setEtherWrapperMaxETH(uint _maxETH) external onlyOwner {
        flexibleStorage().setUIntValue(SETTING_CONTRACT_NAME, SETTING_ETHER_WRAPPER_MAX_ETH, _maxETH);
        emit EtherWrapperMaxETHUpdated(_maxETH);
    }

    function setEtherWrapperMintFeeRate(uint _rate) external onlyOwner {
        require(_rate <= MAX_ETHER_WRAPPER_MINT_FEE_RATE, "rate > MAX_ETHER_WRAPPER_MINT_FEE_RATE");
        flexibleStorage().setUIntValue(SETTING_CONTRACT_NAME, SETTING_ETHER_WRAPPER_MINT_FEE_RATE, _rate);
        emit EtherWrapperMintFeeRateUpdated(_rate);
    }

    function setEtherWrapperBurnFeeRate(uint _rate) external onlyOwner {
        require(_rate <= MAX_ETHER_WRAPPER_BURN_FEE_RATE, "rate > MAX_ETHER_WRAPPER_BURN_FEE_RATE");
        flexibleStorage().setUIntValue(SETTING_CONTRACT_NAME, SETTING_ETHER_WRAPPER_BURN_FEE_RATE, _rate);
        emit EtherWrapperBurnFeeRateUpdated(_rate);
    }

    function setFuturesTakerFee(bytes32 _baseAsset, uint _takerFee) external onlyOwner {
        require(_takerFee <= 1 ether, "taker fee greater than 1");
        flexibleStorage().setUIntValue(
            SETTING_CONTRACT_NAME,
            keccak256(abi.encodePacked(SETTINGS_FUTURES_KEY, _baseAsset, SETTINGS_FUTURES_TAKER_FEE)),
            _takerFee
        );
        emit FuturesTakerFeeUpdated(_baseAsset, _takerFee);
    }

    function setFuturesMakerFee(bytes32 _baseAsset, uint _makerFee) external onlyOwner {
        require(_makerFee <= 1 ether, "maker fee greater than 1");
        flexibleStorage().setUIntValue(
            SETTING_CONTRACT_NAME,
            keccak256(abi.encodePacked(SETTINGS_FUTURES_KEY, _baseAsset, SETTINGS_FUTURES_MAKER_FEE)),
            _makerFee
        );
        emit FuturesMakerFeeUpdated(_baseAsset, _makerFee);
    }

    function setFuturesMaxLeverage(bytes32 _baseAsset, uint _maxLeverage) external onlyOwner {
        flexibleStorage().setUIntValue(
            SETTING_CONTRACT_NAME,
            keccak256(abi.encodePacked(SETTINGS_FUTURES_KEY, _baseAsset, SETTINGS_FUTURES_MAX_LEVERAGE)),
            _maxLeverage
        );
        emit FuturesMaxLeverageUpdated(_baseAsset, _maxLeverage);
    }

    function setFuturesMaxMarketValue(bytes32 _baseAsset, uint _maxMarketValue) external onlyOwner {
        flexibleStorage().setUIntValue(
            SETTING_CONTRACT_NAME,
            keccak256(abi.encodePacked(SETTINGS_FUTURES_KEY, _baseAsset, SETTINGS_FUTURES_MAX_MARKET_VALUE)),
            _maxMarketValue
        );
        emit FuturesMaxMarketValueUpdated(_baseAsset, _maxMarketValue);
    }

    function setFuturesMaxFundingRate(bytes32 _baseAsset, uint _maxFundingRate) external onlyOwner {
        IFuturesMarket(futuresMarketManager()().marketForAssetFutures(_baseAsset)).recomputeFunding();
        flexibleStorage().setUIntValue(
            SETTING_CONTRACT_NAME,
            keccak256(abi.encodePacked(SETTINGS_FUTURES_KEY, _baseAsset, SETTINGS_FUTURES_MAX_FUNDING_RATE)),
            _maxFundingRate
        );
        emit FuturesMaxFundingRateUpdated(_baseAsset, _maxFundingRate);
    }

    function setFuturesMaxFundingRateSkew(bytes32 _baseAsset, uint _maxFundingRateSkew) external onlyOwner {
        IFuturesMarket(futuresMarketManager()().marketForAssetFutures(_baseAsset)).recomputeFunding();
        flexibleStorage().setUIntValue(
            SETTING_CONTRACT_NAME,
            keccak256(abi.encodePacked(SETTINGS_FUTURES_KEY, _baseAsset, SETTINGS_FUTURES_MAX_FUNDING_RATE_SKEW)),
            _maxFundingRateSkew
        );
        emit FuturesMaxFundingRateSkewUpdated(_baseAsset, _maxFundingRateSkew);
    }

    function setFuturesMaxFundingRateDelta(bytes32 _baseAsset, uint _maxFundingRateDelta) external onlyOwner {
        IFuturesMarket(futuresMarketManager()().marketForAssetFutures(_baseAsset)).recomputeFunding();
        flexibleStorage().setUIntValue(
            SETTING_CONTRACT_NAME,
            keccak256(abi.encodePacked(SETTINGS_FUTURES_KEY, _baseAsset, SETTINGS_FUTURES_MAX_FUNDING_RATE_DELTA)),
            _maxFundingRateDelta
        );
        emit FuturesMaxFundingRateDeltaUpdated(_baseAsset, _maxFundingRateDelta);
    }

    // ========== EVENTS ==========
    event CrossDomainMessageGasLimitChanged(CrossDomainMessageGasLimits gasLimitType, uint newLimit);
    event TradingRewardsEnabled(bool enabled);
    event WaitingPeriodSecsUpdated(uint waitingPeriodSecs);
    event PriceDeviationThresholdUpdated(uint threshold);
    event IssuanceRatioUpdated(uint newRatio);
    event FeePeriodDurationUpdated(uint newFeePeriodDuration);
    event TargetThresholdUpdated(uint newTargetThreshold);
    event LiquidationDelayUpdated(uint newDelay);
    event LiquidationRatioUpdated(uint newRatio);
    event LiquidationPenaltyUpdated(uint newPenalty);
    event RateStalePeriodUpdated(uint rateStalePeriod);
    event ExchangeFeeUpdated(bytes32 synthKey, uint newExchangeFeeRate);
    event MinimumStakeTimeUpdated(uint minimumStakeTime);
    event DebtSnapshotStaleTimeUpdated(uint debtSnapshotStaleTime);
    event FuturesLiquidationFeeUpdated(uint sUSD);
    event FuturesMinInitialMarginUpdated(uint minMargin);
    event AggregatorWarningFlagsUpdated(address flags);
    event EtherWrapperMaxETHUpdated(uint maxETH);
    event EtherWrapperMintFeeRateUpdated(uint rate);
    event EtherWrapperBurnFeeRateUpdated(uint rate);
    event FuturesTakerFeeUpdated(bytes32 baseAsset, uint takerFee);
    event FuturesMakerFeeUpdated(bytes32 baseAsset, uint makerFee);
    event FuturesMaxLeverageUpdated(bytes32 baseAsset, uint maxLeverage);
    event FuturesMaxMarketValueUpdated(bytes32 baseAsset, uint maxMarketValue);
    event FuturesMaxFundingRateUpdated(bytes32 baseAsset, uint maxFundingRate);
    event FuturesMaxFundingRateSkewUpdated(bytes32 baseAsset, uint maxFundingRateSkew);
    event FuturesMaxFundingRateDeltaUpdated(bytes32 baseAsset, uint maxFundingRateDelta);
}
