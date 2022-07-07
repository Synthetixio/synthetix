'use strict';

const { gray } = require('chalk');
const { toBytes32 } = require('../../../..');

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

	const { futuresMarkets } = loadAndCheckRequiredSources({
		deploymentPath,
		network,
	});

	// ----------------
	// Futures market setup
	// ----------------

	console.log(gray(`\n------ DEPLOY FUTURES MARKETS ------\n`));

	const futuresMarketManager = await deployer.deployContract({
		name: 'FuturesMarketManager',
		source: useOvm ? 'FuturesMarketManager' : 'EmptyFuturesMarketManager',
		args: useOvm ? [account, addressOf(ReadProxyAddressResolver)] : [],
		deps: ['ReadProxyAddressResolver'],
	});

	if (!useOvm) {
		return;
	}

	// This belongs in dapp-utils, but since we are only deploying futures on L2,
	// I've colocated it here for now.
	await deployer.deployContract({
		name: 'FuturesMarketData',
		args: [addressOf(ReadProxyAddressResolver)],
		deps: ['AddressResolver'],
	});

	await deployer.deployContract({
		name: 'FuturesMarketSettings',
		args: [account, addressOf(ReadProxyAddressResolver)],
	});

	const deployedFuturesMarkets = [];

	for (const marketConfig of futuresMarkets) {
		const baseAsset = toBytes32(marketConfig.asset);
		const marketKey = toBytes32(marketConfig.marketKey);
		const marketName = 'FuturesMarket' + marketConfig.marketKey.slice('1'); // remove s prefix

		const futuresMarket = await deployer.deployContract({
			name: marketName,
			source: 'FuturesMarket',
			args: [addressOf(ReadProxyAddressResolver), baseAsset, marketKey],
		});

		if (futuresMarket) {
			deployedFuturesMarkets.push(addressOf(futuresMarket));
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
