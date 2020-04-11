'use strict';

const { artifacts, web3 } = require('@nomiclabs/buidler');

const SafeDecimalMath = artifacts.require('SafeDecimalMath');

const { toBytes32, getUsers } = require('../../');

const ZERO_ADDRESS = '0x' + '0'.repeat(40);
const SUPPLY_100M = web3.utils.toWei((1e8).toString()); // 100M

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

	const totalSupply = web3.utils.toWei(supply.toString());

	const proxy = await artifacts.require('ProxyERC20').new(owner, { from: deployerAccount });
	// set associated contract as deployerAccount so we can setBalanceOf to the owner below
	const tokenState = await artifacts
		.require('TokenState')
		.new(owner, deployerAccount, { from: deployerAccount });

	if (!skipInitialAllocation) {
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
	await tokenState.setAssociatedContract(token.address, { from: owner });
	await proxy.setTarget(token.address, { from: owner });

	return { token, tokenState, proxy };
};

const mockGenericContractFnc = async ({ instance, fncName, mock, returns = [] }) => {
	// Adapted from: https://github.com/EthWorks/Doppelganger/blob/master/lib/index.ts
	const abiEntryForFnc = artifacts.require(mock).abi.find(({ name }) => name === fncName);

	const signature = web3.eth.abi.encodeFunctionSignature(abiEntryForFnc);

	const outputTypes = abiEntryForFnc.outputs.map(({ type }) => type);

	const responseAsEncodedData = web3.eth.abi.encodeParameters(outputTypes, returns);

	await instance.mockReturns(signature, responseAsEncodedData);
};

/**
 * Setup an individual contract. Note: will fail if required dependencies aren't provided in the cache.
 */
