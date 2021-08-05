'use strict';

const { artifacts, web3, log } = require('hardhat');

const { toWei } = web3.utils;
const { toUnit } = require('../utils')();
const {
	toBytes32,
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
		LIQUIDATION_PENALTY,
		RATE_STALE_PERIOD,
		MINIMUM_STAKE_TIME,
		DEBT_SNAPSHOT_STALE_TIME,
		CROSS_DOMAIN_DEPOSIT_GAS_LIMIT,
		CROSS_DOMAIN_REWARD_GAS_LIMIT,
		CROSS_DOMAIN_ESCROW_GAS_LIMIT,
		CROSS_DOMAIN_WITHDRAWAL_GAS_LIMIT,
		ETHER_WRAPPER_MAX_ETH,
		ETHER_WRAPPER_MINT_FEE_RATE,
		ETHER_WRAPPER_BURN_FEE_RATE,
	},
} = require('../../');

const SUPPLY_100M = toWei((1e8).toString()); // 100M

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
		throw Error(`Cannot find function "${fncName}" in the ABI of contract "${mock}"`);
	}
	const signature = web3.eth.abi.encodeFunctionSignature(abiEntryForFnc);

	const outputTypes = abiEntryForFnc.outputs.map(({ type }) => type);

	const responseAsEncodedData = web3.eth.abi.encodeParameters(outputTypes, returns);

	if (process.env.DEBUG) {
		log(`Mocking ${mock}.${fncName} to return ${returns.join(',')}`);
	}

	await instance.mockReturns(signature, responseAsEncodedData);
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
	const [deployerAccount, owner, oracle, fundsWallet] = accounts;

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
		await artifact.link(await artifacts.require('SafeDecimalMath').new());
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

	const defaultArgs = {
		GenericMock: [],
		TradingRewards: [owner, owner, tryGetAddressOf('AddressResolver')],
		AddressResolver: [owner],
		SystemStatus: [owner],
		FlexibleStorage: [tryGetAddressOf('AddressResolver')],
		ExchangeRates: [
			owner,
			oracle,
			tryGetAddressOf('AddressResolver'),
			[toBytes32('SNX')],
			[toWei('0.2', 'ether')],
		],
		SynthetixState: [owner, ZERO_ADDRESS],
		SupplySchedule: [owner, 0, 0],
		Proxy: [owner],
		ProxyERC20: [owner],
		Depot: [owner, fundsWallet, tryGetAddressOf('AddressResolver')],
		SynthUtil: [tryGetAddressOf('AddressResolver')],
		DappMaintenance: [owner],
		DebtCache: [owner, tryGetAddressOf('AddressResolver')],
		Issuer: [owner, tryGetAddressOf('AddressResolver')],
		Exchanger: [owner, tryGetAddressOf('AddressResolver')],
		SystemSettings: [owner, tryGetAddressOf('AddressResolver')],
		ExchangeState: [owner, tryGetAddressOf('Exchanger')],
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
		BaseRewardEscrowV2: [owner, tryGetAddressOf('AddressResolver')],
		RewardEscrowV2: [owner, tryGetAddressOf('AddressResolver')],
		ImportableRewardEscrowV2: [owner, tryGetAddressOf('AddressResolver')],
		SynthetixEscrow: [owner, tryGetAddressOf('Synthetix')],
		// use deployerAccount as associated contract to allow it to call setBalanceOf()
		TokenState: [owner, deployerAccount],
		EtherWrapper: [owner, tryGetAddressOf('AddressResolver'), tryGetAddressOf('WETH')],
		NativeEtherWrapper: [owner, tryGetAddressOf('AddressResolver')],
		FeePoolState: [owner, tryGetAddressOf('FeePool')],
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
		Liquidations: [owner, tryGetAddressOf('AddressResolver')],
		BinaryOptionMarketFactory: [owner, tryGetAddressOf('AddressResolver')],
		BinaryOptionMarketManager: [
			owner,
			tryGetAddressOf('AddressResolver'),
			61 * 60, // max oracle price age: 61 minutes
			26 * 7 * 24 * 60 * 60, // expiry duration: 26 weeks (~ 6 months)
			365 * 24 * 60 * 60, // Max time to maturity: ~ 1 year
			toWei('2'), // Capital requirement
			toWei('0.05'), // Skew Limit
			toWei('0.008'), // pool fee
			toWei('0.002'), // creator fee
			toWei('0.02'), // refund fee
		],
		BinaryOptionMarketData: [],
		CollateralManagerState: [owner, tryGetAddressOf('CollateralManager')],
		CollateralManager: [
			tryGetAddressOf('CollateralManagerState'),
			owner,
			tryGetAddressOf('AddressResolver'),
			toUnit(50000000),
			0,
			0,
		],
		CollateralUtil: [tryGetAddressOf('AddressResolver')],
		CollateralEth: [
			owner,
			tryGetAddressOf('CollateralManager'),
			tryGetAddressOf('AddressResolver'),
			toBytes32('sETH'),
			toUnit(1.3),
			toUnit(2),
		],
		CollateralErc20: [
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
			toUnit(1000),
		],
		WETH: [],
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
		}
	} catch (err) {
		throw Error(
			`Failed to deploy ${contract}. Does it have defaultArgs setup?\n\t└─> Caused by ${err.toString()}`
		);
	}

	const postDeployTasks = {
		async Issuer() {
			await Promise.all(
				[].concat(
					// Synthetix State is where the issuance data lives so it needs to be connected to Issuer
					tryInvocationIfNotMocked({
						name: 'SynthetixState',
						fncName: 'setAssociatedContract',
						args: [instance.address],
					}) || []
				)
			);
		},
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
							name: 'FeePoolState',
							fncName: 'setFeePool',
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
		async DelegateApprovals() {
			await cache['EternalStorageDelegateApprovals'].setAssociatedContract(instance.address, {
				from: owner,
			});
		},
		async Liquidations() {
			await cache['EternalStorageLiquidations'].setAssociatedContract(instance.address, {
				from: owner,
			});
		},
		async Exchanger() {
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

		async SystemStatus() {
			// ensure the owner has suspend/resume control over everything
			await instance.updateAccessControls(
				['System', 'Issuance', 'Exchange', 'SynthExchange', 'Synth'].map(toBytes32),
				[owner, owner, owner, owner, owner],
				[true, true, true, true, true],
				[true, true, true, true, true],
				{ from: owner }
			);
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
}) => {
	const [, owner] = accounts;

	// Copy mocks into the return object, this allows us to include them in the
	// AddressResolver
	const returnObj = Object.assign({}, mocks, existing);

	// BASE CONTRACTS

	// Note: those with deps need to be listed AFTER their deps
	const baseContracts = [
		{ contract: 'AddressResolver' },
		{ contract: 'SystemStatus' },
		{ contract: 'ExchangeState' },
		{ contract: 'FlexibleStorage', deps: ['AddressResolver'] },
		{
			contract: 'SystemSettings',
			deps: ['AddressResolver', 'FlexibleStorage'],
		},
		{
			contract: 'ExchangeRates',
			deps: ['AddressResolver', 'SystemSettings'],
			mocks: ['Exchanger'],
		},
		{ contract: 'SynthetixState' },
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
			contract: 'BaseRewardEscrowV2',
			deps: ['AddressResolver'],
			mocks: ['Synthetix', 'FeePool'],
		},
		{
			contract: 'RewardEscrowV2',
			deps: ['AddressResolver', 'SystemStatus'],
			mocks: ['Synthetix', 'FeePool', 'RewardEscrow', 'SynthetixBridgeToOptimism', 'Issuer'],
		},
		{
			contract: 'ImportableRewardEscrowV2',
			deps: ['AddressResolver'],
			mocks: ['Synthetix', 'FeePool', 'SynthetixBridgeToBase', 'Issuer'],
		},
		{ contract: 'SynthetixEscrow' },
		{ contract: 'FeePoolEternalStorage' },
		{ contract: 'FeePoolState', mocks: ['FeePool'] },
		{ contract: 'EternalStorage', forContract: 'DelegateApprovals' },
		{ contract: 'DelegateApprovals', deps: ['EternalStorage'] },
		{ contract: 'EternalStorage', forContract: 'Liquidations' },
		{ contract: 'Liquidations', deps: ['EternalStorage', 'FlexibleStorage'] },
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
			contract: 'DebtCache',
			mocks: ['Issuer', 'Exchanger', 'CollateralManager', 'EtherWrapper'],
			deps: ['ExchangeRates', 'SystemStatus'],
		},
		{
			contract: 'Issuer',
			mocks: [
				'CollateralManager',
				'Synthetix',
				'SynthetixState',
				'Exchanger',
				'FeePool',
				'DelegateApprovals',
				'FlexibleStorage',
				'EtherWrapper',
			],
			deps: ['AddressResolver', 'SystemStatus', 'FlexibleStorage', 'DebtCache'],
		},
		{
			contract: 'Exchanger',
			source: 'ExchangerWithVirtualSynth',
			mocks: ['Synthetix', 'FeePool', 'DelegateApprovals', 'VirtualSynthMastercopy'],
			deps: [
				'AddressResolver',
				'TradingRewards',
				'SystemStatus',
				'ExchangeRates',
				'ExchangeState',
				'FlexibleStorage',
				'DebtCache',
			],
		},
		{
			contract: 'Synth',
			mocks: ['Issuer', 'Exchanger', 'FeePool', 'EtherWrapper'],
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
				'Liquidations',
			],
			deps: [
				'Issuer',
				'SynthetixState',
				'Proxy',
				'ProxyERC20',
				'AddressResolver',
				'TokenState',
				'SystemStatus',
				'ExchangeRates',
			],
		},
		{
			contract: 'BaseSynthetix',
			mocks: [
				'Exchanger',
				'RewardEscrow',
				'RewardEscrowV2',
				'SynthetixEscrow',
				'RewardsDistribution',
				'Liquidations',
			],
			deps: [
				'Issuer',
				'SynthetixState',
				'Proxy',
				'ProxyERC20',
				'AddressResolver',
				'TokenState',
				'SystemStatus',
				'ExchangeRates',
			],
		},
		{
			contract: 'MintableSynthetix',
			mocks: [
				'Exchanger',
				'SynthetixEscrow',
				'Liquidations',
				'Issuer',
				'SystemStatus',
				'ExchangeRates',
				'SynthetixBridgeToBase',
			],
			deps: [
				'Proxy',
				'ProxyERC20',
				'AddressResolver',
				'TokenState',
				'RewardsDistribution',
				'RewardEscrow',
				'SynthetixState',
			],
		},
		{
			contract: 'SynthetixBridgeToOptimism',
			mocks: [
				'ext:Messenger',
				'ovm:SynthetixBridgeToBase',
				'SynthetixBridgeEscrow',
				'RewardsDistribution',
			],
			deps: ['AddressResolver', 'Issuer', 'RewardEscrowV2', 'Synthetix'],
		},
		{
			contract: 'SynthetixBridgeToBase',
			mocks: ['ext:Messenger', 'base:SynthetixBridgeToOptimism', 'RewardEscrowV2'],
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
				'SynthetixState',
				'RewardEscrow',
				'RewardEscrowV2',
				'DelegateApprovals',
				'FeePoolEternalStorage',
				'RewardsDistribution',
				'FlexibleStorage',
				'CollateralManager',
				'EtherWrapper',
			],
			deps: ['SystemStatus', 'FeePoolState', 'AddressResolver'],
		},
		{
			contract: 'BinaryOptionMarketFactory',
			deps: ['AddressResolver'],
		},
		{
			contract: 'BinaryOptionMarketManager',
			deps: [
				'SystemStatus',
				'AddressResolver',
				'ExchangeRates',
				'FeePool',
				'Synthetix',
				'BinaryOptionMarketFactory',
			],
		},
		{
			contract: 'BinaryOptionMarketData',
			deps: ['BinaryOptionMarketManager', 'BinaryOptionMarket', 'BinaryOption'],
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
			contract: 'CollateralEth',
			deps: ['CollateralManager', 'AddressResolver', 'CollateralUtil'],
		},
		{
			contract: 'CollateralErc20',
			deps: ['CollateralManager', 'AddressResolver', 'CollateralUtil'],
		},
		{
			contract: 'CollateralShort',
			deps: ['CollateralManager', 'AddressResolver', 'CollateralUtil'],
		},
	];

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

	// now go through all contracts and compile a list of them and all nested dependencies
	const contractsRequired = findAllAssociatedContracts({ contractList: contractNamesRequested });

	// now sort in dependency order
	const contractsToFetch = baseContracts.filter(
		({ contract, forContract }) =>
			// keep if contract is required
			contractsRequired.indexOf(contract) > -1 &&
			// and either there is no "forContract" or the forContract is itself required
			(!forContract || contractsRequired.indexOf(forContract) > -1) &&
			// and no entry in the existingContracts object
			!(contract in existing)
	);

	// now setup each contract in serial in case we have deps we need to load
	for (const { contract, source, mocks = [], forContract } of contractsToFetch) {
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

		// deploy the contract
		// HACK: if MintableSynthetix is deployed then rename it
		let contractRegistered = contract;
		if (contract === 'MintableSynthetix' || contract === 'BaseSynthetix') {
			contractRegistered = 'Synthetix';
		}
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
			returnObj['SystemSettings'].setLiquidationPenalty(LIQUIDATION_PENALTY, { from: owner }),
			returnObj['SystemSettings'].setRateStalePeriod(RATE_STALE_PERIOD, { from: owner }),
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
		]);
	}

	// finally if any of our contracts have setSystemStatus (from MockSynth), then invoke it
	await Promise.all(
		Object.values(returnObj)
			.filter(contract => contract.setSystemStatus)
			.map(mock => mock.setSystemStatus(returnObj['SystemStatus'].address))
	);

	return returnObj;
};

module.exports = {
	mockToken,
	mockGenericContractFnc,
	setupContract,
	setupAllContracts,
};
