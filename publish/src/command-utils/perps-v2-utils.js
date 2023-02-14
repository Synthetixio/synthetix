const ethers = require('ethers');
const { gray, green, yellow } = require('chalk');
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

const isNewMarket = ({ existingMarkets, marketKey }) =>
	existingMarkets.includes(toBytes32(marketKey));

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
	const baseAssetB32 = toBytes32(baseAsset);
	const marketKeyB32 = toBytes32(marketKey);

	const previousContractAddress = deployer.getExistingAddress({
		name: marketStateName,
	});

	const newContract = await deployer.deployContract({
		name: marketStateName,
		source: 'PerpsV2MarketState',
		args: [owner, [owner], baseAssetB32, marketKeyB32],
		force: true,
		skipResolver: true,
	});

	const isSameContract = previousContractAddress === newContract.address;

	return { contract: newContract, updated: !isSameContract, previousContractAddress };
};

const deployMarketImplementations = async ({
	deployer,
	owner,
	addressResolverAddress,
	marketKey,
	proxyAddress,
	stateAddress,
}) => {
	const implementationConfigurations = [
		{
			contract: 'PerpsV2Market',
		},
		{
			contract: 'PerpsV2MarketLiquidate',
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

	for (const implementation of implementationConfigurations) {
		const name =
			(implementation.nameKey ? implementation.nameKey : implementation.contract) +
			marketKey.slice('1'); // remove s prefix

		const previousContractAddress = deployer.getExistingAddress({ name });
		const args = [];
		if (!implementation.isView) {
			// PerpsV2MarketViews don't use the proxy in the constructor
			args.push(proxyAddress);
		}
		args.push(stateAddress, owner, addressResolverAddress);
		const newContract = await deployer.deployContract({
			name: name,
			source: implementation.contract,
			args,
			force: true,
			skipResolver: true,
		});

		const isSameContract = previousContractAddress === newContract.address;

		implementations.push({
			contract: implementation.contract,
			target: newContract,
			isView: implementation.isView,
			updateState: !implementation.isView,
			useExchangeRate: implementation.useExchangeRate,
			updated: !isSameContract,
			functionSignatures: getFunctionSignatures(newContract, excludedFunctions),
		});
	}

	return { implementations };
};

const linkToPerpsExchangeRate = async ({ runStep, perpsV2ExchangeRate, implementations }) => {
	const currentAddresses = Array.from(await perpsV2ExchangeRate.associatedContracts()).sort();

	const requiredAddresses = implementations
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

const linkToState = async ({ runStep, perpsV2MarketState, implementations }) => {
	// get current associated contracts
	const currentAddresses = Array.from(await perpsV2MarketState.associatedContracts());

	// get list of associated contracts from implementations
	const requiredAddresses = implementations
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

const linkToProxy = async ({ runStep, perpsV2MarketProxy, implementations }) => {
	// Set the proxy for the implementations
	for (const implementation of implementations) {
		if (implementation.isView) {
			continue;
		}
		await runStep({
			contract: implementation.contract,
			target: implementation.target,
			write: 'setProxy',
			writeArg: [perpsV2MarketProxy.address],
		});
	}

	// compile signatures
	let filteredFunctions = [];
	for (const implementation of implementations) {
		filteredFunctions.push(...implementation.functionSignatures);
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

// const isMarketPaused = async ({ marketKey, SystemStatus }) => {
// 	const marketKeyBytes = toBytes32(marketKey);
// 	return (await SystemStatus.futuresMarketSuspension(marketKeyBytes)).suspended;
// };

// const ensureMarketPausedStatus = async ({ marketKey, SystemStatus, runStep, expectedPaused }) => {
// 	let marketWasPaused;

// 	const marketKeyBytes = toBytes32(marketKey);
// 	marketWasPaused = (await SystemStatus.futuresMarketSuspension(marketKeyBytes)).suspended;
// 	if (marketWasPaused === expectedPaused) {
// 		return marketWasPaused;
// 	}

// 	if (expectedPaused) {
// 		await runStep({
// 			contract: 'SystemStatus',
// 			target: SystemStatus,
// 			write: 'suspendFuturesMarket',
// 			writeArg: [marketKeyBytes, 80],
// 			comment: 'Ensure perpsV2 market is paused according to expected status',
// 		});
// 	} else {
// 		await runStep({
// 			contract: 'SystemStatus',
// 			target: SystemStatus,
// 			write: 'resumeFuturesMarket',
// 			writeArg: [marketKeyBytes],
// 			comment: 'Ensure perpsV2 market is not paused according to expected status',
// 		});
// 	}

// 	return marketWasPaused;
// };

const rebuildCaches = async ({ deployer, runStep, updatedContracts }) => {
	const { AddressResolver } = deployer.deployedContracts;

	const requireCache = [];
	for (const contract of updatedContracts) {
		const isCached = await contract.isResolverCached();
		if (!isCached) {
			requireCache.push(contract.address);
		}
	}

	if (requireCache.length > 0) {
		await runStep({
			gasLimit: 7e6,
			contract: 'AddressResolver',
			target: AddressResolver,
			publiclyCallable: true, // does not require owner
			write: 'rebuildCaches',
			writeArg: [requireCache],
			comment: 'Rebuild the resolver caches in the market implementations',
		});
	}
};

const importAddresses = async ({
	deployer,
	runStep,
	addressOf,
	limitPromise,
	resolvedContracts,
}) => {
	const { AddressResolver, ReadProxyAddressResolver } = deployer.deployedContracts;

	// Note: RPAR.setTarget(AR) MUST go before the addresses are imported into the resolver.
	// most of the time it will be a no-op but when there's a new AddressResolver, it's critical
	if (AddressResolver && ReadProxyAddressResolver) {
		await runStep({
			contract: 'ReadProxyAddressResolver',
			target: ReadProxyAddressResolver,
			read: 'target',
			expected: input => input === addressOf(AddressResolver),
			write: 'setTarget',
			writeArg: addressOf(AddressResolver),
			comment: 'set the target of the address resolver proxy to the latest resolver',
		});
	}

	const addressArgs = [[], []];
	const allContracts = Object.entries(deployer.deployedContracts);
	await Promise.all(
		allContracts
			// ignore adding contracts with the skipResolver and library options
			.filter(([, contract]) => !contract.skipResolver && !contract.library)
			.map(([name, contract]) => {
				return limitPromise(async () => {
					const currentAddress = await AddressResolver.getAddress(toBytes32(name));

					// only import ext: addresses if they have never been imported before
					if (currentAddress !== contract.address) {
						console.log(green(`${name} needs to be imported to the AddressResolver`));

						addressArgs[0].push(toBytes32(name));
						addressArgs[1].push(contract.address);
					}
				});
			})
	);

	// await Promise.all(
	// 	resolvedContracts.map(([name, contract]) => {
	// 		return limitPromise(async () => {
	// 			const currentAddress = await AddressResolver.getAddress(toBytes32(name));

	// 			// only import ext: addresses if they have never been imported before
	// 			if (currentAddress !== contract.address) {
	// 				console.log(green(`${name} needs to be imported to the AddressResolver`));

	// 				addressArgs[0].push(toBytes32(name));
	// 				addressArgs[1].push(contract.address);

	// 				// const { source, address } = contract;
	// 				// newContractsBeingAdded[contract.address] = { name, source, address, contract };
	// 			}
	// 		});
	// 	})
	// );

	await runStep({
		gasLimit: 6e6, // higher gas required for mainnet
		contract: 'AddressResolver',
		target: AddressResolver,
		read: 'areAddressesImported',
		readArg: addressArgs,
		expected: input => input,
		write: 'importAddresses',
		writeArg: addressArgs,
		comment: 'Import all new contracts into the address resolver',
	});
};

const configureMarket = async ({
	runStep,
	deployer,
	generateSolidity,
	yes,
	confirmAction,
	marketKey,
	marketConfig,
	perpsV2MarketSettings,
}) => {
	const { SystemStatus } = deployer.deployedContracts;

	const marketKeyBytes = toBytes32(marketConfig.marketKey);
	const offchainMarketKey = marketConfig.offchainMarketKey;

	// const expectedParameters = [
	// 	ethers.utils.parseUnits(marketConfig.takerFee),
	// 	ethers.utils.parseUnits(marketConfig.makerFee),
	// 	ethers.utils.parseUnits(marketConfig.overrideCommitFee),
	// 	ethers.utils.parseUnits(marketConfig.takerFeeDelayedOrder),
	// 	ethers.utils.parseUnits(marketConfig.makerFeeDelayedOrder),
	// 	ethers.utils.parseUnits(marketConfig.takerFeeOffchainDelayedOrder),
	// 	ethers.utils.parseUnits(marketConfig.makerFeeOffchainDelayedOrder),
	// 	ethers.utils.parseUnits(marketConfig.maxLeverage),
	// 	ethers.utils.parseUnits(marketConfig.maxMarketValue),
	// 	ethers.utils.parseUnits(marketConfig.maxFundingVelocity),
	// 	ethers.utils.parseUnits(marketConfig.skewScale),
	// 	ethers.BigNumber.from(marketConfig.nextPriceConfirmWindow),
	// 	ethers.BigNumber.from(marketConfig.delayedOrderConfirmWindow),
	// 	ethers.BigNumber.from(marketConfig.minDelayTimeDelta),
	// 	ethers.BigNumber.from(marketConfig.maxDelayTimeDelta),
	// 	ethers.BigNumber.from(marketConfig.offchainDelayedOrderMinAge),
	// 	ethers.BigNumber.from(marketConfig.offchainDelayedOrderMaxAge),
	// 	toBytes32(offchainMarketKey),
	// 	ethers.utils.parseUnits(marketConfig.offchainPriceDivergence),
	// 	ethers.utils.parseUnits(marketConfig.liquidationPremiumMultiplier),
	// 	ethers.utils.parseUnits(marketConfig.maxLiquidationDelta),
	// 	ethers.utils.parseUnits(marketConfig.maxPD),
	// ];

	// const currentSettings = await perpsV2MarketSettings.parameters(marketKeyBytes);

	// if (JSON.stringify(expectedParameters) !== JSON.stringify(currentSettings)) {
	// 	// configurations doesn't match
	// 	await runStep({
	// 		contract: 'PerpsV2MarketSettings',
	// 		target: perpsV2MarketSettings,
	// 		write: 'setParameters',
	// 		writeArg: [marketKeyBytes, expectedParameters],
	// 	});
	// }

	const settings = {
		takerFee: ethers.utils.parseUnits(marketConfig.takerFee),
		makerFee: ethers.utils.parseUnits(marketConfig.makerFee),
		takerFeeDelayedOrder: ethers.utils.parseUnits(marketConfig.takerFeeDelayedOrder),
		makerFeeDelayedOrder: ethers.utils.parseUnits(marketConfig.makerFeeDelayedOrder),
		takerFeeOffchainDelayedOrder: ethers.utils.parseUnits(
			marketConfig.takerFeeOffchainDelayedOrder
		),
		makerFeeOffchainDelayedOrder: ethers.utils.parseUnits(
			marketConfig.makerFeeOffchainDelayedOrder
		),
		nextPriceConfirmWindow: marketConfig.nextPriceConfirmWindow,
		delayedOrderConfirmWindow: marketConfig.delayedOrderConfirmWindow,
		minDelayTimeDelta: marketConfig.minDelayTimeDelta,
		maxDelayTimeDelta: marketConfig.maxDelayTimeDelta,
		offchainDelayedOrderMinAge: marketConfig.offchainDelayedOrderMinAge,
		offchainDelayedOrderMaxAge: marketConfig.offchainDelayedOrderMaxAge,
		maxLeverage: ethers.utils.parseUnits(marketConfig.maxLeverage),
		maxMarketValue: ethers.utils.parseUnits(marketConfig.maxMarketValue),
		maxFundingVelocity: ethers.utils.parseUnits(marketConfig.maxFundingVelocity),
		skewScale: ethers.utils.parseUnits(marketConfig.skewScale),
		offchainMarketKey: toBytes32(offchainMarketKey),
		offchainPriceDivergence: ethers.utils.parseUnits(marketConfig.offchainPriceDivergence),
		liquidationPremiumMultiplier: ethers.utils.parseUnits(
			marketConfig.liquidationPremiumMultiplier
		),
		maxLiquidationDelta: ethers.utils.parseUnits(marketConfig.maxLiquidationDelta),
		maxPD: ethers.utils.parseUnits(marketConfig.maxPD),
	};

	console.log('SSSSSSSSSSS', settings);
	for (const setting in settings) {
		console.log('SSSSSSSSSSS', setting);
		const capSetting = setting.charAt(0).toUpperCase() + setting.slice(1);
		const value = settings[setting];

		await runStep({
			contract: 'PerpsV2MarketSettings',
			target: perpsV2MarketSettings,
			read: setting,
			readArg: [marketKeyBytes],
			expected: input => input === value,
			write: `set${capSetting}`,
			writeArg: [marketKeyBytes, value],
		});
	}

	// pause or resume market according to config
	await setPausedMode({
		paused: marketConfig.paused,
		marketKey,
		runStep,
		SystemStatus,
		generateSolidity,
		yes,
		confirmAction,
	});

	// pause or resume offchain market according to config
	await setPausedMode({
		paused: marketConfig.offchainPaused,
		marketKey: offchainMarketKey,
		runStep,
		deployer,
		generateSolidity,
		yes,
		confirmAction,
	});
};

async function setPausedMode({
	runStep,
	deployer,
	marketKey,
	paused,
	generateSolidity,
	yes,
	confirmAction,
}) {
	const { SystemStatus } = deployer.deployedContracts;
	const marketKeyBytes = toBytes32(marketKey);

	function migrationContractNoACLWarning(actionMessage) {
		console.log(
			yellow(
				`⚠⚠⚠ WARNING: the step is trying to ${actionMessage}, but 'generateSolidity' is true. `,
				`The migration contract will not have the SystemStatus ACL permissions to perform this step, `,
				`so it should be EDITED OUT of the migration contract and performed separately (by rerunning `,
				`the deploy script).`
			)
		);
	}

	const shouldPause = paused; // config value
	const isPaused = (await SystemStatus.futuresMarketSuspension(marketKeyBytes)).suspended;

	if (shouldPause & !isPaused) {
		await runStep({
			contract: 'SystemStatus',
			target: SystemStatus,
			write: 'suspendFuturesMarket',
			writeArg: [marketKeyBytes, 80],
			comment: 'Ensure perpsV2 market is paused according to config',
		});
		if (generateSolidity) {
			migrationContractNoACLWarning(`pause ${marketKey} perpsV2 market`);
		}
	} else if (isPaused & !shouldPause) {
		let resume;

		if (!yes) {
			// in case we're trying to resume something that doesn't need to be resumed
			console.log(
				yellow(
					`⚠⚠⚠ WARNING: The market ${marketKey} is paused,`,
					`but according to config should be resumed. Confirm that this market should`,
					`be resumed in this release and it's not a misconfiguration issue.`
				)
			);
			try {
				await confirmAction(gray('Unpause the market? (y/n) '));
				resume = true;
			} catch (err) {
				console.log(gray('Market will remain paused'));
				resume = false;
			}
		} else {
			// yes mode (e.g. tests)
			resume = true;
		}

		if (resume) {
			await runStep({
				contract: 'SystemStatus',
				target: SystemStatus,
				write: 'resumeFuturesMarket',
				writeArg: [marketKeyBytes],
				comment: 'Ensure perpsV2 market is un-paused according to config',
			});
			if (generateSolidity) {
				migrationContractNoACLWarning(`unpause ${marketKey} perpsV2 market`);
			}
		}
	}
}

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
	importAddresses,
	rebuildCaches,
	migrateState,
	setPausedMode,
};
