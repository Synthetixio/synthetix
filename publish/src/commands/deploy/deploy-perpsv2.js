'use strict';

const { gray, yellow } = require('chalk');
const { confirmAction } = require('../../util');
const { toBytes32 } = require('../../../..');

const ethers = require('ethers');

const {
	isNewMarket,
	deployMarketProxy,
	deployMarketState,
	deployMarketImplementations,
	linkToPerpsExchangeRate,
	linkToProxy,
	linkToState,
	linkToMarketManager,
	configureMarket,
	rebuildCaches,
	importAddresses,
	pauseMarket,
	resumeMarket,
} = require('../../command-utils/perps-v2-utils');

const deployPerpsV2Generics = async ({ account, addressOf, deployer, useOvm }) => {
	const { ReadProxyAddressResolver } = deployer.deployedContracts;

	// ----------------
	// PerpsV2 market setup
	// ----------------

	console.log(gray(`\n------ DEPLOY PERPS V2 GENERICS  ------\n`));

	const futuresMarketManager = await deployer.deployContract({
		name: 'FuturesMarketManager',
		source: useOvm ? 'FuturesMarketManager' : 'EmptyFuturesMarketManager',
		args: useOvm ? [account, addressOf(ReadProxyAddressResolver)] : [],
		deps: ['ReadProxyAddressResolver'],
	});

	if (!useOvm) {
		return;
	}

	// This belongs in dapp-utils, but since we are only deploying perpsV2 on L2,
	// I've colocated it here for now.
	await deployer.deployContract({
		name: 'PerpsV2MarketData',
		args: [addressOf(ReadProxyAddressResolver)],
		deps: ['AddressResolver'],
	});

	await deployer.deployContract({
		name: 'PerpsV2MarketSettings',
		args: [account, addressOf(ReadProxyAddressResolver)],
	});

	await deployer.deployContract({
		name: 'PerpsV2ExchangeRate',
		args: [account, addressOf(ReadProxyAddressResolver)],
	});

	return { futuresMarketManager };
};

const deployPerpsV2Markets = async ({
	account,
	addressOf,
	loadAndCheckRequiredSources,
	deployer,
	runStep,
	deploymentPath,
	network,
	useOvm,
	generateSolidity,
	yes,
	futuresMarketManager,
	limitPromise,
	specificMarkets,
}) => {
	const {
		ReadProxyAddressResolver,
		PerpsV2MarketSettings: perpsV2MarketSettings,
		PerpsV2ExchangeRate: perpsV2ExchangeRate,
		SystemStatus,
	} = deployer.deployedContracts;

	// ----------------
	// PerpsV2 market setup
	// ----------------

	console.log(gray(`\n------ DEPLOY AND CONFIGURE PERPS V2 MARKETS ------\n`));

	const updatedContracts = [];

	if (!useOvm) {
		return;
	}

	const { perpsv2Markets } = loadAndCheckRequiredSources({
		deploymentPath,
		network,
	});

	const existingMarketAddresses = await futuresMarketManager['allMarkets(bool)'](true);
	const existingMarkets = [];
	for (const marketAddress of existingMarketAddresses) {
		const market = new ethers.Contract(
			marketAddress,
			[
				{
					constant: true,
					inputs: [],
					name: 'marketKey',
					outputs: [
						{
							internalType: 'bytes32',
							name: 'key',
							type: 'bytes32',
						},
					],
					payable: false,
					stateMutability: 'view',
					type: 'function',
				},
			],
			deployer.provider
		);
		existingMarkets.push(await market.marketKey());
	}

	// const deployedPerpsV2Markets = [];
	// const perpMarketsImplementationUpdated = [];
	// const exchangeRateAssociateContractAddresses = [];

	// Grant futures pause/resume ACL to owner
	await runStep({
		contract: 'SystemStatus',
		target: SystemStatus,
		write: 'updateAccessControl',
		writeArg: [toBytes32('Futures'), account, true, true],
	});

	for (const marketConfig of perpsv2Markets) {
		if (specificMarkets && !specificMarkets.includes(marketConfig.marketKey)) {
			console.log(
				yellow(
					`Excluding market ${marketConfig.marketKey} since is not flaged for deploy in the command line`
				)
			);
			continue;
		}

		console.log(
			gray(`attempting to deploy market for ${marketConfig.asset} - ${marketConfig.marketKey}`)
		);

		const baseAsset = marketConfig.asset;
		const marketKey = marketConfig.marketKey;

		const newMarket = isNewMarket({ existingMarkets, marketKey });
		if (newMarket) {
			console.log(gray(`market ${marketConfig.marketKey} is a new market.`));
		}

		// Deploy market contracts
		// Proxy
		const deployedMarketProxy = await deployMarketProxy({ deployer, owner: account, marketKey });

		// State
		const deployedMarketState = await deployMarketState({
			deployer,
			owner: account,
			marketKey,
			baseAsset,
		});

		// Market Implmenentations
		const { implementations } = await deployMarketImplementations({
			deployer,
			owner: account,
			addressResolverAddress: addressOf(ReadProxyAddressResolver),
			marketKey: marketConfig.marketKey,
			marketProxy: deployedMarketProxy,
			marketState: deployedMarketState,
		});

		// Pause market to start linking/configuring
		const { wasPaused } = newMarket
			? true
			: await pauseMarket({
					marketKey,
					deployer,
					runStep,
					generateSolidity,
			  });

		// Link/configure contracts relationships
		await linkToState({
			runStep,
			perpsV2MarketState: deployedMarketState,
			implementations,
		});

		await linkToPerpsExchangeRate({
			runStep,
			perpsV2ExchangeRate,
			implementations,
		});

		await linkToProxy({
			runStep,
			perpsV2MarketProxy: deployedMarketProxy,
			implementations,
		});

		for (const implementation of implementations) {
			updatedContracts.push(implementation.target);
		}

		await linkToMarketManager({
			runStep,
			futuresMarketManager,
			proxies: [deployedMarketProxy.target.address],
		});

		await importAddresses({
			runStep,
			deployer,
			addressOf,
			limitPromise,
		});

		await rebuildCaches({ runStep, deployer, implementations });

		await configureMarket({
			marketKey,
			marketConfig,
			newMarket,
			perpsV2MarketSettings,
			deployer,
			runStep,
			generateSolidity,
			yes,
			confirmAction,
		});

		// Resume market if needed after linking/configuring
		if (!newMarket && !wasPaused) {
			await resumeMarket({
				marketKey,
				deployer,
				runStep,
				generateSolidity,
				yes,
				confirmAction,
			});
		}
	}

	// Revoke futures pause/resume ACL to owner
	await runStep({
		contract: 'SystemStatus',
		target: SystemStatus,
		write: 'updateAccessControl',
		writeArg: [toBytes32('Futures'), account, false, false],
	});
};

