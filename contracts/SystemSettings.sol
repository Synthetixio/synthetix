pragma solidity ^0.5.16;

// Inheritance
import "./Owned.sol";
import "./MixinResolver.sol";
import "./MixinSystemSettings.sol";
import "./interfaces/ISystemSettings.sol";
import "./SystemSettingsLib.sol";

// https://docs.synthetix.io/contracts/source/contracts/systemsettings
contract SystemSettings is Owned, MixinSystemSettings, ISystemSettings {
    bytes32 public constant CONTRACT_NAME = "SystemSettings";

    constructor(address _owner, address _resolver) public Owned(_owner) MixinSystemSettings(_resolver) {}

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

    // SIP 182: Wrapper Factory
    // The maximum amount of token held by the Wrapper.
    function wrapperMaxTokenAmount(address wrapper) external view returns (uint) {
        return getWrapperMaxTokenAmount(wrapper);
    }

    // SIP 182: Wrapper Factory
    // The fee for depositing token into the Wrapper.
    function wrapperMintFeeRate(address wrapper) external view returns (int) {
        return getWrapperMintFeeRate(wrapper);
    }

    // SIP 182: Wrapper Factory
    // The fee for burning synth and releasing token from the Wrapper.
    function wrapperBurnFeeRate(address wrapper) external view returns (int) {
        return getWrapperBurnFeeRate(wrapper);
    }

    function interactionDelay(address collateral) external view returns (uint) {
        return getInteractionDelay(collateral);
    }

    function collapseFeeRate(address collateral) external view returns (uint) {
        return getCollapseFeeRate(collateral);
    }

    // SIP-120 Atomic exchanges
    // max allowed volume per block for atomic exchanges
    function atomicMaxVolumePerBlock() external view returns (uint) {
        return getAtomicMaxVolumePerBlock();
    }

    // SIP-120 Atomic exchanges
    // time window (in seconds) for TWAP prices when considered for atomic exchanges
    function atomicTwapWindow() external view returns (uint) {
        return getAtomicTwapWindow();
    }

    // SIP-120 Atomic exchanges
    // equivalent asset to use for a synth when considering external prices for atomic exchanges
    function atomicEquivalentForDexPricing(bytes32 currencyKey) external view returns (address) {
        return getAtomicEquivalentForDexPricing(currencyKey);
    }

    // SIP-120 Atomic exchanges
    // fee rate override for atomic exchanges into a synth
    function atomicExchangeFeeRate(bytes32 currencyKey) external view returns (uint) {
        return getAtomicExchangeFeeRate(currencyKey);
    }

    // SIP-120 Atomic exchanges
    // price dampener for chainlink prices when considered for atomic exchanges
    function atomicPriceBuffer(bytes32 currencyKey) external view returns (uint) {
        return getAtomicPriceBuffer(currencyKey);
    }

    // SIP-120 Atomic exchanges
    // consideration window for determining synth volatility
    function atomicVolatilityConsiderationWindow(bytes32 currencyKey) external view returns (uint) {
        return getAtomicVolatilityConsiderationWindow(currencyKey);
    }

    // SIP-120 Atomic exchanges
    // update threshold for determining synth volatility
    function atomicVolatilityUpdateThreshold(bytes32 currencyKey) external view returns (uint) {
        return getAtomicVolatilityUpdateThreshold(currencyKey);
    }

    // ========== RESTRICTED ==========

    function setCrossDomainMessageGasLimit(CrossDomainMessageGasLimits _gasLimitType, uint _crossDomainMessageGasLimit)
        external
        onlyOwner
    {
        SystemSettingsLib.setCrossDomainMessageGasLimit(
            address(flexibleStorage()),
            SETTING_CONTRACT_NAME,
            _getGasLimitSetting(_gasLimitType),
            _crossDomainMessageGasLimit
        );
        emit CrossDomainMessageGasLimitChanged(_gasLimitType, _crossDomainMessageGasLimit);
    }

    function setTradingRewardsEnabled(bool _tradingRewardsEnabled) external onlyOwner {
        SystemSettingsLib.setTradingRewardsEnabled(
            address(flexibleStorage()),
            SETTING_CONTRACT_NAME,
            SETTING_TRADING_REWARDS_ENABLED,
            _tradingRewardsEnabled
        );
    }

    function setWaitingPeriodSecs(uint _waitingPeriodSecs) external onlyOwner {
        SystemSettingsLib.setWaitingPeriodSecs(
            address(flexibleStorage()),
            SETTING_CONTRACT_NAME,
            SETTING_WAITING_PERIOD_SECS,
            _waitingPeriodSecs
        );
    }

    function setPriceDeviationThresholdFactor(uint _priceDeviationThresholdFactor) external onlyOwner {
        SystemSettingsLib.setPriceDeviationThresholdFactor(
            address(flexibleStorage()),
            SETTING_CONTRACT_NAME,
            SETTING_PRICE_DEVIATION_THRESHOLD_FACTOR,
            _priceDeviationThresholdFactor
        );
    }

    function setIssuanceRatio(uint _issuanceRatio) external onlyOwner {
        SystemSettingsLib.setIssuanceRatio(
            address(flexibleStorage()),
            SETTING_CONTRACT_NAME,
            SETTING_ISSUANCE_RATIO,
            _issuanceRatio
        );
    }

    function setFeePeriodDuration(uint _feePeriodDuration) external onlyOwner {
        SystemSettingsLib.setFeePeriodDuration(
            address(flexibleStorage()),
            SETTING_CONTRACT_NAME,
            SETTING_FEE_PERIOD_DURATION,
            _feePeriodDuration
        );
    }

    function setTargetThreshold(uint _percent) external onlyOwner {
        SystemSettingsLib.setTargetThreshold(
            address(flexibleStorage()),
            SETTING_CONTRACT_NAME,
            SETTING_TARGET_THRESHOLD,
            _percent
        );
    }

    function setLiquidationDelay(uint time) external onlyOwner {
        SystemSettingsLib.setLiquidationDelay(
            address(flexibleStorage()),
            SETTING_CONTRACT_NAME,
            SETTING_LIQUIDATION_DELAY,
            time
        );
    }

    // The collateral / issuance ratio ( debt / collateral ) is higher when there is less collateral backing their debt
    // Upper bound liquidationRatio is 1 + penalty (100% + 10% = 110%) to allow collateral value to cover debt and liquidation penalty
    function setLiquidationRatio(uint _liquidationRatio) external onlyOwner {
        SystemSettingsLib.setLiquidationRatio(
            address(flexibleStorage()),
            SETTING_CONTRACT_NAME,
            SETTING_LIQUIDATION_RATIO,
            _liquidationRatio,
            getLiquidationPenalty(),
            getIssuanceRatio()
        );
    }

    function setLiquidationPenalty(uint penalty) external onlyOwner {
        SystemSettingsLib.setLiquidationPenalty(
            address(flexibleStorage()),
            SETTING_CONTRACT_NAME,
            SETTING_LIQUIDATION_PENALTY,
            penalty
        );
    }

    function setRateStalePeriod(uint period) external onlyOwner {
        SystemSettingsLib.setRateStalePeriod(
            address(flexibleStorage()),
            SETTING_CONTRACT_NAME,
            SETTING_RATE_STALE_PERIOD,
            period
        );
    }

    function setExchangeFeeRateForSynths(bytes32[] calldata synthKeys, uint256[] calldata exchangeFeeRates)
        external
        onlyOwner
    {
        SystemSettingsLib.setExchangeFeeRateForSynths(
            address(flexibleStorage()),
            SETTING_CONTRACT_NAME,
            SETTING_EXCHANGE_FEE_RATE,
            synthKeys,
            exchangeFeeRates
        );
    }

    function setMinimumStakeTime(uint _seconds) external onlyOwner {
        SystemSettingsLib.setMinimumStakeTime(
            address(flexibleStorage()),
            SETTING_CONTRACT_NAME,
            SETTING_MINIMUM_STAKE_TIME,
            _seconds
        );
    }

    function setDebtSnapshotStaleTime(uint _seconds) external onlyOwner {
        SystemSettingsLib.setDebtSnapshotStaleTime(
            address(flexibleStorage()),
            SETTING_CONTRACT_NAME,
            SETTING_DEBT_SNAPSHOT_STALE_TIME,
            _seconds
        );
    }

    function setAggregatorWarningFlags(address _flags) external onlyOwner {
        SystemSettingsLib.setAggregatorWarningFlags(
            address(flexibleStorage()),
            SETTING_CONTRACT_NAME,
            SETTING_AGGREGATOR_WARNING_FLAGS,
            _flags
        );
    }

    function setEtherWrapperMaxETH(uint _maxETH) external onlyOwner {
        SystemSettingsLib.setEtherWrapperMaxETH(
            address(flexibleStorage()),
            SETTING_CONTRACT_NAME,
            SETTING_ETHER_WRAPPER_MAX_ETH,
            _maxETH
        );
    }

    function setEtherWrapperMintFeeRate(uint _rate) external onlyOwner {
        SystemSettingsLib.setEtherWrapperMintFeeRate(
            address(flexibleStorage()),
            SETTING_CONTRACT_NAME,
            SETTING_ETHER_WRAPPER_MINT_FEE_RATE,
            _rate
        );
    }

    function setEtherWrapperBurnFeeRate(uint _rate) external onlyOwner {
        SystemSettingsLib.setEtherWrapperBurnFeeRate(
            address(flexibleStorage()),
            SETTING_CONTRACT_NAME,
            SETTING_ETHER_WRAPPER_BURN_FEE_RATE,
            _rate
        );
    }

    function setWrapperMaxTokenAmount(address _wrapper, uint _maxTokenAmount) external onlyOwner {
        SystemSettingsLib.setWrapperMaxTokenAmount(
            address(flexibleStorage()),
            SETTING_CONTRACT_NAME,
            SETTING_WRAPPER_MAX_TOKEN_AMOUNT,
            _wrapper,
            _maxTokenAmount
        );
    }

    function setWrapperMintFeeRate(address _wrapper, int _rate) external onlyOwner {
        SystemSettingsLib.setWrapperMintFeeRate(
            address(flexibleStorage()),
            SETTING_CONTRACT_NAME,
            SETTING_WRAPPER_MINT_FEE_RATE,
            _wrapper,
            _rate,
            getWrapperBurnFeeRate(_wrapper)
        );
    }

    function setWrapperBurnFeeRate(address _wrapper, int _rate) external onlyOwner {
        SystemSettingsLib.setWrapperBurnFeeRate(
            address(flexibleStorage()),
            SETTING_CONTRACT_NAME,
            SETTING_WRAPPER_BURN_FEE_RATE,
            _wrapper,
            _rate,
            getWrapperMintFeeRate(_wrapper)
        );
    }

    function setInteractionDelay(address _collateral, uint _interactionDelay) external onlyOwner {
        SystemSettingsLib.setInteractionDelay(
            address(flexibleStorage()),
            SETTING_CONTRACT_NAME,
            SETTING_INTERACTION_DELAY,
            _collateral,
            _interactionDelay
        );
    }

    function setCollapseFeeRate(address _collateral, uint _collapseFeeRate) external onlyOwner {
        SystemSettingsLib.setCollapseFeeRate(
            address(flexibleStorage()),
            SETTING_CONTRACT_NAME,
            SETTING_COLLAPSE_FEE_RATE,
            _collateral,
            _collapseFeeRate
        );
    }

    function setAtomicMaxVolumePerBlock(uint _maxVolume) external onlyOwner {
        SystemSettingsLib.setAtomicMaxVolumePerBlock(
            address(flexibleStorage()),
            SETTING_CONTRACT_NAME,
            SETTING_ATOMIC_MAX_VOLUME_PER_BLOCK,
            _maxVolume
        );
    }

    function setAtomicTwapWindow(uint _window) external onlyOwner {
        SystemSettingsLib.setAtomicTwapWindow(
            address(flexibleStorage()),
            SETTING_CONTRACT_NAME,
            SETTING_ATOMIC_TWAP_WINDOW,
            _window
        );
    }

    function setAtomicEquivalentForDexPricing(bytes32 _currencyKey, address _equivalent) external onlyOwner {
        SystemSettingsLib.setAtomicEquivalentForDexPricing(
            address(flexibleStorage()),
            SETTING_CONTRACT_NAME,
            SETTING_ATOMIC_EQUIVALENT_FOR_DEX_PRICING,
            _currencyKey,
            _equivalent
        );
    }

    function setAtomicExchangeFeeRate(bytes32 _currencyKey, uint256 _exchangeFeeRate) external onlyOwner {
        SystemSettingsLib.setAtomicExchangeFeeRate(
            address(flexibleStorage()),
            SETTING_CONTRACT_NAME,
            SETTING_ATOMIC_EXCHANGE_FEE_RATE,
            _currencyKey,
            _exchangeFeeRate
        );
    }

    function setAtomicPriceBuffer(bytes32 _currencyKey, uint _buffer) external onlyOwner {
        SystemSettingsLib.setAtomicPriceBuffer(
            address(flexibleStorage()),
            SETTING_CONTRACT_NAME,
            SETTING_ATOMIC_PRICE_BUFFER,
            _currencyKey,
            _buffer
        );
    }

    function setAtomicVolatilityConsiderationWindow(bytes32 _currencyKey, uint _window) external onlyOwner {
        SystemSettingsLib.setAtomicVolatilityConsiderationWindow(
            address(flexibleStorage()),
            SETTING_CONTRACT_NAME,
            SETTING_ATOMIC_VOLATILITY_CONSIDERATION_WINDOW,
            _currencyKey,
            _window
        );
    }

    function setAtomicVolatilityUpdateThreshold(bytes32 _currencyKey, uint _threshold) external onlyOwner {
        SystemSettingsLib.setAtomicVolatilityUpdateThreshold(
            address(flexibleStorage()),
            SETTING_CONTRACT_NAME,
            SETTING_ATOMIC_VOLATILITY_UPDATE_THRESHOLD,
            _currencyKey,
            _threshold
        );
    }

    // ========== EVENTS ==========
    event CrossDomainMessageGasLimitChanged(CrossDomainMessageGasLimits gasLimitType, uint newLimit);
}
