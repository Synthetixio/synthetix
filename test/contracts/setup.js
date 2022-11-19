'use strict';

const { artifacts, web3, log, ethers } = require('hardhat');

const { toWei, toBN } = web3.utils;
const { toUnit } = require('../utils')();
const { setupPriceAggregators, updateAggregatorRates } = require('./helpers');

const {
	toBytes32,
	fromBytes32,
	getUsers,
	constants: { ZERO_ADDRESS },
	defaults: {
		WAITING_PERIOD_SECS,
		PRICE_DEVIATION_THRESHOLD_FACTOR,
		ISSUANCE_RATIO,
		FEE_PERIOD_DURATION,
		TARGET_THRESHOLD,
		LIQUIDATION_DELAY,
		LIQUIDATION_RATIO,
		LIQUIDATION_ESCROW_DURATION,
		LIQUIDATION_PENALTY,
		SNX_LIQUIDATION_PENALTY,
		SELF_LIQUIDATION_PENALTY,
		FLAG_REWARD,
		LIQUIDATE_REWARD,
		RATE_STALE_PERIOD,
		// EXCHANGE_DYNAMIC_FEE_THRESHOLD, // overridden
		// EXCHANGE_DYNAMIC_FEE_WEIGHT_DECAY, // overridden
		// EXCHANGE_DYNAMIC_FEE_ROUNDS, // overridden
		// EXCHANGE_MAX_DYNAMIC_FEE, // overridden
		MINIMUM_STAKE_TIME,
		DEBT_SNAPSHOT_STALE_TIME,
		ATOMIC_MAX_VOLUME_PER_BLOCK,
		ATOMIC_TWAP_WINDOW,
		CROSS_DOMAIN_DEPOSIT_GAS_LIMIT,
		CROSS_DOMAIN_REWARD_GAS_LIMIT,
		CROSS_DOMAIN_ESCROW_GAS_LIMIT,
		CROSS_DOMAIN_WITHDRAWAL_GAS_LIMIT,
		ETHER_WRAPPER_MAX_ETH,
		ETHER_WRAPPER_MINT_FEE_RATE,
		ETHER_WRAPPER_BURN_FEE_RATE,
		// FUTURES_MIN_KEEPER_FEE, // overridden
		FUTURES_LIQUIDATION_FEE_RATIO,
		FUTURES_LIQUIDATION_BUFFER_RATIO,
		FUTURES_MIN_INITIAL_MARGIN,
	},
} = require('../../');

const SUPPLY_100M = toWei((1e8).toString()); // 100M

// constants overrides for testing (to avoid having to update tests for config changes)
const constantsOverrides = {
	EXCHANGE_DYNAMIC_FEE_ROUNDS: '10',
	EXCHANGE_DYNAMIC_FEE_WEIGHT_DECAY: toWei('0.95'),
	EXCHANGE_DYNAMIC_FEE_THRESHOLD: toWei('0.004'),
	EXCHANGE_MAX_DYNAMIC_FEE: toWei('0.05'),
	FUTURES_MIN_KEEPER_FEE: toWei('20'),
};

/**
 * Create a mock ExternStateToken - useful to mock Synthetix or a synth
 */
const mockToken = async ({
	accounts,
	synth = undefined,
	name = 'name',
	symbol = 'ABC',
	supply = 1e8,
	skipInitialAllocation = false,
}) => {
	const [deployerAccount, owner] = accounts;

	const totalSupply = toWei(supply.toString());

	const proxy = await artifacts.require('ProxyERC20').new(owner, { from: deployerAccount });
	// set associated contract as deployerAccount so we can setBalanceOf to the owner below
	const tokenState = await artifacts
		.require('TokenState')
		.new(owner, deployerAccount, { from: deployerAccount });

	if (!skipInitialAllocation && supply > 0) {
		await tokenState.setBalanceOf(owner, totalSupply, { from: deployerAccount });
	}

	const token = await artifacts.require(synth ? 'MockSynth' : 'PublicEST').new(
		...[proxy.address, tokenState.address, name, symbol, totalSupply, owner]
			// add synth as currency key if needed
			.concat(synth ? toBytes32(synth) : [])
			.concat({
				from: deployerAccount,
			})
	);
	await Promise.all([
		tokenState.setAssociatedContract(token.address, { from: owner }),
		proxy.setTarget(token.address, { from: owner }),
	]);

	return { token, tokenState, proxy };
};

const mockGenericContractFnc = async ({ instance, fncName, mock, returns = [] }) => {
	// Adapted from: https://github.com/EthWorks/Doppelganger/blob/master/lib/index.ts
	const abiEntryForFnc = artifacts.require(mock).abi.find(({ name }) => name === fncName);

	if (!fncName || !abiEntryForFnc) {
		throw new Error(`Cannot find function "${fncName}" in the ABI of contract "${mock}"`);
	}
	const signature = web3.eth.abi.encodeFunctionSignature(abiEntryForFnc);

	const outputTypes = abiEntryForFnc.outputs.map(({ type }) => type);

	const responseAsEncodedData = web3.eth.abi.encodeParameters(outputTypes, returns);

	if (process.env.DEBUG) {
		log(`Mocking ${mock}.${fncName} to return ${returns.join(',')}`);
	}

	await instance.mockReturns(signature, responseAsEncodedData);
};

// Futures V2 Proxy
const excludedFunctions = [
	// Owned
	'nominateNewOwner',
	'acceptOwnership',
	'nominatedOwner',
	'owner',
	// MixinResolver
	'resolver',
	'resolverAddressesRequired',
	'rebuildCache',
	'isResolvedCache',
	// ProxyPerpsV2
	'getRoutesPage',
	// PerpsV2MarketBase
	'marketState',
];

const getFunctionSignatures = (instance, excludedFunctions) => {
	const contractInterface = new ethers.utils.Interface(instance.abi);
	const signatures = [];
	const funcNames = Object.keys(contractInterface.functions);
	for (const funcName of funcNames) {
		const signature = {
			signature: contractInterface.getSighash(contractInterface.functions[funcName]),
			functionName: contractInterface.functions[funcName].name,
			stateMutability: contractInterface.functions[funcName].stateMutability,
			isView: contractInterface.functions[funcName].stateMutability === 'view',
		};
		signatures.push(signature);
	}
	return signatures.filter(f => !excludedFunctions.includes(f.functionName));
};

/**
 * Setup an individual contract. Note: will fail if required dependencies aren't provided in the cache.
 */
