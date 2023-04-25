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
	'isResolverCached',
	// ProxyPerpsV2
	'addRoute',
	'removeRoute',
	'getRoutesPage',
	'getRoutesLength',
	'getRoutesPage',
	'getAllTargets',
	// Proxyable
	'messageSender',
	'setMessageSender',
	'proxy',
	'setProxy',
	// PerpsV2MarketBase
	'marketState',
];

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

const getFunctionSignatures = (instance, excludedFunctions, contractName = '') => {
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
			contractName,
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

const getProxyNameAndCurrentAddress = ({ deployer, marketKey }) => {
	const marketProxyName = 'PerpsV2Proxy' + marketKey.slice('1'); // remove s prefix

	const previousContractAddress = deployer.getExistingAddress({
		name: marketProxyName,
	});

	return { name: marketProxyName, address: previousContractAddress };
};

const deployMarketProxy = async ({ deployer, owner, marketKey }) => {
	const { name: marketProxyName, address: previousContractAddress } = getProxyNameAndCurrentAddress(
		{
			deployer,
			marketKey,
		}
	);

	const newContract = await deployer.deployContract({
		name: marketProxyName,
		source: 'ProxyPerpsV2',
		args: [owner],
		force: true,
		skipResolver: true,
	});

	const isSameContract = previousContractAddress === newContract.address;

	return { target: newContract, contract: marketProxyName, updated: !isSameContract };
};

const getStateNameAndCurrentAddress = ({ deployer, marketKey }) => {
	const marketProxyName = 'PerpsV2MarketState' + marketKey.slice('1'); // remove s prefix

	const previousContractAddress = deployer.getExistingAddress({
		name: marketProxyName,
	});

	let target;
	if (previousContractAddress) {
		target = deployer.getExistingContract({
			contract: marketProxyName,
		});
	}

	return { name: marketProxyName, address: previousContractAddress, target };
};

const deployMarketState = async ({ deployer, owner, marketKey, baseAsset }) => {
	const {
		name: marketStateName,
		address: previousContractAddress,
		target: previousContractTarget,
	} = getStateNameAndCurrentAddress({
		deployer,
		marketKey,
	});

	const baseAssetB32 = toBytes32(baseAsset);
	const marketKeyB32 = toBytes32(marketKey);

	const newContract = await deployer.deployContract({
		name: marketStateName,
		source: 'PerpsV2MarketState',
		args: [
			owner,
			[owner],
			baseAssetB32,
			marketKeyB32,
			previousContractAddress || ethers.constants.AddressZero,
		],
		force: true,
		skipResolver: true,
	});

	const isSameContract = previousContractAddress === newContract.address;

	return {
		target: newContract,
		contract: marketStateName,
		updated: !isSameContract,
		previousContractAddress,
		previousContractTarget,
	};
};

const getImplementationNamesAndAddresses = ({ deployer, marketKey }) => {
	const implementations = [];

	for (const implementation of implementationConfigurations) {
		const name =
			(implementation.nameKey ? implementation.nameKey : implementation.contract) +
			marketKey.slice('1'); // remove s prefix

		const address = deployer.getExistingAddress({ name });

		implementations.push({ name, address, useExchangeRate: implementation.useExchangeRate });
	}
	return implementations;
};

const deployMarketImplementations = async ({
	deployer,
	owner,
	addressResolverAddress,
	marketKey,
	marketProxy,
	marketState,
}) => {
	const marketStateAddress = marketState.target.address;
	const marketProxyAddress = marketProxy.target.address;

	const implementations = [];

	for (const implementation of implementationConfigurations) {
		const name =
			(implementation.nameKey ? implementation.nameKey : implementation.contract) +
			marketKey.slice('1'); // remove s prefix

		const previousContractAddress = deployer.getExistingAddress({ name });
		const args = [];
		if (!implementation.isView) {
			// PerpsV2MarketViews don't use the proxy in the constructor
			args.push(marketProxyAddress);
		}
		args.push(marketStateAddress, owner, addressResolverAddress);
		const newContract = await deployer.deployContract({
			name: name,
			source: implementation.contract,
			args,
			force: true,
			skipResolver: true,
		});

		const isSameContract = previousContractAddress === newContract.address;

		implementations.push({
			contract: name,
			target: newContract,
			isView: implementation.isView,
			updateState: !implementation.isView,
			useExchangeRate: implementation.useExchangeRate,
			updated: !isSameContract,
			functionSignatures: getFunctionSignatures(newContract, excludedFunctions, name),
		});
	}

	return { implementations };
};

const linkToPerpsExchangeRate = async ({
	runStep,
	perpsV2ExchangeRate,
	implementations,
	removeExtraAssociatedContracts,
}) => {
	const currentAddresses = Array.from(await perpsV2ExchangeRate.associatedContracts()).sort();

	const requiredAddresses = implementations
		.filter(imp => imp.useExchangeRate)
		.map(item => (item.address ? item.address : item.target.address));

	const { toRemove, toAdd } = filteredLists(currentAddresses, requiredAddresses);

	if (removeExtraAssociatedContracts) {
		if (toRemove.length > 0) {
			await runStep({
				contract: 'PerpsV2ExchangeRate',
				target: perpsV2ExchangeRate,
				write: 'removeAssociatedContracts',
				writeArg: [toRemove],
			});
		}
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
	const currentAddresses = Array.from(await perpsV2MarketState.target.associatedContracts());

	// get list of associated contracts from implementations
	const requiredAddresses = implementations
		.filter(imp => imp.updateState)
		.map(item => item.target.address);

	const { toRemove, toAdd } = filteredLists(currentAddresses, requiredAddresses);

	const overrides = perpsV2MarketState.updated ? { generateSolidity: false } : {};

	if (toRemove.length > 0) {
		await runStep(
			{
				contract: perpsV2MarketState.contract,
				target: perpsV2MarketState.target,
				write: 'removeAssociatedContracts',
				writeArg: [toRemove],
			},
			overrides
		);
	}

	if (toAdd.length > 0) {
		await runStep(
			{
				contract: perpsV2MarketState.contract,
				target: perpsV2MarketState.target,
				write: 'addAssociatedContracts',
				writeArg: [toAdd],
			},
			overrides
		);
	}
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
			read: 'proxy',
			expected: input => input === perpsV2MarketProxy.target.address,
			write: 'setProxy',
			writeArg: [perpsV2MarketProxy.target.address],
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
	const routesLength = await perpsV2MarketProxy.target.getRoutesLength();
	const routes = (await perpsV2MarketProxy.target.getRoutesPage(0, routesLength)).map(
		route => route.selector
	);
	const { toRemove } = filteredLists(routes, filteredFunctionSelectors);

	// Remove unnecessary selectors
	for (const f of toRemove) {
		await runStep({
			contract: perpsV2MarketProxy.contract,
			target: perpsV2MarketProxy.target,
			read: 'getRoute',
			readArg: [f],
			expected: readResult => readResult.implementation === ethers.constants.AddressZero,
			write: 'removeRoute',
			writeArg: [f],
		});
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
		await runStep({
			contract: perpsV2MarketProxy.contract,
			target: perpsV2MarketProxy.target,
			read: 'getRoute',
			readArg: [f.signature],
			expected: readResult =>
				readResult.selector === f.signature &&
				readResult.implementation === f.contractAddress &&
				readResult.isView === f.isView,
			write: 'addRoute',
			writeArg: [f.signature, f.contractAddress, f.isView],
			comment: `Add route to ${f.contractName}.${f.functionName}`,
		});
	}
};

const linkToMarketManager = async ({
	runStep,
	futuresMarketManager,
	proxies,
	onlyRemoveUnusedProxies,
	someImplementationUpdated,
}) => {
	const managerKnownMarkets = Array.from(
		await futuresMarketManager['allMarkets(bool)'](true)
	).sort();
	const { toKeep, toAdd, toRemove } = filteredLists(managerKnownMarkets, proxies);

	if (!onlyRemoveUnusedProxies) {
		if (toAdd.length > 0) {
			await runStep({
				contract: 'FuturesMarketManager',
				target: futuresMarketManager,
				write: 'addProxiedMarkets',
				writeArg: [toAdd],
				gasLimit: 150e3 * toAdd.length, // extra gas per market
			});
		}

		if (someImplementationUpdated) {
			if (toKeep.length > 0) {
				await runStep({
					contract: 'FuturesMarketManager',
					target: futuresMarketManager,
					write: 'updateMarketsImplementations',
					writeArg: [toKeep],
				});
			}
		} else {
			console.log(gray(`No implementations updated for market proxy ${toKeep[0]}`));
		}
	}

	if (onlyRemoveUnusedProxies) {
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
	}
};

const rebuildCaches = async ({ deployer, runStep, implementations }) => {
	const { AddressResolver } = deployer.deployedContracts;

	const requireCache = [];
	for (const implementation of implementations) {
		const isCached = await implementation.target.isResolverCached();
		if (!isCached) {
			requireCache.push(implementation.target.address);
		}
	}

	if (requireCache.length > 0) {
		await runStep(
			{
				gasLimit: 7e6,
				contract: 'AddressResolver',
				target: AddressResolver,
				publiclyCallable: true, // does not require owner
				write: 'rebuildCaches',
				writeArg: [requireCache],
				comment: 'Rebuild the resolver caches in the market implementations',
			},
			{ generateSolidity: false }
		);
	}
};

const importAddresses = async ({ deployer, runStep, addressOf, limitPromise }) => {
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
	newMarket,
	generateSolidity,
	yes,
	confirmAction,
	marketKey,
	marketConfig,
	perpsV2MarketSettings,
}) => {
	const marketKeyBytes = toBytes32(marketConfig.marketKey);
	const offchainMarketKey = marketConfig.offchainMarketKey;

	const settings = {
		takerFee: ethers.utils.parseUnits(marketConfig.takerFee).toString(),
		makerFee: ethers.utils.parseUnits(marketConfig.makerFee).toString(),
		takerFeeDelayedOrder: ethers.utils.parseUnits(marketConfig.takerFeeDelayedOrder).toString(),
		makerFeeDelayedOrder: ethers.utils.parseUnits(marketConfig.makerFeeDelayedOrder).toString(),
		takerFeeOffchainDelayedOrder: ethers.utils
			.parseUnits(marketConfig.takerFeeOffchainDelayedOrder)
			.toString(),
		makerFeeOffchainDelayedOrder: ethers.utils
			.parseUnits(marketConfig.makerFeeOffchainDelayedOrder)
			.toString(),
		nextPriceConfirmWindow: marketConfig.nextPriceConfirmWindow,
		delayedOrderConfirmWindow: marketConfig.delayedOrderConfirmWindow,
		minDelayTimeDelta: marketConfig.minDelayTimeDelta,
		maxDelayTimeDelta: marketConfig.maxDelayTimeDelta,
		offchainDelayedOrderMinAge: marketConfig.offchainDelayedOrderMinAge,
		offchainDelayedOrderMaxAge: marketConfig.offchainDelayedOrderMaxAge,
		maxLeverage: ethers.utils.parseUnits(marketConfig.maxLeverage).toString(),
		maxMarketValue: ethers.utils.parseUnits(marketConfig.maxMarketValue).toString(),
		maxFundingVelocity: ethers.utils.parseUnits(marketConfig.maxFundingVelocity).toString(),
		skewScale: ethers.utils.parseUnits(marketConfig.skewScale).toString(),
		offchainMarketKey: toBytes32(offchainMarketKey).toString(),
		offchainPriceDivergence: ethers.utils
			.parseUnits(marketConfig.offchainPriceDivergence)
			.toString(),
		liquidationPremiumMultiplier: ethers.utils
			.parseUnits(marketConfig.liquidationPremiumMultiplier)
			.toString(),
		maxLiquidationDelta: ethers.utils.parseUnits(marketConfig.maxLiquidationDelta).toString(),
		liquidationBufferRatio: ethers.utils.parseUnits(marketConfig.liquidationBufferRatio).toString(),
		maxPD: ethers.utils.parseUnits(marketConfig.maxPD).toString(),
	};

	for (const setting in settings) {
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

	if (newMarket) {
		// pause or resume market according to config
		await setPausedMode({
			paused: marketConfig.paused,
			marketKey,
			runStep,
			deployer,
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
	}
};

async function setPausedMode({
	paused,
	marketKey,
	runStep,
	deployer,
	generateSolidity,
	yes,
	confirmAction,
}) {
	if (paused) {
		await pauseMarket({
			marketKey,
			deployer,
			runStep,
			generateSolidity,
		});
	} else {
		await resumeMarket({
			marketKey,
			deployer,
			runStep,
			generateSolidity,
			yes,
			confirmAction,
		});
	}
}

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

async function pauseMarket({ runStep, deployer, marketKey, generateSolidity }) {
	const { SystemStatus } = deployer.deployedContracts;
	const marketKeyBytes = toBytes32(marketKey);

	const isPaused = (await SystemStatus.futuresMarketSuspension(marketKeyBytes)).suspended;

	if (!isPaused) {
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
	}

	return { wasPaused: isPaused };
}

async function resumeMarket({
	runStep,
	deployer,
	marketKey,
	generateSolidity,
	yes,
	confirmAction,
}) {
	const { SystemStatus } = deployer.deployedContracts;
	const marketKeyBytes = toBytes32(marketKey);

	const isPaused = (await SystemStatus.futuresMarketSuspension(marketKeyBytes)).suspended;

	if (isPaused) {
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
	getProxyNameAndCurrentAddress,
	getImplementationNamesAndAddresses,
	deployMarketProxy,
	deployMarketState,
	deployMarketImplementations,
	linkToPerpsExchangeRate,
	linkToProxy,
	linkToState,
	linkToMarketManager,
	configureMarket,
	importAddresses,
	rebuildCaches,
	pauseMarket,
	resumeMarket,
};
