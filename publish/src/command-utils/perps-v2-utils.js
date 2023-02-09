const ethers = require('ethers');
const { toBytes32 } = require('../../..');

// Perps V2 Proxy
const excludedFunctions = [
	// Owned
	'nominateNewOwner',
	'acceptOwnership',
	'nominatedOwner',
	'owner',
	// MixinResolver
	'resolver',
	'resolverAddressesRequired',
	'rebuildCache',
	'isResolvedCache',
	// ProxyPerpsV2
	'addRoute',
	'removeRoute',
	'getRoutesPage',
	'getRoutesLength',
	'getRoutesPage',
	'getAllTargets',
	// PerpsV2MarketBase
	'marketState',
];

const getFunctionSignatures = (instance, excludedFunctions) => {
	const contractInterface = instance.abi
		? new ethers.utils.Interface(instance.abi)
		: instance.interface;
	const signatures = [];
	const funcNames = Object.keys(contractInterface.functions);
	for (const funcName of funcNames) {
		const signature = {
			signature: contractInterface.getSighash(contractInterface.functions[funcName]),
			functionName: contractInterface.functions[funcName].name,
			stateMutability: contractInterface.functions[funcName].stateMutability,
			isView: contractInterface.functions[funcName].stateMutability === 'view',
			contractAddress: instance.address,
		};
		signatures.push(signature);
	}
	return signatures.filter(f => !excludedFunctions.includes(f.functionName));
};

const filteredLists = (originalList, newList) => {
	const toRemove = originalList.filter(element => !newList.includes(element));

	const toKeep = originalList.filter(element => newList.includes(element)).sort();

	const toAdd = newList.filter(element => !originalList.includes(element));

	return { toRemove, toKeep, toAdd };
};

const isNewMarket = (existingMarkets, marketKey) => existingMarkets.includes(marketKey);

const deployMarketProxy = async ({ deployer, owner, marketKey }) => {
	const marketProxyName = 'PerpsV2Proxy' + marketKey.slice('1'); // remove s prefix

	const previousContractAddress = deployer.getExistingAddress({
		name: marketProxyName,
	});

	const newContract = await deployer.deployContract({
		name: marketProxyName,
		source: 'ProxyPerpsV2',
		args: [owner],
		force: true,
		skipResolver: true,
	});

	const isSameContract = previousContractAddress === newContract.address;

	return { contract: newContract, updated: !isSameContract };
};

const deployMarketState = async ({ deployer, owner, marketKey, baseAsset }) => {
	const marketStateName = 'PerpsV2MarketState' + marketKey.slice('1'); // remove s prefix

	const previousContractAddress = deployer.getExistingAddress({
		name: marketStateName,
	});

	const newContract = await deployer.deployContract({
		name: marketStateName,
		source: 'PerpsV2MarketState',
		args: [owner, owner, baseAsset, marketKey],
		force: true,
		skipResolver: true,
	});

	const isSameContract = previousContractAddress === newContract.address;

	return { contract: newContract, updated: !isSameContract };
};

const deployMarketImplementations = async ({
	deployer,
	owner,
	addressResolverAddress, // addressOf(ReadProxyAddressResolver),
	marketKey,
	proxyAddress,
	stateAddress,
}) => {
	const implementationConfigurations = [
		{
			contract: 'PerpsV2Market',
		},
		{
			source: 'PerpsV2MarketLiquidate',
		},
		{
			contract: 'PerpsV2MarketDelayedIntent',
			nameKey: 'PerpsV2DelayedIntent',
			useExchangeRate: true,
		},
		{
			contract: 'PerpsV2MarketDelayedExecution',
			nameKey: 'PerpsV2DelayedExecution',
			useExchangeRate: true,
		},
		{
			contract: 'PerpsV2MarketViews',
			isView: true,
		},
	];

	const implementations = [];

	for (const implememtation of implementationConfigurations) {
		const name = implememtation.nameKey
			? implememtation.nameKey
			: implememtation.source + marketKey.slice('1'); // remove s prefix

		const previousContractAddress = deployer.getExistingAddress({ name });
		const args = [];
		if (!implememtation.isView) {
			// PerpsV2MarketViews don't use the proxy in the constructor
			args.push(proxyAddress);
		}
		args.push([stateAddress, owner, addressResolverAddress]);
		const newContract = await deployer.deployContract({
			name: implememtation.nameKey ? implememtation.nameKey : implememtation.contract,
			source: implememtation.contract,
			args,
			force: true,
			skipResolver: true,
		});

		const isSameContract = previousContractAddress === newContract.address;

		implementations.push({
			contract: implememtation.contract,
			target: newContract,
			updateState: !implememtation.isView,
			useExchangeRate: implememtation.useExchangeRate,
			updated: !isSameContract,
			functionSignatures: getFunctionSignatures(newContract, excludedFunctions),
		});
	}

	return { implementations };
};