const setupContract = async ({
	accounts,
	contract,
	source = undefined, // if a separate source file should be used
	mock = undefined, // if contract is GenericMock, this is the name of the contract being mocked
	forContract = undefined, // when a contract is deployed for another (like Proxy for FeePool)
	cache = {},
	args = [],
	skipPostDeploy = false,
	properties = {},
}) => {
	const [deployerAccount, owner, , fundsWallet] = accounts;

	const artifact = artifacts.require(source || contract);

	const create = ({ constructorArgs }) => {
		return artifact.new(
			...constructorArgs.concat({
				from: deployerAccount,
			})
		);
	};

	// if it needs library linking
	if (Object.keys((await artifacts.readArtifact(source || contract)).linkReferences).length > 0) {
		const safeDecimalMath = await artifacts.require('SafeDecimalMath').new();

		if (
			artifact._json.contractName === 'Exchanger' ||
			artifact._json.contractName === 'ExchangerWithFeeRecAlternatives'
		) {
			// SafeDecimalMath -> ExchangeSettlementLib -> Exchanger*
			const ExchangeSettlementLib = artifacts.require('ExchangeSettlementLib');
			ExchangeSettlementLib.link(safeDecimalMath);
			artifact.link(await ExchangeSettlementLib.new());
			artifact.link(await safeDecimalMath);
		} else if (artifact._json.contractName === 'SystemSettings') {
			// SafeDecimalMath -> SystemSettingsLib -> SystemSettings
			const SystemSettingsLib = artifacts.require('SystemSettingsLib');
			SystemSettingsLib.link(safeDecimalMath);
			artifact.link(await SystemSettingsLib.new());
		} else {
			// SafeDecimalMath -> anything else that expects linking
			artifact.link(safeDecimalMath);
		}
	}

	const tryGetAddressOf = name => (cache[name] ? cache[name].address : ZERO_ADDRESS);

	const tryGetProperty = ({ property, otherwise }) =>
		property in properties ? properties[property] : otherwise;

	const tryInvocationIfNotMocked = ({ name, fncName, args, user = owner }) => {
		if (name in cache && fncName in cache[name]) {
			if (process.env.DEBUG) {
				log(`Invoking ${name}.${fncName}(${args.join(',')})`);
			}

			return cache[name][fncName](...args.concat({ from: user }));
		}
	};

	const perpSuffix = tryGetProperty({ property: 'perpSuffix', otherwise: '' });

	const defaultArgs = {
		GenericMock: [],
		TradingRewards: [owner, owner, tryGetAddressOf('AddressResolver')],
		AddressResolver: [owner],
		OneNetAggregatorIssuedSynths: [tryGetAddressOf('AddressResolver')],
		OneNetAggregatorDebtRatio: [tryGetAddressOf('AddressResolver')],
		SystemStatus: [owner],
		FlexibleStorage: [tryGetAddressOf('AddressResolver')],
		ExchangeRates: [owner, tryGetAddressOf('AddressResolver')],
		ExchangeRatesWithDexPricing: [owner, tryGetAddressOf('AddressResolver')],
		SynthetixState: [owner, ZERO_ADDRESS],
		SupplySchedule: [owner, 0, 0],
		Proxy: [owner],
		ProxyERC20: [owner],
		ProxySynthetix: [owner],
		Depot: [owner, fundsWallet, tryGetAddressOf('AddressResolver')],
		SynthUtil: [tryGetAddressOf('AddressResolver')],
		DappMaintenance: [owner],
		DebtCache: [owner, tryGetAddressOf('AddressResolver')],
		Issuer: [owner, tryGetAddressOf('AddressResolver')],
		Exchanger: [owner, tryGetAddressOf('AddressResolver')],
		CircuitBreaker: [owner, tryGetAddressOf('AddressResolver')],
		ExchangeCircuitBreaker: [owner, tryGetAddressOf('AddressResolver')],
		ExchangerWithFeeRecAlternatives: [owner, tryGetAddressOf('AddressResolver')],
		SystemSettings: [owner, tryGetAddressOf('AddressResolver')],
		DirectIntegrationManager: [owner, tryGetAddressOf('AddressResolver')],
		ExchangeState: [owner, tryGetAddressOf('Exchanger')],
		SynthetixDebtShare: [owner, tryGetAddressOf('AddressResolver')],
		BaseSynthetix: [
			tryGetAddressOf('ProxyERC20BaseSynthetix'),
			tryGetAddressOf('TokenStateBaseSynthetix'),
			owner,
			SUPPLY_100M,
			tryGetAddressOf('AddressResolver'),
		],
		Synthetix: [
			tryGetAddressOf('ProxyERC20Synthetix'),
			tryGetAddressOf('TokenStateSynthetix'),
			owner,
			SUPPLY_100M,
			tryGetAddressOf('AddressResolver'),
		],
		MintableSynthetix: [
			tryGetAddressOf('ProxyERC20MintableSynthetix'),
			tryGetAddressOf('TokenStateMintableSynthetix'),
			owner,
			SUPPLY_100M,
			tryGetAddressOf('AddressResolver'),
		],
		SynthetixBridgeToOptimism: [owner, tryGetAddressOf('AddressResolver')],
		SynthetixBridgeToBase: [owner, tryGetAddressOf('AddressResolver')],
		SynthetixBridgeEscrow: [owner],
		RewardsDistribution: [
			owner,
			tryGetAddressOf('Synthetix'),
			tryGetAddressOf('ProxyERC20Synthetix'),
			tryGetAddressOf('RewardEscrowV2'),
			tryGetAddressOf('ProxyFeePool'),
		],
		RewardEscrow: [owner, tryGetAddressOf('Synthetix'), tryGetAddressOf('FeePool')],
		BaseRewardEscrowV2Frozen: [owner, tryGetAddressOf('AddressResolver')],
		RewardEscrowV2Frozen: [owner, tryGetAddressOf('AddressResolver')],
		RewardEscrowV2Storage: [owner, ZERO_ADDRESS],
		BaseRewardEscrowV2: [owner, tryGetAddressOf('AddressResolver')],
		RewardEscrowV2: [owner, tryGetAddressOf('AddressResolver')],
		ImportableRewardEscrowV2: [owner, tryGetAddressOf('AddressResolver')],
		SynthetixEscrow: [owner, tryGetAddressOf('Synthetix')],
		// use deployerAccount as associated contract to allow it to call setBalanceOf()
		TokenState: [owner, deployerAccount],
		EtherWrapper: [owner, tryGetAddressOf('AddressResolver'), tryGetAddressOf('WETH')],
		NativeEtherWrapper: [owner, tryGetAddressOf('AddressResolver')],
		WrapperFactory: [owner, tryGetAddressOf('AddressResolver')],
		FeePool: [tryGetAddressOf('ProxyFeePool'), owner, tryGetAddressOf('AddressResolver')],
		Synth: [
			tryGetAddressOf('ProxyERC20Synth'),
			tryGetAddressOf('TokenStateSynth'),
			tryGetProperty({ property: 'name', otherwise: 'Synthetic sUSD' }),
			tryGetProperty({ property: 'symbol', otherwise: 'sUSD' }),
			owner,
			tryGetProperty({ property: 'currencyKey', otherwise: toBytes32('sUSD') }),
			tryGetProperty({ property: 'totalSupply', otherwise: '0' }),
			tryGetAddressOf('AddressResolver'),
		],
		EternalStorage: [owner, tryGetAddressOf(forContract)],
		FeePoolEternalStorage: [owner, tryGetAddressOf('FeePool')],
		DelegateApprovals: [owner, tryGetAddressOf('EternalStorageDelegateApprovals')],
		Liquidator: [owner, tryGetAddressOf('AddressResolver')],
		LiquidatorRewards: [owner, tryGetAddressOf('AddressResolver')],
		CollateralManagerState: [owner, tryGetAddressOf('CollateralManager')],
		CollateralManager: [
			tryGetAddressOf('CollateralManagerState'),
			owner,
			tryGetAddressOf('AddressResolver'),
			toUnit(50000000),
			0,
			0,
			0,
		],
		CollateralUtil: [tryGetAddressOf('AddressResolver')],
		Collateral: [
			owner,
			tryGetAddressOf('CollateralManager'),
			tryGetAddressOf('AddressResolver'),
			toBytes32('sUSD'),
			toUnit(1.3),
			toUnit(100),
		],
		CollateralEth: [
			owner,
			tryGetAddressOf('CollateralManager'),
			tryGetAddressOf('AddressResolver'),
			toBytes32('sETH'),
			toUnit(1.3),
			toUnit(2),
		],
		CollateralShort: [
			owner,
			tryGetAddressOf('CollateralManager'),
			tryGetAddressOf('AddressResolver'),
			toBytes32('sUSD'),
			toUnit(1.2),
			toUnit(100),
		],
		WETH: [],
		SynthRedeemer: [tryGetAddressOf('AddressResolver')],
		FuturesMarketManager: [owner, tryGetAddressOf('AddressResolver')],
		FuturesMarketSettings: [owner, tryGetAddressOf('AddressResolver')],
		FuturesMarketBTC: [
			tryGetAddressOf('AddressResolver'),
			toBytes32('sBTC'), // base asset
			toBytes32('sBTC' + perpSuffix), // market key
		],
		FuturesMarketETH: [
			tryGetAddressOf('AddressResolver'),
			toBytes32('sETH'), // base asset
			toBytes32('sETH' + perpSuffix), // market key
		],
		FuturesMarketData: [tryGetAddressOf('AddressResolver')],
		// Perps V2
		MockPyth: [60, 1],
		PerpsV2ExchangeRate: [owner, tryGetAddressOf('AddressResolver')],
		PerpsV2MarketSettings: [owner, tryGetAddressOf('AddressResolver')],
		PerpsV2MarketData: [tryGetAddressOf('AddressResolver')],
		PerpsV2MarketStateBTC: [
			owner,
			[deployerAccount],
			toBytes32('sBTC'), // base asset
			toBytes32('sBTC' + perpSuffix), // market key
		],
		PerpsV2MarketStateETH: [
			owner,
			[deployerAccount],
			toBytes32('sETH'), // base asset
			toBytes32('sETH' + perpSuffix), // market key
		],
		ProxyPerpsV2MarketBTC: [owner],
		ProxyPerpsV2MarketETH: [owner],
		PerpsV2MarketViewsBTC: [
			tryGetAddressOf('PerpsV2MarketStateBTC'),
			owner,
			tryGetAddressOf('AddressResolver'),
		],
		PerpsV2MarketViewsETH: [
			tryGetAddressOf('PerpsV2MarketStateETH'),
			owner,
			tryGetAddressOf('AddressResolver'),
		],
		PerpsV2DelayedOrderBTC: [
			tryGetAddressOf('ProxyPerpsV2MarketBTC'),
			tryGetAddressOf('PerpsV2MarketStateBTC'),
			owner,
			tryGetAddressOf('AddressResolver'),
		],
		PerpsV2OffchainOrderBTC: [
			tryGetAddressOf('ProxyPerpsV2MarketBTC'),
			tryGetAddressOf('PerpsV2MarketStateBTC'),
			owner,
			tryGetAddressOf('AddressResolver'),
		],
		PerpsV2MarketBTC: [
			tryGetAddressOf('ProxyPerpsV2MarketBTC'),
			tryGetAddressOf('PerpsV2MarketStateBTC'),
			owner,
			tryGetAddressOf('AddressResolver'),
		],
		PerpsV2MarketETH: [
			tryGetAddressOf('ProxyPerpsV2MarketETH'),
			tryGetAddressOf('PerpsV2MarketStateETH'),
			owner,
			tryGetAddressOf('AddressResolver'),
		],
	};

	let instance;
	try {
		instance = await create({
			constructorArgs: args.length > 0 ? args : defaultArgs[contract],
		});
		// Show contracts creating for debugging purposes
		if (process.env.DEBUG) {
			log(
				'Deployed',
				contract + (source ? ` (${source})` : '') + (forContract ? ' for ' + forContract : ''),
				mock ? 'mock of ' + mock : '',
				'to',
				instance.address
			);
			if (contract.startsWith('PerpsV2Market') || contract.startsWith('ProxyPerpsV2Market')) {
				log('Deployed with default args:', defaultArgs[contract], 'and args:', args);
			}
		}
	} catch (err) {
		throw new Error(
			`Failed to deploy ${contract}. Does it have defaultArgs setup?\n\t└─> Caused by ${err.toString()}`
		);
	}

	const postDeployTasks = {
		async Synthetix() {
			// first give all SNX supply to the owner (using the hack that the deployerAccount was setup as the associatedContract via
			// the constructor args)
			await cache['TokenStateSynthetix'].setBalanceOf(owner, SUPPLY_100M, {
				from: deployerAccount,
			});

			// then configure everything else (including setting the associated contract of TokenState back to the Synthetix contract)
			await Promise.all(
				[
					(cache['TokenStateSynthetix'].setAssociatedContract(instance.address, { from: owner }),
					cache['ProxySynthetix'].setTarget(instance.address, { from: owner }),
					cache['ProxyERC20Synthetix'].setTarget(instance.address, { from: owner }),
					instance.setProxy(cache['ProxyERC20Synthetix'].address, {
						from: owner,
					})),
				]
					.concat(
						// If there's a SupplySchedule and it has the method we need (i.e. isn't a mock)
						tryInvocationIfNotMocked({
							name: 'SupplySchedule',
							fncName: 'setSynthetixProxy',
							args: [cache['ProxyERC20Synthetix'].address],
						}) || []
					)
					.concat(
						// If there's an escrow that's not a mock
						tryInvocationIfNotMocked({
							name: 'SynthetixEscrow',
							fncName: 'setSynthetix',
							args: [instance.address],
						}) || []
					)
					.concat(
						// If there's a reward escrow that's not a mock
						tryInvocationIfNotMocked({
							name: 'RewardEscrow',
							fncName: 'setSynthetix',
							args: [instance.address],
						}) || []
					)
					.concat(
						// If there's a rewards distribution that's not a mock
						tryInvocationIfNotMocked({
							name: 'RewardsDistribution',
							fncName: 'setAuthority',
							args: [instance.address],
						}) || []
					)
					.concat(
						tryInvocationIfNotMocked({
							name: 'RewardsDistribution',
							fncName: 'setSynthetixProxy',
							args: [cache['ProxyERC20Synthetix'].address], // will fail if no Proxy instantiated for Synthetix
						}) || []
					)
			);
		},
		async BaseSynthetix() {
			// first give all SNX supply to the owner (using the hack that the deployerAccount was setup as the associatedContract via
			// the constructor args)
			await cache['TokenStateBaseSynthetix'].setBalanceOf(owner, SUPPLY_100M, {
				from: deployerAccount,
			});

			// then configure everything else (including setting the associated contract of TokenState back to the Synthetix contract)
			await Promise.all(
				[
					(cache['TokenStateBaseSynthetix'].setAssociatedContract(instance.address, {
						from: owner,
					}),
					cache['ProxyBaseSynthetix'].setTarget(instance.address, { from: owner }),
					cache['ProxyERC20BaseSynthetix'].setTarget(instance.address, { from: owner }),
					instance.setProxy(cache['ProxyERC20BaseSynthetix'].address, {
						from: owner,
					})),
				]
					.concat(
						// If there's a rewards distribution that's not a mock
						tryInvocationIfNotMocked({
							name: 'RewardsDistribution',
							fncName: 'setAuthority',
							args: [instance.address],
						}) || []
					)
					.concat(
						tryInvocationIfNotMocked({
							name: 'RewardsDistribution',
							fncName: 'setSynthetixProxy',
							args: [cache['ProxyERC20BaseSynthetix'].address], // will fail if no Proxy instantiated for BaseSynthetix
						}) || []
					)
			);
		},
		async MintableSynthetix() {
			// first give all SNX supply to the owner (using the hack that the deployerAccount was setup as the associatedContract via
			// the constructor args)
			await cache['TokenStateMintableSynthetix'].setBalanceOf(owner, SUPPLY_100M, {
				from: deployerAccount,
			});

			// then configure everything else (including setting the associated contract of TokenState back to the Synthetix contract)
			await Promise.all(
				[
					(cache['TokenStateMintableSynthetix'].setAssociatedContract(instance.address, {
						from: owner,
					}),
					cache['ProxyMintableSynthetix'].setTarget(instance.address, { from: owner }),
					cache['ProxyERC20MintableSynthetix'].setTarget(instance.address, { from: owner }),
					instance.setProxy(cache['ProxyERC20MintableSynthetix'].address, {
						from: owner,
					})),
				]
					.concat(
						// If there's a rewards distribution that's not a mock
						tryInvocationIfNotMocked({
							name: 'RewardsDistribution',
							fncName: 'setAuthority',
							args: [instance.address],
						}) || []
					)
					.concat(
						tryInvocationIfNotMocked({
							name: 'RewardsDistribution',
							fncName: 'setSynthetixProxy',
							args: [cache['ProxyERC20MintableSynthetix'].address], // will fail if no Proxy instantiated for MintableSynthetix
						}) || []
					)
			);
		},
		async Synth() {
			await Promise.all(
				[
					cache['TokenStateSynth'].setAssociatedContract(instance.address, { from: owner }),
					cache['ProxyERC20Synth'].setTarget(instance.address, { from: owner }),
				] || []
			);
		},
		async FeePool() {
			await Promise.all(
				[]
					.concat(
						tryInvocationIfNotMocked({
							name: 'ProxyFeePool',
							fncName: 'setTarget',
							args: [instance.address],
						}) || []
					)
					.concat(
						tryInvocationIfNotMocked({
							name: 'FeePoolEternalStorage',
							fncName: 'setAssociatedContract',
							args: [instance.address],
						}) || []
					)
					.concat(
						tryInvocationIfNotMocked({
							name: 'RewardEscrow',
							fncName: 'setFeePool',
							args: [instance.address],
						}) || []
					)
			);
		},
		async Issuer() {
			await Promise.all([
				cache['SystemStatus'].updateAccessControl(
					toBytes32('Issuance'),
					instance.address,
					true,
					false,
					{ from: owner }
				),
			]);
		},
		async DelegateApprovals() {
			await cache['EternalStorageDelegateApprovals'].setAssociatedContract(instance.address, {
				from: owner,
			});
		},
		async Exchanger() {
			await Promise.all([
				cache['ExchangeState'].setAssociatedContract(instance.address, { from: owner }),
			]);
		},
		async ExchangeCircuitBreaker() {
			await Promise.all([
				cache['SystemStatus'].updateAccessControl(
					toBytes32('Synth'),
					instance.address,
					true,
					false,
					{ from: owner }
				),
			]);
		},
		async ExchangerWithFeeRecAlternatives() {
			await Promise.all([
				cache['ExchangeState'].setAssociatedContract(instance.address, { from: owner }),

				cache['SystemStatus'].updateAccessControl(
					toBytes32('Synth'),
					instance.address,
					true,
					false,
					{ from: owner }
				),
			]);
		},

		async CollateralManager() {
			await cache['CollateralManagerState'].setAssociatedContract(instance.address, {
				from: owner,
			});
		},

		async RewardEscrowV2() {
			await Promise.all([
				cache['RewardEscrowV2Storage'].setAssociatedContract(instance.address, { from: owner }),
				cache['RewardEscrowV2Storage'].setFallbackRewardEscrow(
					cache['RewardEscrowV2Frozen'].address,
					{ from: owner }
				),
			]);
		},

		async ImportableRewardEscrowV2() {
			await Promise.all([
				cache['RewardEscrowV2Storage'].setAssociatedContract(instance.address, { from: owner }),
				cache['RewardEscrowV2Storage'].setFallbackRewardEscrow(
					cache['RewardEscrowV2Frozen'].address,
					{ from: owner }
				),
			]);
		},

		async SystemStatus() {
			// ensure the owner has suspend/resume control over everything
			await instance.updateAccessControls(
				['System', 'Issuance', 'Exchange', 'SynthExchange', 'Synth', 'Futures'].map(toBytes32),
				[owner, owner, owner, owner, owner, owner],
				[true, true, true, true, true, true],
				[true, true, true, true, true, true],
				{ from: owner }
			);
		},
		async FuturesMarketBTC() {
			await Promise.all([
				cache['FuturesMarketManager'].addMarkets([instance.address], { from: owner }),
			]);
		},
		async FuturesMarketETH() {
			await Promise.all([
				cache['FuturesMarketManager'].addMarkets([instance.address], { from: owner }),
			]);
		},
		async PerpsV2MarketViewsBTC() {
			const filteredFunctions = getFunctionSignatures(instance, excludedFunctions);

			await Promise.all(
				filteredFunctions.map(e =>
					cache['ProxyPerpsV2MarketBTC'].addRoute(e.signature, instance.address, e.isView, {
						from: owner,
					})
				)
			);
		},
		async PerpsV2MarketViewsETH() {
			const filteredFunctions = getFunctionSignatures(instance, excludedFunctions);

			await Promise.all(
				filteredFunctions.map(e =>
					cache['ProxyPerpsV2MarketETH'].addRoute(e.signature, instance.address, e.isView, {
						from: owner,
					})
				)
			);
		},
		async PerpsV2DelayedOrderBTC() {
			const filteredFunctions = getFunctionSignatures(instance, excludedFunctions);

			await Promise.all([
				cache['PerpsV2MarketStateBTC'].removeAssociatedContracts([deployerAccount], {
					from: owner,
				}),
				cache['PerpsV2MarketStateBTC'].addAssociatedContracts([instance.address], {
					from: owner,
				}),
				instance.setProxy(cache['ProxyPerpsV2MarketBTC'].address, { from: owner }),
				...filteredFunctions.map(e =>
					cache['ProxyPerpsV2MarketBTC'].addRoute(e.signature, instance.address, e.isView, {
						from: owner,
					})
				),
			]);
		},
		async PerpsV2OffchainOrderBTC() {
			const filteredFunctions = getFunctionSignatures(instance, excludedFunctions);

			await Promise.all([
				cache['PerpsV2MarketStateBTC'].removeAssociatedContracts([deployerAccount], {
					from: owner,
				}),
				cache['PerpsV2MarketStateBTC'].addAssociatedContracts([instance.address], {
					from: owner,
				}),
				instance.setProxy(cache['ProxyPerpsV2MarketBTC'].address, { from: owner }),
				...filteredFunctions.map(e =>
					cache['ProxyPerpsV2MarketBTC'].addRoute(e.signature, instance.address, e.isView, {
						from: owner,
					})
				),
			]);
		},
		async PerpsV2MarketBTC() {
			await Promise.all([
				instance.setProxy(cache['ProxyPerpsV2MarketBTC'].address, { from: owner }),
				cache['PerpsV2MarketStateBTC'].removeAssociatedContracts([deployerAccount], {
					from: owner,
				}),
				cache['PerpsV2MarketStateBTC'].addAssociatedContracts([instance.address], {
					from: owner,
				}),
				cache['ProxyPerpsV2MarketBTC'].setTarget(instance.address, { from: owner }),
				cache['FuturesMarketManager'].addProxiedMarkets([cache['ProxyPerpsV2MarketBTC'].address], {
					from: owner,
				}),
			]);
		},
		async PerpsV2MarketETH() {
			await Promise.all([
				instance.setProxy(cache['ProxyPerpsV2MarketETH'].address, { from: owner }),
				cache['PerpsV2MarketStateETH'].removeAssociatedContracts([deployerAccount], {
					from: owner,
				}),
				cache['PerpsV2MarketStateETH'].addAssociatedContracts([instance.address], {
					from: owner,
				}),
				cache['ProxyPerpsV2MarketETH'].setTarget(instance.address, { from: owner }),
				cache['FuturesMarketManager'].addProxiedMarkets([cache['ProxyPerpsV2MarketETH'].address], {
					from: owner,
				}),
			]);
		},
		async GenericMock() {
			if (mock === 'RewardEscrow' || mock === 'SynthetixEscrow') {
				await mockGenericContractFnc({ instance, mock, fncName: 'balanceOf', returns: ['0'] });
			} else if (mock === 'EtherWrapper') {
				await mockGenericContractFnc({
					instance,
					mock,
					fncName: 'totalIssuedSynths',
					returns: ['0'],
				});
			} else if (mock === 'WrapperFactory') {
				await Promise.all([
					mockGenericContractFnc({
						instance,
						mock,
						fncName: 'isWrapper',
						returns: [false],
					}),
				]);
			} else if (mock === 'FeePool') {
				await Promise.all([
					mockGenericContractFnc({
						instance,
						mock,
						fncName: 'FEE_ADDRESS',
						returns: [getUsers({ network: 'mainnet', user: 'fee' }).address],
					}),
				]);
			} else if (mock === 'Exchanger') {
				await Promise.all([
					mockGenericContractFnc({
						instance,
						mock,
						fncName: 'feeRateForExchange',
						returns: [toWei('0.0030')],
					}),
				]);
			} else if (mock === 'Issuer') {
				await Promise.all([
					mockGenericContractFnc({
						instance,
						mock,
						fncName: 'debtBalanceOf',
						returns: [toWei('0')],
					}),
				]);
			} else if (mock === 'ExchangeState') {
				await Promise.all([
					mockGenericContractFnc({
						instance,
						mock,
						fncName: 'getLengthOfEntries',
						returns: ['0'],
					}),
					mockGenericContractFnc({
						instance,
						mock,
						fncName: 'getMaxTimestamp',
						returns: ['0'],
					}),
				]);
			} else if (mock === 'CollateralManager') {
				await Promise.all([
					mockGenericContractFnc({
						instance,
						mock,
						fncName: 'isSynthManaged',
						returns: [false],
					}),
				]);
			} else if (mock === 'FuturesMarketManager') {
				await Promise.all([
					mockGenericContractFnc({
						instance,
						mock,
						fncName: 'totalDebt',
						returns: ['0', false],
					}),
				]);
			} else if (mock === 'FuturesMarket') {
				await Promise.all([
					mockGenericContractFnc({
						instance,
						mock,
						fncName: 'recomputeFunding',
						returns: ['0'],
					}),
				]);
			} else if (mock === 'PerpsV2Market') {
				await Promise.all([
					mockGenericContractFnc({
						instance,
						mock,
						fncName: 'recomputeFunding',
						returns: ['0'],
					}),
				]);
			}
		},
	};

	// now run any postDeploy tasks (connecting contracts together)
	if (!skipPostDeploy && postDeployTasks[contract]) {
		await postDeployTasks[contract]();
	}

	return instance;
};

