'use strict';

const { gray } = require('chalk');

const {
	constants: { ZERO_ADDRESS },
} = require('../../../..');

module.exports = async ({
	addressOf,
	currentLastMintEvent,
	currentSynthetixSupply,
	currentWeekOfInflation,
	deployer,
	oracleAddress,
	owner,
	useOvm,
}) => {
	console.log(gray(`\n------ DEPLOY LIBRARIES ------\n`));

	await deployer.deployContract({
		name: 'SafeDecimalMath',
	});

	await deployer.deployContract({
		name: 'Math',
	});

	console.log(gray(`\n------ DEPLOY CORE PROTOCOL ------\n`));

	await deployer.deployContract({
		name: 'AddressResolver',
		args: [owner],
	});

	const readProxyForResolver = await deployer.deployContract({
		name: 'ReadProxyAddressResolver',
		source: 'ReadProxy',
		args: [owner],
	});

	await deployer.deployContract({
		name: 'FlexibleStorage',
		deps: ['ReadProxyAddressResolver'],
		args: [addressOf(readProxyForResolver)],
	});

	await deployer.deployContract({
		name: 'SystemSettings',
		args: [owner, addressOf(readProxyForResolver)],
	});

	await deployer.deployContract({
		name: 'SystemStatus',
		args: [owner],
	});

	await deployer.deployContract({
		name: 'ExchangeRates',
		source: useOvm ? 'ExchangeRatesWithoutInvPricing' : 'ExchangeRates',
		args: [owner, oracleAddress, addressOf(readProxyForResolver), [], []],
	});

	await deployer.deployContract({
		name: 'RewardEscrow',
		args: [owner, ZERO_ADDRESS, ZERO_ADDRESS],
	});

	const rewardEscrowV2 = await deployer.deployContract({
		name: 'RewardEscrowV2',
		source: useOvm ? 'ImportableRewardEscrowV2' : 'RewardEscrowV2',
		args: [owner, addressOf(readProxyForResolver)],
		deps: ['AddressResolver'],
	});

	const synthetixEscrow = await deployer.deployContract({
		name: 'SynthetixEscrow',
		args: [owner, ZERO_ADDRESS],
	});

	await deployer.deployContract({
		name: 'SynthetixState',
		source: useOvm ? 'SynthetixStateWithLimitedSetup' : 'SynthetixState',
		args: [owner, ZERO_ADDRESS],
	});

	const proxyFeePool = await deployer.deployContract({
		name: 'ProxyFeePool',
		source: 'Proxy',
		args: [owner],
	});

	const delegateApprovalsEternalStorage = await deployer.deployContract({
		name: 'DelegateApprovalsEternalStorage',
		source: 'EternalStorage',
		args: [owner, ZERO_ADDRESS],
	});

	await deployer.deployContract({
		name: 'DelegateApprovals',
		args: [owner, addressOf(delegateApprovalsEternalStorage)],
	});

	const liquidations = await deployer.deployContract({
		name: 'Liquidations',
		args: [owner, addressOf(readProxyForResolver)],
	});

	await deployer.deployContract({
		name: 'EternalStorageLiquidations',
		source: 'EternalStorage',
		args: [owner, addressOf(liquidations)],
	});

	await deployer.deployContract({
		name: 'FeePoolEternalStorage',
		args: [owner, ZERO_ADDRESS],
	});

	const feePool = await deployer.deployContract({
		name: 'FeePool',
		deps: ['ProxyFeePool', 'AddressResolver'],
		args: [addressOf(proxyFeePool), owner, addressOf(readProxyForResolver)],
	});

	await deployer.deployContract({
		name: 'FeePoolState',
		deps: ['FeePool'],
		args: [owner, addressOf(feePool)],
	});

	await deployer.deployContract({
		name: 'RewardsDistribution',
		deps: useOvm ? ['RewardEscrowV2', 'ProxyFeePool'] : ['RewardEscrowV2', 'ProxyFeePool'],
		args: [
			owner, // owner
			ZERO_ADDRESS, // authority (synthetix)
			ZERO_ADDRESS, // Synthetix Proxy
			addressOf(rewardEscrowV2),
			addressOf(proxyFeePool),
		],
	});

	// New Synthetix proxy.
	const proxyERC20Synthetix = await deployer.deployContract({
		name: 'ProxyERC20',
		args: [owner],
	});

	const tokenStateSynthetix = await deployer.deployContract({
		name: 'TokenStateSynthetix',
		source: 'LegacyTokenState',
		args: [owner, ZERO_ADDRESS],
	});

	await deployer.deployContract({
		name: 'Synthetix',
		source: useOvm ? 'MintableSynthetix' : 'Synthetix',
		deps: ['ProxyERC20', 'TokenStateSynthetix', 'AddressResolver'],
		args: [
			addressOf(proxyERC20Synthetix),
			addressOf(tokenStateSynthetix),
			owner,
			currentSynthetixSupply,
			addressOf(readProxyForResolver),
		],
	});

	// Old Synthetix proxy based off Proxy.sol: this has been deprecated.
	// To be removed after May 30, 2020:
	// https://docs.synthetix.io/integrations/guide/#proxy-deprecation
	await deployer.deployContract({
		name: 'ProxySynthetix',
		source: 'Proxy',
		args: [owner],
	});

	await deployer.deployContract({
		name: 'DebtCache',
		deps: ['AddressResolver'],
		args: [owner, addressOf(readProxyForResolver)],
	});

	const exchanger = await deployer.deployContract({
		name: 'Exchanger',
		source: useOvm ? 'Exchanger' : 'ExchangerWithVirtualSynth',
		deps: ['AddressResolver'],
		args: [owner, addressOf(readProxyForResolver)],
	});

	await deployer.deployContract({
		name: 'VirtualSynthMastercopy',
	});

	await deployer.deployContract({
		name: 'ExchangeState',
		deps: ['Exchanger'],
		args: [owner, addressOf(exchanger)],
	});

	await deployer.deployContract({
		name: 'Issuer',
		source: useOvm ? 'IssuerWithoutLiquidations' : 'Issuer',
		deps: ['AddressResolver'],
		args: [owner, addressOf(readProxyForResolver)],
	});

	await deployer.deployContract({
		name: 'TradingRewards',
		deps: ['AddressResolver', 'Exchanger'],
		args: [owner, owner, addressOf(readProxyForResolver)],
	});

	await deployer.deployContract({
		name: 'SupplySchedule',
		args: [owner, currentLastMintEvent, currentWeekOfInflation],
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
		args: [owner, addressOf(readProxyForResolver)],
	});

	await deployer.deployContract({
		name: 'SynthetixBridgeToOptimism',
		deps: ['AddressResolver'],
		args: [owner, addressOf(readProxyForResolver)],
	});

	await deployer.deployContract({
		name: 'SynthetixBridgeEscrow',
		deps: ['AddressResolver'],
		args: [owner],
	});
};
