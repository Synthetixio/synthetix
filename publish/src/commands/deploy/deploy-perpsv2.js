'use strict';

const { gray } = require('chalk');
const { toBytes32 } = require('../../../..');

const ethers = require('ethers');

const { excludedFunctions, getFunctionSignatures } = require('../../command-utils/perps-v2-utils');

module.exports = async ({
	account,
	addressOf,
	loadAndCheckRequiredSources,
	deployer,
	runStep,
	deploymentPath,
	network,
	useOvm,
	futuresMarketManager,
}) => {
	const { ReadProxyAddressResolver } = deployer.deployedContracts;

	// ----------------
	// PerpsV2 market setup
	// ----------------

	console.log(gray(`\n------ DEPLOY PERPS V2 MARKETS ------\n`));

	const filteredLists = (originalList, newList) => {
		const toRemove = originalList.filter(element => !newList.includes(element));

		const toKeep = originalList.filter(element => newList.includes(element)).sort();

		const toAdd = newList.filter(element => !originalList.includes(element));

		return { toRemove, toKeep, toAdd };
	};

	const { perpsv2Markets } = loadAndCheckRequiredSources({
		deploymentPath,
		network,
	});

	if (!futuresMarketManager) {
		futuresMarketManager = await deployer.deployContract({
			name: 'FuturesMarketManager',
			source: useOvm ? 'FuturesMarketManager' : 'EmptyFuturesMarketManager',
			args: useOvm ? [account, addressOf(ReadProxyAddressResolver)] : [],
			deps: ['ReadProxyAddressResolver'],
		});
	}

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

	const perpsV2ExchangeRate = await deployer.deployContract({
		name: 'PerpsV2ExchangeRate',
		args: [account, addressOf(ReadProxyAddressResolver)],
	});

	const deployedPerpsV2Markets = [];
	const perpMarketsImplementationUpdated = [];
	const exchangeRateAssociateContractAddresses = [];

	for (const marketConfig of perpsv2Markets) {
		console.log(
			gray(`attempting to deploy market for ${marketConfig.asset} - ${marketConfig.marketKey}`)
		);
		let filteredFunctions = [];
		const baseAsset = toBytes32(marketConfig.asset);
		const marketKey = toBytes32(marketConfig.marketKey);
		const marketProxyName = 'PerpsV2Proxy' + marketConfig.marketKey.slice('1'); // remove s prefix
		const marketStateName = 'PerpsV2MarketState' + marketConfig.marketKey.slice('1'); // remove s prefix
		const marketName = 'PerpsV2Market' + marketConfig.marketKey.slice('1'); // remove s prefix
		const marketLiquidateName = 'PerpsV2MarketLiquidate' + marketConfig.marketKey.slice('1'); // remove s prefix
		const marketViewName = 'PerpsV2MarketViews' + marketConfig.marketKey.slice('1'); // remove s prefix
		const marketDelayedIntentName = 'PerpsV2DelayedIntent' + marketConfig.marketKey.slice('1'); // remove s prefix
		const marketDelayedExecutionName =
			'PerpsV2DelayedExecution' + marketConfig.marketKey.slice('1'); // remove s prefix

		// Deploy contracts
		// Proxy
		const previousPerpsV2MarketProxy = deployer.getExistingAddress({
			name: marketProxyName,
		});
		const perpsV2MarketProxy = await deployer.deployContract({
			name: marketProxyName,
			source: 'ProxyPerpsV2',
			args: [account],
			force: true,
			skipResolver: true,
		});

		// State
		const previousPerpsV2MarketState = deployer.getExistingAddress({
			name: marketStateName,
		});
		const perpsV2MarketState = await deployer.deployContract({
			name: marketStateName,
			source: 'PerpsV2MarketState',
			args: [account, [account], baseAsset, marketKey],
			force: true,
		});

		// Market
		const previousPerpsV2Market = deployer.getExistingAddress({ name: marketName });
		const perpsV2Market = await deployer.deployContract({
			name: marketName,
			source: 'PerpsV2Market',
			args: [
				perpsV2MarketProxy.address,
				perpsV2MarketState.address,
				account,
				addressOf(ReadProxyAddressResolver),
			],
			force: true,
			skipResolver: true,
		});

		// Views
		const perpsV2MarketViews = await deployer.deployContract({
			name: marketViewName,
			source: 'PerpsV2MarketViews',
			args: [perpsV2MarketState.address, account, addressOf(ReadProxyAddressResolver)],
			force: true,
			skipResolver: true,
		});

		// Liquidate
		const previousPerpsV2MarketLiquidate = deployer.getExistingAddress({
			name: marketLiquidateName,
		});
		const perpsV2MarketLiquidate = await deployer.deployContract({
			name: marketLiquidateName,
			source: 'PerpsV2MarketLiquidate',
			args: [
				perpsV2MarketProxy.address,
				perpsV2MarketState.address,
				account,
				addressOf(ReadProxyAddressResolver),
			],
			force: true,
			skipResolver: true,
		});

		// DelayedIntent
		const previousPerpsV2MarketDelayedIntent = deployer.getExistingAddress({
			name: marketDelayedIntentName,
		});
		const perpsV2MarketDelayedIntent = await deployer.deployContract({
			name: marketDelayedIntentName,
			source: 'PerpsV2MarketDelayedIntent',
			args: [
				perpsV2MarketProxy.address,
				perpsV2MarketState.address,
				account,
				addressOf(ReadProxyAddressResolver),
			],
			force: true,
			skipResolver: true,
		});

		// DelayedExecution
		const previousPerpsV2MarketDelayedExecution = deployer.getExistingAddress({
			name: marketDelayedExecutionName,
		});
		const perpsV2MarketDelayedExecution = await deployer.deployContract({
			name: marketDelayedExecutionName,
			source: 'PerpsV2MarketDelayedExecution',
			args: [
				perpsV2MarketProxy.address,
				perpsV2MarketState.address,
				account,
				addressOf(ReadProxyAddressResolver),
			],
			force: true,
			skipResolver: true,
		});

		exchangeRateAssociateContractAddresses.push(perpsV2MarketDelayedIntent.address);
		exchangeRateAssociateContractAddresses.push(perpsV2MarketDelayedExecution.address);

		// Configure Contracts, Proxy and State

		// Initial cleanup
		const stateChanged = previousPerpsV2MarketState !== perpsV2MarketState.address;
		const stateOrProxyChanged =
			stateChanged || previousPerpsV2MarketProxy !== perpsV2MarketProxy.address;
		let implementationChanged = false;

		if (stateChanged) {
			await runStep({
				contract: `PerpsV2MarketState`,
				target: perpsV2MarketState,
				write: 'removeAssociatedContracts',
				writeArg: [[account]],
			});
		}

		// Configure Views
		filteredFunctions.push(...getFunctionSignatures(perpsV2MarketViews, excludedFunctions));

		// Configure Delayed Execution
		if (stateOrProxyChanged || previousPerpsV2MarketLiquidate !== perpsV2MarketLiquidate.address) {
			implementationChanged = true;
			await runStep({
				contract: `PerpsV2MarketState`,
				target: perpsV2MarketState,
				write: 'addAssociatedContracts',
				writeArg: [[perpsV2MarketLiquidate.address]],
			});

			await runStep({
				contract: `PerpsV2MarketLiquidate`,
				target: perpsV2MarketLiquidate,
				write: 'setProxy',
				writeArg: [perpsV2MarketProxy.address],
			});
		}

		filteredFunctions.push(...getFunctionSignatures(perpsV2MarketLiquidate, excludedFunctions));

		// Configure Delayed Intent
		if (
			stateOrProxyChanged ||
			previousPerpsV2MarketDelayedIntent !== perpsV2MarketDelayedIntent.address
		) {
			implementationChanged = true;
			await runStep({
				contract: `PerpsV2MarketState`,
				target: perpsV2MarketState,
				write: 'addAssociatedContracts',
				writeArg: [[perpsV2MarketDelayedIntent.address]],
			});

			await runStep({
				contract: `PerpsV2MarketDelayedIntent`,
				target: perpsV2MarketDelayedIntent,
				write: 'setProxy',
				writeArg: [perpsV2MarketProxy.address],
			});
		}

		filteredFunctions.push(...getFunctionSignatures(perpsV2MarketDelayedIntent, excludedFunctions));

		// Configure Delayed Execution
		if (
			stateOrProxyChanged ||
			previousPerpsV2MarketDelayedExecution !== perpsV2MarketDelayedExecution.address
		) {
			implementationChanged = true;
			await runStep({
				contract: `PerpsV2MarketState`,
				target: perpsV2MarketState,
				write: 'addAssociatedContracts',
				writeArg: [[perpsV2MarketDelayedExecution.address]],
			});

			await runStep({
				contract: `PerpsV2MarketDelayedExecution`,
				target: perpsV2MarketDelayedExecution,
				write: 'setProxy',
				writeArg: [perpsV2MarketProxy.address],
			});
		}

		filteredFunctions.push(
			...getFunctionSignatures(perpsV2MarketDelayedExecution, excludedFunctions)
		);

		// Configure Market
		if (stateOrProxyChanged || previousPerpsV2Market !== perpsV2Market.address) {
			implementationChanged = true;
			await runStep({
				contract: `PerpsV2MarketState`,
				target: perpsV2MarketState,
				write: 'addAssociatedContracts',
				writeArg: [[perpsV2Market.address]],
			});

			await runStep({
				contract: `PerpsV2Market`,
				target: perpsV2Market,
				write: 'setProxy',
				writeArg: [perpsV2MarketProxy.address],
			});
		}

		filteredFunctions.push(...getFunctionSignatures(perpsV2Market, excludedFunctions));

		// Remove duplicate selectors
		filteredFunctions = filteredFunctions.filter(
			(value, index, self) => index === self.findIndex(t => t.signature === value.signature)
		);
		// Order by selectors
		filteredFunctions = filteredFunctions.sort((a, b) => a.signature > b.signature);

		// Remove unknown selectors
		const filteredFunctionSelectors = filteredFunctions.map(ff => ff.signature);
		const routesLength = await perpsV2MarketProxy.getRoutesLength();
		const routes = (await perpsV2MarketProxy.getRoutesPage(0, routesLength)).map(
			route => route.selector
		);
		const { toRemove } = filteredLists(routes, filteredFunctionSelectors);

		// Remove unnecessary selectors
		for (const f of toRemove) {
			await runStep({
				contract: 'ProxyPerpsV2',
				target: perpsV2MarketProxy,
				read: 'getRoute',
				readArg: [f],
				expected: readResult => readResult.implementation === ethers.constants.AddressZero,
				write: 'removeRoute',
				writeArg: [f],
			});
		}

		// Add Missing selectors
		const toAdd = filteredFunctions.filter(
			route =>
				!routes.find(
					item =>
						item.selector === route.signature &&
						item.isView === route.isView &&
						item.implementation === route.contractAddress
				)
		);

		for (const f of toAdd) {
			await runStep({
				contract: 'ProxyPerpsV2',
				target: perpsV2MarketProxy,
				read: 'getRoute',
				readArg: [f.signature],
				expected: readResult =>
					readResult.selector === f.signature &&
					readResult.implementation === f.contractAddress &&
					readResult.isView === f.isView,
				write: 'addRoute',
				writeArg: [f.signature, f.contractAddress, f.isView],
			});
		}

		if (perpsV2MarketProxy) {
			deployedPerpsV2Markets.push(addressOf(perpsV2MarketProxy));

			if (implementationChanged) {
				perpMarketsImplementationUpdated.push(addressOf(perpsV2MarketProxy));
			}
		}
	}

	// Add/Remove the relevant associated contracts in PerpsV2ExchangeRate
	if (perpsV2ExchangeRate && exchangeRateAssociateContractAddresses.length > 0) {
		const knownAssociates = Array.from(await perpsV2ExchangeRate.associatedContracts()).sort();

		const { toRemove, toKeep, toAdd } = filteredLists(
			knownAssociates,
			exchangeRateAssociateContractAddresses
		);

		if (toRemove.length > 0) {
			await runStep({
				contract: `PerpsV2ExchangeRate`,
				target: perpsV2ExchangeRate,
				read: 'associatedContracts()',
				expected: contracts => JSON.stringify(contracts.slice().sort()) === JSON.stringify(toKeep),
				write: 'removeAssociatedContracts',
				writeArg: [toRemove],
			});
		}

		if (toAdd.length > 0) {
			await runStep({
				contract: `PerpsV2ExchangeRate`,
				target: perpsV2ExchangeRate,
				read: 'associatedContracts()',
				expected: contracts =>
					JSON.stringify(contracts.slice().sort()) ===
					JSON.stringify(exchangeRateAssociateContractAddresses.slice().sort()),
				write: 'addAssociatedContracts',
				writeArg: [toAdd],
				gasLimit: 150e3 * toAdd.length, // extra gas per market
			});
		}
	}

	// Replace the relevant markets in the manager (if any)
	let marketImplementationsUpdated = perpMarketsImplementationUpdated;
	if (futuresMarketManager && deployedPerpsV2Markets.length > 0) {
		const managerKnownMarkets = Array.from(
			await futuresMarketManager['allMarkets(bool)'](true)
		).sort();

		const { toRemove, toKeep, toAdd } = filteredLists(managerKnownMarkets, deployedPerpsV2Markets);

		if (toRemove.length > 0) {
			await runStep({
				contract: `FuturesMarketManager`,
				target: futuresMarketManager,
				read: 'allMarkets(bool)',
				readArg: [true],
				expected: markets => JSON.stringify(markets.slice().sort()) === JSON.stringify(toKeep),
				write: 'removeMarkets',
				writeArg: [toRemove],
			});
		}

		if (toAdd.length > 0) {
			await runStep({
				contract: `FuturesMarketManager`,
				target: futuresMarketManager,
				read: 'allMarkets(bool)',
				readArg: [true],
				expected: markets =>
					JSON.stringify(markets.slice().sort()) ===
					JSON.stringify(deployedPerpsV2Markets.slice().sort()),
				write: 'addProxiedMarkets',
				writeArg: [toAdd],
				gasLimit: 150e3 * toAdd.length, // extra gas per market
			});
		}

		// implememtation was updated, but not the market (proxy)
		marketImplementationsUpdated = perpMarketsImplementationUpdated.filter(element =>
			toKeep.includes(element)
		);
	}

	// Update markets implementations if its needed.
	if (futuresMarketManager && marketImplementationsUpdated.length > 0) {
		await runStep({
			contract: `FuturesMarketManager`,
			target: futuresMarketManager,
			write: 'updateMarketsImplementations',
			writeArg: [marketImplementationsUpdated],
		});
	}
};
