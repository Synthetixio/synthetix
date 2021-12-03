'use strict';

const { gray, red, yellow, redBright } = require('chalk');
const ethers = require('ethers');
const {
	fromBytes32,
	constants: { ZERO_ADDRESS },
} = require('../../../..');

module.exports = async ({
	deployer,
	generateSolidity,
	limitPromise,
	newContractsBeingAdded,
	runStep,
	network,
	useOvm,
}) => {
	console.log(gray(`\n------ REBUILD RESOLVER CACHES ------\n`));

	const { AddressResolver, WrapperFactory } = deployer.deployedContracts;

	const filterTargetsWith = ({ prop }) =>
		Object.entries(deployer.deployedContracts).filter(([, target]) => {
			return target.functions[prop] !== undefined;
		});

	const contractsWithRebuildableCache = filterTargetsWith({ prop: 'rebuildCache' });

	// add deployed wrappers
	const wrapperCreatedLogs = await deployer.provider.getLogs({
		fromBlock: 0,
		topics: [ethers.utils.id('WrapperCreated(address,bytes32,address)')],
	});

	const wrappers = wrapperCreatedLogs.map(rawLog => {
		const log = WrapperFactory.interface.parseLog(rawLog);
		return [
			`Wrapper for ${ethers.utils.parseBytes32String(log.args.currencyKey)}`,
			new ethers.Contract(log.args.wrapperAddress, WrapperFactory.interface, deployer.provider),
		]; // interface doesn't matter as long as it responds to MixinResolver
	});

	// OVM pre-regenesis
	if (network === 'mainnet' && useOvm) {
		wrappers.push(
			[
				'Wrapper for sETH',
				new ethers.Contract(
					'0x6202A3B0bE1D222971E93AaB084c6E584C29DB70',
					WrapperFactory.interface,
					deployer.provider
				),
			],
			[
				'Wrapper for sUSD',
				new ethers.Contract(
					'0xad32aA4Bff8b61B4aE07E3BA437CF81100AF0cD7',
					WrapperFactory.interface,
					deployer.provider
				),
			],
			[
				'Wrapper for sUSD',
				new ethers.Contract(
					'0x8A91e92FDd86e734781c38DB52a390e1B99fba7c',
					WrapperFactory.interface,
					deployer.provider
				),
			]
		);
	}

	console.log(gray(`found ${wrappers.length} wrapper addresses`));

	contractsWithRebuildableCache.push(...wrappers);

	// collect all resolver addresses required
	const contractToDepMap = {};
	const resolverAddressesRequired = (
		await Promise.all(
			contractsWithRebuildableCache.map(([id, contract]) => {
				return limitPromise(() => contract.resolverAddressesRequired())
					.then(result => [contract.address, result])
					.catch(() => {
						console.log(
							yellow.bold(
								`⚠ WARNING: Contract ${id} did not respond to resolverAddressesRequired()`
							)
						);
					});
			})
		)
	)
		.filter(e => e !== undefined)
		.reduce((allAddresses, [targetContractAddress, requiredAddressesForContract]) => {
			// side-effect
			for (const contractDepName of requiredAddressesForContract) {
				const contractDepNameParsed = ethers.utils.parseBytes32String(contractDepName);
				// collect all contract maps
				contractToDepMap[contractDepNameParsed] = []
					.concat(contractToDepMap[contractDepNameParsed] || [])
					.concat(targetContractAddress);
			}
			return allAddresses.concat(
				requiredAddressesForContract.filter(
					contractAddress => !allAddresses.includes(contractAddress)
				)
			);
		}, []);

	// check which resolver addresses are imported
	const resolvedAddresses = await Promise.all(
		resolverAddressesRequired.map(id => {
			return limitPromise(() => AddressResolver.getAddress(id));
		})
	);
	const isResolverAddressImported = {};
	for (let i = 0; i < resolverAddressesRequired.length; i++) {
		isResolverAddressImported[resolverAddressesRequired[i]] = resolvedAddresses[i] !== ZERO_ADDRESS;
	}

	// print out resolver addresses
	console.log(gray('Imported resolver addresses:'));
	for (const id of Object.keys(isResolverAddressImported)) {
		const isImported = isResolverAddressImported[id];
		const chalkFn = isImported ? gray : red;
		console.log(chalkFn(`  > ${fromBytes32(id)}: ${isImported}`));
	}

	// now ensure all caches are rebuilt for those in need
	let contractsToRebuildCache = [];
	if (generateSolidity) {
		// use set to dedupe
		const contractsToRebuildCacheSet = new Set();
		// when running in solidity generation mode, we cannot expect
		// the address resolver to have been updated. Thus we have to compile a list
		// of all possible contracts to update rather than relying on "isResolverCached"
		for (const { name: newContract, address, contract } of Object.values(newContractsBeingAdded)) {
			if (Array.isArray(contractToDepMap[newContract])) {
				// when the new contract is required by others, add them
				contractToDepMap[newContract].forEach(entry => contractsToRebuildCacheSet.add(entry));
			}
			// and regardless add each new contract being added if it uses the MixinResolver
			if (contract.resolverAddressesRequired) {
				contractsToRebuildCacheSet.add(address);
			}
		}
		contractsToRebuildCache = Array.from(contractsToRebuildCacheSet);
	} else {
		for (const [name, target] of contractsWithRebuildableCache) {
			let isCached = true;

			try {
				isCached = await target.isResolverCached();
			} catch (err) {
				console.log(
					yellow.bold(`⚠ WARNING: Contract ${name} did not respond to isResolverCached()`)
				);
			}

			if (!isCached) {
				const requiredAddresses = await target.resolverAddressesRequired();

				const unknownAddress = requiredAddresses.find(id => !isResolverAddressImported[id]);
				if (unknownAddress) {
					console.log(
						redBright(
							`WARNING: Not invoking ${name}.rebuildCache() because ${fromBytes32(
								unknownAddress
							)} is unknown. This contract requires: ${requiredAddresses.map(id =>
								fromBytes32(id)
							)}`
						)
					);
				} else {
					contractsToRebuildCache.push(target.address);
				}
			}
		}
	}

	const addressesChunkSize = useOvm ? 5 : 20;
	let batchCounter = 1;
	for (let i = 0; i < contractsToRebuildCache.length; i += addressesChunkSize) {
		const chunk = contractsToRebuildCache.slice(i, i + addressesChunkSize);
		await runStep({
			gasLimit: 7e6,
			contract: `AddressResolver`,
			target: AddressResolver,
			publiclyCallable: true, // does not require owner
			write: 'rebuildCaches',
			writeArg: [chunk],
			comment: `Rebuild the resolver caches in all MixinResolver contracts - batch ${batchCounter++}`,
		});
	}

	console.log(gray('Double check all contracts with rebuildCache() are rebuilt...'));
	for (const [contract, target] of contractsWithRebuildableCache) {
		if (contractsToRebuildCache.includes(target.address)) {
			await runStep({
				gasLimit: 500e3, // higher gas required
				contract,
				target,
				read: 'isResolverCached',
				expected: input => input,
				publiclyCallable: true, // does not require owner
				write: 'rebuildCache',
				skipSolidity: true, // this is a double check - we don't want solidity output for this
			});
		}
	}

	console.log(gray('All caches are rebuilt. '));
};
