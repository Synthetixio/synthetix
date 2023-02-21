const {
	constants: { inflationStartTimestampInSecs },
} = require('.');

module.exports = {
	port: 8545,
	skipFiles: [
		'legacy',
		'migrations',
		'test-helpers',
		'BaseRewardEscrowV2',
		'Collateral.sol',
		'CollateralErc20.sol',
		'CollateralEth.sol',
		'CollateralShort.sol',
		'CollateralUtil.sol',
		'CollateralManager.sol',
		'CollateralManagerState.sol',
		'Depot.sol',
		'EmptyEtherWrapper.sol',
		'EscrowChecker.sol',
		'EternalStorage.sol',
		'EtherWrapper.sol',
		'ExchangeRates.sol',
		'ExchangeRatesWithDexPricing.sol',
		'ExchangerWithFeeRecAlternatives',
		'ExchangeSettlementLib.sol',
		'ExchangeState.sol',
		'ExternStateToken.sol',
		'FuturesMarketBase.sol',
		'FuturesMarketData.sol',
		'FuturesMarketSettings.sol',
		'MixinFuturesMarketSettings.sol',
		'MixinFuturesNextPriceOrders.sol',
		'MixinFuturesViews.sol',
		'OwnerRelayOnEthereum.sol',
		'OwnerRelayOnOptimism.sol',
		'RewardEscrowV2Frozen',
		'ShortingRewards.sol',
		'SynthRedeemer.sol',
		'TemporarilyOwned.sol',
		'TradingRewards.sol',
		'VirtualSynth.sol',
		'VirtualSynthMastercopy.sol',
	],
	providerOptions: {
		default_balance_ether: 10000000000000, // extra zero just in case (coverage consumes more gas)
		time: new Date(inflationStartTimestampInSecs * 1000),
		network_id: 55,
	},
	mocha: {
		grep: '@cov-skip', // Find everything with this tag
		invert: true, // Run the grep's inverse set.
		timeout: 360e3,
	},
	// Reduce instrumentation footprint - volume of solidity code
	// passed to compiler causes it to crash (See discussion PR #732)
	// Line and branch coverage will still be reported.
	measureStatementCoverage: false,
};
