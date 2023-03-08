'use strict';

const { gray, yellow } = require('chalk');
const { confirmAction } = require('../../util');
const { toBytes32 } = require('../../../..');

const ethers = require('ethers');

const {
	isNewMarket,
	getProxyNameAndCurrentAddress,
	getImplementationNamesAndAddresses,
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
		return { futuresMarketManager };
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

const cleanupPerpsV2 = async ({
	// account,
	// addressOf,
	runStep,
	loadAndCheckRequiredSources,
	futuresMarketManager,
	deploymentPath,
	network,
	deployer,
	useOvm,
}) => {
	console.log(gray(`\n------ CLEANUP PERPS V2 CONFIGURATION ------\n`));

	if (!useOvm) {
		return;
	}

	const {
		// ReadProxyAddressResolver,
		// PerpsV2MarketSettings: perpsV2MarketSettings,
		PerpsV2ExchangeRate: perpsV2ExchangeRate,
		// SystemStatus,
	} = deployer.deployedContracts;

	// Get list of perps markets
	const { perpsv2Markets } = loadAndCheckRequiredSources({
		deploymentPath,
		network,
	});

	const allImplementations = [];
	const allMarketProxies = [];
	for (const marketConfig of perpsv2Markets) {
		const marketKey = marketConfig.marketKey;

		const proxy = getProxyNameAndCurrentAddress({ deployer, marketKey });
		const implementations = getImplementationNamesAndAddresses({ deployer, marketKey });

		allMarketProxies.push(proxy.address);
		allImplementations.push(implementations);
	}

	// cleanup perps exchange rate associated contracts
	await linkToPerpsExchangeRate({
		runStep,
		perpsV2ExchangeRate,
		implementations: allImplementations,
		removeExtraAssociatedContracts: true,
	});

	// cleanup unused proxies
	await linkToMarketManager({
		runStep,
		futuresMarketManager,
		proxies: allMarketProxies,
		onlyRemoveUnusedProxies: true,
	});
};

module.exports = {
	deployPerpsV2Generics,
	deployPerpsV2Markets,
	cleanupPerpsV2,
};
