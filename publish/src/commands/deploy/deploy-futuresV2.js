'use strict';

const { gray } = require('chalk');
const { toBytes32 } = require('../../../..');

const {
	excludedFunctions,
	getFunctionSignatures,
} = require('../../command-utils/futures-v2-utils');

module.exports = async ({
	account,
	addressOf,
	loadAndCheckRequiredSources,
	deployer,
	runStep,
	deploymentPath,
	network,
	useOvm,
}) => {
	const { ReadProxyAddressResolver } = deployer.deployedContracts;

	// ----------------
	// Futures market setup
	// ----------------

	console.log(gray(`\n------ DEPLOY FUTURES V2 MARKETS ------\n`));

	const { futuresMarkets } = loadAndCheckRequiredSources({
		deploymentPath,
		network,
	});

	const futuresMarketManager = await deployer.deployContract({
		name: 'FuturesV2MarketManager',
		source: useOvm ? 'FuturesV2MarketManager' : 'EmptyFuturesV2MarketManager',
		args: useOvm ? [account, addressOf(ReadProxyAddressResolver)] : [],
		deps: ['ReadProxyAddressResolver'],
	});

	if (!useOvm) {
		return;
	}

	// This belongs in dapp-utils, but since we are only deploying futures on L2,
	// I've colocated it here for now.
	await deployer.deployContract({
		name: 'FuturesV2MarketData',
		args: [addressOf(ReadProxyAddressResolver)],
		deps: ['AddressResolver'],
	});

	await deployer.deployContract({
		name: 'FuturesV2MarketSettings',
		args: [account, addressOf(ReadProxyAddressResolver)],
	});

	const deployedFuturesMarkets = [];

	for (const marketConfig of futuresMarkets) {
		console.log(
			gray(`attempting to deploy market for ${marketConfig.asset} - ${marketConfig.marketKey}`)
		);
		let filteredFunctions;
		const baseAsset = toBytes32(marketConfig.asset);
		const marketKey = toBytes32(marketConfig.marketKey);
		const marketName = 'FuturesV2Market' + marketConfig.marketKey.slice('1'); // remove s prefix
		const marketProxyName = 'ProxyFuturesV2' + marketConfig.marketKey.slice('1'); // remove s prefix
		const marketStateName = 'FuturesV2MarketState' + marketConfig.marketKey.slice('1'); // remove s prefix
		const marketViewName = 'FuturesV2MarketViews' + marketConfig.marketKey.slice('1'); // remove s prefix
		const marketNextPriceName = 'FuturesV2NextPrice' + marketConfig.marketKey.slice('1'); // remove s prefix

		// Deploy contracts
		// Proxy
		const futuresMarketProxy = await deployer.deployContract({
			name: marketProxyName,
			source: 'ProxyFuturesV2',
			args: [account],
		});

		// State
		const futuresMarketState = await deployer.deployContract({
			name: marketStateName,
			source: 'FuturesV2MarketState',
			args: [account, [account], baseAsset, marketKey],
		});

		// Market
		const futuresMarket = await deployer.deployContract({
			name: marketName,
			source: 'FuturesV2Market',
			args: [
				futuresMarketProxy.address,
				futuresMarketState.address,
				account,
				addressOf(ReadProxyAddressResolver),
			],
		});

		// Views
		const futuresMarketViews = await deployer.deployContract({
			name: marketViewName,
			source: 'FuturesV2MarketViews',
			args: [futuresMarketState.address, account, addressOf(ReadProxyAddressResolver)],
		});

		// Next Price
		const futuresMarketNextPrice = await deployer.deployContract({
			name: marketNextPriceName,
			source: 'FuturesV2MarketNextPriceOrders',
			args: [
				futuresMarketProxy.address,
				futuresMarketState.address,
				account,
				addressOf(ReadProxyAddressResolver),
			],
		});

		// Configure Contracts, Proxy and State

		// Initial cleanup
		await runStep({
			contract: `FuturesV2MarketState`,
			target: futuresMarketState,
			write: 'removeAssociatedContracts',
			writeArg: [[account.address]],
		});

		// Configure Views
		filteredFunctions = getFunctionSignatures(futuresMarketViews, excludedFunctions);
		for (const f in filteredFunctions) {
			await runStep({
				contract: `ProxyFuturesV2`,
				target: futuresMarketProxy,
				write: 'addRoute',
				writeArg: [f.signature, futuresMarketViews.address, f.isView],
			});
		}

		// Configure Next Price
		await runStep({
			contract: `FuturesV2MarketState`,
			target: futuresMarketState,
			write: 'addAssociatedContracts',
			writeArg: [[futuresMarketNextPrice.address]],
		});

		await runStep({
			contract: `FuturesV2MarketNextPriceOrders`,
			target: futuresMarketNextPrice,
			write: 'setProxy',
			writeArg: [futuresMarketProxy.address],
		});

		filteredFunctions = getFunctionSignatures(futuresMarketNextPrice, excludedFunctions);
		for (const f in filteredFunctions) {
			await runStep({
				contract: `ProxyFuturesV2`,
				target: futuresMarketProxy,
				write: 'addRoute',
				writeArg: [f.signature, futuresMarketNextPrice.address, f.isView],
			});
		}

		// Configure Market
		await runStep({
			contract: `FuturesV2MarketState`,
			target: futuresMarketState,
			write: 'addAssociatedContracts',
			writeArg: [[futuresMarket.address]],
		});

		await runStep({
			contract: `FuturesV2Market`,
			target: futuresMarket,
			write: 'setProxy',
			writeArg: [futuresMarketProxy.address],
		});

		filteredFunctions = getFunctionSignatures(futuresMarket, excludedFunctions);
		for (const f in filteredFunctions) {
			await runStep({
				contract: `ProxyFuturesV2`,
				target: futuresMarketProxy,
				write: 'addRoute',
				writeArg: [f.signature, futuresMarket.address, f.isView],
			});
		}

		if (futuresMarketProxy) {
			deployedFuturesMarkets.push(addressOf(futuresMarketProxy));
		}
	}

	// Now replace the relevant markets in the manager (if any)

	if (futuresMarketManager && deployedFuturesMarkets.length > 0) {
		const numManagerKnownMarkets = await futuresMarketManager.numMarkets();
		const managerKnownMarkets = Array.from(
			await futuresMarketManager.markets(0, numManagerKnownMarkets)
		).sort();

		const toRemove = managerKnownMarkets.filter(market => !deployedFuturesMarkets.includes(market));
		const toKeep = managerKnownMarkets
			.filter(market => deployedFuturesMarkets.includes(market))
			.sort();
		if (toRemove.length > 0) {
			await runStep({
				contract: `FuturesV2MarketManager`,
				target: futuresMarketManager,
				read: 'markets',
				readArg: [0, numManagerKnownMarkets],
				expected: markets => JSON.stringify(markets.slice().sort()) === JSON.stringify(toKeep),
				write: 'removeMarkets',
				writeArg: [toRemove],
			});
		}

		const toAdd = deployedFuturesMarkets.filter(market => !managerKnownMarkets.includes(market));

		if (toAdd.length > 0) {
			await runStep({
				contract: `FuturesV2MarketManager`,
				target: futuresMarketManager,
				read: 'markets',
				readArg: [0, Math.max(numManagerKnownMarkets, deployedFuturesMarkets.length)],
				expected: markets =>
					JSON.stringify(markets.slice().sort()) ===
					JSON.stringify(deployedFuturesMarkets.slice().sort()),
				write: 'addMarkets',
				writeArg: [toAdd],
				gasLimit: 150e3 * toAdd.length, // extra gas per market
			});
		}
	}
};
