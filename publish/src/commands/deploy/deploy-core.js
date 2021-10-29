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
	oracleAddress,
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
		args: [account],
	});

	const readProxyForResolver = await deployer.deployContract({
		name: 'ReadProxyAddressResolver',
		source: 'ReadProxy',
		args: [account],
	});

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
		source: useOvm ? 'ExchangeRatesWithoutInvPricing' : 'ExchangeRates',
		args: [account, oracleAddress, addressOf(readProxyForResolver), [], []],
	});

	await deployer.deployContract({
		name: 'RewardEscrow',
		args: [account, ZERO_ADDRESS, ZERO_ADDRESS],
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

	const liquidations = await deployer.deployContract({
		name: 'Liquidations',
		args: [account, addressOf(readProxyForResolver)],
	});

	await deployer.deployContract({
		name: 'EternalStorageLiquidations',
		source: 'EternalStorage',
		args: [account, addressOf(liquidations)],
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

	// New Synthetix proxy.
	const proxyERC20Synthetix = await deployer.deployContract({
		name: 'ProxyERC20',
		args: [account],
	});

	const tokenStateSynthetix = await deployer.deployContract({
		name: 'TokenStateSynthetix',
		source: 'LegacyTokenState',
		args: [account, account],
	});

	await deployer.deployContract({
		name: 'Synthetix',
		source: useOvm ? 'MintableSynthetix' : 'Synthetix',
		deps: ['ProxyERC20', 'TokenStateSynthetix', 'AddressResolver'],
		args: [
			addressOf(proxyERC20Synthetix),
			addressOf(tokenStateSynthetix),
			account,
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
		args: [account],
	});

	await deployer.deployContract({
		name: 'DebtCache',
		deps: ['AddressResolver'],
		args: [account, addressOf(readProxyForResolver)],
	});

	const exchanger = await deployer.deployContract({
		name: 'Exchanger',
		source: useOvm ? 'Exchanger' : 'ExchangerWithVirtualSynth',
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
		source: useOvm ? 'IssuerWithoutLiquidations' : 'Issuer',
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
		name: 'OwnerRelayOnOptimism',
		deps: ['AddressResolver'],
		args: [addressOf(readProxyForResolver), account, TEMP_OWNER_DEFAULT_DURATION],
	});

	await deployer.deployContract({
		name: 'OwnerRelayOnEthereum',
		deps: ['AddressResolver'],
		args: [account, addressOf(readProxyForResolver)],
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
