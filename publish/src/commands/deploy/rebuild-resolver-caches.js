'use strict';

const { gray, red, yellow, redBright } = require('chalk');
const ethers = require('ethers');
const {
	fromBytes32,
	constants: { ZERO_ADDRESS },
} = require('../../../..');

module.exports = async ({
	addressOf,
	compiled,
	deployer,
	generateSolidity,
	limitPromise,
	network,
	newContractsBeingAdded,
	runStep,
	useOvm,
}) => {
	const { AddressResolver, ReadProxyAddressResolver } = deployer.deployedContracts;

	// Legacy contracts.
	if (network === 'mainnet' && !useOvm) {
		// v2.35.2 contracts.
		// TODO  -fetch these from getVersions()
		const CollateralEth = '0x3FF5c0A14121Ca39211C95f6cEB221b86A90729E';
		const CollateralErc20 = '0x3B3812BB9f6151bEb6fa10783F1ae848a77a0d46'; // REN
		const CollateralShort = '0x188C2274B04Ea392B21487b5De299e382Ff84246';

		const legacyContracts = Object.entries({
			CollateralEth,
			CollateralErc20,
			CollateralShort,
		}).map(([name, address]) => {
			// Conbine MixinResolver + Owned abis
			const abi1 = compiled['MixinResolver'].abi;
			const abi2 = compiled['Owned'].abi.filter(e => e.type !== 'constructor'); // Avoid duplicate constructor entries
			const abi = [...abi1, ...abi2];

			const target = new ethers.Contract(address, abi, deployer.provider);
			target.source = name;
			return [`legacy_${name}`, target];
		});

		for (const [name, target] of legacyContracts) {
			await runStep({
				gasLimit: 7e6,
				contract: name,
				target,
				read: 'isResolverCached',
				expected: input => input,
				publiclyCallable: true, // does not require owner
				write: 'rebuildCache',
				// these updates are tricky to Soliditize, and aren't
				// owner required and aren't critical to the core, so
				// let's skip them in the migration script
				// and a re-run of the deploy script will catch them
				skipSolidity: true,
			});
		}
	}

	const filterTargetsWith = ({ prop }) =>
		Object.entries(deployer.deployedContracts).filter(([, target]) => {
			return target.functions[prop] !== undefined;
		});

	const contractsWithRebuildableCache = filterTargetsWith({ prop: 'rebuildCache' });

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
		for (const { name: newContract } of Object.values(newContractsBeingAdded)) {
			if (Array.isArray(contractToDepMap[newContract])) {
				// when the new contract is required by others, add them
				contractToDepMap[newContract].forEach(entry => contractsToRebuildCacheSet.add(entry));
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

	const addressesChunkSize = useOvm ? 7 : 20;
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

	// Now perform a sync of legacy contracts that have not been replaced in Shaula (v2.35.x)
	// EtherCollateral, EtherCollateralsUSD
	console.log(gray('Checking all legacy contracts with setResolverAndSyncCache() are rebuilt...'));
	const contractsWithLegacyResolverCaching = filterTargetsWith({
		prop: 'setResolverAndSyncCache',
	});
	for (const [contract, target] of contractsWithLegacyResolverCaching) {
		await runStep({
			gasLimit: 500e3, // higher gas required
			contract,
			target,
			read: 'isResolverCached',
			readArg: addressOf(ReadProxyAddressResolver),
			expected: input => input,
			write: 'setResolverAndSyncCache',
			writeArg: addressOf(ReadProxyAddressResolver),
			comment:
				'Rebuild the resolver cache of contracts that use the legacy "setResolverAndSyncCache" function',
		});
	}

	// Finally set resolver on contracts even older than legacy (Depot)
	console.log(gray('Checking all legacy contracts with setResolver() are rebuilt...'));
	const contractsWithLegacyResolverNoCache = filterTargetsWith({
		prop: 'setResolver',
	});
	for (const [contract, target] of contractsWithLegacyResolverNoCache) {
		await runStep({
			gasLimit: 500e3, // higher gas required
			contract,
			target,
			read: 'resolver',
			expected: input => addressOf(ReadProxyAddressResolver),
			write: 'setResolver',
			writeArg: addressOf(ReadProxyAddressResolver),
			comment: 'Rebuild the resolver cache of contracts that use the legacy "setResolver" function',
		});
	}

	console.log(gray('All caches are rebuilt. '));
};
