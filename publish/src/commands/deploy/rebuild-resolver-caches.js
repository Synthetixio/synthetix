'use strict';

const { gray, red, yellow, redBright } = require('chalk');
const {
	fromBytes32,
	constants: { OVM_MAX_GAS_LIMIT, ZERO_ADDRESS },
} = require('../../../..');

module.exports = async ({
	addressOf,
	compiled,
	deployer,
	limitPromise,
	network,
	runStep,
	useOvm,
}) => {
	const {
		AddressResolver,
		BinaryOptionMarketManager,
		ReadProxyAddressResolver,
	} = deployer.deployedContracts;

	// Legacy contracts.
	if (network === 'mainnet') {
		// v2.35.2 contracts.
		const CollateralEth = '0x3FF5c0A14121Ca39211C95f6cEB221b86A90729E';
		const CollateralErc20REN = '0x3B3812BB9f6151bEb6fa10783F1ae848a77a0d46';
		const CollateralShort = '0x188C2274B04Ea392B21487b5De299e382Ff84246';

		const legacyContracts = Object.entries({
			CollateralEth,
			CollateralErc20REN,
			CollateralShort,
		}).map(([name, address]) => {
			const contract = new deployer.provider.web3.eth.Contract(
				[...compiled['MixinResolver'].abi, ...compiled['Owned'].abi],
				address
			);
			return [`legacy:${name}`, contract];
		});

		await Promise.all(
			legacyContracts.map(async ([name, contract]) => {
				return runStep({
					gasLimit: 7e6,
					contract: name,
					target: contract,
					read: 'isResolverCached',
					expected: input => input,
					publiclyCallable: true, // does not require owner
					write: 'rebuildCache',
				});
			})
		);
	}

	const filterTargetsWith = ({ prop }) =>
		Object.entries(deployer.deployedContracts).filter(([, target]) =>
			target.options.jsonInterface.find(({ name }) => name === prop)
		);

	const contractsWithRebuildableCache = filterTargetsWith({ prop: 'rebuildCache' });

	// collect all resolver addresses required
	const resolverAddressesRequired = (
		await Promise.all(
			contractsWithRebuildableCache.map(([, contract]) => {
				return limitPromise(() => contract.methods.resolverAddressesRequired().call());
			})
		)
	).reduce((allAddresses, contractAddresses) => {
		return allAddresses.concat(
			contractAddresses.filter(contractAddress => !allAddresses.includes(contractAddress))
		);
	}, []);

	// check which resolver addresses are imported
	const resolvedAddresses = await Promise.all(
		resolverAddressesRequired.map(id => {
			return limitPromise(() => AddressResolver.methods.getAddress(id).call());
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
	const contractsToRebuildCache = [];
	for (const [name, target] of contractsWithRebuildableCache) {
		const isCached = await target.methods.isResolverCached().call();
		if (!isCached) {
			const requiredAddresses = await target.methods.resolverAddressesRequired().call();

			const unknownAddress = requiredAddresses.find(id => !isResolverAddressImported[id]);
			if (unknownAddress) {
				console.log(
					redBright(
						`WARINING: Not invoking ${name}.rebuildCache() because ${fromBytes32(
							unknownAddress
						)} is unknown. This contract requires: ${requiredAddresses.map(id => fromBytes32(id))}`
					)
				);
			} else {
				contractsToRebuildCache.push(target.options.address);
			}
		}
	}

	const addressesChunkSize = useOvm ? 7 : 20;
	for (let i = 0; i < contractsToRebuildCache.length; i += addressesChunkSize) {
		const chunk = contractsToRebuildCache.slice(i, i + addressesChunkSize);
		await runStep({
			gasLimit: useOvm ? OVM_MAX_GAS_LIMIT : 7e6,
			contract: `AddressResolver`,
			target: AddressResolver,
			publiclyCallable: true, // does not require owner
			write: 'rebuildCaches',
			writeArg: [chunk],
		});
	}

	console.log(gray('Double check all contracts with rebuildCache() are rebuilt...'));
	for (const [contract, target] of contractsWithRebuildableCache) {
		if (contractsToRebuildCache.includes(target.options.address)) {
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

	// Now do binary option market cache rebuilding
	if (BinaryOptionMarketManager) {
		console.log(gray('Checking all binary option markets have rebuilt caches'));
		let binaryOptionMarkets = [];
		// now grab all possible binary option markets to rebuild caches as well
		const binaryOptionsFetchPageSize = 100;
		for (const marketType of ['Active', 'Matured']) {
			const numBinaryOptionMarkets = Number(
				await BinaryOptionMarketManager.methods[`num${marketType}Markets`]().call()
			);
			console.log(
				gray('Found'),
				yellow(numBinaryOptionMarkets),
				gray(marketType, 'binary option markets')
			);

			if (numBinaryOptionMarkets > binaryOptionsFetchPageSize) {
				console.log(
					redBright(
						'⚠⚠⚠ Warning: cannot fetch all',
						marketType,
						'binary option markets as there are',
						numBinaryOptionMarkets,
						'which is more than page size of',
						binaryOptionsFetchPageSize
					)
				);
			} else {
				// fetch the list of markets
				const marketAddresses = await BinaryOptionMarketManager.methods[
					`${marketType.toLowerCase()}Markets`
				](0, binaryOptionsFetchPageSize).call();

				// wrap them in a contract via the deployer
				const markets = marketAddresses.map(
					binaryOptionMarket =>
						new deployer.provider.web3.eth.Contract(
							compiled['BinaryOptionMarket'].abi,
							binaryOptionMarket
						)
				);

				binaryOptionMarkets = binaryOptionMarkets.concat(markets);
			}
		}

		// now figure out which binary option markets need their caches rebuilt
		const binaryOptionMarketsToRebuildCacheOn = [];
		for (const market of binaryOptionMarkets) {
			try {
				const isCached = await market.methods.isResolverCached().call();
				if (!isCached) {
					binaryOptionMarketsToRebuildCacheOn.push(addressOf(market));
				}
				console.log(
					gray('Binary option market'),
					yellow(addressOf(market)),
					gray('is newer and cache status'),
					yellow(isCached)
				);
			} catch (err) {
				// the challenge being that some used an older MixinResolver API
				const oldBinaryOptionMarketABI = [
					{
						constant: true,
						inputs: [
							{
								internalType: 'contract AddressResolver',
								name: '_resolver',
								type: 'address',
							},
						],
						name: 'isResolverCached',
						outputs: [
							{
								internalType: 'bool',
								name: '',
								type: 'bool',
							},
						],
						payable: false,
						stateMutability: 'view',
						type: 'function',
						signature: '0x631e1444',
					},
				];

				const oldBinaryOptionMarket = new deployer.provider.web3.eth.Contract(
					oldBinaryOptionMarketABI,
					addressOf(market)
				);

				const isCached = await oldBinaryOptionMarket.methods
					.isResolverCached(addressOf(ReadProxyAddressResolver))
					.call();
				if (!isCached) {
					binaryOptionMarketsToRebuildCacheOn.push(addressOf(market));
				}

				console.log(
					gray('Binary option market'),
					yellow(addressOf(market)),
					gray('is older and cache status'),
					yellow(isCached)
				);
			}
		}

		console.log(
			gray('In total'),
			yellow(binaryOptionMarketsToRebuildCacheOn.length),
			gray('binary option markets need their caches rebuilt')
		);

		const addressesChunkSize = useOvm ? 7 : 20;
		for (let i = 0; i < binaryOptionMarketsToRebuildCacheOn.length; i += addressesChunkSize) {
			const chunk = binaryOptionMarketsToRebuildCacheOn.slice(i, i + addressesChunkSize);
			await runStep({
				gasLimit: useOvm ? OVM_MAX_GAS_LIMIT : 7e6,
				contract: `BinaryOptionMarketManager`,
				target: BinaryOptionMarketManager,
				publiclyCallable: true, // does not require owner
				write: 'rebuildMarketCaches',
				writeArg: [chunk],
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
		});
	}

	console.log(gray('All caches are rebuilt. '));
};