const linkToPerpsExchangeRate = async ({ runStep, perpsV2ExchangeRate, implememtations }) => {
	const currentAddresses = Array.from(await perpsV2ExchangeRate.associatedContracts()).sort();

	const requiredAddresses = implememtations
		.filter(imp => imp.useExchangeRate)
		.map(item => item.target.address);

	const { toRemove, toAdd } = filteredLists(currentAddresses, requiredAddresses);

	if (toRemove.length > 0) {
		await runStep({
			contract: 'PerpsV2ExchangeRate',
			target: perpsV2ExchangeRate,
			write: 'removeAssociatedContracts',
			writeArg: [toRemove],
		});
	}

	if (toAdd.length > 0) {
		await runStep({
			contract: 'PerpsV2ExchangeRate',
			target: perpsV2ExchangeRate,
			write: 'addAssociatedContracts',
			writeArg: [toAdd],
			gasLimit: 150e3 * toAdd.length, // extra gas per market
		});
	}
};

const linkToState = async ({ runStep, perpsV2MarketState, implememtations }) => {
	// get current associated contracts
	const currentAddresses = Array.from(await perpsV2MarketState.associatedContracts());

	// get list of associated contracts from implementations
	const requiredAddresses = implememtations
		.filter(imp => imp.updateState)
		.map(item => item.target.address);

	const { toRemove, toAdd } = filteredLists(currentAddresses, requiredAddresses);

	await runStep({
		contract: 'PerpsV2MarketState',
		target: perpsV2MarketState,
		write: 'removeAssociatedContracts',
		writeArg: [toRemove],
	});

	await runStep({
		contract: 'PerpsV2MarketState',
		target: perpsV2MarketState,
		write: 'addAssociatedContracts',
		writeArg: [toAdd],
	});
};

