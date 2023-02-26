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
	// Futures market setup
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

	const deployedFuturesMarkets = [];
	const perpMarketsImplementationUpdated = [];
	const exchangeRateAssociateContractAddresses = [];

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

		const isNewMarket = !existingMarkets.includes(marketKey);
		if (isNewMarket) {
			console.log(gray(`market ${marketConfig.marketKey} is a new market.`));
		}
		// Deploy contracts
		// Proxy
		const previousFuturesMarketProxy = deployer.getExistingAddress({
			name: marketProxyName,
		});
		const futuresMarketProxy = await deployer.deployContract({
			name: marketProxyName,
			source: 'ProxyPerpsV2',
			args: [account],
			force: true,
			skipResolver: true,
		});

		// State
		const previousFuturesMarketState = deployer.getExistingAddress({
			name: marketStateName,
		});
		const futuresMarketState = await deployer.deployContract({
			name: marketStateName,
			source: 'PerpsV2MarketState',
			args: [account, [account], baseAsset, marketKey],
			force: true,
		});

		// Market
		const previousFuturesMarket = deployer.getExistingAddress({ name: marketName });
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
		const previousFuturesMarketDelayedOrder = deployer.getExistingAddress({
			name: marketDelayedOrderName,
		});
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
		const previousFuturesMarketDelayedOrderOffchain = deployer.getExistingAddress({
			name: marketOffchainDelayedOrderName,
		});
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

		exchangeRateAssociateContractAddresses.push(futuresMarketDelayedOrderOffchain.address);

		// Configure Contracts, Proxy and State

		// Initial cleanup
		const stateChanged = previousFuturesMarketState !== futuresMarketState.address;
		const stateOrProxyChanged =
			stateChanged || previousFuturesMarketProxy !== futuresMarketProxy.address;
		let implementationChanged = false;

		if (stateChanged) {
			await runStep(
				{
					contract: `PerpsV2MarketState`,
					target: futuresMarketState,
					write: 'removeAssociatedContracts',
					writeArg: [[account]],
				},
				{
					generateSolidity: !isNewMarket,
				}
			);
		}

		// Configure Views
		filteredFunctions.push(...getFunctionSignatures(futuresMarketViews, excludedFunctions));

		// Configure Next Price
		if (
			stateOrProxyChanged ||
			previousFuturesMarketDelayedOrder !== futuresMarketDelayedOrder.address
		) {
			implementationChanged = true;
			await runStep(
				{
					contract: `PerpsV2MarketState`,
					target: futuresMarketState,
					write: 'addAssociatedContracts',
					writeArg: [[futuresMarketDelayedOrder.address]],
				},
				{
					generateSolidity: !isNewMarket,
				}
			);

			await runStep(
				{
					contract: `PerpsV2MarketDelayedOrders`,
					target: futuresMarketDelayedOrder,
					write: 'setProxy',
					writeArg: [futuresMarketProxy.address],
				},
				{
					generateSolidity: !isNewMarket,
				}
			);
		}

		filteredFunctions.push(...getFunctionSignatures(futuresMarketDelayedOrder, excludedFunctions));

		// Configure Offchain Next Price
		if (
			stateOrProxyChanged ||
			previousFuturesMarketDelayedOrderOffchain !== futuresMarketDelayedOrderOffchain.address
		) {
			implementationChanged = true;
			await runStep(
				{
					contract: `PerpsV2MarketState`,
					target: futuresMarketState,
					write: 'addAssociatedContracts',
					writeArg: [[futuresMarketDelayedOrderOffchain.address]],
				},
				{
					generateSolidity: !isNewMarket,
				}
			);

			await runStep(
				{
					contract: `PerpsV2MarketDelayedOrdersOffchain`,
					target: futuresMarketDelayedOrderOffchain,
					write: 'setProxy',
					writeArg: [futuresMarketProxy.address],
				},
				{
					generateSolidity: !isNewMarket,
				}
			);
		}

		filteredFunctions.push(
			...getFunctionSignatures(futuresMarketDelayedOrderOffchain, excludedFunctions)
		);

		// Configure Market
		if (stateOrProxyChanged || previousFuturesMarket !== futuresMarket.address) {
			implementationChanged = true;
			await runStep(
				{
					contract: `PerpsV2MarketState`,
					target: futuresMarketState,
					write: 'addAssociatedContracts',
					writeArg: [[futuresMarket.address]],
				},
				{
					generateSolidity: !isNewMarket,
				}
			);

			await runStep(
				{
					contract: `PerpsV2Market`,
					target: futuresMarket,
					write: 'setProxy',
					writeArg: [futuresMarketProxy.address],
				},
				{
					generateSolidity: !isNewMarket,
				}
			);
		}

		filteredFunctions.push(...getFunctionSignatures(futuresMarket, excludedFunctions));

		// Remove duplicate selectors
		filteredFunctions = filteredFunctions.filter(
			(value, index, self) => index === self.findIndex(t => t.signature === value.signature)
		);
		// Order by selectors
		filteredFunctions = filteredFunctions.sort((a, b) => a.signature > b.signature);

		// Remove unknown selectors
		const filteredFunctionSelectors = filteredFunctions.map(ff => ff.signature);
		const routesLength = await futuresMarketProxy.getRoutesLength();
		const routes = await futuresMarketProxy.getRoutesPage(0, routesLength);
		const routesSelector = routes.map(route => route.selector);
		const { toRemove } = filteredLists(routesSelector, filteredFunctionSelectors);

		// Remove unnecessary selectors
		for (const f of toRemove) {
			await runStep(
				{
					contract: 'ProxyPerpsV2',
					target: futuresMarketProxy,
					read: 'getRoute',
					readArg: [f],
					expected: readResult => readResult.implementation === ethers.constants.AddressZero,
					write: 'removeRoute',
					writeArg: [f],
				},
				{
					generateSolidity: !isNewMarket,
				}
			);
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
			await runStep(
				{
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
				},
				{
					generateSolidity: !isNewMarket,
				}
			);
		}

		if (futuresMarketProxy) {
			deployedFuturesMarkets.push(addressOf(futuresMarketProxy));

			if (implementationChanged) {
				perpMarketsImplementationUpdated.push(addressOf(futuresMarketProxy));
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
	if (futuresMarketManager && deployedFuturesMarkets.length > 0) {
		const managerKnownMarkets = Array.from(
			await futuresMarketManager['allMarkets(bool)'](true)
		).sort();

		const { toRemove, toKeep, toAdd } = filteredLists(managerKnownMarkets, deployedFuturesMarkets);

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
					JSON.stringify(deployedFuturesMarkets.slice().sort()),
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