const cleanupPerpsV2 = async ({ account, addressOf, deployer, useOvm }) => {
	console.log({ account, addressOf, deployer, useOvm });

	// EXCHANGE - REMOVE UNUSED ADDRESSES
	// const linkToPerpsExchangeRate = async ({ runStep, perpsV2ExchangeRate, implementations }) => {
	// 	const currentAddresses = Array.from(await perpsV2ExchangeRate.associatedContracts()).sort();

	// 	const requiredAddresses = implementations
	// 		.filter(imp => imp.useExchangeRate)
	// 		.map(item => item.target.address);

	// 	const { toRemove, toAdd } = filteredLists(currentAddresses, requiredAddresses);

	// 	if (toRemove.length > 0) {
	// 		await runStep({
	// 			contract: 'PerpsV2ExchangeRate',
	// 			target: perpsV2ExchangeRate,
	// 			write: 'removeAssociatedContracts',
	// 			writeArg: [toRemove],
	// 		});
	// 	}

	// 	if (toAdd.length > 0) {
	// 		await runStep({
	// 			contract: 'PerpsV2ExchangeRate',
	// 			target: perpsV2ExchangeRate,
	// 			write: 'addAssociatedContracts',
	// 			writeArg: [toAdd],
	// 			gasLimit: 150e3 * toAdd.length, // extra gas per market
	// 		});
	// 	}
	// };

	// REMOVE UNUSED PROXIES
	// const linkToMarketManager = async ({ runStep, futuresMarketManager, proxies }) => {
	// 	const managerKnownMarkets = Array.from(
	// 		await futuresMarketManager['allMarkets(bool)'](true)
	// 	).sort();
	// 	const { toKeep, toAdd } = filteredLists(managerKnownMarkets, proxies);

	// 	if (toAdd.length > 0) {
	// 		await runStep({
	// 			contract: 'FuturesMarketManager',
	// 			target: futuresMarketManager,
	// 			write: 'addProxiedMarkets',
	// 			writeArg: [toAdd],
	// 			gasLimit: 150e3 * toAdd.length, // extra gas per market
	// 		});
	// 	}

	// 	if (toKeep.length > 0) {
	// 		await runStep({
	// 			contract: 'FuturesMarketManager',
	// 			target: futuresMarketManager,
	// 			write: 'updateMarketsImplementations',
	// 			writeArg: [toKeep],
	// 		});
	// 	}
	// };

	///
	///
	///
	///
	///
	///
	///
	///
	///
	///
	///
	///
	///
	/// / TODO CLEAN
	// // Update markets implementations if its needed.
	// if (futuresMarketManager && marketImplementationsUpdated.length > 0) {
	// 	await runStep({
	// 		contract: `FuturesMarketManager`,
	// 		target: futuresMarketManager,
	// 		write: 'updateMarketsImplementations',
	// 		writeArg: [marketImplementationsUpdated],
	// 	});
	// }
	// Replace the relevant markets in the manager (if any)
	// let marketImplementationsUpdated = perpMarketsImplementationUpdated;
	// if (futuresMarketManager && deployedPerpsV2Markets.length > 0) {
	// 	const managerKnownMarkets = Array.from(
	// 		await futuresMarketManager['allMarkets(bool)'](true)
	// 	).sort();
	// 	const { toRemove, toKeep, toAdd } = filteredLists(managerKnownMarkets, deployedPerpsV2Markets);
	// 	if (toRemove.length > 0) {
	// 		await runStep({
	// 			contract: `FuturesMarketManager`,
	// 			target: futuresMarketManager,
	// 			read: 'allMarkets(bool)',
	// 			readArg: [true],
	// 			expected: (markets) => JSON.stringify(markets.slice().sort()) === JSON.stringify(toKeep),
	// 			write: 'removeMarkets',
	// 			writeArg: [toRemove],
	// 		});
	// 	}
	// 	if (toAdd.length > 0) {
	// 		await runStep({
	// 			contract: `FuturesMarketManager`,
	// 			target: futuresMarketManager,
	// 			read: 'allMarkets(bool)',
	// 			readArg: [true],
	// 			expected: (markets) =>
	// 				JSON.stringify(markets.slice().sort()) ===
	// 				JSON.stringify(deployedPerpsV2Markets.slice().sort()),
	// 			write: 'addProxiedMarkets',
	// 			writeArg: [toAdd],
	// 			gasLimit: 150e3 * toAdd.length, // extra gas per market
	// 		});
	// 	}
	// 	// implementation was updated, but not the market (proxy)
	// 	marketImplementationsUpdated = perpMarketsImplementationUpdated.filter((element) =>
	// 		toKeep.includes(element)
	// 	);
	// }

	// SNIPPETS
	// const isMarketPaused = async ({ marketKey, SystemStatus }) => {
	// 	const marketKeyBytes = toBytes32(marketKey);
	// 	return (await SystemStatus.futuresMarketSuspension(marketKeyBytes)).suspended;
	// };

	// const ensureMarketPausedStatus = async ({ marketKey, SystemStatus, runStep, expectedPaused }) => {
	// 	let marketWasPaused;

	// 	const marketKeyBytes = toBytes32(marketKey);
	// 	marketWasPaused = (await SystemStatus.futuresMarketSuspension(marketKeyBytes)).suspended;
	// 	if (marketWasPaused === expectedPaused) {
	// 		return marketWasPaused;
	// 	}

	// 	if (expectedPaused) {
	// 		await runStep({
	// 			contract: 'SystemStatus',
	// 			target: SystemStatus,
	// 			write: 'suspendFuturesMarket',
	// 			writeArg: [marketKeyBytes, 80],
	// 			comment: 'Ensure perpsV2 market is paused according to expected status',
	// 		});
	// 	} else {
	// 		await runStep({
	// 			contract: 'SystemStatus',
	// 			target: SystemStatus,
	// 			write: 'resumeFuturesMarket',
	// 			writeArg: [marketKeyBytes],
	// 			comment: 'Ensure perpsV2 market is not paused according to expected status',
	// 		});
	// 	}

	// 	return marketWasPaused;
	// };

	// OTHER SNIPPETS
	// await Promise.all(
	// 	resolvedContracts.map(([name, contract]) => {
	// 		return limitPromise(async () => {
	// 			const currentAddress = await AddressResolver.getAddress(toBytes32(name));

	// 			// only import ext: addresses if they have never been imported before
	// 			if (currentAddress !== contract.address) {
	// 				console.log(green(`${name} needs to be imported to the AddressResolver`));

	// 				addressArgs[0].push(toBytes32(name));
	// 				addressArgs[1].push(contract.address);

	// 				// const { source, address } = contract;
	// 				// newContractsBeingAdded[contract.address] = { name, source, address, contract };
	// 			}
	// 		});
	// 	})
	// );
};

module.exports = {
	deployPerpsV2Generics,
	deployPerpsV2Markets,
	cleanupPerpsV2,
};
