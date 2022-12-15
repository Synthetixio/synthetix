'use strict';

const { gray } = require('chalk');
const { toBytes32 } = require('../../../..');

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
	// Futures market setup
	// ----------------

	console.log(gray(`\n------ DEPLOY PERPS V2 MARKETS ------\n`));

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

	await deployer.deployContract({
		name: 'PerpsV2ExchangeRate',
		args: [account, addressOf(ReadProxyAddressResolver)],
	});

	const deployedFuturesMarkets = [];

	for (const marketConfig of perpsv2Markets) {
		console.log(
			gray(`attempting to deploy market for ${marketConfig.asset} - ${marketConfig.marketKey}`)
		);
		let filteredFunctions = [];
		const baseAsset = toBytes32(marketConfig.asset);
		const marketKey = toBytes32(marketConfig.marketKey);
		const marketName = 'PerpsV2Market' + marketConfig.marketKey.slice('1'); // remove s prefix
		const marketProxyName = 'PerpsV2Proxy' + marketConfig.marketKey.slice('1'); // remove s prefix
		const marketStateName = 'PerpsV2MarketState' + marketConfig.marketKey.slice('1'); // remove s prefix
		const marketViewName = 'PerpsV2MarketViews' + marketConfig.marketKey.slice('1'); // remove s prefix
		const marketDelayedOrderName = 'PerpsV2DelayedOrder' + marketConfig.marketKey.slice('1'); // remove s prefix
		const marketOffchainDelayedOrderName =
			'PerpsV2OffchainDelayedOrder' + marketConfig.marketKey.slice('1'); // remove s prefix

		// Deploy contracts
		// Proxy
		const futuresMarketProxy = await deployer.deployContract({
			name: marketProxyName,
			source: 'ProxyPerpsV2',
			args: [account],
			force: true,
			skipResolver: true,
		});

		// State
		const futuresMarketState = await deployer.deployContract({
			name: marketStateName,
			source: 'PerpsV2MarketState',
			args: [account, [account], baseAsset, marketKey],
			force: true,
		});

		// Market
		const futuresMarket = await deployer.deployContract({
			name: marketName,
			source: 'PerpsV2Market',
			args: [
				futuresMarketProxy.address,
				futuresMarketState.address,
				account,
				addressOf(ReadProxyAddressResolver),
			],
			force: true,
			skipResolver: true,
		});

		// Views
		const futuresMarketViews = await deployer.deployContract({
			name: marketViewName,
			source: 'PerpsV2MarketViews',
			args: [futuresMarketState.address, account, addressOf(ReadProxyAddressResolver)],
			force: true,
			skipResolver: true,
		});

		// DelayedOrder
		const futuresMarketDelayedOrder = await deployer.deployContract({
			name: marketDelayedOrderName,
			source: 'PerpsV2MarketDelayedOrders',
			args: [
				futuresMarketProxy.address,
				futuresMarketState.address,
				account,
				addressOf(ReadProxyAddressResolver),
			],
			force: true,
			skipResolver: true,
		});

		// Offchain DelayedOrder
		const futuresMarketDelayedOrderOffchain = await deployer.deployContract({
			name: marketOffchainDelayedOrderName,
			source: 'PerpsV2MarketDelayedOrdersOffchain',
			args: [
				futuresMarketProxy.address,
				futuresMarketState.address,
				account,
				addressOf(ReadProxyAddressResolver),
			],
			force: true,
			skipResolver: true,
		});

		// Configure Contracts, Proxy and State

		// Initial cleanup
		await runStep({
			contract: `PerpsV2MarketState`,
			target: futuresMarketState,
			write: 'removeAssociatedContracts',
			writeArg: [[account]],
		});

		// Configure Views
		filteredFunctions.push(...getFunctionSignatures(futuresMarketViews, excludedFunctions));

		// Configure Next Price
		await runStep({
			contract: `PerpsV2MarketState`,
			target: futuresMarketState,
			write: 'addAssociatedContracts',
			writeArg: [[futuresMarketDelayedOrder.address]],
		});

		await runStep({
			contract: `PerpsV2MarketDelayedOrders`,
			target: futuresMarketDelayedOrder,
			write: 'setProxy',
			writeArg: [futuresMarketProxy.address],
		});

		filteredFunctions.push(...getFunctionSignatures(futuresMarketDelayedOrder, excludedFunctions));

		// Configure Offchain Next Price
		await runStep({
			contract: `PerpsV2MarketState`,
			target: futuresMarketState,
			write: 'addAssociatedContracts',
			writeArg: [[futuresMarketDelayedOrderOffchain.address]],
		});

		await runStep({
			contract: `PerpsV2MarketDelayedOrdersOffchain`,
			target: futuresMarketDelayedOrderOffchain,
			write: 'setProxy',
			writeArg: [futuresMarketProxy.address],
		});

		filteredFunctions.push(
			...getFunctionSignatures(futuresMarketDelayedOrderOffchain, excludedFunctions)
		);

		// Configure Market
		await runStep({
			contract: `PerpsV2MarketState`,
			target: futuresMarketState,
			write: 'addAssociatedContracts',
			writeArg: [[futuresMarket.address]],
		});

		await runStep({
			contract: `PerpsV2Market`,
			target: futuresMarket,
			write: 'setProxy',
			writeArg: [futuresMarketProxy.address],
		});

		filteredFunctions.push(...getFunctionSignatures(futuresMarket, excludedFunctions));

		// Remove duplicate selectors
		filteredFunctions = filteredFunctions.filter(
			(value, index, self) => index === self.findIndex(t => t.signature === value.signature)
		);
		// Order by selectors
		filteredFunctions = filteredFunctions.sort((a, b) => a.signature > b.signature);

		// Add Missing selectors
		for (const f of filteredFunctions) {
			await runStep({
				contract: 'ProxyPerpsV2',
				target: futuresMarketProxy,
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

		if (futuresMarketProxy) {
			deployedFuturesMarkets.push(addressOf(futuresMarketProxy));
		}
	}

	// Now replace the relevant markets in the manager (if any)

	if (futuresMarketManager && deployedFuturesMarkets.length > 0) {
		const managerKnownMarkets = Array.from(
			await futuresMarketManager['allMarkets(bool)'](true)
		).sort();

		const toRemove = managerKnownMarkets.filter(market => !deployedFuturesMarkets.includes(market));
		const toKeep = managerKnownMarkets
			.filter(market => deployedFuturesMarkets.includes(market))
			.sort();
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

		const toAdd = deployedFuturesMarkets.filter(market => !managerKnownMarkets.includes(market));

		if (toAdd.length > 0) {
			await runStep({
				contract: `FuturesMarketManager`,
				target: futuresMarketManager,
				read: 'allMarkets(bool)',
				readArg: [true],
				expected: markets =>
					JSON.stringify(markets.slice().sort()) ===
					JSON.stringify(deployedFuturesMarkets.slice().sort()),
				write: 'addProxiedMarkets',
				writeArg: [toAdd],
				gasLimit: 150e3 * toAdd.length, // extra gas per market
			});
		}
	}
};
