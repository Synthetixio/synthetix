'use strict';

const { gray } = require('chalk');
const w3utils = require('web3-utils');
const { toBytes32 } = require('../../../..');

module.exports = async ({
	account,
	addressOf,
	deployer,
	readProxyForResolver,
	runStep,
	useOvm,
}) => {
	// ----------------
	// Futures market setup
	// ----------------

	console.log(gray(`\n------ DEPLOY FUTURES MARKETS ------\n`));

	const proxyFuturesMarketManager = await deployer.deployContract({
		name: 'ProxyFuturesMarketManager',
		source: 'Proxy',
		args: [account],
	});

	const futuresMarketManager = await deployer.deployContract({
		name: 'FuturesMarketManager',
		source: useOvm ? 'FuturesMarketManager' : 'EmptyFuturesMarketManager',
		args: useOvm
			? [addressOf(proxyFuturesMarketManager), account, addressOf(readProxyForResolver)]
			: [],
	});

	if (!useOvm) {
		return;
	}

	if (proxyFuturesMarketManager && futuresMarketManager) {
		await runStep({
			contract: 'ProxyFuturesMarketManager',
			target: proxyFuturesMarketManager,
			read: 'target',
			expected: input => input === addressOf(futuresMarketManager),
			write: 'setTarget',
			writeArg: addressOf(futuresMarketManager),
		});
	}

	const futuresAssets = ['BTC', 'ETH', 'LINK'];
	const deployedFuturesMarkets = [];

	// TODO: Perform this programmatically per-market
	const takerFee = w3utils.toWei('0.003');
	const makerFee = w3utils.toWei('0.001');
	const maxLeverage = w3utils.toWei('10');
	const maxMarketDebt = w3utils.toWei('100000');
	const minInitialMargin = w3utils.toWei('100');
	const fundingParameters = [
		w3utils.toWei('0.1'), // max funding rate per day
		w3utils.toWei('1'), // max funding rate skew
		w3utils.toWei('0.0125'), // max funding rate delta per hour
	];

	for (const asset of futuresAssets) {
		const marketName = 'FuturesMarket' + asset;
		const proxyName = 'Proxy' + marketName;

		const proxyFuturesMarket = await deployer.deployContract({
			name: proxyName,
			source: 'Proxy',
			args: [account],
		});

		const futuresMarket = await deployer.deployContract({
			name: marketName,
			source: 'FuturesMarket',
			args: [
				addressOf(proxyFuturesMarket),
				account,
				addressOf(readProxyForResolver),
				toBytes32('s' + asset),
				takerFee,
				makerFee,
				maxLeverage,
				maxMarketDebt,
				minInitialMargin,
				fundingParameters,
			],
		});

		if (futuresMarket) {
			deployedFuturesMarkets.push(addressOf(futuresMarket));
		}

		if (proxyFuturesMarket && futuresMarket) {
			await runStep({
				contract: proxyName,
				target: proxyFuturesMarket,
				read: 'target',
				expected: input => input === addressOf(futuresMarket),
				write: 'setTarget',
				writeArg: addressOf(futuresMarket),
			});
		}
	}

	// Now replace the relevant markets in the manager (if any)

	if (futuresMarketManager && deployedFuturesMarkets.length > 0) {
		const numManagerKnownMarkets = await futuresMarketManager.methods.numMarkets().call();
		const managerKnownMarkets = Array.from(
			await futuresMarketManager.methods.markets(0, numManagerKnownMarkets).call()
		).sort();

		const toRemove = managerKnownMarkets.filter(market => !deployedFuturesMarkets.includes(market));
		const toKeep = managerKnownMarkets
			.filter(market => deployedFuturesMarkets.includes(market))
			.sort();
		if (toRemove.length > 0) {
			await runStep({
				contract: `FuturesMarketManager`,
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
				contract: `FuturesMarketManager`,
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
