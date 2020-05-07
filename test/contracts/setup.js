'use strict';

const { artifacts, web3, log, linkWithLegacySupport } = require('@nomiclabs/buidler');

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

	await instance.mockReturns(signature, responseAsEncodedData);
};

/**
 * Setup an individual contract. Note: will fail if required dependencies aren't provided in the cache.
 */
const setupContract = async ({
	accounts,
	contract,
	mock = undefined, // if contract is GenericMock, this is the name of the contract being mocked
	forContract = undefined, // when a contract is deployed for another (like Proxy for FeePool)
	cache = {},
	args = [],
	skipPostDeploy = false,
	properties = {},
}) => {
	const [deployerAccount, owner, oracle, fundsWallet] = accounts;

	const artifact = artifacts.require(contract);

	const create = ({ constructorArgs }) => {
		return artifact.new(
			...constructorArgs.concat({
				from: deployerAccount,
				gas: 9e15,
				gasPrice: web3.utils.toWei('0.000001', 'gwei'),
			})
		);
	};

	if (artifacts.contractNeedsLinking(artifact)) {
		await linkWithLegacySupport(artifact, 'SafeDecimalMath');
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
		ExchangeState: [owner, tryGetAddressOf('Exchanger')],
		Synthetix: [
			tryGetAddressOf('ProxySynthetix'),
			tryGetAddressOf('TokenStateSynthetix'),
			owner,
			SUPPLY_100M,
			tryGetAddressOf('AddressResolver'),
		],
		RewardsDistribution: [
			owner,
			tryGetAddressOf('Synthetix'),
			tryGetAddressOf('ProxyERC20Synthetix'),
			tryGetAddressOf('RewardEscrow'),
			tryGetAddressOf('ProxyFeePool'),
		],
		RewardEscrow: [owner, tryGetAddressOf('Synthetix'), tryGetAddressOf('FeePool')],
		SynthetixEscrow: [owner, tryGetAddressOf('Synthetix')],
		// use deployerAccount as associated contract to allow it to call setBalanceOf()
		TokenState: [owner, deployerAccount],
		EtherCollateral: [owner, tryGetAddressOf('AddressResolver')],
		FeePoolState: [owner, tryGetAddressOf('FeePool')],
		FeePool: [
			tryGetAddressOf('ProxyFeePool'),
			owner,
			tryGetProperty({
				property: 'exchangeFeeRate',
				otherwise: web3.utils.toWei('0.003', 'ether'),
			}),
			tryGetAddressOf('AddressResolver'),
		],
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
		IssuanceEternalStorage: [owner, tryGetAddressOf('Issuer')],
		FeePoolEternalStorage: [owner, tryGetAddressOf('FeePool')],
		DelegateApprovals: [owner, tryGetAddressOf('EternalStorageDelegateApprovals')],
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
				contract,
				forContract ? 'for ' + forContract : '',
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
				[]
					.concat(
						// Synthetix State is where the issuance data lives so it needs to be connected to Issuer
						tryInvocationIfNotMocked({
							name: 'SynthetixState',
							fncName: 'setAssociatedContract',
							args: [instance.address],
						}) || []
					)
					.concat(
						tryInvocationIfNotMocked({
							name: 'IssuanceEternalStorage',
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
					instance.setIntegrationProxy(cache['ProxyERC20Synthetix'].address, {
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
						// If there's an escrow that's the legacy version
						tryInvocationIfNotMocked({
							name: 'SynthetixEscrow',
							fncName: 'setHavven',
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
					.concat(
						'Synth' in cache ? instance.addSynth(cache['Synth'].address, { from: owner }) : []
					)
			);
		},
		async Synth() {
			await Promise.all(
				[
					cache['TokenStateSynth'].setAssociatedContract(instance.address, { from: owner }),
					cache['ProxyERC20Synth'].setTarget(instance.address, { from: owner }),
				].concat(
					tryInvocationIfNotMocked({
						name: 'Synthetix',
						fncName: 'addSynth',
						args: [instance.address],
					}) || []
				)
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
		async Exchanger() {
			await cache['ExchangeState'].setAssociatedContract(instance.address, { from: owner });
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
		{ contract: 'ExchangeRates' },
		{ contract: 'ExchangeState' },
		{ contract: 'SynthetixState' },
		{ contract: 'SupplySchedule' },
		{ contract: 'ProxyERC20', forContract: 'Synthetix' },
		{ contract: 'ProxyERC20', forContract: 'Synth' }, // for generic synth
		{ contract: 'Proxy', forContract: 'Synthetix' },
		{ contract: 'Proxy', forContract: 'FeePool' },
		{ contract: 'TokenState', forContract: 'Synthetix' },
		{ contract: 'TokenState', forContract: 'Synth' }, // for generic synth
		{ contract: 'RewardEscrow' },
		{ contract: 'SynthetixEscrow' },
		{ contract: 'EternalStorage', forContract: 'DelegateApprovals' },
		{ contract: 'FeePoolEternalStorage' },
		{ contract: 'IssuanceEternalStorage' },
		{ contract: 'FeePoolState', mocks: ['FeePool'] },
		{ contract: 'DelegateApprovals', deps: ['EternalStorage'] },
		{
			contract: 'RewardsDistribution',
			mocks: ['Synthetix', 'FeePool', 'RewardEscrow', 'ProxyFeePool'],
		},
		{ contract: 'Depot', deps: ['AddressResolver', 'SystemStatus'] },
		{
			contract: 'EtherCollateral',
			mocks: ['Issuer', 'Depot'],
			deps: ['AddressResolver', 'SystemStatus'],
		},
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
			deps: ['AddressResolver', 'SystemStatus'],
		},
		{
			contract: 'Exchanger',
			mocks: ['Synthetix', 'FeePool', 'DelegateApprovals'],
			deps: ['AddressResolver', 'SystemStatus', 'ExchangeRates', 'ExchangeState'],
		},
		{
			contract: 'Synth',
			mocks: ['Issuer', 'Exchanger', 'FeePool', 'Synthetix'],
			deps: ['TokenState', 'ProxyERC20', 'SystemStatus', 'AddressResolver'],
		}, // a generic synth
		{
			contract: 'Synthetix',
			mocks: [
				'Issuer',
				'Exchanger',
				'EtherCollateral',
				'SupplySchedule',
				'RewardEscrow',
				'SynthetixEscrow',
				'RewardsDistribution',
			],
			deps: [
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
			contract: 'FeePool',
			mocks: [
				'Synthetix',
				'Exchanger',
				'Issuer',
				'SynthetixState',
				'RewardEscrow',
				'DelegateApprovals',
				'FeePoolEternalStorage',
				'RewardsDistribution',
			],
			deps: ['SystemStatus', 'FeePoolState', 'AddressResolver'],
		},
	];

	// contract names the user requested - could be a list of strings or objects with a "contract" property
	const contractNamesRequested = contracts.map(contract => contract.contract || contract);

	// get deduped list of all required base contracts
	const contractsRequired = Array.from(
		new Set(
			baseContracts
				.filter(({ contract }) => contractNamesRequested.indexOf(contract) > -1)
				.reduce((memo, { contract, deps = [] }) => memo.concat(contract).concat(deps), [])
		)
	);

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
	for (const { contract, mocks = [], forContract } of contractsToFetch) {
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
		returnObj[contract + forContractName] = await setupContract({
			accounts,
			contract,
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

	// finally if any of our contractds have setSystemStatus (from MockSynth), then invoke it
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
