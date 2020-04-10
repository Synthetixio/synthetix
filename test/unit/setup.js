'use strict';

const { artifacts } = require('@nomiclabs/buidler');

const SafeDecimalMath = artifacts.require('SafeDecimalMath');

const { toBytes32 } = require('../../');

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

	if (skipInitialAllocation) {
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

/**
 * Setup an individual contract. Note: will fail if required dependencies aren't provided in the cache.
 */
const setupContract = async ({ accounts, contract, cache = {}, args = [] }) => {
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
		AddressResolver: [owner],
		SystemStatus: [owner],
		ExchangeRates: [owner, oracle, [toBytes32('SNX')], [web3.utils.toWei('0.2', 'ether')]],
		SynthetixState: [owner, ZERO_ADDRESS],
		SupplySchedule: [owner, 0, 0],
		ProxyERC20: [owner],
		Depot: [owner, fundsWallet, tryGetAddressOf('AddressResolver')],
		Synthetix: [
			tryGetAddressOf('ProxyERC20'),
			tryGetAddressOf('SynthetixState'),
			owner,
			SUPPLY_100M,
			tryGetAddressOf('AddressResolver'),
		],
		RewardEscrow: [owner, tryGetAddressOf('Synthetix'), tryGetAddressOf('FeePool')],
		// use deployerAccount as associated contract to allow it to call setBalanceOf()
		TokenState: [owner, deployerAccount],
		EtherCollateral: [owner, tryGetAddressOf('AddressResolver')],
	};

	return create({ constructorArgs: args.length > 0 ? args : defaultArgs[contract] });
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
		{ contract: 'RewardEscrow' }, // no deps for RewardEscrow - we will supply mocks if need be
		{ contract: 'Depot', deps: ['AddressResolver', 'SystemStatus'] },
		{
			contract: 'Synthetix',
			mocks: [
				'SystemStatus',
				'Exchanger',
				'EtherCollateral',
				'Issuer',
				'FeePool',
				'SupplySchedule',
				'RewardEscrow',
				'SynthetixEscrow',
				'RewardsDistribution',
			],
			deps: ['AddressResolver', 'SynthetixState', 'ProxyERC20', 'ExchangeRates'],
			async postDeploy({ contract }) {
				await Promise.all[
					(returnObj['SynthetixState'].setAssociatedContract(contract.address, { from: owner }),
					returnObj['ProxyERC20'].setTarget(contract.address, { from: owner }))
				];
			},
		},
		{
			contract: 'EtherCollateral',
			deps: ['AddressResolver', 'SystemStatus', 'Depot'],
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
	for (const { contract, mocks = [], postDeploy } of contractsToFetch) {
		// mark each mock onto the returnObj as true when it doesn't exist, indicating it needs to be
		// put through the AddressResolver
		mocks.forEach(mock => (returnObj[mock] = returnObj[mock] || true));

		// deploy the contract
		returnObj[contract] = await setupContract({
			accounts,
			contract,
			// the cache is a combination of the mocks and any return objects
			cache: Object.assign({}, mocks, returnObj),
		});
		// now run any postDeploy tasks (connecting contracts together)
		if (postDeploy) {
			await postDeploy({ contract: returnObj[contract] });
		}
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
