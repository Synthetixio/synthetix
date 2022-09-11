'use strict';

const { gray } = require('chalk');

const {
	constants: { ZERO_ADDRESS },
	defaults: { TEMP_OWNER_DEFAULT_DURATION },
} = require('../../../..');

module.exports = async ({
	account,
	addressOf,
	currentLastMintEvent,
	currentSynthetixSupply,
	currentWeekOfInflation,
	deployer,
	useOvm,
}) => {
	console.log(gray(`\n------ DEPLOY LIBRARIES ------\n`));

	await deployer.deployContract({
		name: 'SafeDecimalMath',
		library: true,
	});

	await deployer.deployContract({
		name: 'Math',
		library: true,
	});

	await deployer.deployContract({
		name: 'SystemSettingsLib',
		library: true,
	});

	await deployer.deployContract({
		name: 'SignedSafeDecimalMath',
		library: true,
	});

	console.log(gray(`\n------ DEPLOY ADDRESS RESOLVER ------\n`));

	await deployer.deployContract({
		name: 'AddressResolver',
		args: [account],
	});

	const readProxyForResolver = await deployer.deployContract({
		name: 'ReadProxyAddressResolver',
		source: 'ReadProxy',
		args: [account],
	});

	console.log(gray(`\n------ DEPLOY SELF ORACLES ------\n`));

	await deployer.deployContract({
		name: 'OneNetAggregatorIssuedSynths',
		args: [addressOf(readProxyForResolver)],
	});

	await deployer.deployContract({
		name: 'OneNetAggregatorDebtRatio',
		args: [addressOf(readProxyForResolver)],
	});

	// SIP-243: Deprecate sDEFI
	await deployer.deployContract({
		name: 'OneNetAggregatorsDEFI',
		args: [addressOf(readProxyForResolver)],
	});

	console.log(gray(`\n------ DEPLOY CORE PROTOCOL ------\n`));

	await deployer.deployContract({
		name: 'FlexibleStorage',
		deps: ['ReadProxyAddressResolver'],
		args: [addressOf(readProxyForResolver)],
	});

	await deployer.deployContract({
		name: 'SystemSettings',
		args: [account, addressOf(readProxyForResolver)],
	});

	await deployer.deployContract({
		name: 'SystemStatus',
		args: [account],
	});

	await deployer.deployContract({
		name: 'ExchangeRates',
		source: useOvm ? 'ExchangeRates' : 'ExchangeRatesWithDexPricing',
		args: [account, addressOf(readProxyForResolver)],
	});

	const tokenStateSynthetix = await deployer.deployContract({
		name: 'TokenStateSynthetix',
		source: 'LegacyTokenState',
		args: [account, account],
	});

	const proxySynthetix = await deployer.deployContract({
		name: 'ProxySynthetix',
		source: 'ProxyERC20',
		args: [account],
	});

	await deployer.deployContract({
		name: 'Synthetix',
		source: useOvm ? 'MintableSynthetix' : 'Synthetix',
		deps: ['ProxySynthetix', 'TokenStateSynthetix', 'AddressResolver'],
		args: [
			addressOf(proxySynthetix),
			addressOf(tokenStateSynthetix),
			account,
			currentSynthetixSupply,
			addressOf(readProxyForResolver),
		],
	});

	await deployer.deployContract({
		name: 'RewardEscrow',
		args: [account, ZERO_ADDRESS, ZERO_ADDRESS],
	});

	// SIP-252: frozen V2 escrow for migration to new escrow
	// this is actually deployed in integration tests, but it shouldn't be deployed (should only be configured)
	// for fork-tests & actual deployment (by not specifying RewardEscrowV2Frozen in config and releases)
	await deployer.deployContract({
		name: 'RewardEscrowV2Frozen',
		source: useOvm ? 'ImportableRewardEscrowV2Frozen' : 'RewardEscrowV2Frozen',
		args: [account, addressOf(readProxyForResolver)],
		deps: ['AddressResolver'],
	});

	// SIP-252: storage contract for RewardEscrowV2
	await deployer.deployContract({
		name: 'RewardEscrowV2Storage',
		args: [account, ZERO_ADDRESS],
		deps: ['AddressResolver'],
	});

	const rewardEscrowV2 = await deployer.deployContract({
		name: 'RewardEscrowV2',
		source: useOvm ? 'ImportableRewardEscrowV2' : 'RewardEscrowV2',
		args: [account, addressOf(readProxyForResolver)],
		deps: ['AddressResolver'],
	});

	const synthetixEscrow = await deployer.deployContract({
		name: 'SynthetixEscrow',
		args: [account, ZERO_ADDRESS],
	});

	await deployer.deployContract({
		name: 'SynthetixState',
		source: useOvm ? 'SynthetixStateWithLimitedSetup' : 'SynthetixState',
		args: [account, account],
	});

	await deployer.deployContract({
		name: 'SynthetixDebtShare',
		deps: ['AddressResolver'],
		args: [account, addressOf(readProxyForResolver)],
	});

	const proxyFeePool = await deployer.deployContract({
		name: 'ProxyFeePool',
		source: 'Proxy',
		args: [account],
	});

	const delegateApprovalsEternalStorage = await deployer.deployContract({
		name: 'DelegateApprovalsEternalStorage',
		source: 'EternalStorage',
		args: [account, ZERO_ADDRESS],
	});

	await deployer.deployContract({
		name: 'DelegateApprovals',
		args: [account, addressOf(delegateApprovalsEternalStorage)],
	});

	await deployer.deployContract({
		name: 'Liquidator',
		args: [account, addressOf(readProxyForResolver)],
	});

	await deployer.deployContract({
		name: 'LiquidatorRewards',
		deps: ['AddressResolver'],
		args: [account, addressOf(readProxyForResolver)],
	});

	await deployer.deployContract({
		name: 'FeePoolEternalStorage',
		args: [account, ZERO_ADDRESS],
	});

	const feePool = await deployer.deployContract({
		name: 'FeePool',
		deps: ['ProxyFeePool', 'AddressResolver'],
		args: [addressOf(proxyFeePool), account, addressOf(readProxyForResolver)],
	});

	await deployer.deployContract({
		name: 'FeePoolState',
		deps: ['FeePool'],
		args: [account, addressOf(feePool)],
	});

	await deployer.deployContract({
		name: 'RewardsDistribution',
		deps: useOvm ? ['RewardEscrowV2', 'ProxyFeePool'] : ['RewardEscrowV2', 'ProxyFeePool'],
		args: [
			account, // owner
			ZERO_ADDRESS, // authority (synthetix)
			ZERO_ADDRESS, // Synthetix Proxy
			addressOf(rewardEscrowV2),
			addressOf(proxyFeePool),
		],
	});

	await deployer.deployContract({
		name: 'DebtCache',
		deps: ['AddressResolver'],
		args: [account, addressOf(readProxyForResolver)],
	});

	const exchanger = await deployer.deployContract({
		name: 'Exchanger',
		source: useOvm ? 'Exchanger' : 'ExchangerWithFeeRecAlternatives',
		deps: ['AddressResolver'],
		args: [account, addressOf(readProxyForResolver)],
	});

	await deployer.deployContract({
		name: 'CircuitBreaker',
		source: 'CircuitBreaker',
		deps: ['AddressResolver'],
		args: [account, addressOf(readProxyForResolver)],
	});

	await deployer.deployContract({
		name: 'ExchangeCircuitBreaker',
		source: 'ExchangeCircuitBreaker',
		deps: ['AddressResolver'],
		args: [account, addressOf(readProxyForResolver)],
	});

	await deployer.deployContract({
		name: 'VirtualSynthMastercopy',
	});

	await deployer.deployContract({
		name: 'ExchangeState',
		deps: ['Exchanger'],
		args: [account, addressOf(exchanger)],
	});

	await deployer.deployContract({
		name: 'Issuer',
		deps: ['AddressResolver'],
		args: [account, addressOf(readProxyForResolver)],
	});

	await deployer.deployContract({
		name: 'TradingRewards',
		deps: ['AddressResolver', 'Exchanger'],
		args: [account, account, addressOf(readProxyForResolver)],
	});

	await deployer.deployContract({
		name: 'SupplySchedule',
		args: [account, currentLastMintEvent, currentWeekOfInflation],
	});

	if (synthetixEscrow) {
		await deployer.deployContract({
			name: 'EscrowChecker',
			deps: ['SynthetixEscrow'],
			args: [addressOf(synthetixEscrow)],
		});
	}

	await deployer.deployContract({
		name: 'SynthetixBridgeToBase',
		deps: ['AddressResolver'],
		args: [account, addressOf(readProxyForResolver)],
	});

	await deployer.deployContract({
		name: 'SynthetixBridgeToOptimism',
		deps: ['AddressResolver'],
		args: [account, addressOf(readProxyForResolver)],
	});

	await deployer.deployContract({
		name: 'SynthetixBridgeEscrow',
		deps: ['AddressResolver'],
		args: [account],
	});

	await deployer.deployContract({
		name: 'OwnerRelayOnEthereum',
		deps: ['AddressResolver'],
		args: [account, addressOf(readProxyForResolver)],
	});

	await deployer.deployContract({
		name: 'OwnerRelayOnOptimism',
		deps: ['AddressResolver'],
		args: [addressOf(readProxyForResolver), account, TEMP_OWNER_DEFAULT_DURATION],
	});

	await deployer.deployContract({
		name: 'SynthRedeemer',
		deps: ['AddressResolver'],
		args: [addressOf(readProxyForResolver)],
	});

	await deployer.deployContract({
		name: 'WrapperFactory',
		source: 'WrapperFactory',
		deps: ['AddressResolver'],
		args: [account, addressOf(readProxyForResolver)],
	});
};
