'use strict';

const { gray } = require('chalk');
const { confirmAction } = require('../../util');

const ethers = require('ethers');

const {
	isNewMarket,
	deployMarketProxy,
	deployMarketState,
	deployMarketImplementations,
	deployStateMigration,
	setPausedMode,
	linkToPerpsExchangeRate,
	linkToProxy,
	linkToState,
	linkToMarketManager,
	configureMarket,
	rebuildCaches,
	migrateState,
} = require('../../command-utils/perps-v2-utils');

module.exports = async ({
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
	migrationContractName,
}) => {
	const { ReadProxyAddressResolver, SystemStatus, AddressResolver } = deployer.deployedContracts;

	// ----------------
	// PerpsV2 market setup
	// ----------------

	console.log(gray(`\n------ DEPLOY AND CONFIGURE PERPS V2 MARKETS ------\n`));

	const futuresMarketManager = await deployer.deployContract({
		name: 'FuturesMarketManager',
		source: useOvm ? 'FuturesMarketManager' : 'EmptyFuturesMarketManager',
		args: useOvm ? [account, addressOf(ReadProxyAddressResolver)] : [],
		deps: ['ReadProxyAddressResolver'],
	});

	if (!useOvm) {
		return;
	}

	const { perpsv2Markets } = loadAndCheckRequiredSources({
		deploymentPath,
		network,
	});

	// This belongs in dapp-utils, but since we are only deploying perpsV2 on L2,
	// I've colocated it here for now.
	await deployer.deployContract({
		name: 'PerpsV2MarketData',
		args: [addressOf(ReadProxyAddressResolver)],
		deps: ['AddressResolver'],
	});

	const perpsV2MarketSettings = await deployer.deployContract({
		name: 'PerpsV2MarketSettings',
		args: [account, addressOf(ReadProxyAddressResolver)],
	});

	const perpsV2ExchangeRate = await deployer.deployContract({
		name: 'PerpsV2ExchangeRate',
		args: [account, addressOf(ReadProxyAddressResolver)],
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

	for (const marketConfig of perpsv2Markets) {
		console.log(
			gray(`attempting to deploy market for ${marketConfig.asset} - ${marketConfig.marketKey}`)
		);

		const baseAsset = marketConfig.asset;
		const marketKey = marketConfig.marketKey;

		if (isNewMarket({ existingMarkets, marketKey })) {
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
			proxyAddress: deployedMarketProxy.contract.address,
			stateAddress: deployedMarketState.contract.address,
		});

		// Pause market to start linking/configuring
		await setPausedMode({
			marketKey,
			paused: true,
			SystemStatus,
			runStep,
			generateSolidity,
			yes,
			confirmAction,
		});

		// Link/configure contracts relationships
		await linkToState({
			runStep,
			perpsV2MarketState: deployedMarketState.contract,
			implementations,
		});

		await linkToPerpsExchangeRate({
			runStep,
			perpsV2ExchangeRate,
			implementations,
		});

		// STATE MIGRATION
		const deployedStateMigration =
			!isNewMarket && deployMarketState.updated
				? await deployStateMigration({
						deployer,
						owner: account,
						marketKey,
						migrationContractName,
						oldStateContractAddress: deployMarketState.oldContractAddress,
						newStateContractAddress: deployMarketState.oldContractAddress,
				  })
				: undefined;

		if (deployedStateMigration) {
			await migrateState({ runStep, migration: deployStateMigration });
		}

		await linkToProxy({
			runStep,
			perpsV2MarketProxy: deployedMarketProxy.contract,
			implementations,
		});

		await configureMarket({
			marketKey,
			marketConfig,
			perpsV2MarketSettings,
			SystemStatus,
			runStep,
			generateSolidity,
			yes,
			confirmAction,
		});

		await rebuildCaches({ runStep, AddressResolver, implementations });

		await linkToMarketManager({
			runStep,
			futuresMarketManager,
			proxies: [deployMarketProxy.contract],
		});
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
	}
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
};
