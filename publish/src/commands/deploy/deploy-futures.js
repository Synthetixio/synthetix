'use strict';

const { gray } = require('chalk');
const w3utils = require('web3-utils');
const { toBytes32 } = require('../../../..');

module.exports = async ({ account, addressOf, deployer, runStep, useOvm }) => {
	const { ReadProxyAddressResolver } = deployer.deployedContracts;

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
			? [addressOf(proxyFuturesMarketManager), account, addressOf(ReadProxyAddressResolver)]
			: [],
		deps: ['AddressResolver'],
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

	const futuresMarketSettings = await deployer.deployContract({
		name: 'FuturesMarketSettings',
		args: [(account, addressOf(ReadProxyAddressResolver))],
	});

	// This belongs in dapp-utils, but since we are only deploying futures on L2,
	// I've colocated it here for now.
	await deployer.deployContract({
		name: 'FuturesMarketData',
		args: [addressOf(ReadProxyAddressResolver)],
		deps: ['AddressResolver'],
	});

	// TODO: Perform this programmatically per-market
	const futuresAssets = ['BTC', 'ETH', 'LINK'];
	const deployedFuturesMarkets = [];
	const settings = {
		takerFee: w3utils.toWei('0.003'),
		makerFee: w3utils.toWei('0.001'),
		maxLeverage: w3utils.toWei('10'),
		maxMarketValue: w3utils.toWei('100000'),
		maxFundingRate: w3utils.toWei('0.1'),
		maxFundingRateSkew: w3utils.toWei('1'),
		maxFundingRateDelta: w3utils.toWei('0.0125'),
	};

	for (const asset of futuresAssets) {
		const marketName = 'FuturesMarket' + asset;
		const proxyName = 'Proxy' + marketName;
		const baseAsset = toBytes32('s' + asset);

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
				addressOf(ReadProxyAddressResolver),
				baseAsset,
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

		if (futuresMarketSettings) {
			// set the parameters before deploying the markets

			for (const setting in settings) {
				const capSetting = setting.charAt(0).toUpperCase() + setting.slice(1);
				const value = settings[setting];
				await runStep({
					contract: 'FuturesMarketSettings',
					target: futuresMarketSettings,
					read: `get${capSetting}`,
					expected: input => input === value,
					write: `set${capSetting}`,
					writeArg: value,
				});
			}
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