const setupAllContracts = async ({
	accounts,
	existing = {},
	mocks = {},
	contracts = [],
	synths = [],
	feeds = [],
}) => {
	const [, owner] = accounts;

	// Copy mocks into the return object, this allows us to include them in the
	// AddressResolver
	const returnObj = Object.assign({}, mocks, existing);

	// BASE CONTRACTS

	// Note: those with deps need to be listed AFTER their deps
	// Note: deps are based on the contract's resolver name, allowing different contracts to be used
	// for the same dependency (e.g. in l1/l2 configurations)
	const baseContracts = [
		{ contract: 'AddressResolver' },
		{
			contract: 'OneNetAggregatorIssuedSynths',
			resolverAlias: 'ext:AggregatorIssuedSynths',
		},
		{
			contract: 'OneNetAggregatorDebtRatio',
			resolverAlias: 'ext:AggregatorDebtRatio',
		},
		{ contract: 'SystemStatus' },
		{ contract: 'ExchangeState' },
		{ contract: 'FlexibleStorage', deps: ['AddressResolver'] },
		{
			contract: 'SystemSettings',
			deps: ['AddressResolver', 'FlexibleStorage'],
		},
		{
			contract: 'DirectIntegrationManager',
			deps: ['AddressResolver', 'SystemSettings'],
		},
		{
			contract: 'ExchangeRates',
			deps: ['AddressResolver', 'SystemSettings', 'CircuitBreaker'],
			mocks: ['ExchangeCircuitBreaker'],
		},
		{ contract: 'SynthetixDebtShare' },
		{ contract: 'SupplySchedule' },
		{ contract: 'ProxyERC20', forContract: 'Synthetix' },
		{ contract: 'ProxyERC20', forContract: 'MintableSynthetix' },
		{ contract: 'ProxyERC20', forContract: 'BaseSynthetix' },
		{ contract: 'ProxyERC20', forContract: 'Synth' }, // for generic synth
		{ contract: 'Proxy', forContract: 'Synthetix' },
		{ contract: 'Proxy', forContract: 'MintableSynthetix' },
		{ contract: 'Proxy', forContract: 'BaseSynthetix' },
		{ contract: 'Proxy', forContract: 'FeePool' },
		{ contract: 'TokenState', forContract: 'Synthetix' },
		{ contract: 'TokenState', forContract: 'MintableSynthetix' },
		{ contract: 'TokenState', forContract: 'BaseSynthetix' },
		{ contract: 'TokenState', forContract: 'Synth' }, // for generic synth
		{ contract: 'RewardEscrow' },
		{
			contract: 'BaseRewardEscrowV2Frozen',
			deps: ['AddressResolver'],
			mocks: ['Synthetix', 'FeePool', 'Issuer'],
		},
		{
			contract: 'RewardEscrowV2Frozen',
			deps: ['AddressResolver'],
			mocks: ['Synthetix', 'FeePool', 'Issuer'],
		},
		{
			contract: 'RewardEscrowV2Storage',
			deps: ['RewardEscrowV2Frozen'],
			mocks: ['Synthetix', 'FeePool', 'RewardEscrow', 'SynthetixBridgeToOptimism', 'Issuer'],
		},
		{
			contract: 'BaseRewardEscrowV2',
			deps: ['AddressResolver', 'RewardEscrowV2Storage'],
			mocks: ['Synthetix', 'FeePool', 'Issuer'],
		},
		{
			contract: 'RewardEscrowV2',
			deps: ['AddressResolver', 'SystemStatus', 'RewardEscrowV2Storage'],
			mocks: ['Synthetix', 'FeePool', 'RewardEscrow', 'SynthetixBridgeToOptimism', 'Issuer'],
		},
		{
			contract: 'ImportableRewardEscrowV2',
			resolverAlias: `RewardEscrowV2`,
			deps: ['AddressResolver', 'RewardEscrowV2Storage'],
			mocks: ['Synthetix', 'FeePool', 'SynthetixBridgeToBase', 'Issuer'],
		},
		{ contract: 'SynthetixEscrow' },
		{ contract: 'FeePoolEternalStorage' },
		{ contract: 'EternalStorage', forContract: 'DelegateApprovals' },
		{ contract: 'DelegateApprovals', deps: ['EternalStorage'] },
		{ contract: 'EternalStorage', forContract: 'Liquidator' },
		{
			contract: 'Liquidator',
			deps: ['AddressResolver', 'EternalStorage', 'FlexibleStorage', 'SynthetixEscrow'],
		},
		{
			contract: 'LiquidatorRewards',
			deps: ['AddressResolver', 'Liquidator', 'Issuer', 'RewardEscrowV2', 'Synthetix'],
		},
		{
			contract: 'RewardsDistribution',
			mocks: ['Synthetix', 'FeePool', 'RewardEscrow', 'RewardEscrowV2', 'ProxyFeePool'],
		},
		{ contract: 'Depot', deps: ['AddressResolver', 'SystemStatus'] },
		{ contract: 'SynthUtil', deps: ['AddressResolver'] },
		{ contract: 'DappMaintenance' },
		{ contract: 'WETH' },
		{
			contract: 'EtherWrapper',
			mocks: [],
			deps: ['AddressResolver', 'WETH'],
		},
		{
			contract: 'NativeEtherWrapper',
			mocks: [],
			deps: ['AddressResolver', 'EtherWrapper', 'WETH', 'SynthsETH'],
		},
		{
			contract: 'WrapperFactory',
			mocks: [],
			deps: ['AddressResolver', 'SystemSettings'],
		},
		{
			contract: 'SynthRedeemer',
			mocks: ['Issuer'],
			deps: ['AddressResolver'],
		},
		{
			contract: 'DebtCache',
			mocks: ['Issuer', 'Exchanger', 'CollateralManager', 'EtherWrapper', 'FuturesMarketManager'],
			deps: ['ExchangeRates', 'SystemStatus'],
		},
		{
			contract: 'Issuer',
			mocks: [
				'CollateralManager',
				'Synthetix',
				'Exchanger',
				'FeePool',
				'DelegateApprovals',
				'FlexibleStorage',
				'WrapperFactory',
				'EtherWrapper',
				'SynthRedeemer',
			],
			deps: [
				'OneNetAggregatorIssuedSynths',
				'OneNetAggregatorDebtRatio',
				'AddressResolver',
				'SystemStatus',
				'FlexibleStorage',
				'DebtCache',
				'SynthetixDebtShare',
			],
		},
		{
			contract: 'CircuitBreaker',
			mocks: ['Issuer', 'ExchangeRates'],
			deps: ['AddressResolver', 'SystemStatus', 'FlexibleStorage'],
		},
		{
			contract: 'ExchangeCircuitBreaker',
			mocks: ['Synthetix', 'FeePool', 'DelegateApprovals', 'VirtualSynthMastercopy'],
			deps: ['AddressResolver', 'SystemStatus', 'ExchangeRates', 'FlexibleStorage', 'Issuer'],
		},
		{
			contract: 'Exchanger',
			mocks: ['Synthetix', 'FeePool', 'DelegateApprovals'],
			deps: [
				'AddressResolver',
				'DirectIntegrationManager',
				'TradingRewards',
				'SystemStatus',
				'ExchangeRates',
				'ExchangeState',
				'FlexibleStorage',
				'DebtCache',
				'CircuitBreaker',
			],
		},
		{
			contract: 'ExchangeRatesWithDexPricing',
			resolverAlias: 'ExchangeRates',
			deps: ['AddressResolver', 'DirectIntegrationManager', 'CircuitBreaker'],
		},
		{
			contract: 'ExchangerWithFeeRecAlternatives',
			resolverAlias: 'Exchanger',
			mocks: [
				'Synthetix',
				'CircuitBreaker',
				'ExchangeRates',
				'FeePool',
				'DelegateApprovals',
				'VirtualSynthMastercopy',
			],
			deps: [
				'AddressResolver',
				'DirectIntegrationManager',
				'TradingRewards',
				'SystemStatus',
				'ExchangeRates',
				'ExchangeState',
				'FlexibleStorage',
				'DebtCache',
				'CircuitBreaker',
			],
		},
		{
			contract: 'Synth',
			mocks: ['Issuer', 'Exchanger', 'FeePool', 'EtherWrapper', 'WrapperFactory'],
			deps: ['TokenState', 'ProxyERC20', 'SystemStatus', 'AddressResolver'],
		}, // a generic synth
		{
			contract: 'Synthetix',
			mocks: [
				'Exchanger',
				'SupplySchedule',
				'RewardEscrow',
				'RewardEscrowV2',
				'SynthetixEscrow',
				'RewardsDistribution',
				'Liquidator',
				'LiquidatorRewards',
			],
			deps: ['Issuer', 'Proxy', 'ProxyERC20', 'AddressResolver', 'TokenState', 'SystemStatus'],
		},
		{
			contract: 'BaseSynthetix',
			resolverAlias: 'Synthetix',
			mocks: [
				'Exchanger',
				'RewardEscrow',
				'RewardEscrowV2',
				'SynthetixEscrow',
				'RewardsDistribution',
				'Liquidator',
				'LiquidatorRewards',
			],
			deps: ['Issuer', 'Proxy', 'ProxyERC20', 'AddressResolver', 'TokenState', 'SystemStatus'],
		},
		{
			contract: 'MintableSynthetix',
			resolverAlias: 'Synthetix',
			mocks: [
				'Exchanger',
				'SynthetixEscrow',
				'Liquidator',
				'LiquidatorRewards',
				'Issuer',
				'SystemStatus',
				'SynthetixBridgeToBase',
			],
			deps: [
				'Proxy',
				'ProxyERC20',
				'AddressResolver',
				'TokenState',
				'RewardsDistribution',
				'RewardEscrow',
				'RewardEscrowV2',
			],
		},
		{
			contract: 'SynthetixBridgeToOptimism',
			mocks: [
				'ext:Messenger',
				'ovm:SynthetixBridgeToBase',
				'FeePool',
				'SynthetixBridgeEscrow',
				'RewardsDistribution',
			],
			deps: ['AddressResolver', 'Issuer', 'RewardEscrowV2', 'Synthetix'],
		},
		{
			contract: 'SynthetixBridgeToBase',
			mocks: ['ext:Messenger', 'base:SynthetixBridgeToOptimism', 'FeePool', 'RewardEscrowV2'],
			deps: ['AddressResolver', 'Synthetix'],
		},
		{
			contract: 'SynthetixBridgeEscrow',
			mocks: [],
			deps: [],
		},
		{ contract: 'TradingRewards', deps: ['AddressResolver', 'Synthetix'] },
		{
			contract: 'FeePool',
			mocks: [
				'Synthetix',
				'Exchanger',
				'Issuer',
				'RewardEscrow',
				'RewardEscrowV2',
				'DelegateApprovals',
				'FeePoolEternalStorage',
				'RewardsDistribution',
				'FlexibleStorage',
				'CollateralManager',
				'EtherWrapper',
				'FuturesMarketManager',
				'WrapperFactory',
				'SynthetixBridgeToOptimism',
			],
			deps: [
				'OneNetAggregatorIssuedSynths',
				'OneNetAggregatorDebtRatio',
				'SystemStatus',
				'SynthetixDebtShare',
				'AddressResolver',
			],
		},
		{
			contract: 'CollateralState',
			deps: [],
		},
		{
			contract: 'CollateralManagerState',
			deps: [],
		},
		{
			contract: 'CollateralUtil',
			deps: ['AddressResolver', 'ExchangeRates'],
		},
		{
			contract: 'CollateralManager',
			deps: [
				'AddressResolver',
				'SystemStatus',
				'Issuer',
				'ExchangeRates',
				'DebtCache',
				'CollateralUtil',
				'CollateralManagerState',
			],
		},
		{
			contract: 'Collateral',
			deps: ['CollateralManager', 'AddressResolver', 'CollateralUtil'],
		},
		{
			contract: 'CollateralEth',
			deps: ['Collateral', 'CollateralManager', 'AddressResolver', 'CollateralUtil'],
		},
		{
			contract: 'CollateralShort',
			deps: ['Collateral', 'CollateralManager', 'AddressResolver', 'CollateralUtil'],
		},
		{
			contract: 'FuturesMarketManager',
			deps: [
				'AddressResolver',
				'Exchanger' /*, 'FuturesMarketSettings', 'ExchangeCircuitBreaker' */,
			],
		},
		{
			contract: 'FuturesMarketSettings',
			deps: ['AddressResolver', 'FlexibleStorage'],
		},
		// perps v1 - "futures"
		{
			contract: 'FuturesMarketBTC',
			source: 'TestableFuturesMarket',
			deps: [
				'AddressResolver',
				'FuturesMarketManager',
				'FuturesMarketSettings',
				'SystemStatus',
				'FlexibleStorage',
				'ExchangeCircuitBreaker',
			],
		},
		{
			contract: 'FuturesMarketETH',
			source: 'TestableFuturesMarket',
			deps: [
				'AddressResolver',
				'FuturesMarketManager',
				'FuturesMarketSettings',
				'FlexibleStorage',
				'ExchangeCircuitBreaker',
			],
		},
		{ contract: 'FuturesMarketData', deps: ['FuturesMarketSettings'] },

		// Perps v2
		{ contract: 'PerpsV2ExchangeRate', deps: ['AddressResolver', 'FlexibleStorage'] },
		{ contract: 'Proxy', source: 'ProxyPerpsV2', forContract: 'PerpsV2MarketBTC' },
		{ contract: 'Proxy', source: 'ProxyPerpsV2', forContract: 'PerpsV2MarketETH' },
		{
			contract: 'PerpsV2MarketStateBTC',
			source: 'PerpsV2MarketState',
		},
		{
			contract: 'PerpsV2MarketStateETH',
			source: 'PerpsV2MarketState',
		},
		{ contract: 'PerpsV2MarketSettings', deps: ['AddressResolver', 'FlexibleStorage'] },
		{ contract: 'PerpsV2MarketData', deps: ['PerpsV2MarketSettings'] },
		{
			contract: 'PerpsV2MarketViewsBTC',
			source: 'PerpsV2MarketViews',
			deps: [
				'ProxyPerpsV2MarketBTC',
				'PerpsV2MarketStateBTC',
				'PerpsV2MarketSettings',
				'AddressResolver',
				'FlexibleStorage',
				'ExchangeRates',
				'PerpsV2ExchangeRate',
			],
		},
		{
			contract: 'PerpsV2MarketViewsETH',
			source: 'PerpsV2MarketViews',
			deps: [
				'ProxyPerpsV2MarketETH',
				'PerpsV2MarketStateETH',
				'PerpsV2MarketSettings',
				'AddressResolver',
				'FlexibleStorage',
				'ExchangeRates',
				'PerpsV2ExchangeRate',
			],
		},
		{
			contract: 'PerpsV2DelayedOrderBTC',
			source: 'PerpsV2MarketDelayedOrders',
			deps: [
				'ProxyPerpsV2MarketETH',
				'PerpsV2MarketStateETH',
				'PerpsV2MarketSettings',
				'AddressResolver',
				'FlexibleStorage',
				'ExchangeRates',
				'PerpsV2ExchangeRate',
			],
		},
		{
			contract: 'PerpsV2OffchainOrderBTC',
			source: 'PerpsV2MarketDelayedOrdersOffchain',
			deps: [
				'ProxyPerpsV2MarketETH',
				'PerpsV2MarketStateETH',
				'PerpsV2MarketSettings',
				'AddressResolver',
				'FlexibleStorage',
				'ExchangeRates',
				'PerpsV2ExchangeRate',
			],
		},
		{
			contract: 'PerpsV2MarketBTC',
			source: 'TestablePerpsV2Market',
			deps: [
				'ProxyPerpsV2MarketBTC',
				'PerpsV2MarketStateBTC',
				'PerpsV2MarketViewsBTC',
				'PerpsV2DelayedOrderBTC',
				'PerpsV2OffchainOrderBTC',
				'PerpsV2MarketSettings',
				'AddressResolver',
				'FuturesMarketManager',
				'FlexibleStorage',
				'ExchangeRates',
				'PerpsV2ExchangeRate',
			],
		},
		{
			contract: 'PerpsV2MarketETH',
			source: 'TestablePerpsV2Market',
			deps: [
				'ProxyPerpsV2MarketETH',
				'PerpsV2MarketStateETH',
				'PerpsV2MarketViewsETH',
				'PerpsV2NextPriceETH',
				'PerpsV2MarketSettings',
				'AddressResolver',
				'FuturesMarketManager',
				'FlexibleStorage',
				'ExchangeRates',
				'PerpsV2ExchangeRate',
			],
		},
	];

	// check contract list for contracts with the same address resolver name
	const checkConflictsInDeclaredContracts = ({ contractList }) => {
		// { resolverName: [contract1, contract2, ...], ... }
		const resolverNameToContracts = baseContracts
			.filter(({ contract }) => contractList.includes(contract))
			.filter(({ forContract }) => !forContract) // ignore proxies
			.map(({ contract, resolverAlias }) => [contract, resolverAlias || contract])
			.reduce((memo, [name, resolverName]) => {
				memo[resolverName] = [].concat(memo[resolverName] || [], name);
				return memo;
			}, {});
		// [[resolverName, [contract1, contract2, ...]]]
		const conflicts = Object.entries(resolverNameToContracts).filter(
			([resolverName, contracts]) => contracts.length > 1
		);

		if (conflicts.length) {
			const errorStr = conflicts.map(
				([resolverName, contracts]) => `[${contracts.join(',')}] conflict for ${resolverName}`
			);

			throw new Error(`Conflicting contracts declared in setup: ${errorStr}`);
		}
	};

	// get deduped list of all required base contracts
	const findAllAssociatedContracts = ({ contractList }) => {
		return Array.from(
			new Set(
				baseContracts
					.filter(({ contract }) => contractList.includes(contract))
					.reduce(
						(memo, { contract, deps = [] }) =>
							memo.concat(contract).concat(findAllAssociatedContracts({ contractList: deps })),
						[]
					)
			)
		);
	};

	// contract names the user requested - could be a list of strings or objects with a "contract" property
	const contractNamesRequested = contracts.map(contract => contract.contract || contract);

	// ensure user didn't specify conflicting contracts
	checkConflictsInDeclaredContracts({ contractList: contractNamesRequested });

	// get list of resolver aliases from declared contracts
	const namesResolvedThroughAlias = contractNamesRequested
		.map(contractName => baseContracts.find(({ contract }) => contract === contractName))
		.map(({ resolverAlias }) => resolverAlias)
		.filter(resolverAlias => !!resolverAlias);

	// now go through all contracts and compile a list of them and all nested dependencies
	const contractsRequired = findAllAssociatedContracts({ contractList: contractNamesRequested });

	// now sort in dependency order
	const contractsToFetch = baseContracts.filter(
		({ contract, forContract }) =>
			// keep if contract is required
			contractsRequired.includes(contract) &&
			// ignore if contract has been aliased
			!namesResolvedThroughAlias.includes(contract) &&
			// and either there is no "forContract" or the forContract is itself required
			(!forContract || contractsRequired.includes(forContract)) &&
			// and no entry in the existingContracts object
			!(contract in existing)
	);

	// now setup each contract in serial in case we have deps we need to load
	for (const { contract, source, resolverAlias, mocks = [], forContract } of contractsToFetch) {
		// mark each mock onto the returnObj as true when it doesn't exist, indicating it needs to be
		// put through the AddressResolver
		// for all mocks required for this contract
		await Promise.all(
			mocks
				// if the target isn't on the returnObj (i.e. already mocked / created) and not in the list of contracts
				.filter(mock => !(mock in returnObj) && contractNamesRequested.indexOf(mock) < 0)
				// then setup the contract
				.map(mock =>
					setupContract({
						accounts,
						mock,
						contract: 'GenericMock',
						cache: Object.assign({}, mocks, returnObj),
					}).then(instance => (returnObj[mock] = instance))
				)
		);

		// the name of the contract - the contract plus it's forContract
		// (e.g. Proxy + FeePool)
		const forContractName = forContract || '';

		// some contracts should be registered to the address resolver with a different name
		const contractRegistered = resolverAlias || contract;

		// deploy the contract
		returnObj[contractRegistered + forContractName] = await setupContract({
			accounts,
			contract,
			source,
			forContract,
			// the cache is a combination of the mocks and any return objects
			cache: Object.assign({}, mocks, returnObj),
			// pass through any properties that may be given for this contract
			properties:
				(contracts.find(({ contract: foundContract }) => foundContract === contract) || {})
					.properties || {},
		});
	}

	// SYNTHS

	const synthsToAdd = [];

	// now setup each synth and its deps
	for (const synth of synths) {
		const { token, proxy, tokenState } = await mockToken({
			accounts,
			synth,
			supply: 0, // add synths with 0 supply initially
			skipInitialAllocation: true,
			name: `Synth ${synth}`,
			symbol: synth,
		});

		returnObj[`ProxyERC20${synth}`] = proxy;
		returnObj[`TokenState${synth}`] = tokenState;
		returnObj[`Synth${synth}`] = token;

		// We'll defer adding the tokens into the Issuer as it must
		// be synchronised with the FlexibleStorage address first.
		synthsToAdd.push(token.address);
	}

	// now invoke AddressResolver to set all addresses
	if (returnObj['AddressResolver']) {
		if (process.env.DEBUG) {
			log(`Importing into AddressResolver:\n\t - ${Object.keys(returnObj).join('\n\t - ')}`);
		}

		await returnObj['AddressResolver'].importAddresses(
			Object.keys(returnObj).map(toBytes32),
			Object.values(returnObj).map(entry =>
				// use 0x1111 address for any mocks that have no actual deployment
				entry === true ? '0x' + '1'.repeat(40) : entry.address
			),
			{
				from: owner,
			}
		);
	}

	// now rebuild caches for all contracts that need it
	await Promise.all(
		Object.entries(returnObj)
			// keep items not in mocks
			.filter(([name]) => !(name in mocks))
			// and only those with the setResolver function
			.filter(([, instance]) => !!instance.rebuildCache)
			.map(([contract, instance]) => {
				return instance.rebuildCache().catch(err => {
					throw err;
				});
			})
	);

	// if deploying a real Synthetix, then we add the synths
	if (returnObj['Issuer'] && !mocks['Issuer']) {
		if (returnObj['Synth']) {
			returnObj['Issuer'].addSynth(returnObj['Synth'].address, { from: owner });
		}

		for (const synthAddress of synthsToAdd) {
			await returnObj['Issuer'].addSynth(synthAddress, { from: owner });
		}
	}

	// now setup defaults for the system (note: this dupes logic from the deploy script)
	if (returnObj['SystemSettings']) {
		await Promise.all([
			returnObj['SystemSettings'].setWaitingPeriodSecs(WAITING_PERIOD_SECS, { from: owner }),
			returnObj['SystemSettings'].setPriceDeviationThresholdFactor(
				PRICE_DEVIATION_THRESHOLD_FACTOR,
				{ from: owner }
			),
			returnObj['SystemSettings'].setIssuanceRatio(ISSUANCE_RATIO, { from: owner }),
			returnObj['SystemSettings'].setCrossDomainMessageGasLimit(0, CROSS_DOMAIN_DEPOSIT_GAS_LIMIT, {
				from: owner,
			}),
			returnObj['SystemSettings'].setCrossDomainMessageGasLimit(1, CROSS_DOMAIN_ESCROW_GAS_LIMIT, {
				from: owner,
			}),
			returnObj['SystemSettings'].setCrossDomainMessageGasLimit(2, CROSS_DOMAIN_REWARD_GAS_LIMIT, {
				from: owner,
			}),
			returnObj['SystemSettings'].setCrossDomainMessageGasLimit(
				3,
				CROSS_DOMAIN_WITHDRAWAL_GAS_LIMIT,
				{
					from: owner,
				}
			),
			returnObj['SystemSettings'].setFeePeriodDuration(FEE_PERIOD_DURATION, { from: owner }),
			returnObj['SystemSettings'].setTargetThreshold(TARGET_THRESHOLD, { from: owner }),
			returnObj['SystemSettings'].setLiquidationDelay(LIQUIDATION_DELAY, { from: owner }),
			returnObj['SystemSettings'].setLiquidationRatio(LIQUIDATION_RATIO, { from: owner }),
			returnObj['SystemSettings'].setLiquidationEscrowDuration(LIQUIDATION_ESCROW_DURATION, {
				from: owner,
			}),
			returnObj['SystemSettings'].setLiquidationPenalty(LIQUIDATION_PENALTY, {
				from: owner,
			}),
			returnObj['SystemSettings'].setSnxLiquidationPenalty(SNX_LIQUIDATION_PENALTY, {
				from: owner,
			}),
			returnObj['SystemSettings'].setSelfLiquidationPenalty(SELF_LIQUIDATION_PENALTY, {
				from: owner,
			}),
			returnObj['SystemSettings'].setFlagReward(FLAG_REWARD, { from: owner }),
			returnObj['SystemSettings'].setLiquidateReward(LIQUIDATE_REWARD, { from: owner }),
			returnObj['SystemSettings'].setRateStalePeriod(RATE_STALE_PERIOD, { from: owner }),
			returnObj['SystemSettings'].setExchangeDynamicFeeThreshold(
				constantsOverrides.EXCHANGE_DYNAMIC_FEE_THRESHOLD,
				{
					from: owner,
				}
			),
			returnObj['SystemSettings'].setExchangeDynamicFeeWeightDecay(
				constantsOverrides.EXCHANGE_DYNAMIC_FEE_WEIGHT_DECAY,
				{
					from: owner,
				}
			),
			returnObj['SystemSettings'].setExchangeDynamicFeeRounds(
				constantsOverrides.EXCHANGE_DYNAMIC_FEE_ROUNDS,
				{
					from: owner,
				}
			),
			returnObj['SystemSettings'].setExchangeMaxDynamicFee(
				constantsOverrides.EXCHANGE_MAX_DYNAMIC_FEE,
				{
					from: owner,
				}
			),
			returnObj['SystemSettings'].setMinimumStakeTime(MINIMUM_STAKE_TIME, { from: owner }),
			returnObj['SystemSettings'].setDebtSnapshotStaleTime(DEBT_SNAPSHOT_STALE_TIME, {
				from: owner,
			}),
			returnObj['SystemSettings'].setEtherWrapperMaxETH(ETHER_WRAPPER_MAX_ETH, {
				from: owner,
			}),
			returnObj['SystemSettings'].setEtherWrapperMintFeeRate(ETHER_WRAPPER_MINT_FEE_RATE, {
				from: owner,
			}),
			returnObj['SystemSettings'].setEtherWrapperBurnFeeRate(ETHER_WRAPPER_BURN_FEE_RATE, {
				from: owner,
			}),
			returnObj['SystemSettings'].setAtomicMaxVolumePerBlock(ATOMIC_MAX_VOLUME_PER_BLOCK, {
				from: owner,
			}),
			returnObj['SystemSettings'].setAtomicTwapWindow(ATOMIC_TWAP_WINDOW, {
				from: owner,
			}),
		]);

		// legacy futures
		if (returnObj['FuturesMarketSettings']) {
			const promises = [
				returnObj['FuturesMarketSettings'].setMinInitialMargin(FUTURES_MIN_INITIAL_MARGIN, {
					from: owner,
				}),
				returnObj['FuturesMarketSettings'].setMinKeeperFee(
					constantsOverrides.FUTURES_MIN_KEEPER_FEE,
					{
						from: owner,
					}
				),
				returnObj['FuturesMarketSettings'].setLiquidationFeeRatio(FUTURES_LIQUIDATION_FEE_RATIO, {
					from: owner,
				}),
				returnObj['FuturesMarketSettings'].setLiquidationBufferRatio(
					FUTURES_LIQUIDATION_BUFFER_RATIO,
					{
						from: owner,
					}
				),
			];

			// TODO: fetch settings per-market programmatically
			const setupFuturesMarket = async market => {
				const assetKey = await market.baseAsset();
				const marketKey = await market.marketKey();
				await setupPriceAggregators(returnObj['ExchangeRates'], owner, [assetKey]);
				await updateAggregatorRates(returnObj['ExchangeRates'], null, [assetKey], [toUnit('1')]);
				await Promise.all([
					returnObj['FuturesMarketSettings'].setParameters(
						marketKey,
						toWei('0.003'), // 0.3% taker fee
						toWei('0.001'), // 0.1% maker fee
						toWei('0.0005'), // 0.05% taker fee next price
						toWei('0.0001'), // 0.01% maker fee next price
						toBN('2'), // 2 rounds next price confirm window
						toWei('10'), // 10x max leverage
						toWei('100000'), // 100000 max market debt
						toWei('0.1'), // 10% max funding velocity
						toWei('100000'), // 100000 USD skewScaleUSD
						{ from: owner }
					),
				]);
			};

			if (returnObj['FuturesMarketBTC']) {
				promises.push(setupFuturesMarket(returnObj['FuturesMarketBTC']));
			}
			if (returnObj['FuturesMarketETH']) {
				promises.push(setupFuturesMarket(returnObj['FuturesMarketETH']));
			}

			await Promise.all(promises);
		}

		// PerpsV2
		if (returnObj['PerpsV2MarketSettings']) {
			const promises = [
				returnObj['PerpsV2MarketSettings'].setMinInitialMargin(FUTURES_MIN_INITIAL_MARGIN, {
					from: owner,
				}),
				returnObj['PerpsV2MarketSettings'].setMinKeeperFee(
					constantsOverrides.FUTURES_MIN_KEEPER_FEE,
					{
						from: owner,
					}
				),
				returnObj['PerpsV2MarketSettings'].setLiquidationFeeRatio(FUTURES_LIQUIDATION_FEE_RATIO, {
					from: owner,
				}),
				returnObj['PerpsV2MarketSettings'].setLiquidationBufferRatio(
					FUTURES_LIQUIDATION_BUFFER_RATIO,
					{
						from: owner,
					}
				),
			];

			// TODO: fetch settings per-market programmatically
			const setupPerpsV2Market = async market => {
				const marketViewsArtifact = artifacts.require('PerpsV2MarketViews');
				const proxiedMarketViews = await marketViewsArtifact.at(market.address);

				const assetKey = await proxiedMarketViews.baseAsset();
				const marketKey = await proxiedMarketViews.marketKey();
				const offchainMarketKey = toBytes32(
					'oc' + fromBytes32(marketKey.replace(/([0\s]+$)/g, ''))
				);
				await setupPriceAggregators(returnObj['ExchangeRates'], owner, [assetKey]);
				await updateAggregatorRates(returnObj['ExchangeRates'], null, [assetKey], [toUnit('1')]);
				await Promise.all([
					returnObj['PerpsV2MarketSettings'].setParameters(
						marketKey,
						[
							toWei('0.003'), // 0.3% taker fee
							toWei('0.001'), // 0.1% maker fee
							toWei('0.0005'), // 0.05% taker fee delayed order
							toWei('0.0001'), // 0.01% maker fee delayed order
							toWei('0.00005'), // 0.005% taker fee offchain delayed order
							toWei('0.00001'), // 0.001% maker fee offchain delayed order

							toWei('10'), // 10x max leverage
							toWei('1000'), // 1000 max market value
							toWei('0.1'), // 10% max funding velocity
							toWei('100000'), // 100k native units skewScale

							toBN('2'), // 2 rounds next price confirm window
							30, // 30s delay confirm window
							60, // 60s minimum delay time in seconds
							120, // 120s maximum delay time in seconds

							15, // 20s offchain min delay window
							60, // 20s offchain max delay window

							offchainMarketKey, // offchain market key
							toUnit('0.06'), // offchain price divergence 5%
						],
						{ from: owner }
					),
				]);
			};

			if (returnObj['PerpsV2MarketBTC']) {
				promises.push(setupPerpsV2Market(returnObj['ProxyPerpsV2MarketBTC']));
			}
			if (returnObj['PerpsV2MarketETH']) {
				promises.push(setupPerpsV2Market(returnObj['ProxyPerpsV2MarketETH']));
			}

			await Promise.all(promises);
		}
	}

	// finally if any of our contracts have setAddressResolver (from MockSynth), then invoke it
	await Promise.all(
		Object.values(returnObj)
			.filter(contract => contract.setAddressResolver)
			.map(mock => mock.setAddressResolver(returnObj['AddressResolver'].address))
	);

	if (returnObj['ExchangeRates']) {
		// setup SNX price feed and any other feeds
		const keys = ['SNX', ...(feeds || [])].map(toBytes32);
		const prices = ['0.2', ...(feeds || []).map(() => '1.0')].map(toUnit);
		await setupPriceAggregators(returnObj['ExchangeRates'], owner, keys);
		await updateAggregatorRates(
			returnObj['ExchangeRates'],
			returnObj['CircuitBreaker'],
			keys,
			prices
		);
	}

	return returnObj;
};

module.exports = {
	mockToken,
	mockGenericContractFnc,
	setupContract,
	setupAllContracts,
	constantsOverrides,
	excludedFunctions,
	getFunctionSignatures,
};
