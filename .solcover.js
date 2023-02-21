const {
	constants: { inflationStartTimestampInSecs },
} = require('.');

module.exports = {
	port: 8545,
	skipFiles: [
		'test-helpers',
		'migrations',
		'legacy',
		'RewardEscrowV2Frozen',
		'EscrowChecker.sol',
		'EtherWrapper.sol',
		'EmptyEtherWrapper.sol',
		'ExternStateToken.sol',
		'ExchangeState.sol',
		'ExchangerWithFeeRecAlternatives',
		'BaseRewardEscrowV2',
		'OwnerRelayOnEthereum.sol',
		'OwnerRelayOnOptimism.sol',
		'VirtualSynth.sol',
		'VirtualSynthMastercopy.sol',
		'TradingRewards.sol',
		'ShortingRewards.sol',
		'TemporarilyOwned.sol',
		'FuturesMarketBase.sol',
		'FuturesMarketData.sol',
		'FuturesMarketSettings.sol',
		'MixinFuturesViews.sol',
		'MixinFuturesMarketSettings.sol',
		'MixinFuturesNextPriceOrders.sol',
		'ExchangeRatesWithDexPricing.sol',
		'EternalStorage.sol',
		'Collateral.sol',
		'CollateralEth.sol',
		'CollateralErc20.sol',
		'CollateralShort.sol',
		'CollateralUtil.sol',
		'SynthRedeemer.sol',
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