const linkToProxy = async ({ runStep, perpsV2MarketProxy, implememtations }) => {
	// Set the proxy for the implementations
	for (const implememtation of implememtations) {
		await runStep({
			contract: implememtation.contract,
			target: implememtation.target,
			write: 'setProxy',
			writeArg: [perpsV2MarketProxy.address],
		});
	}

	// compile signatures
	let filteredFunctions = [];
	for (const implememtation of implememtations) {
		filteredFunctions.push(...implememtation.functionSignatures);
	}
	// Remove duplicate selectors and order by selectors
	filteredFunctions = filteredFunctions
		.filter((value, index, self) => index === self.findIndex(t => t.signature === value.signature))
		.sort((a, b) => a.signature > b.signature);

	// Remove unknown selectors
	const filteredFunctionSelectors = filteredFunctions.map(ff => ff.signature);
	const routesLength = await perpsV2MarketProxy.getRoutesLength();
	const routes = (await perpsV2MarketProxy.getRoutesPage(0, routesLength)).map(
		route => route.selector
	);
	const { toRemove } = filteredLists(routes, filteredFunctionSelectors);

	// Remove unnecessary selectors
	for (const f of toRemove) {
		await runStep(
			{
				contract: 'ProxyPerpsV2',
				target: perpsV2MarketProxy,
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
				target: perpsV2MarketProxy,
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
};

const linkToMarketManager = async ({ runStep, futuresMarketManager, proxies }) => {
	const managerKnownMarkets = Array.from(
		await futuresMarketManager['allMarkets(bool)'](true)
	).sort();
	const { toKeep, toAdd } = filteredLists(managerKnownMarkets, proxies);

	if (toAdd.length > 0) {
		await runStep({
			contract: 'FuturesMarketManager',
			target: futuresMarketManager,
			write: 'addProxiedMarkets',
			writeArg: [toAdd],
			gasLimit: 150e3 * toAdd.length, // extra gas per market
		});
	}

	if (toKeep.length > 0) {
		await runStep({
			contract: 'FuturesMarketManager',
			target: futuresMarketManager,
			write: 'updateMarketsImplementations',
			writeArg: [toKeep],
		});
	}
};

const deployStateMigration = async ({
	deployer,
	owner,
	marketKey,
	migrationContractName,
	oldStateContractAddress,
	newStateContractAddress,
}) => {
	const marketMigrationName = migrationContractName + marketKey.slice('1'); // remove s prefix

	const previousContractAddress = deployer.getExistingAddress({
		name: migrationContractName,
	});

	const newContract = await deployer.deployContract({
		name: marketMigrationName,
		source: migrationContractName,
		args: [owner, oldStateContractAddress, newStateContractAddress],
		force: true,
		skipResolver: true,
	});

	const isSameContract = previousContractAddress === newContract.address;

	return { target: newContract, contract: migrationContractName, updated: !isSameContract };
};

const migrateState = async ({ runStep, migration }) => {
	await runStep({
		contract: migration.contract,
		target: migration.target,
		write: 'execute',
	});
};

const pauseMarket = async ({ marketKey, ocMarketKey, runStep, SystemStatus }) => {
	const result = {};
	let isPaused;

	const marketKeyBytes = toBytes32(marketKey);
	isPaused = (await SystemStatus.futuresMarketSuspension(marketKeyBytes)).suspended;
	result.marketPrePausedStatus = isPaused;
	if (!isPaused) {
		await runStep({
			contract: 'SystemStatus',
			target: SystemStatus,
			write: 'suspendFuturesMarket',
			writeArg: [marketKeyBytes, 80],
			comment: 'Ensure perps V2 market is paused before upgrading',
		});
	}

	if (ocMarketKey) {
		const ocMarketKeyBytes = toBytes32(ocMarketKey);
		isPaused = (await SystemStatus.futuresMarketSuspension(ocMarketKeyBytes)).suspended;
		result.ocMarketPrePausedStatus = isPaused;
		if (!isPaused) {
			await runStep({
				contract: 'SystemStatus',
				target: SystemStatus,
				write: 'suspendFuturesMarket',
				writeArg: [ocMarketKeyBytes, 80],
				comment: 'Ensure perps V2 oc market is paused before upgrading',
			});
		}
	}

	return result;
};

const recoverExpectedPauseStatus = async ({
	marketKey,
	ocMarketKey,
	runStep,
	SystemStatus,
	expectedMarketPaused,
	expectedOcMarketPaused,
}) => {
	let isPaused;

	const marketKeyBytes = toBytes32(marketKey);
	isPaused = (await SystemStatus.futuresMarketSuspension(marketKeyBytes)).suspended;
	if (isPaused && !expectedMarketPaused) {
		await runStep({
			contract: 'SystemStatus',
			target: SystemStatus,
			write: 'resumeFuturesMarket',
			writeArg: [marketKeyBytes],
			comment: 'Ensure perpsV2 market is un-paused according to previous status',
		});
	}

	if (ocMarketKey) {
		const ocMarketKeyBytes = toBytes32(ocMarketKey);
		isPaused = (await SystemStatus.futuresMarketSuspension(ocMarketKeyBytes)).suspended;
		if (isPaused && !expectedOcMarketPaused) {
			await runStep({
				contract: 'SystemStatus',
				target: SystemStatus,
				write: 'suspendFuturesMarket',
				writeArg: [ocMarketKeyBytes, 80],
				comment: 'Ensure perpsV2 oc market is un-paused according to previous status',
			});
		}
	}
};

const configureMarket = async () => {};
const rebuildCaches = async () => {};

module.exports = {
	excludedFunctions,
	getFunctionSignatures,
	isNewMarket,
	deployMarketProxy,
	deployMarketState,
	deployMarketImplementations,
	deployStateMigration,
	linkToPerpsExchangeRate,
	linkToProxy,
	linkToState,
	linkToMarketManager,
	configureMarket,
	rebuildCaches,
	migrateState,
	pauseMarket,
	recoverExpectedPauseStatus,
};
