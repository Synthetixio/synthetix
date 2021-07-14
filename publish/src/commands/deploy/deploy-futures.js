'use strict';

const { gray } = require('chalk');
const { toBytes32 } = require('../../../..');

module.exports = async ({ account, addressOf, getDeployParameter, deployer, runStep, useOvm }) => {
	const { ReadProxyAddressResolver, AddressResolver } = deployer.deployedContracts;

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
		deps: ['ReadProxyAddressResolver'],
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

	// This belongs in dapp-utils, but since we are only deploying futures on L2,
	// I've colocated it here for now.
	await deployer.deployContract({
		name: 'FuturesMarketData',
		args: [addressOf(ReadProxyAddressResolver)],
		deps: ['AddressResolver'],
	});

	// NOTE: Disabled until we figure out an issue with the bytecode of this contract being unsafe.
	//
	const futuresMarketSettings = await deployer.deployContract({
		name: 'FuturesMarketSettings',
		args: [account, addressOf(ReadProxyAddressResolver)],
	});

	// FuturesMarketSettings will be deployed manually using Remix.
	// The args for deployment are logged below.
	// console.log([account, addressOf(ReadProxyAddressResolver)])

	// Import the FuturesMarketSettings contract into the AddressResolver.
	// if(0) {
	// 	const importArgs = [
	// 		[toBytes32('FuturesMarketSettings')],
	// 		// [deployer.deployment.targets['FuturesMarketSettings'].address],
	// 		['0x'+'1'.repeat(40)]
	// 	];
	// 	await runStep({
	// 		gasLimit: 6e6, // higher gas required for mainnet
	// 		contract: `AddressResolver`,
	// 		target: AddressResolver,
	// 		read: 'areAddressesImported',
	// 		readArg: importArgs,
	// 		expected: input => input,
	// 		write: 'importAddresses',
	// 		writeArg: importArgs,
	// 	});
	// } else {

	// }

	const futuresAssets = await getDeployParameter('FUTURES_ASSETS');
	const deployedFuturesMarkets = [];

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