const setupContract = async ({
	accounts,
	contract,
	mock = undefined, // if contract is GenericMock, this is the name of the contract being mocked
	cache = {},
	args = [],
	skipPostDeploy = false,
}) => {
	const [deployerAccount, owner, oracle, fundsWallet] = accounts;

	const artifact = artifacts.require(contract);

	const linkSafeDecimalMath = async () => {
		return artifact.link(await SafeDecimalMath.new());
	};

	const create = ({ constructorArgs }) => {
		return artifact.new(
			...constructorArgs.concat({
				from: deployerAccount,
				gas: 9e15,
				gasPrice: web3.utils.toWei('0.000001', 'gwei'),
			})
		);
	};

	// const constructorArgs = args.length > 0 ? args : undefined;

	try {
		await linkSafeDecimalMath();
	} catch (err) {
		// Ignore as we may not need library linkage
	}

	const tryGetAddressOf = name => (cache[name] ? cache[name].address : ZERO_ADDRESS);

	const defaultArgs = {
		GenericMock: [],
		AddressResolver: [owner],
		SystemStatus: [owner],
		ExchangeRates: [owner, oracle, [toBytes32('SNX')], [web3.utils.toWei('0.2', 'ether')]],
		SynthetixState: [owner, ZERO_ADDRESS],
		SupplySchedule: [owner, 0, 0],
		Proxy: [owner],
		ProxyERC20: [owner],
		Depot: [owner, fundsWallet, tryGetAddressOf('AddressResolver')],
		Issuer: [owner, tryGetAddressOf('AddressResolver')],
		Exchanger: [owner, tryGetAddressOf('AddressResolver')],
		Synthetix: [
			tryGetAddressOf('Proxy'),
			tryGetAddressOf('TokenState'),
			owner,
			SUPPLY_100M,
			tryGetAddressOf('AddressResolver'),
		],
		RewardsDistribution: [
			owner,
			tryGetAddressOf('Synthetix'),
			tryGetAddressOf('Proxy'),
			tryGetAddressOf('RewardEscrow'),
			// TODO: the below should be ProxyFeePool, but not quite ready for that (come back once tackling this problem with
			// FeePool tests)
			tryGetAddressOf('FeePool'),
		],
		RewardEscrow: [owner, tryGetAddressOf('Synthetix'), tryGetAddressOf('FeePool')],
		SynthetixEscrow: [owner, tryGetAddressOf('Synthetix')],
		// use deployerAccount as associated contract to allow it to call setBalanceOf()
		TokenState: [owner, deployerAccount],
		EtherCollateral: [owner, tryGetAddressOf('AddressResolver')],
	};

	let instance;
	try {
		instance = await create({
			constructorArgs: args.length > 0 ? args : defaultArgs[contract],
		});
	} catch (err) {
		throw Error(
			`Failed to deploy ${contract}. Does it have defaultArgs setup?\n\t└─> Caused by ${err.toString()}`
		);
	}

	const postDeployTasks = {
		async Issuer() {
			await cache['SynthetixState'].setAssociatedContract(instance.address, { from: owner });
		},
		async Synthetix() {
			// first give all SNX supply to the owner (using the hack that the deployerAccount was setup as the associatedContract via
			// the constructor args)
			await cache['TokenState'].setBalanceOf(owner, SUPPLY_100M, { from: deployerAccount });

			// then configure everything else (including setting the associated contract of TokenState back to the Synthetix contract)
			await Promise.all(
				[
					(cache['TokenState'].setAssociatedContract(instance.address, { from: owner }),
					cache['Proxy'].setTarget(instance.address, { from: owner })),
				]
					.concat(
						// If there's a SupplySchedule and it has the method we need (i.e. isn't a mock)
						'SupplySchedule' in cache && 'setSynthetixProxy' in cache['SupplySchedule']
							? cache['SupplySchedule'].setSynthetixProxy(cache['Proxy'].address, { from: owner })
							: []
					)
					.concat(
						// If there's an escrow that's not a mock
						'SynthetixEscrow' in cache && 'setSynthetix' in cache['SynthetixEscrow']
							? cache['SynthetixEscrow'].setSynthetix(instance.address, { from: owner })
							: []
					)
					.concat(
						// If there's a reward escrow that's not a mock
						'RewardEscrow' in cache && 'setSynthetix' in cache['RewardEscrow']
							? cache['RewardEscrow'].setSynthetix(instance.address, { from: owner })
							: []
					)
					.concat(
						// If there's a rewards distribution that's not a mock
						'RewardsDistribution' in cache && 'setAuthority' in cache['RewardsDistribution']
							? [
									cache['RewardsDistribution'].setAuthority(instance.address, { from: owner }),
									cache['RewardsDistribution'].setSynthetixProxy(cache['Proxy'].address, {
										from: owner,
									}),
							  ]
							: []
					)
			);
		},
		async GenericMock() {
			if (mock === 'RewardEscrow' || mock === 'SynthetixEscrow') {
				await mockGenericContractFnc({ instance, mock, fncName: 'balanceOf', returns: ['0'] });
			} else if (mock === 'EtherCollateral') {
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
						fncName: 'exchangeFeeRate',
						returns: [web3.utils.toWei('0.0030')],
					}),
					mockGenericContractFnc({
						instance,
						mock,
						fncName: 'FEE_ADDRESS',
						returns: [getUsers({ network: 'mainnet', user: 'fee' }).address],
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
			}
		},
	};

	// now run any postDeploy tasks (connecting contracts together)
	if (!skipPostDeploy && postDeployTasks[contract]) {
		await postDeployTasks[contract]();
	}

	return instance;
};

