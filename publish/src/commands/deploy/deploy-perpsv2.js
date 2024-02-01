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

const deployPerpsV2Generics = async ({
	account,
	addressOf,
	deployer,
	runStep,
	useOvm,
	limitPromise,
}) => {
	const { ReadProxyAddressResolver } = deployer.deployedContracts;
	const contractsRequiringAddressResolver = [];

	// ----------------
	// PerpsV2 market setup
	// ----------------

	console.log(gray(`\n------ DEPLOY PERPS V2 GENERICS  ------\n`));

	// Get previous added markets
	let prevFuturesMarketManager;
	const deployedFuturesMarketManagerAddress = deployer.getExistingAddress({
		name: 'FuturesMarketManager',
	});

	try {
		prevFuturesMarketManager = deployer.getExistingContract({
			contract: 'FuturesMarketManager',
		});
	} catch (e) {}
	const prevFuturesMarketManagerConfig = {};
	if (useOvm && prevFuturesMarketManager) {
		const proxiedMarkets = await prevFuturesMarketManager['allMarkets(bool)'](true);
		const nonProxiedMarkets = await prevFuturesMarketManager['allMarkets(bool)'](false);
		prevFuturesMarketManagerConfig.proxiedMarkets = proxiedMarkets;
		prevFuturesMarketManagerConfig.nonProxiedMarkets = nonProxiedMarkets;
	}

	const futuresMarketManager = await deployer.deployContract({
		name: 'FuturesMarketManager',
		source: useOvm ? 'FuturesMarketManager' : 'EmptyFuturesMarketManager',
		args: useOvm ? [account, addressOf(ReadProxyAddressResolver)] : [],
		deps: ['ReadProxyAddressResolver'],
	});
	contractsRequiringAddressResolver.push({
		name: 'FuturesMarketManager',
		target: futuresMarketManager,
	});

	if (!useOvm) {
		return { futuresMarketManager };
	}

	if (
		prevFuturesMarketManager &&
		futuresMarketManager.address !== deployedFuturesMarketManagerAddress
	) {
		// FuturesMarketManager changed. Import current markets before going on to maintain previous configuration

		await runStep({
			contract: 'FuturesMarketManager',
			target: futuresMarketManager,
			write: 'addMarkets',
			writeArg: [prevFuturesMarketManagerConfig.nonProxiedMarkets],
		});

		const chunkSize = 10;
		for (let i = 0; i < prevFuturesMarketManagerConfig.proxiedMarkets.length; i += chunkSize) {
			const chunk = prevFuturesMarketManagerConfig.proxiedMarkets.slice(i, i + chunkSize);
			await runStep({
				contract: 'FuturesMarketManager',
				target: futuresMarketManager,
				write: 'addProxiedMarkets',
				writeArg: [chunk],
			});
		}
	}

	// This belongs in dapp-utils, but since we are only deploying perpsV2 on L2,
	// I've colocated it here for now.
	await deployer.deployContract({
		name: 'PerpsV2MarketData',
		args: [addressOf(ReadProxyAddressResolver)],
		deps: ['AddressResolver'],
	});
	// not adding to contractsRequiringAddressResolver since it doesn't need it

	const perpsV2MarketSettings = await deployer.deployContract({
		name: 'PerpsV2MarketSettings',
		args: [account, addressOf(ReadProxyAddressResolver)],
	});
	contractsRequiringAddressResolver.push({
		name: 'PerpsV2MarketSettings',
		target: perpsV2MarketSettings,
	});

	const perpsV2ExchangeRate = await deployer.deployContract({
		name: 'PerpsV2ExchangeRate',
		args: [account, addressOf(ReadProxyAddressResolver)],
	});
	contractsRequiringAddressResolver.push({
		name: 'PerpsV2ExchangeRate',
		target: perpsV2ExchangeRate,
	});

	// rebuild caches for recently used contrats
	await importAddresses({
		runStep,
		deployer,
		addressOf,
		limitPromise,
	});

	await rebuildCaches({ runStep, deployer, implementations: contractsRequiringAddressResolver });

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

	// Grant futures pause/resume ACL to owner
	// const fakeAccountToReplace = '0x0011223344556677889900112233445566778899';
	await runStep({
		contract: 'SystemStatus',
		target: SystemStatus,
		read: 'accessControl',
		readArg: [toBytes32('Futures'), account],
		// readArg: [toBytes32('Futures'), fakeAccountToReplace],
		expected: ({ canSuspend } = {}) => canSuspend,
		write: 'updateAccessControl',
		writeArg: [toBytes32('Futures'), account, true, true],
		// writeArg: [toBytes32('Futures'), fakeAccountToReplace, true, true],
	});

	const numberOfMarkets = perpsv2Markets.length;
	let currentMarketIndex = 0;
	for (const marketConfig of perpsv2Markets) {
		currentMarketIndex++;
		if (specificMarkets && !specificMarkets.includes(marketConfig.marketKey)) {
			console.log(
				yellow(
					`Excluding market ${marketConfig.marketKey} since is not flaged for deploy in the command line`
				)
			);
			continue;
		}

		console.log(
			gray(
				`attempting to deploy market for ${marketConfig.asset} - ${marketConfig.marketKey} [${currentMarketIndex}/${numberOfMarkets}]`
			)
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

		// Initialize State
		const stateInitialized = await deployedMarketState.target.initialized();
		if (!stateInitialized) {
			await runStep({
				contract: deployedMarketState.contract,
				target: deployedMarketState.target,
				write: 'linkOrInitializeState',
				writeArg: [],
			});

			// if updated, enable in legacy state
			if (deployedMarketState.updated && deployedMarketState.previousContractTarget) {
				// fix missing source
				deployedMarketState.previousContractTarget.source = 'PerpsV2MarketState';
				await runStep({
					customAddress: deployedMarketState.previousContractTarget.address,
					customSource: deployedMarketState.previousContractTarget.source,

					contract: `${deployedMarketState.contract}Legacy`,
					target: deployedMarketState.previousContractTarget,
					write: 'addAssociatedContracts',
					writeArg: [[deployedMarketState.target.address]],
				});
			}
		}

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

		let someImplementationUpdated = false;
		for (const implementation of implementations) {
			if (!someImplementationUpdated && implementation.updated) {
				someImplementationUpdated = true;
			}
			updatedContracts.push(implementation.target);
		}

		await linkToMarketManager({
			runStep,
			futuresMarketManager,
			proxies: [deployedMarketProxy.target.address],
			someImplementationUpdated,
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
		read: 'accessControl',
		// readArg: [toBytes32('Futures'), fakeAccountToReplace],
		readArg: [toBytes32('Futures'), account],
		expected: ({ canSuspend } = {}) => !canSuspend,
		write: 'updateAccessControl',
		// writeArg: [toBytes32('Futures'), fakeAccountToReplace, false, false],
		writeArg: [toBytes32('Futures'), account, false, false],
	});
};

const cleanupPerpsV2 = async ({
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

	const { PerpsV2ExchangeRate: perpsV2ExchangeRate } = deployer.deployedContracts;

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
		allImplementations.push(...implementations);
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

const configurePerpsV2GenericParams = async ({ deployer, getDeployParameter, runStep, useOvm }) => {
	console.log(gray(`\n------ CONFIGURE PERPS V2 GENERICS (ALL MARKETS) ------\n`));
	if (!useOvm) return;

	const { PerpsV2MarketSettings: futuresMarketSettings } = deployer.deployedContracts;

	const FUTURES_MIN_INITIAL_MARGIN = await getDeployParameter('FUTURES_MIN_INITIAL_MARGIN');
	await runStep({
		contract: 'PerpsV2MarketSettings',
		target: futuresMarketSettings,
		read: 'minInitialMargin',
		expected: input => input === FUTURES_MIN_INITIAL_MARGIN,
		write: 'setMinInitialMargin',
		writeArg: FUTURES_MIN_INITIAL_MARGIN,
		comment: 'Set the minimum margin to open a perpsV2 position (SIP-80)',
	});

	const FUTURES_LIQUIDATION_FEE_RATIO = await getDeployParameter('FUTURES_LIQUIDATION_FEE_RATIO');
	await runStep({
		contract: 'PerpsV2MarketSettings',
		target: futuresMarketSettings,
		read: 'liquidationFeeRatio',
		expected: input => input === FUTURES_LIQUIDATION_FEE_RATIO,
		write: 'setLiquidationFeeRatio',
		writeArg: FUTURES_LIQUIDATION_FEE_RATIO,
		comment: 'Set the reward for liquidating a perpsV2 position (SIP-80)',
	});

	const FUTURES_MIN_KEEPER_FEE = await getDeployParameter('FUTURES_MIN_KEEPER_FEE');
	await runStep({
		contract: 'PerpsV2MarketSettings',
		target: futuresMarketSettings,
		read: 'minKeeperFee',
		expected: input => input === FUTURES_MIN_KEEPER_FEE,
		write: 'setMinKeeperFee',
		writeArg: FUTURES_MIN_KEEPER_FEE,
		comment: 'Set the minimum reward for liquidating a perpsV2 position (SIP-80)',
	});

	const FUTURES_MAX_KEEPER_FEE = await getDeployParameter('FUTURES_MAX_KEEPER_FEE');
	await runStep({
		contract: 'PerpsV2MarketSettings',
		target: futuresMarketSettings,
		read: 'maxKeeperFee',
		expected: input => input === FUTURES_MAX_KEEPER_FEE,
		write: 'setMaxKeeperFee',
		writeArg: FUTURES_MAX_KEEPER_FEE,
		comment: 'Set the maximum reward for liquidating a perpsV2 position',
	});

	const PERPSV2_KEEPER_LIQUIDATION_FEE = await getDeployParameter('PERPSV2_KEEPER_LIQUIDATION_FEE');
	await runStep({
		contract: 'PerpsV2MarketSettings',
		target: futuresMarketSettings,
		read: 'keeperLiquidationFee',
		expected: input => input === PERPSV2_KEEPER_LIQUIDATION_FEE,
		write: 'setKeeperLiquidationFee',
		writeArg: PERPSV2_KEEPER_LIQUIDATION_FEE,
		comment: 'Set the keeper liquidation fee',
	});
};

module.exports = {
	deployPerpsV2Generics,
	deployPerpsV2Markets,
	cleanupPerpsV2,
	configurePerpsV2GenericParams,
};
