'use strict';

const SafeDecimalMath = artifacts.require('SafeDecimalMath');

const { toBytes32 } = require('../../');

const ZERO_ADDRESS = '0x' + '0'.repeat(40);
const SUPPLY_100M = web3.utils.toWei((1e8).toString()); // 100M

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

	const defaultArgs = {
		AddressResolver: [owner],
		SystemStatus: [owner],
		ExchangeRates: [owner, oracle, [toBytes32('SNX')], [web3.utils.toWei('0.2', 'ether')]],
		SynthetixState: [owner, ZERO_ADDRESS],
		SupplySchedule: [owner, 0, 0],
		ProxyERC20: [owner],
		Depot: [owner, fundsWallet, (cache['AddressResolver'] || {}).address],
		Synthetix: [
			(cache['ProxyERC20'] || {}).address,
			(cache['SynthetixState'] || {}).address,
			owner,
			SUPPLY_100M,
			(cache['AddressResolver'] || {}).address,
		],
		// use deployerAccount as associated contract to allow it to call setBalanceOf()
		TokenState: [owner, deployerAccount],
	};

	return create({ constructorArgs: args.length > 0 ? args : defaultArgs[contract] });
};

const setupAllContracts = async ({ accounts, contracts = [], synths = [] }) => {
	const [deployerAccount, owner] = accounts;

	const returnObj = {};

	// BASE CONTRACTS

	const baseContracts = [
		{ contract: 'AddressResolver' },
		{ contract: 'SystemStatus' },
		{ contract: 'ExchangeRates' },
		{ contract: 'SynthetixState' },
		{ contract: 'SupplySchedule' },
		{ contract: 'ProxyERC20' },
		{ contract: 'Depot', deps: ['AddressResolver'] },
		{
			contract: 'Synthetix',
			deps: ['AddressResolver', 'SynthetixState', 'ProxyERC20'],
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
	for (const { contract } of contractsToFetch) {
		returnObj[contract] = await setupContract({ accounts, contract, cache: returnObj });
	}

	// SYNTHS

	// now setup each synth and its deps
	for (const id of synths) {
		const [proxy, tokenState] = await Promise.all(
			['ProxyERC20', 'TokenState'].map(contract => setupContract({ accounts, contract }))
		);
		returnObj[`ProxyERC20${id}`] = proxy;
		returnObj[`TokenState${id}`] = tokenState;

		const synth = await setupContract({
			accounts,
			contract: 'Synth',
			args: [
				proxy.address,
				tokenState.address,
				`Synth ${id}`,
				id,
				owner,
				toBytes32(id),
				SUPPLY_100M,
				returnObj['AddressResolver'].address,
			],
		});

		// first, give all supply to the owner (we can do this as the deployer as it's the associated contract for now)
		await tokenState.setBalanceOf(owner, SUPPLY_100M, { from: deployerAccount });

		// now configure the proxy and token state to use this new synth
		// and optionally synthetix if we've also deployed it
		await Promise.all([
			proxy.setTarget(synth.address, { from: owner }),
			tokenState.setAssociatedContract(synth.address, { from: owner }),
			returnObj['Synthetix']
				? returnObj['Synthetix'].addSynth(synth.address, { from: owner })
				: undefined,
		]);

		// and add the synth to the return obj
		returnObj[`Synth${id}`] = synth;
	}

	// now invoke AddressResolver to set all addresses
	if (returnObj['AddressResolver']) {
		// TODO - this should only import the ones set as required in contracts
		await returnObj['AddressResolver'].importAddresses(
			Object.keys(returnObj).map(toBytes32),
			Object.values(returnObj).map(({ address }) => address),
			{
				from: owner,
			}
		);
	}

	// now set resolver and sync cache for all contracts that need it
	await Promise.all(
		Object.entries(returnObj)
			.filter(([, instance]) => !!instance.setResolverAndSyncCache)
			.map(([contract, instance]) =>
				instance
					.setResolverAndSyncCache(returnObj['AddressResolver'].address, { from: owner })
					.catch(err => {
						if (/Resolver missing target/.test(err.toString())) {
							throw Error(`Cannot resolve all resolver requirements for ${contract}`);
						} else {
							throw err;
						}
					})
			)
	);

	return returnObj;
};

module.exports = {
	setupContract,
	setupAllContracts,
};
