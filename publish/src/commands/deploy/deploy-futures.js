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

	if (useOvm) {
		// deploy an empty perps manager for futures manager to query for perps debt
		await deployer.deployContract({
			name: 'PerpsManagerV2',
			source: 'EmptyPerpsManagerV2',
			args: [],
			deps: [],
		});
	}

	await deployer.deployContract({
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

	return deployedFuturesMarkets;
};