const setupAllContracts = async ({ accounts, mocks = {}, contracts = [], synths = [] }) => {
	const [, owner] = accounts;

	// Copy mocks into the return object, this allows us to include them in the
	// AddressResolver
	const returnObj = Object.assign({}, mocks);

	// BASE CONTRACTS

	const baseContracts = [
		{ contract: 'AddressResolver' },
		{ contract: 'SystemStatus' },
		{ contract: 'ExchangeRates' },
		{ contract: 'SynthetixState' },
		{ contract: 'SupplySchedule' },
		{ contract: 'ProxyERC20' },
		{ contract: 'Proxy' }, // ProxySynthetix
		{ contract: 'TokenState' }, // TokenStateSynthetix
		{ contract: 'RewardEscrow' },
		{ contract: 'SynthetixEscrow' },
		{ contract: 'RewardsDistribution', mocks: ['Synthetix', 'FeePool', 'RewardEscrow'] },
		{
			contract: 'Issuer',
			mocks: [
				'Synthetix',
				'SynthetixState',
				'Exchanger',
				'FeePool',
				'DelegateApprovals',
				'IssuanceEternalStorage',
			],
			deps: ['AddressResolver'],
		},
		{
			contract: 'Exchanger',
			mocks: ['ExchangeState', 'Synthetix', 'FeePool', 'DelegateApprovals'],
			deps: ['AddressResolver', 'SystemStatus', 'ExchangeRates'],
		},
		{ contract: 'Depot', deps: ['AddressResolver', 'SystemStatus'] },
		{
			contract: 'Synthetix',
			mocks: [
				'Issuer',
				'Exchanger',
				'EtherCollateral',
				'FeePool',
				'SupplySchedule',
				'RewardEscrow',
				'SynthetixEscrow',
				'RewardsDistribution',
			],
			deps: [
				'SynthetixState',
				'Proxy',
				'AddressResolver',
				'TokenState',
				'SystemStatus',
				'ExchangeRates',
			],
		},
		{
			contract: 'EtherCollateral',
			mocks: ['Issuer', 'Depot'],
			deps: ['AddressResolver', 'SystemStatus'],
		},
	];

	// get deduped list of all required base contracts
	const contractsRequired = Array.from(
		new Set(
			baseContracts
				.filter(({ contract }) => contracts.indexOf(contract) > -1)
				.reduce((memo, { contract, deps = [] }) => memo.concat(contract).concat(deps), [])
		)
	);

	// now sort in dependency order
	const contractsToFetch = baseContracts.filter(
		({ contract }) => contractsRequired.indexOf(contract) > -1
	);

	// now setup each contract in serial in case we have deps we need to load
	for (const { contract, mocks = [] } of contractsToFetch) {
		// mark each mock onto the returnObj as true when it doesn't exist, indicating it needs to be
		// put through the AddressResolver
		// for all mocks required for this contract
		await Promise.all(
			mocks
				// if the target isn't on the returnObj (i.e. already mocked / created) and not in the list of contracts
				.filter(mock => !(mock in returnObj) && contracts.indexOf(mock) < 0)
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

		// deploy the contract
		returnObj[contract] = await setupContract({
			accounts,
			contract,
			// the cache is a combination of the mocks and any return objects
			cache: Object.assign({}, mocks, returnObj),
		});
	}

	// SYNTHS

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

		// if deploying a real Synthetix, then we add this synth
		if (returnObj['Synthetix'] && !mocks['Synthetix']) {
			await returnObj['Synthetix'].addSynth(token.address, { from: owner });
		}
	}

	// now invoke AddressResolver to set all addresses
	if (returnObj['AddressResolver']) {
		// TODO - this should only import the ones set as required in contracts
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
		// console.log(
		// 	Object.entries(returnObj).forEach(([key, { address }]) => console.log(key, address))
		// );
	}

	// now set resolver and sync cache for all contracts that need it
	await Promise.all(
		Object.entries(returnObj)
			// keep items not in mocks
			.filter(([name]) => !(name in mocks))
			// and only those with the setResolver function
			.filter(([, instance]) => !!instance.setResolverAndSyncCache)
			.map(([contract, instance]) => {
				return instance
					.setResolverAndSyncCache(returnObj['AddressResolver'].address, { from: owner })
					.catch(err => {
						if (/Resolver missing target/.test(err.toString())) {
							throw Error(`Cannot resolve all resolver requirements for ${contract}`);
						} else {
							throw err;
						}
					});
			})
	);

	// finally if any of our mocks have setSystemStatus (from MockSynth), then invoke it
	await Promise.all(
		Object.values(mocks)
			.filter(mock => mock.setSystemStatus)
			.map(mock => mock.setSystemStatus(returnObj['SystemStatus'].address))
	);

	return returnObj;
};

module.exports = {
	mockToken,
	setupContract,
	setupAllContracts,
};
