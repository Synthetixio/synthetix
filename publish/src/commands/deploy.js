'use strict';

const path = require('path');
const { gray, green, yellow, redBright, red } = require('chalk');
const {
	utils: { parseUnits, formatUnits, isAddress },
	constants,
} = require('ethers');
const Deployer = require('../Deployer');
const NonceManager = require('../NonceManager');
const { loadCompiledFiles, getLatestSolTimestamp } = require('../solidity');
const checkAggregatorPrices = require('../check-aggregator-prices');
const pLimit = require('p-limit');

const {
	ensureDeploymentPath,
	ensureNetwork,
	getDeploymentPathForNetwork,
	loadAndCheckRequiredSources,
	loadConnections,
	confirmAction,
	performTransactionalStep,
	parameterNotice,
	reportDeployedContracts,
} = require('../util');

const {
	toBytes32,
	fromBytes32,
	constants: {
		BUILD_FOLDER,
		CONFIG_FILENAME,
		CONTRACTS_FOLDER,
		SYNTHS_FILENAME,
		DEPLOYMENT_FILENAME,
		ZERO_ADDRESS,
		OVM_MAX_GAS_LIMIT,
		inflationStartTimestampInSecs,
	},
	defaults,
	nonUpgradeable,
} = require('../../../.');

const DEFAULTS = {
	gasPrice: '1',
	methodCallGasLimit: 250e3, // 250k
	contractDeploymentGasLimit: 6.9e6, // TODO split out into separate limits for different contracts, Proxys, Synths, Synthetix
	debtSnapshotMaxDeviation: 0.01, // a 1 percent deviation will trigger a snapshot
	network: 'kovan',
	buildPath: path.join(__dirname, '..', '..', '..', BUILD_FOLDER),
};

const deploy = async ({
	addNewSynths,
	gasPrice = DEFAULTS.gasPrice,
	methodCallGasLimit = DEFAULTS.methodCallGasLimit,
	contractDeploymentGasLimit = DEFAULTS.contractDeploymentGasLimit,
	network = DEFAULTS.network,
	buildPath = DEFAULTS.buildPath,
	deploymentPath,
	oracleExrates,
	privateKey,
	yes,
	dryRun = false,
	forceUpdateInverseSynthsOnTestnet = false,
	useFork,
	providerUrl,
	useOvm,
	freshDeploy,
	manageNonces,
	ignoreSafetyChecks,
	ignoreCustomParameters,
	concurrency,
	specifyContracts,
} = {}) => {
	ensureNetwork(network);
	deploymentPath = deploymentPath || getDeploymentPathForNetwork({ network, useOvm });
	ensureDeploymentPath(deploymentPath);

	// OVM uses a gas price of 0 (unless --gas explicitely defined).
	if (useOvm && gasPrice === DEFAULTS.gasPrice) {
		gasPrice = constants.Zero;
	}

	const limitPromise = pLimit(concurrency);

	const {
		config,
		params,
		configFile,
		synths,
		deployment,
		deploymentFile,
		ownerActions,
		ownerActionsFile,
		feeds,
	} = loadAndCheckRequiredSources({
		deploymentPath,
		network,
	});

	// Mark contracts for deployment specified via an argument
	if (specifyContracts) {
		// Ignore config.json
		Object.keys(config).map(name => {
			config[name].deploy = false;
		});
		// Add specified contracts
		specifyContracts.split(',').map(name => {
			if (!config[name]) {
				config[name] = {
					deploy: true,
				};
			} else {
				config[name].deploy = true;
			}
		});
	}

	if (freshDeploy) {
		deployment.targets = {};
		deployment.sources = {};
	}

	if (!ignoreSafetyChecks) {
		// Using Goerli without manageNonces?
		if (network.toLowerCase() === 'goerli' && !useOvm && !manageNonces) {
			throw new Error(`Deploying on Goerli needs to be performed with --manage-nonces.`);
		}

		// Cannot re-deploy legacy contracts
		if (!freshDeploy) {
			// Get list of contracts to be deployed
			const contractsToDeploy = [];
			Object.keys(config).map(contractName => {
				if (config[contractName].deploy) {
					contractsToDeploy.push(contractName);
				}
			});

			// Check that no non-deployable is marked for deployment.
			// Note: if nonDeployable = 'TokenState', this will match 'TokenStatesUSD'
			nonUpgradeable.map(nonUpgradeableContract => {
				contractsToDeploy.map(contractName => {
					if (contractName.match(new RegExp(`^${nonUpgradeableContract}`, 'g'))) {
						throw new Error(
							`You are attempting to deploy a contract marked as non-upgradeable: ${contractName}. This action could result in loss of state. Please verify and use --ignore-safety-checks if you really know what you're doing.`
						);
					}
				});
			});
		}

		// Every transaction in Optimism needs to be below 9m gas, to ensure
		// there are no deployment out of gas errors during fraud proofs.
		if (useOvm) {
			const maxOptimismGasLimit = OVM_MAX_GAS_LIMIT;
			if (
				contractDeploymentGasLimit > maxOptimismGasLimit ||
				methodCallGasLimit > maxOptimismGasLimit
			) {
				throw new Error(
					`Maximum transaction gas limit for OVM is ${maxOptimismGasLimit} gas, and specified contractDeploymentGasLimit and/or methodCallGasLimit are over such limit. Please make sure that these values are below the maximum gas limit to guarantee that fraud proofs can be done in L1.`
				);
			}
		}

		// Deploying on OVM and not using an OVM deployment path?
		const lastPathItem = deploymentPath.split('/').pop();
		const isOvmPath = lastPathItem.includes('ovm');
		const deploymentPathMismatch = (useOvm && !isOvmPath) || (!useOvm && isOvmPath);
		if (deploymentPathMismatch) {
			if (useOvm) {
				throw new Error(
					`You are deploying to a non-ovm path ${deploymentPath}, while --use-ovm is true.`
				);
			} else {
				throw new Error(
					`You are deploying to an ovm path ${deploymentPath}, while --use-ovm is false.`
				);
			}
		}

		// Fresh deploy and deployment.json not empty?
		if (freshDeploy && Object.keys(deployment.targets).length > 0 && network !== 'local') {
			throw new Error(
				`Cannot make a fresh deploy on ${deploymentPath} because a deployment has already been made on this path. If you intend to deploy a new instance, use a different path or delete the deployment files for this one.`
			);
		}
	}

	const standaloneFeeds = Object.values(feeds).filter(({ standalone }) => standalone);

	const getDeployParameter = async name => {
		const defaultParam = defaults[name];
		if (ignoreCustomParameters) {
			return defaultParam;
		}

		let effectiveValue = defaultParam;

		const param = (params || []).find(p => p.name === name);

		if (param) {
			if (!yes) {
				try {
					await confirmAction(
						yellow(
							`⚠⚠⚠ WARNING: Found an entry for ${param.name} in params.json. Specified value is ${param.value} and default is ${defaultParam}.` +
								'\nDo you want to use the specified value (default otherwise)? (y/n) '
						)
					);

					effectiveValue = param.value;
				} catch (err) {
					console.error(err);
				}
			} else {
				// yes = true
				effectiveValue = param.value;
			}
		}

		if (effectiveValue !== defaultParam) {
			console.log(
				yellow(
					`PARAMETER OVERRIDE: Overriding default ${name} with ${effectiveValue}, specified in params.json.`
				)
			);
		}

		return effectiveValue;
	};

	console.log(
		gray('Checking all contracts not flagged for deployment have addresses in this network...')
	);
	const missingDeployments = Object.keys(config).filter(name => {
		return !config[name].deploy && (!deployment.targets[name] || !deployment.targets[name].address);
	});

	if (missingDeployments.length) {
		throw Error(
			`Cannot use existing contracts for deployment as addresses not found for the following contracts on ${network}:\n` +
				missingDeployments.join('\n') +
				'\n' +
				gray(`Used: ${deploymentFile} as source`)
		);
	}

	console.log(gray('Loading the compiled contracts locally...'));
	const { earliestCompiledTimestamp, compiled } = loadCompiledFiles({ buildPath });

	// now get the latest time a Solidity file was edited
	const latestSolTimestamp = getLatestSolTimestamp(CONTRACTS_FOLDER);

	const {
		providerUrl: envProviderUrl,
		privateKey: envPrivateKey,
		etherscanLinkPrefix,
	} = loadConnections({
		network,
		useFork,
	});

	if (!providerUrl) {
		if (!envProviderUrl) {
			throw new Error('Missing .env key of PROVIDER_URL. Please add and retry.');
		}

		providerUrl = envProviderUrl;
	}

	// if not specified, or in a local network, override the private key passed as a CLI option, with the one specified in .env
	if (network !== 'local' && !privateKey) {
		privateKey = envPrivateKey;
	}

	const nonceManager = new NonceManager({});

	const deployer = new Deployer({
		compiled,
		contractDeploymentGasLimit,
		config,
		configFile,
		deployment,
		deploymentFile,
		gasPrice,
		methodCallGasLimit,
		network,
		privateKey,
		providerUrl,
		dryRun,
		useOvm,
		useFork,
		ignoreSafetyChecks,
		nonceManager: manageNonces ? nonceManager : undefined,
	});

	const { account } = deployer;

	nonceManager.web3 = deployer.provider.web3;
	nonceManager.account = account;

	let currentSynthetixSupply;
	let oldExrates;
	let currentLastMintEvent;
	let currentWeekOfInflation;
	let systemSuspended = false;
	let systemSuspendedReason;

	try {
		const oldSynthetix = deployer.getExistingContract({ contract: 'Synthetix' });
		currentSynthetixSupply = await oldSynthetix.methods.totalSupply().call();

		// inflationSupplyToDate = total supply - 100m
		const inflationSupplyToDate = parseUnits(currentSynthetixSupply, 'wei').sub(
			parseUnits((100e6).toString(), 'wei')
		);

		// current weekly inflation 75m / 52
		const weeklyInflation = parseUnits((75e6 / 52).toString()).toString();
		currentWeekOfInflation = inflationSupplyToDate.div(weeklyInflation);

		// Check result is > 0 else set to 0 for currentWeek
		currentWeekOfInflation = currentWeekOfInflation.gt(constants.Zero)
			? currentWeekOfInflation.toNumber()
			: 0;

		// Calculate lastMintEvent as Inflation start date + number of weeks issued * secs in weeks
		const mintingBuffer = 86400;
		const secondsInWeek = 604800;
		const inflationStartDate = inflationStartTimestampInSecs;
		currentLastMintEvent =
			inflationStartDate + currentWeekOfInflation * secondsInWeek + mintingBuffer;
	} catch (err) {
		if (freshDeploy) {
			currentSynthetixSupply = await getDeployParameter('INITIAL_ISSUANCE');
			currentWeekOfInflation = 0;
			currentLastMintEvent = 0;
		} else {
			console.error(
				red(
					'Cannot connect to existing Synthetix contract. Please double check the deploymentPath is correct for the network allocated'
				)
			);
			process.exitCode = 1;
			return;
		}
	}

	try {
		oldExrates = deployer.getExistingContract({ contract: 'ExchangeRates' });
		if (!oracleExrates) {
			oracleExrates = await oldExrates.methods.oracle().call();
		}
	} catch (err) {
		if (freshDeploy) {
			oracleExrates = oracleExrates || account;
			oldExrates = undefined; // unset to signify that a fresh one will be deployed
		} else {
			console.error(
				red(
					'Cannot connect to existing ExchangeRates contract. Please double check the deploymentPath is correct for the network allocated'
				)
			);
			process.exitCode = 1;
			return;
		}
	}

	try {
		const oldSystemStatus = deployer.getExistingContract({ contract: 'SystemStatus' });

		const systemSuspensionStatus = await oldSystemStatus.methods.systemSuspension().call();

		systemSuspended = systemSuspensionStatus.suspended;
		systemSuspendedReason = systemSuspensionStatus.reason;
	} catch (err) {
		if (!freshDeploy) {
			console.error(
				red(
					'Cannot connect to existing SystemStatus contract. Please double check the deploymentPath is correct for the network allocated'
				)
			);
			process.exitCode = 1;
			return;
		}
	}

	for (const address of [account, oracleExrates]) {
		if (!isAddress(address)) {
			console.error(red('Invalid address detected (please check your inputs):', address));
			process.exitCode = 1;
			return;
		}
	}

	const newSynthsToAdd = synths
		.filter(({ name }) => !config[`Synth${name}`])
		.map(({ name }) => name);

	let aggregatedPriceResults = 'N/A';

	if (oldExrates && network !== 'local') {
		const padding = '\n\t\t\t\t';
		const aggResults = await checkAggregatorPrices({
			network,
			useOvm,
			providerUrl,
			synths,
			oldExrates,
			standaloneFeeds,
		});
		aggregatedPriceResults = padding + aggResults.join(padding);
	}

	const deployerBalance = parseInt(
		formatUnits(await deployer.provider.web3.eth.getBalance(account), 'ether'),
		10
	);
	if (useFork) {
		// Make sure the pwned account has ETH when using a fork
		const accounts = await deployer.provider.web3.eth.getAccounts();

		await deployer.provider.web3.eth.sendTransaction({
			from: accounts[0],
			to: account,
			value: parseUnits('10', 'ether').toString(),
		});
	} else if (deployerBalance < 5) {
		console.log(
			yellow(`⚠ WARNING: Deployer account balance could be too low: ${deployerBalance} ETH`)
		);
	}

	let ovmDeploymentPathWarning = false;
	// OVM targets must end with '-ovm'.
	if (useOvm) {
		const lastPathElement = path.basename(deploymentPath);
		ovmDeploymentPathWarning = !lastPathElement.includes('ovm');
	}

	parameterNotice({
		'Dry Run': dryRun ? green('true') : yellow('⚠ NO'),
		'Using a fork': useFork ? green('true') : yellow('⚠ NO'),
		Concurrency: `${concurrency} max parallel calls`,
		Network: network,
		'OVM?': useOvm
			? ovmDeploymentPathWarning
				? red('⚠ No -ovm folder suffix!')
				: green('true')
			: 'false',
		'Gas price to use': `${gasPrice} GWEI`,
		'Method call gas limit': `${methodCallGasLimit} gas`,
		'Contract deployment gas limit': `${contractDeploymentGasLimit} gas`,
		'Deployment Path': new RegExp(network, 'gi').test(deploymentPath)
			? deploymentPath
			: yellow('⚠⚠⚠ cant find network name in path. Please double check this! ') + deploymentPath,
		Provider: providerUrl,
		'Local build last modified': `${new Date(earliestCompiledTimestamp)} ${yellow(
			((new Date().getTime() - earliestCompiledTimestamp) / 60000).toFixed(2) + ' mins ago'
		)}`,
		'Last Solidity update':
			new Date(latestSolTimestamp) +
			(latestSolTimestamp > earliestCompiledTimestamp
				? yellow(' ⚠⚠⚠ this is later than the last build! Is this intentional?')
				: green(' ✅')),
		'Add any new synths found?': addNewSynths
			? green('✅ YES\n\t\t\t\t') + newSynthsToAdd.join(', ')
			: yellow('⚠ NO'),
		'Deployer account:': account,
		'Synthetix totalSupply': `${Math.round(formatUnits(currentSynthetixSupply) / 1e6)}m`,
		'ExchangeRates Oracle': oracleExrates,
		'Last Mint Event': `${currentLastMintEvent} (${new Date(currentLastMintEvent * 1000)})`,
		'Current Weeks Of Inflation': currentWeekOfInflation,
		'Aggregated Prices': aggregatedPriceResults,
		'System Suspended': systemSuspended
			? green(' ✅', 'Reason:', systemSuspendedReason)
			: yellow('⚠ NO'),
	});

	if (!yes) {
		try {
			await confirmAction(
				yellow(
					`⚠⚠⚠ WARNING: This action will deploy the following contracts to ${network}:\n${Object.entries(
						config
					)
						.filter(([, { deploy }]) => deploy)
						.map(([contract]) => contract)
						.join(', ')}` + `\nIt will also set proxy targets and add synths to Synthetix.\n`
				) +
					gray('-'.repeat(50)) +
					'\nDo you want to continue? (y/n) '
			);
		} catch (err) {
			console.log(gray('Operation cancelled'));
			return;
		}
	}

	console.log(
		gray(`Starting deployment to ${network.toUpperCase()}${useFork ? ' (fork)' : ''}...`)
	);

	const runStep = async opts =>
		performTransactionalStep({
			gasLimit: methodCallGasLimit, // allow overriding of gasLimit
			...opts,
			account,
			gasPrice,
			etherscanLinkPrefix,
			ownerActions,
			ownerActionsFile,
			dryRun,
			nonceManager: manageNonces ? nonceManager : undefined,
		});

	console.log(gray(`\n------ DEPLOY LIBRARIES ------\n`));

	await deployer.deployContract({
		name: 'SafeDecimalMath',
	});

	await deployer.deployContract({
		name: 'Math',
	});

	console.log(gray(`\n------ DEPLOY CORE PROTOCOL ------\n`));

	const addressOf = c => (c ? c.options.address : '');

	const addressResolver = await deployer.deployContract({
		name: 'AddressResolver',
		args: [account],
	});

	const readProxyForResolver = await deployer.deployContract({
		name: 'ReadProxyAddressResolver',
		source: 'ReadProxy',
		args: [account],
	});

	if (addressResolver && readProxyForResolver) {
		await runStep({
			contract: 'ReadProxyAddressResolver',
			target: readProxyForResolver,
			read: 'target',
			expected: input => input === addressOf(addressResolver),
			write: 'setTarget',
			writeArg: addressOf(addressResolver),
		});
	}

	await deployer.deployContract({
		name: 'FlexibleStorage',
		deps: ['ReadProxyAddressResolver'],
		args: [addressOf(readProxyForResolver)],
	});

	const systemSettings = await deployer.deployContract({
		name: 'SystemSettings',
		source: useOvm ? 'SystemSettings' : 'SystemSettingsL1',
		args: [account, addressOf(readProxyForResolver)],
	});

	const systemStatus = await deployer.deployContract({
		name: 'SystemStatus',
		args: [account],
	});

	if (network !== 'mainnet' && systemStatus) {
		// On testnet, give the deployer the rights to update status
		await runStep({
			contract: 'SystemStatus',
			target: systemStatus,
			read: 'accessControl',
			readArg: [toBytes32('System'), account],
			expected: ({ canSuspend } = {}) => canSuspend,
			write: 'updateAccessControls',
			writeArg: [
				['System', 'Issuance', 'Exchange', 'SynthExchange', 'Synth'].map(toBytes32),
				[account, account, account, account, account],
				[true, true, true, true, true],
				[true, true, true, true, true],
			],
		});
	}

	const exchangeRates = await deployer.deployContract({
		name: 'ExchangeRates',
		source: useOvm ? 'ExchangeRatesWithoutInvPricing' : 'ExchangeRatesWithDexPricing',
		args: [account, oracleExrates, addressOf(readProxyForResolver), [], []],
	});

	const rewardEscrow = await deployer.deployContract({
		name: 'RewardEscrow',
		args: [account, ZERO_ADDRESS, ZERO_ADDRESS],
	});

	const rewardEscrowV2 = await deployer.deployContract({
		name: 'RewardEscrowV2',
		source: useOvm ? 'ImportableRewardEscrowV2' : 'RewardEscrowV2',
		args: [account, addressOf(readProxyForResolver)],
		deps: ['AddressResolver'],
	});

	const synthetixEscrow = await deployer.deployContract({
		name: 'SynthetixEscrow',
		args: [account, ZERO_ADDRESS],
	});

	const synthetixState = await deployer.deployContract({
		name: 'SynthetixState',
		source: useOvm ? 'SynthetixStateWithLimitedSetup' : 'SynthetixState',
		args: [account, account],
	});

	const proxyFeePool = await deployer.deployContract({
		name: 'ProxyFeePool',
		source: 'Proxy',
		args: [account],
	});

	const delegateApprovalsEternalStorage = await deployer.deployContract({
		name: 'DelegateApprovalsEternalStorage',
		source: 'EternalStorage',
		args: [account, ZERO_ADDRESS],
	});

	const delegateApprovals = await deployer.deployContract({
		name: 'DelegateApprovals',
		args: [account, addressOf(delegateApprovalsEternalStorage)],
	});

	if (delegateApprovals && delegateApprovalsEternalStorage) {
		await runStep({
			contract: 'EternalStorage',
			target: delegateApprovalsEternalStorage,
			read: 'associatedContract',
			expected: input => input === addressOf(delegateApprovals),
			write: 'setAssociatedContract',
			writeArg: addressOf(delegateApprovals),
		});
	}

	const liquidations = await deployer.deployContract({
		name: 'Liquidations',
		args: [account, addressOf(readProxyForResolver)],
	});

	const eternalStorageLiquidations = await deployer.deployContract({
		name: 'EternalStorageLiquidations',
		source: 'EternalStorage',
		args: [account, addressOf(liquidations)],
	});

	if (liquidations && eternalStorageLiquidations) {
		await runStep({
			contract: 'EternalStorageLiquidations',
			target: eternalStorageLiquidations,
			read: 'associatedContract',
			expected: input => input === addressOf(liquidations),
			write: 'setAssociatedContract',
			writeArg: addressOf(liquidations),
		});
	}

	const feePoolEternalStorage = await deployer.deployContract({
		name: 'FeePoolEternalStorage',
		args: [account, ZERO_ADDRESS],
	});

	const feePool = await deployer.deployContract({
		name: 'FeePool',
		deps: ['ProxyFeePool', 'AddressResolver'],
		args: [addressOf(proxyFeePool), account, addressOf(readProxyForResolver)],
	});

	if (proxyFeePool && feePool) {
		await runStep({
			contract: 'ProxyFeePool',
			target: proxyFeePool,
			read: 'target',
			expected: input => input === addressOf(feePool),
			write: 'setTarget',
			writeArg: addressOf(feePool),
		});
	}

	if (feePoolEternalStorage && feePool) {
		await runStep({
			contract: 'FeePoolEternalStorage',
			target: feePoolEternalStorage,
			read: 'associatedContract',
			expected: input => input === addressOf(feePool),
			write: 'setAssociatedContract',
			writeArg: addressOf(feePool),
		});
	}

	const feePoolState = await deployer.deployContract({
		name: 'FeePoolState',
		deps: ['FeePool'],
		args: [account, addressOf(feePool)],
	});

	if (feePool && feePoolState) {
		// Rewire feePoolState if there is a feePool upgrade
		await runStep({
			contract: 'FeePoolState',
			target: feePoolState,
			read: 'feePool',
			expected: input => input === addressOf(feePool),
			write: 'setFeePool',
			writeArg: addressOf(feePool),
		});
	}

	const rewardsDistribution = await deployer.deployContract({
		name: 'RewardsDistribution',
		deps: useOvm ? ['RewardEscrowV2', 'ProxyFeePool'] : ['RewardEscrowV2', 'ProxyFeePool'],
		args: [
			account, // owner
			ZERO_ADDRESS, // authority (synthetix)
			ZERO_ADDRESS, // Synthetix Proxy
			addressOf(rewardEscrowV2),
			addressOf(proxyFeePool),
		],
	});

	// New Synthetix proxy.
	const proxyERC20Synthetix = await deployer.deployContract({
		name: 'ProxyERC20',
		args: [account],
	});

	const tokenStateSynthetix = await deployer.deployContract({
		name: 'TokenStateSynthetix',
		source: 'TokenState',
		args: [account, account],
	});

	const synthetix = await deployer.deployContract({
		name: 'Synthetix',
		source: useOvm ? 'MintableSynthetix' : 'Synthetix',
		deps: ['ProxyERC20', 'TokenStateSynthetix', 'AddressResolver'],
		args: [
			addressOf(proxyERC20Synthetix),
			addressOf(tokenStateSynthetix),
			account,
			currentSynthetixSupply,
			addressOf(readProxyForResolver),
		],
	});

	if (synthetix && proxyERC20Synthetix) {
		await runStep({
			contract: 'ProxyERC20',
			target: proxyERC20Synthetix,
			read: 'target',
			expected: input => input === addressOf(synthetix),
			write: 'setTarget',
			writeArg: addressOf(synthetix),
		});
		await runStep({
			contract: 'Synthetix',
			target: synthetix,
			read: 'proxy',
			expected: input => input === addressOf(proxyERC20Synthetix),
			write: 'setProxy',
			writeArg: addressOf(proxyERC20Synthetix),
		});
	}

	// Old Synthetix proxy based off Proxy.sol: this has been deprecated.
	// To be removed after May 30, 2020:
	// https://docs.synthetix.io/integrations/guide/#proxy-deprecation
	const proxySynthetix = await deployer.deployContract({
		name: 'ProxySynthetix',
		source: 'Proxy',
		args: [account],
	});
	if (proxySynthetix && synthetix) {
		await runStep({
			contract: 'ProxySynthetix',
			target: proxySynthetix,
			read: 'target',
			expected: input => input === addressOf(synthetix),
			write: 'setTarget',
			writeArg: addressOf(synthetix),
		});
	}

	const debtCache = await deployer.deployContract({
		name: 'DebtCache',
		deps: ['AddressResolver'],
		args: [account, addressOf(readProxyForResolver)],
	});

	let exchanger;
	if (useOvm) {
		exchanger = await deployer.deployContract({
			name: 'Exchanger',
			source: 'Exchanger',
			deps: ['AddressResolver'],
			args: [account, addressOf(readProxyForResolver)],
		});
	} else {
		exchanger = await deployer.deployContract({
			name: 'Exchanger',
			source: 'ExchangerWithVirtualSynth',
			deps: ['AddressResolver'],
			args: [account, addressOf(readProxyForResolver)],
		});

		await deployer.deployContract({
			name: 'VirtualSynthMastercopy',
		});
	}

	const exchangeState = await deployer.deployContract({
		name: 'ExchangeState',
		deps: ['Exchanger'],
		args: [account, addressOf(exchanger)],
	});

	if (exchanger && exchangeState) {
		// The exchangeState contract has Exchanger as it's associated contract
		await runStep({
			contract: 'ExchangeState',
			target: exchangeState,
			read: 'associatedContract',
			expected: input => input === exchanger.options.address,
			write: 'setAssociatedContract',
			writeArg: exchanger.options.address,
		});
	}

	if (exchanger && systemStatus) {
		// SIP-65: ensure Exchanger can suspend synths if price spikes occur
		await runStep({
			contract: 'SystemStatus',
			target: systemStatus,
			read: 'accessControl',
			readArg: [toBytes32('Synth'), addressOf(exchanger)],
			expected: ({ canSuspend } = {}) => canSuspend,
			write: 'updateAccessControl',
			writeArg: [toBytes32('Synth'), addressOf(exchanger), true, false],
		});
	}

	// only reset token state if redeploying
	if (tokenStateSynthetix && config['TokenStateSynthetix'].deploy) {
		const initialIssuance = await getDeployParameter('INITIAL_ISSUANCE');
		await runStep({
			contract: 'TokenStateSynthetix',
			target: tokenStateSynthetix,
			read: 'balanceOf',
			readArg: account,
			expected: input => input === initialIssuance,
			write: 'setBalanceOf',
			writeArg: [account, initialIssuance],
		});
	}

	if (tokenStateSynthetix && synthetix) {
		await runStep({
			contract: 'TokenStateSynthetix',
			target: tokenStateSynthetix,
			read: 'associatedContract',
			expected: input => input === addressOf(synthetix),
			write: 'setAssociatedContract',
			writeArg: addressOf(synthetix),
		});
	}

	const issuer = await deployer.deployContract({
		name: 'Issuer',
		source: useOvm ? 'IssuerWithoutLiquidations' : 'Issuer',
		deps: ['AddressResolver'],
		args: [account, addressOf(readProxyForResolver)],
	});

	const issuerAddress = addressOf(issuer);

	await deployer.deployContract({
		name: 'TradingRewards',
		deps: ['AddressResolver', 'Exchanger'],
		args: [account, account, addressOf(readProxyForResolver)],
	});

	if (synthetixState && issuer) {
		// The SynthetixState contract has Issuer as it's associated contract (after v2.19 refactor)
		await runStep({
			contract: 'SynthetixState',
			target: synthetixState,
			read: 'associatedContract',
			expected: input => input === issuerAddress,
			write: 'setAssociatedContract',
			writeArg: issuerAddress,
		});
	}

	if (useOvm && synthetixState && feePool) {
		// The SynthetixStateLimitedSetup) contract has FeePool to appendAccountIssuanceRecord
		await runStep({
			contract: 'SynthetixState',
			target: synthetixState,
			read: 'feePool',
			expected: input => input === addressOf(feePool),
			write: 'setFeePool',
			writeArg: addressOf(feePool),
		});
	}

	if (synthetixEscrow) {
		await deployer.deployContract({
			name: 'EscrowChecker',
			deps: ['SynthetixEscrow'],
			args: [addressOf(synthetixEscrow)],
		});
	}

	if (rewardEscrow && synthetix) {
		await runStep({
			contract: 'RewardEscrow',
			target: rewardEscrow,
			read: 'synthetix',
			expected: input => input === addressOf(synthetix),
			write: 'setSynthetix',
			writeArg: addressOf(synthetix),
		});
	}

	if (rewardEscrow && feePool) {
		await runStep({
			contract: 'RewardEscrow',
			target: rewardEscrow,
			read: 'feePool',
			expected: input => input === addressOf(feePool),
			write: 'setFeePool',
			writeArg: addressOf(feePool),
		});
	}

	if (!useOvm) {
		const supplySchedule = await deployer.deployContract({
			name: 'SupplySchedule',
			args: [account, currentLastMintEvent, currentWeekOfInflation],
		});
		if (supplySchedule && synthetix) {
			await runStep({
				contract: 'SupplySchedule',
				target: supplySchedule,
				read: 'synthetixProxy',
				expected: input => input === addressOf(proxySynthetix),
				write: 'setSynthetixProxy',
				writeArg: addressOf(proxySynthetix),
			});
		}
	}

	if (synthetix && rewardsDistribution) {
		await runStep({
			contract: 'RewardsDistribution',
			target: rewardsDistribution,
			read: 'authority',
			expected: input => input === addressOf(synthetix),
			write: 'setAuthority',
			writeArg: addressOf(synthetix),
		});

		await runStep({
			contract: 'RewardsDistribution',
			target: rewardsDistribution,
			read: 'synthetixProxy',
			expected: input => input === addressOf(proxyERC20Synthetix),
			write: 'setSynthetixProxy',
			writeArg: addressOf(proxyERC20Synthetix),
		});
	}

	// RewardEscrow on RewardsDistribution should be set to new RewardEscrowV2
	if (rewardEscrowV2 && rewardsDistribution) {
		await runStep({
			contract: 'RewardsDistribution',
			target: rewardsDistribution,
			read: 'rewardEscrow',
			expected: input => input === addressOf(rewardEscrowV2),
			write: 'setRewardEscrow',
			writeArg: addressOf(rewardEscrowV2),
		});
	}

	// ----------------
	// Setting proxyERC20 Synthetix for synthetixEscrow
	// ----------------

	// Skip setting unless redeploying either of these,
	if (config['Synthetix'].deploy || config['SynthetixEscrow'].deploy) {
		// Note: currently on mainnet SynthetixEscrow.methods.synthetix() does NOT exist
		// it is "havven" and the ABI we have here is not sufficient
		if (network === 'mainnet' && !useOvm) {
			await runStep({
				contract: 'SynthetixEscrow',
				target: synthetixEscrow,
				read: 'havven',
				expected: input => input === addressOf(proxyERC20Synthetix),
				write: 'setHavven',
				writeArg: addressOf(proxyERC20Synthetix),
			});
		} else {
			await runStep({
				contract: 'SynthetixEscrow',
				target: synthetixEscrow,
				read: 'synthetix',
				expected: input => input === addressOf(proxyERC20Synthetix),
				write: 'setSynthetix',
				writeArg: addressOf(proxyERC20Synthetix),
			});
		}
	}

	// ----------------
	// Synths
	// ----------------
	console.log(gray(`\n------ DEPLOY SYNTHS ------\n`));

	// The list of synth to be added to the Issuer once dependencies have been set up
	const synthsToAdd = [];

	for (const { name: currencyKey, subclass, asset } of synths) {
		console.log(gray(`\n   --- SYNTH ${currencyKey} ---\n`));

		const tokenStateForSynth = await deployer.deployContract({
			name: `TokenState${currencyKey}`,
			source: 'TokenState',
			args: [account, ZERO_ADDRESS],
			force: addNewSynths,
		});

		// Legacy proxy will be around until May 30, 2020
		// https://docs.synthetix.io/integrations/guide/#proxy-deprecation
		// Until this time, on mainnet we will still deploy ProxyERC20sUSD and ensure that
		// SynthsUSD.proxy is ProxyERC20sUSD, SynthsUSD.integrationProxy is ProxysUSD
		const synthProxyIsLegacy = currencyKey === 'sUSD' && network === 'mainnet';

		const proxyForSynth = await deployer.deployContract({
			name: `Proxy${currencyKey}`,
			source: synthProxyIsLegacy ? 'Proxy' : 'ProxyERC20',
			args: [account],
			force: addNewSynths,
		});

		// additionally deploy an ERC20 proxy for the synth if it's legacy (sUSD)
		let proxyERC20ForSynth;
		if (currencyKey === 'sUSD') {
			proxyERC20ForSynth = await deployer.deployContract({
				name: `ProxyERC20${currencyKey}`,
				source: `ProxyERC20`,
				args: [account],
				force: addNewSynths,
			});
		}

		const currencyKeyInBytes = toBytes32(currencyKey);

		const synthConfig = config[`Synth${currencyKey}`] || {};

		// track the original supply if we're deploying a new synth contract for an existing synth
		let originalTotalSupply = 0;
		if (synthConfig.deploy) {
			try {
				const oldSynth = deployer.getExistingContract({ contract: `Synth${currencyKey}` });
				originalTotalSupply = await oldSynth.methods.totalSupply().call();
			} catch (err) {
				if (!freshDeploy) {
					// only throw if not local - allows local environments to handle both new
					// and updating configurations
					throw err;
				}
			}
		}

		// user confirm totalSupply is correct for oldSynth before deploy new Synth
		if (synthConfig.deploy && !yes && originalTotalSupply > 0) {
			try {
				await confirmAction(
					yellow(
						`⚠⚠⚠ WARNING: Please confirm - ${network}:\n` +
							`Synth${currencyKey} totalSupply is ${originalTotalSupply} \n`
					) +
						gray('-'.repeat(50)) +
						'\nDo you want to continue? (y/n) '
				);
			} catch (err) {
				console.log(gray('Operation cancelled'));
				return;
			}
		}

		const sourceContract = subclass || 'Synth';
		const synth = await deployer.deployContract({
			name: `Synth${currencyKey}`,
			source: sourceContract,
			deps: [`TokenState${currencyKey}`, `Proxy${currencyKey}`, 'Synthetix', 'FeePool'],
			args: [
				proxyERC20ForSynth ? addressOf(proxyERC20ForSynth) : addressOf(proxyForSynth),
				addressOf(tokenStateForSynth),
				`Synth ${currencyKey}`,
				currencyKey,
				account,
				currencyKeyInBytes,
				originalTotalSupply,
				addressOf(readProxyForResolver),
			],
			force: addNewSynths,
		});

		if (tokenStateForSynth && synth) {
			await runStep({
				contract: `TokenState${currencyKey}`,
				target: tokenStateForSynth,
				read: 'associatedContract',
				expected: input => input === addressOf(synth),
				write: 'setAssociatedContract',
				writeArg: addressOf(synth),
			});
		}

		// Setup proxy for synth
		if (proxyForSynth && synth) {
			await runStep({
				contract: `Proxy${currencyKey}`,
				target: proxyForSynth,
				read: 'target',
				expected: input => input === addressOf(synth),
				write: 'setTarget',
				writeArg: addressOf(synth),
			});

			// Migration Phrase 2: if there's a ProxyERC20sUSD then the Synth's proxy must use it
			await runStep({
				contract: `Synth${currencyKey}`,
				target: synth,
				read: 'proxy',
				expected: input => input === addressOf(proxyERC20ForSynth || proxyForSynth),
				write: 'setProxy',
				writeArg: addressOf(proxyERC20ForSynth || proxyForSynth),
			});

			if (proxyERC20ForSynth) {
				// and make sure this new proxy has the target of the synth
				await runStep({
					contract: `ProxyERC20${currencyKey}`,
					target: proxyERC20ForSynth,
					read: 'target',
					expected: input => input === addressOf(synth),
					write: 'setTarget',
					writeArg: addressOf(synth),
				});
			}
		}

		// Save the synth to be added once the AddressResolver has been synced.
		if (synth && issuer) {
			synthsToAdd.push({
				synth,
				currencyKeyInBytes,
			});
		}

		const { feed } = feeds[asset] || {};

		// now setup price aggregator if any for the synth
		if (isAddress(feed) && exchangeRates) {
			await runStep({
				contract: `ExchangeRates`,
				target: exchangeRates,
				read: 'aggregators',
				readArg: currencyKeyInBytes,
				expected: input => input === feed,
				write: 'addAggregator',
				writeArg: [currencyKeyInBytes, feed],
			});
		}

		if (!useOvm && exchangeRates) {
			/*
			TODO: set up DEX TWAP oracle for exchange rates
			await runStep({
				contract: `ExchangeRates`,
				target: exchangeRates,
				read: 'dexTwapAggregator',
				expected: input => input === dexTwapAggregator,
				write: 'setDexTwapAggregator',
				writeArg: [dexTwapAggregator],
			});
			*/
		}
	}

	console.log(gray(`\n------ DEPLOY ANCILLARY CONTRACTS ------\n`));

	await deployer.deployContract({
		name: 'Depot',
		deps: ['ProxySynthetix', 'SynthsUSD', 'FeePool'],
		args: [account, account, addressOf(readProxyForResolver)],
	});

	// let manager, collateralEth, collateralErc20, collateralShort;

	if (useOvm) {
		await deployer.deployContract({
			// name is EtherCollateral as it behaves as EtherCollateral in the address resolver
			name: 'EtherCollateral',
			source: 'EmptyEtherCollateral',
			args: [],
		});
		await deployer.deployContract({
			name: 'EtherCollateralsUSD',
			source: 'EmptyEtherCollateral',
			args: [],
		});
		await deployer.deployContract({
			name: 'CollateralManager',
			source: 'EmptyCollateralManager',
			args: [],
		});
		await deployer.deployContract({
			name: 'SynthetixBridgeToBase',
			deps: ['AddressResolver'],
			args: [account, addressOf(readProxyForResolver)],
		});
	} else {
		await deployer.deployContract({
			name: 'EtherCollateral',
			deps: ['AddressResolver'],
			args: [account, addressOf(readProxyForResolver)],
		});
		await deployer.deployContract({
			name: 'EtherCollateralsUSD',
			deps: ['AddressResolver'],
			args: [account, addressOf(readProxyForResolver)],
		});
		const SynthetixBridgeToOptimism = await deployer.deployContract({
			name: 'SynthetixBridgeToOptimism',
			deps: ['AddressResolver'],
			args: [account, addressOf(readProxyForResolver)],
		});
		const SynthetixBridgeEscrow = await deployer.deployContract({
			name: 'SynthetixBridgeEscrow',
			deps: ['AddressResolver'],
			args: [account],
		});

		const allowance = await proxyERC20Synthetix.methods
			.allowance(addressOf(SynthetixBridgeEscrow), addressOf(SynthetixBridgeToOptimism))
			.call();
		if (allowance.toString() === '0') {
			await runStep({
				contract: `SynthetixBridgeEscrow`,
				target: SynthetixBridgeEscrow,
				write: 'approveBridge',
				writeArg: [
					addressOf(proxyERC20Synthetix),
					addressOf(SynthetixBridgeToOptimism),
					parseUnits('100000000').toString(),
				],
			});
		}
	}

	let WETH_ADDRESS = (await getDeployParameter('WETH_ERC20_ADDRESSES'))[network];

	if (network === 'local') {
		// On local, deploy a mock WETH token.
		// OVM already has a deployment of WETH, however since we use
		// Hardhat for the local-ovm environment, we must deploy
		// our own.
		const weth = await deployer.deployContract({
			name: useOvm ? 'MockWETH' : 'WETH',
			force: true,
		});
		WETH_ADDRESS = weth.options.address;
	}

	if (!WETH_ADDRESS) {
		throw new Error('WETH address is not known');
	}

	await deployer.deployContract({
		name: 'EtherWrapper',
		deps: ['AddressResolver'],
		args: [account, addressOf(readProxyForResolver), WETH_ADDRESS],
	});

	if (!useOvm) {
		await deployer.deployContract({
			name: 'NativeEtherWrapper',
			deps: ['AddressResolver'],
			args: [account, addressOf(readProxyForResolver)],
		});
	}

	// ----------------
	// Binary option market factory and manager setup
	// ----------------

	console.log(gray(`\n------ DEPLOY BINARY OPTIONS ------\n`));

	await deployer.deployContract({
		name: 'BinaryOptionMarketFactory',
		args: [account, addressOf(readProxyForResolver)],
		deps: ['AddressResolver'],
	});

	const day = 24 * 60 * 60;
	const maxOraclePriceAge = 120 * 60; // Price updates are accepted from up to two hours before maturity to allow for delayed chainlink heartbeats.
	const expiryDuration = 26 * 7 * day; // Six months to exercise options before the market is destructible.
	const maxTimeToMaturity = 730 * day; // Markets may not be deployed more than two years in the future.
	const creatorCapitalRequirement = parseUnits('1000').toString(); // 1000 sUSD is required to create a new market.
	const creatorSkewLimit = parseUnits('0.05').toString(); // Market creators must leave 5% or more of their position on either side.
	const poolFee = parseUnits('0.008').toString(); // 0.8% of the market's value goes to the pool in the end.
	const creatorFee = parseUnits('0.002').toString(); // 0.2% of the market's value goes to the creator.
	const refundFee = parseUnits('0.05').toString(); // 5% of a bid stays in the pot if it is refunded.
	const binaryOptionMarketManager = await deployer.deployContract({
		name: 'BinaryOptionMarketManager',
		args: [
			account,
			addressOf(readProxyForResolver),
			maxOraclePriceAge,
			expiryDuration,
			maxTimeToMaturity,
			creatorCapitalRequirement,
			creatorSkewLimit,
			poolFee,
			creatorFee,
			refundFee,
		],
		deps: ['AddressResolver'],
	});

	console.log(gray(`\n------ DEPLOY DAPP UTILITIES ------\n`));

	await deployer.deployContract({
		name: 'SynthUtil',
		deps: ['ReadProxyAddressResolver'],
		args: [addressOf(readProxyForResolver)],
	});

	await deployer.deployContract({
		name: 'DappMaintenance',
		args: [account],
	});

	await deployer.deployContract({
		name: 'BinaryOptionMarketData',
	});

	console.log(gray(`\n------ CONFIGURE STANDLONE FEEDS ------\n`));

	// Setup remaining price feeds (that aren't synths)

	for (const { asset, feed } of standaloneFeeds) {
		if (isAddress(feed) && exchangeRates) {
			await runStep({
				contract: `ExchangeRates`,
				target: exchangeRates,
				read: 'aggregators',
				readArg: toBytes32(asset),
				expected: input => input === feed,
				write: 'addAggregator',
				writeArg: [toBytes32(asset), feed],
			});
		}
	}

	// ----------------
	// Multi Collateral System
	// ----------------
	let collateralManager, collateralEth, collateralErc20, collateralShort;

	const collateralManagerDefaults = await getDeployParameter('COLLATERAL_MANAGER');

	if (!useOvm) {
		console.log(gray(`\n------ DEPLOY MULTI COLLATERAL ------\n`));

		const managerState = await deployer.deployContract({
			name: 'CollateralManagerState',
			args: [account, account],
		});

		collateralManager = await deployer.deployContract({
			name: 'CollateralManager',
			args: [
				addressOf(managerState),
				account,
				addressOf(readProxyForResolver),
				collateralManagerDefaults['MAX_DEBT'],
				collateralManagerDefaults['BASE_BORROW_RATE'],
				collateralManagerDefaults['BASE_SHORT_RATE'],
			],
		});

		if (managerState && collateralManager) {
			await runStep({
				contract: 'CollateralManagerState',
				target: managerState,
				read: 'associatedContract',
				expected: input => input === addressOf(collateralManager),
				write: 'setAssociatedContract',
				writeArg: addressOf(collateralManager),
			});
		}

		const collateralStateEth = await deployer.deployContract({
			name: 'CollateralStateEth',
			source: 'CollateralState',
			args: [account, account],
		});

		collateralEth = await deployer.deployContract({
			name: 'CollateralEth',
			args: [
				addressOf(collateralStateEth),
				account,
				addressOf(collateralManager),
				addressOf(readProxyForResolver),
				toBytes32('sETH'),
				(await getDeployParameter('COLLATERAL_ETH'))['MIN_CRATIO'],
				(await getDeployParameter('COLLATERAL_ETH'))['MIN_COLLATERAL'],
			],
		});

		if (collateralStateEth && collateralEth) {
			await runStep({
				contract: 'CollateralStateEth',
				target: collateralStateEth,
				read: 'associatedContract',
				expected: input => input === addressOf(collateralEth),
				write: 'setAssociatedContract',
				writeArg: addressOf(collateralEth),
			});
		}

		const collateralStateErc20 = await deployer.deployContract({
			name: 'CollateralStateErc20',
			source: 'CollateralState',
			args: [account, account],
		});

		let RENBTC_ADDRESS = (await getDeployParameter('RENBTC_ERC20_ADDRESSES'))[network];
		if (!RENBTC_ADDRESS) {
			if (network !== 'local') {
				throw new Error('renBTC address is not known');
			}

			// On local, deploy a mock renBTC token to use as the underlying in CollateralErc20
			const renBTC = await deployer.deployContract({
				name: 'MockToken',
				args: ['renBTC', 'renBTC', 8],
			});

			RENBTC_ADDRESS = renBTC.options.address;
		}

		collateralErc20 = await deployer.deployContract({
			name: 'CollateralErc20',
			source: 'CollateralErc20',
			args: [
				addressOf(collateralStateErc20),
				account,
				addressOf(collateralManager),
				addressOf(readProxyForResolver),
				toBytes32('sBTC'),
				(await getDeployParameter('COLLATERAL_RENBTC'))['MIN_CRATIO'],
				(await getDeployParameter('COLLATERAL_RENBTC'))['MIN_COLLATERAL'],
				RENBTC_ADDRESS,
				8,
			],
		});

		if (collateralStateErc20 && collateralErc20) {
			await runStep({
				contract: 'CollateralStateErc20',
				target: collateralStateErc20,
				read: 'associatedContract',
				expected: input => input === addressOf(collateralErc20),
				write: 'setAssociatedContract',
				writeArg: addressOf(collateralErc20),
			});
		}

		const collateralStateShort = await deployer.deployContract({
			name: 'CollateralStateShort',
			source: 'CollateralState',
			args: [account, account],
		});

		collateralShort = await deployer.deployContract({
			name: 'CollateralShort',
			args: [
				addressOf(collateralStateShort),
				account,
				addressOf(collateralManager),
				addressOf(readProxyForResolver),
				toBytes32('sUSD'),
				(await getDeployParameter('COLLATERAL_SHORT'))['MIN_CRATIO'],
				(await getDeployParameter('COLLATERAL_SHORT'))['MIN_COLLATERAL'],
			],
		});

		if (collateralStateShort && collateralShort) {
			await runStep({
				contract: 'CollateralStateShort',
				target: collateralStateShort,
				read: 'associatedContract',
				expected: input => input === collateralShort.options.address,
				write: 'setAssociatedContract',
				writeArg: collateralShort.options.address,
			});
		}
	}

	console.log(gray(`\n------ CONFIGURE ADDRESS RESOLVER ------\n`));

	let addressesAreImported = false;

	if (addressResolver) {
		const addressArgs = [[], []];

		const allContracts = Object.entries(deployer.deployedContracts);
		await Promise.all(
			allContracts.map(([name, contract]) => {
				return limitPromise(async () => {
					const isImported = await addressResolver.methods
						.areAddressesImported([toBytes32(name)], [contract.options.address])
						.call();

					if (!isImported) {
						console.log(green(`${name} needs to be imported to the AddressResolver`));

						addressArgs[0].push(toBytes32(name));
						addressArgs[1].push(contract.options.address);
					}
				});
			})
		);

		const { pending } = await runStep({
			gasLimit: 6e6, // higher gas required
			contract: `AddressResolver`,
			target: addressResolver,
			read: 'areAddressesImported',
			readArg: addressArgs,
			expected: input => input,
			write: 'importAddresses',
			writeArg: addressArgs,
		});

		addressesAreImported = !pending;
	}

	// Whewn addresses
	// This relies on the fact that runStep returns undefined if nothing needed to be done, a tx hash if the
	// transaction could be mined, and true in other cases, including appending to the owner actions file.
	// Note that this will also end the script in the case of manual transaction mining.
	if (!addressesAreImported) {
		console.log(gray(`\n------ DEPLOY PARTIALLY COMPLETED ------\n`));

		console.log(
			yellow(
				'⚠⚠⚠ WARNING: Addresses have not been imported into the resolver, owner actions must be performed before re-running the script.'
			)
		);

		if (deployer.newContractsDeployed.length > 0) {
			reportDeployedContracts({ deployer });
		}

		process.exit(1);
	}

	console.log(gray('Addresses are correctly set up, continuing...'));

	// Legacy contracts.
	if (network === 'mainnet') {
		// v2.35.2 contracts.
		const CollateralEth = '0x3FF5c0A14121Ca39211C95f6cEB221b86A90729E';
		const CollateralErc20REN = '0x3B3812BB9f6151bEb6fa10783F1ae848a77a0d46';
		const CollateralShort = '0x188C2274B04Ea392B21487b5De299e382Ff84246';

		const legacyContracts = Object.entries({
			CollateralEth,
			CollateralErc20REN,
			CollateralShort,
		}).map(([name, address]) => {
			const contract = new deployer.provider.web3.eth.Contract(
				[...compiled['MixinResolver'].abi, ...compiled['Owned'].abi],
				address
			);
			return [`legacy:${name}`, contract];
		});

		await Promise.all(
			legacyContracts.map(async ([name, contract]) => {
				return runStep({
					gasLimit: 7e6,
					contract: name,
					target: contract,
					read: 'isResolverCached',
					expected: input => input,
					publiclyCallable: true, // does not require owner
					write: 'rebuildCache',
				});
			})
		);
	}

	const filterTargetsWith = ({ prop }) =>
		Object.entries(deployer.deployedContracts).filter(([, target]) =>
			target.options.jsonInterface.find(({ name }) => name === prop)
		);

	const contractsWithRebuildableCache = filterTargetsWith({ prop: 'rebuildCache' });

	// collect all resolver addresses required
	const resolverAddressesRequired = (
		await Promise.all(
			contractsWithRebuildableCache.map(([, contract]) => {
				return limitPromise(() => contract.methods.resolverAddressesRequired().call());
			})
		)
	).reduce((allAddresses, contractAddresses) => {
		return allAddresses.concat(
			contractAddresses.filter(contractAddress => !allAddresses.includes(contractAddress))
		);
	}, []);

	// check which resolver addresses are imported
	const resolvedAddresses = await Promise.all(
		resolverAddressesRequired.map(id => {
			return limitPromise(() => addressResolver.methods.getAddress(id).call());
		})
	);
	const isResolverAddressImported = {};
	for (let i = 0; i < resolverAddressesRequired.length; i++) {
		isResolverAddressImported[resolverAddressesRequired[i]] = resolvedAddresses[i] !== ZERO_ADDRESS;
	}

	// print out resolver addresses
	console.log(gray('Imported resolver addresses:'));
	for (const id of Object.keys(isResolverAddressImported)) {
		const isImported = isResolverAddressImported[id];
		const chalkFn = isImported ? gray : red;
		console.log(chalkFn(`  > ${fromBytes32(id)}: ${isImported}`));
	}

	// now ensure all caches are rebuilt for those in need
	const contractsToRebuildCache = [];
	for (const [name, target] of contractsWithRebuildableCache) {
		const isCached = await target.methods.isResolverCached().call();
		if (!isCached) {
			const requiredAddresses = await target.methods.resolverAddressesRequired().call();

			const unknownAddress = requiredAddresses.find(id => !isResolverAddressImported[id]);
			if (unknownAddress) {
				console.log(
					redBright(
						`WARINING: Not invoking ${name}.rebuildCache() because ${fromBytes32(
							unknownAddress
						)} is unknown. This contract requires: ${requiredAddresses.map(id => fromBytes32(id))}`
					)
				);
			} else {
				contractsToRebuildCache.push(target.options.address);
			}
		}
	}

	const addressesChunkSize = useOvm ? 7 : 20;
	for (let i = 0; i < contractsToRebuildCache.length; i += addressesChunkSize) {
		const chunk = contractsToRebuildCache.slice(i, i + addressesChunkSize);
		await runStep({
			gasLimit: useOvm ? OVM_MAX_GAS_LIMIT : 7e6,
			contract: `AddressResolver`,
			target: addressResolver,
			publiclyCallable: true, // does not require owner
			write: 'rebuildCaches',
			writeArg: [chunk],
		});
	}

	console.log(gray('Double check all contracts with rebuildCache() are rebuilt...'));
	for (const [contract, target] of contractsWithRebuildableCache) {
		if (contractsToRebuildCache.includes(target.options.address)) {
			await runStep({
				gasLimit: 500e3, // higher gas required
				contract,
				target,
				read: 'isResolverCached',
				expected: input => input,
				publiclyCallable: true, // does not require owner
				write: 'rebuildCache',
			});
		}
	}

	// Now do binary option market cache rebuilding
	if (binaryOptionMarketManager) {
		console.log(gray('Checking all binary option markets have rebuilt caches'));
		let binaryOptionMarkets = [];
		// now grab all possible binary option markets to rebuild caches as well
		const binaryOptionsFetchPageSize = 100;
		for (const marketType of ['Active', 'Matured']) {
			const numBinaryOptionMarkets = Number(
				await binaryOptionMarketManager.methods[`num${marketType}Markets`]().call()
			);
			console.log(
				gray('Found'),
				yellow(numBinaryOptionMarkets),
				gray(marketType, 'binary option markets')
			);

			if (numBinaryOptionMarkets > binaryOptionsFetchPageSize) {
				console.log(
					redBright(
						'⚠⚠⚠ Warning: cannot fetch all',
						marketType,
						'binary option markets as there are',
						numBinaryOptionMarkets,
						'which is more than page size of',
						binaryOptionsFetchPageSize
					)
				);
			} else {
				// fetch the list of markets
				const marketAddresses = await binaryOptionMarketManager.methods[
					`${marketType.toLowerCase()}Markets`
				](0, binaryOptionsFetchPageSize).call();

				// wrap them in a contract via the deployer
				const markets = marketAddresses.map(
					binaryOptionMarket =>
						new deployer.provider.web3.eth.Contract(
							compiled['BinaryOptionMarket'].abi,
							binaryOptionMarket
						)
				);

				binaryOptionMarkets = binaryOptionMarkets.concat(markets);
			}
		}

		// now figure out which binary option markets need their caches rebuilt
		const binaryOptionMarketsToRebuildCacheOn = [];
		for (const market of binaryOptionMarkets) {
			try {
				const isCached = await market.methods.isResolverCached().call();
				if (!isCached) {
					binaryOptionMarketsToRebuildCacheOn.push(addressOf(market));
				}
				console.log(
					gray('Binary option market'),
					yellow(addressOf(market)),
					gray('is newer and cache status'),
					yellow(isCached)
				);
			} catch (err) {
				// the challenge being that some used an older MixinResolver API
				const oldBinaryOptionMarketABI = [
					{
						constant: true,
						inputs: [
							{
								internalType: 'contract AddressResolver',
								name: '_resolver',
								type: 'address',
							},
						],
						name: 'isResolverCached',
						outputs: [
							{
								internalType: 'bool',
								name: '',
								type: 'bool',
							},
						],
						payable: false,
						stateMutability: 'view',
						type: 'function',
						signature: '0x631e1444',
					},
				];

				const oldBinaryOptionMarket = new deployer.provider.web3.eth.Contract(
					oldBinaryOptionMarketABI,
					addressOf(market)
				);

				const isCached = await oldBinaryOptionMarket.methods
					.isResolverCached(addressOf(readProxyForResolver))
					.call();
				if (!isCached) {
					binaryOptionMarketsToRebuildCacheOn.push(addressOf(market));
				}

				console.log(
					gray('Binary option market'),
					yellow(addressOf(market)),
					gray('is older and cache status'),
					yellow(isCached)
				);
			}
		}

		console.log(
			gray('In total'),
			yellow(binaryOptionMarketsToRebuildCacheOn.length),
			gray('binary option markets need their caches rebuilt')
		);

		const addressesChunkSize = useOvm ? 7 : 20;
		for (let i = 0; i < binaryOptionMarketsToRebuildCacheOn.length; i += addressesChunkSize) {
			const chunk = binaryOptionMarketsToRebuildCacheOn.slice(i, i + addressesChunkSize);
			await runStep({
				gasLimit: useOvm ? OVM_MAX_GAS_LIMIT : 7e6,
				contract: `BinaryOptionMarketManager`,
				target: binaryOptionMarketManager,
				publiclyCallable: true, // does not require owner
				write: 'rebuildMarketCaches',
				writeArg: [chunk],
			});
		}
	}

	// Now perform a sync of legacy contracts that have not been replaced in Shaula (v2.35.x)
	// EtherCollateral, EtherCollateralsUSD
	console.log(gray('Checking all legacy contracts with setResolverAndSyncCache() are rebuilt...'));
	const contractsWithLegacyResolverCaching = filterTargetsWith({
		prop: 'setResolverAndSyncCache',
	});
	for (const [contract, target] of contractsWithLegacyResolverCaching) {
		await runStep({
			gasLimit: 500e3, // higher gas required
			contract,
			target,
			read: 'isResolverCached',
			readArg: addressOf(readProxyForResolver),
			expected: input => input,
			write: 'setResolverAndSyncCache',
			writeArg: addressOf(readProxyForResolver),
		});
	}

	// Finally set resolver on contracts even older than legacy (Depot)
	console.log(gray('Checking all legacy contracts with setResolver() are rebuilt...'));
	const contractsWithLegacyResolverNoCache = filterTargetsWith({
		prop: 'setResolver',
	});
	for (const [contract, target] of contractsWithLegacyResolverNoCache) {
		await runStep({
			gasLimit: 500e3, // higher gas required
			contract,
			target,
			read: 'resolver',
			expected: input => addressOf(readProxyForResolver),
			write: 'setResolver',
			writeArg: addressOf(readProxyForResolver),
		});
	}

	console.log(gray('All caches are rebuilt. Continuing.'));

	// now after resolvers have been set

	console.log(gray(`\n------ ADD SYNTHS TO ISSUER ------\n`));

	// Set up the connection to the Issuer for each Synth (requires FlexibleStorage to have been configured)

	// First filter out all those synths which are already properly imported
	console.log(gray('Filtering synths to add to the issuer.'));
	const filteredSynths = [];
	for (const synth of synthsToAdd) {
		const issuerSynthAddress = await issuer.methods.synths(synth.currencyKeyInBytes).call();
		const currentSynthAddress = addressOf(synth.synth);
		if (issuerSynthAddress === currentSynthAddress) {
			console.log(gray(`${currentSynthAddress} requires no action`));
		} else {
			console.log(gray(`${currentSynthAddress} will be added to the issuer.`));
			filteredSynths.push(synth);
		}
	}

	const synthChunkSize = 15;
	for (let i = 0; i < filteredSynths.length; i += synthChunkSize) {
		const chunk = filteredSynths.slice(i, i + synthChunkSize);
		await runStep({
			contract: 'Issuer',
			target: issuer,
			read: 'getSynths',
			readArg: [chunk.map(synth => synth.currencyKeyInBytes)],
			expected: input =>
				input.length === chunk.length &&
				input.every((cur, idx) => cur === addressOf(chunk[idx].synth)),
			write: 'addSynths',
			writeArg: [chunk.map(synth => addressOf(synth.synth))],
			gasLimit: 1e5 * synthChunkSize,
		});
	}

	console.log(gray(`\n------ CONFIGURE INVERSE SYNTHS ------\n`));

	for (const { name: currencyKey, inverted } of synths) {
		if (inverted) {
			const { entryPoint, upperLimit, lowerLimit } = inverted;

			// helper function
			const setInversePricing = ({ freezeAtUpperLimit, freezeAtLowerLimit }) =>
				runStep({
					contract: 'ExchangeRates',
					target: exchangeRates,
					write: 'setInversePricing',
					writeArg: [
						toBytes32(currencyKey),
						parseUnits(entryPoint.toString()).toString(),
						parseUnits(upperLimit.toString()).toString(),
						parseUnits(lowerLimit.toString()).toString(),
						freezeAtUpperLimit,
						freezeAtLowerLimit,
					],
				});

			// when the oldExrates exists - meaning there is a valid ExchangeRates in the existing deployment.json
			// for this environment (true for all environments except the initial deploy in 'local' during those tests)
			if (oldExrates) {
				// get inverse synth's params from the old exrates, if any exist
				const oldInversePricing = await oldExrates.methods
					.inversePricing(toBytes32(currencyKey))
					.call();

				const {
					entryPoint: oldEntryPoint,
					upperLimit: oldUpperLimit,
					lowerLimit: oldLowerLimit,
					frozenAtUpperLimit: currentRateIsFrozenUpper,
					frozenAtLowerLimit: currentRateIsFrozenLower,
				} = oldInversePricing;

				const currentRateIsFrozen = currentRateIsFrozenUpper || currentRateIsFrozenLower;
				// and the last rate if any exists
				const currentRateForCurrency = await oldExrates.methods
					.rateForCurrency(toBytes32(currencyKey))
					.call();

				// and total supply, if any
				const synth = deployer.deployedContracts[`Synth${currencyKey}`];
				const totalSynthSupply = await synth.methods.totalSupply().call();
				console.log(gray(`totalSupply of ${currencyKey}: ${Number(totalSynthSupply)}`));

				const inversePricingOnCurrentExRates = await exchangeRates.methods
					.inversePricing(toBytes32(currencyKey))
					.call();

				// ensure that if it's a newer exchange rates deployed, then skip reinserting the inverse pricing if
				// already done
				if (
					oldExrates.options.address !== exchangeRates.options.address &&
					JSON.stringify(inversePricingOnCurrentExRates) === JSON.stringify(oldInversePricing) &&
					+formatUnits(inversePricingOnCurrentExRates.entryPoint) === entryPoint &&
					+formatUnits(inversePricingOnCurrentExRates.upperLimit) === upperLimit &&
					+formatUnits(inversePricingOnCurrentExRates.lowerLimit) === lowerLimit
				) {
					console.log(
						gray(
							`Current ExchangeRates.inversePricing(${currencyKey}) is the same as the previous. Nothing to do.`
						)
					);
				}
				// When there's an inverted synth with matching parameters
				else if (
					entryPoint === +formatUnits(oldEntryPoint) &&
					upperLimit === +formatUnits(oldUpperLimit) &&
					lowerLimit === +formatUnits(oldLowerLimit)
				) {
					if (oldExrates.options.address !== addressOf(exchangeRates)) {
						const freezeAtUpperLimit = +formatUnits(currentRateForCurrency) === upperLimit;
						const freezeAtLowerLimit = +formatUnits(currentRateForCurrency) === lowerLimit;
						console.log(
							gray(
								`Detected an existing inverted synth for ${currencyKey} with identical parameters and a newer ExchangeRates. ` +
									`Persisting its frozen status (${currentRateIsFrozen}) and if frozen, then freeze rate at upper (${freezeAtUpperLimit}) or lower (${freezeAtLowerLimit}).`
							)
						);

						// then ensure it gets set to the same frozen status and frozen rate
						// as the old exchange rates
						await setInversePricing({
							freezeAtUpperLimit,
							freezeAtLowerLimit,
						});
					} else {
						console.log(
							gray(
								`Detected an existing inverted synth for ${currencyKey} with identical parameters and no new ExchangeRates. Skipping check of frozen status.`
							)
						);
					}
				} else if (Number(currentRateForCurrency) === 0) {
					console.log(gray(`Detected a new inverted synth for ${currencyKey}. Proceeding to add.`));
					// Then a new inverted synth is being added (as there's no previous rate for it)
					await setInversePricing({ freezeAtUpperLimit: false, freezeAtLowerLimit: false });
				} else if (Number(totalSynthSupply) === 0) {
					console.log(
						gray(
							`Inverted synth at ${currencyKey} has 0 total supply and its inverted parameters have changed. ` +
								`Proceeding to reconfigure its parameters as instructed, unfreezing it if currently frozen.`
						)
					);
					// Then a new inverted synth is being added (as there's no existing supply)
					await setInversePricing({ freezeAtUpperLimit: false, freezeAtLowerLimit: false });
				} else if (network !== 'mainnet' && forceUpdateInverseSynthsOnTestnet) {
					// as we are on testnet and the flag is enabled, allow a mutative pricing change
					console.log(
						redBright(
							`⚠⚠⚠ WARNING: The parameters for the inverted synth ${currencyKey} ` +
								`have changed and it has non-zero totalSupply. This is allowed only on testnets`
						)
					);
					await setInversePricing({ freezeAtUpperLimit: false, freezeAtLowerLimit: false });
				} else {
					// Then an existing synth's inverted parameters have changed.
					// For safety sake, let's inform the user and skip this step
					console.log(
						redBright(
							`⚠⚠⚠ WARNING: The parameters for the inverted synth ${currencyKey} ` +
								`have changed and it has non-zero totalSupply. This use-case is not supported by the deploy script. ` +
								`This should be done as a purge() and setInversePricing() separately`
						)
					);
				}
			} else {
				// When no exrates, then totally fresh deploy (local deployment)
				await setInversePricing({ freezeAtUpperLimit: false, freezeAtLowerLimit: false });
			}
		}
	}

	// then ensure the defaults of SystemSetting
	// are set (requires FlexibleStorage to have been correctly configured)
	if (systemSettings) {
		console.log(gray(`\n------ CONFIGURE SYSTEM SETTINGS ------\n`));

		// Now ensure all the fee rates are set for various synths (this must be done after the AddressResolver
		// has populated all references).
		// Note: this populates rates for new synths regardless of the addNewSynths flag
		const synthRates = await Promise.all(
			synths.map(({ name }) => systemSettings.methods.exchangeFeeRate(toBytes32(name)).call())
		);

		const exchangeFeeRates = await getDeployParameter('EXCHANGE_FEE_RATES');

		// override individual currencyKey / synths exchange rates
		const synthExchangeRateOverride = {
			sETH: parseUnits('0.0025').toString(),
			iETH: parseUnits('0.004').toString(),
			sBTC: parseUnits('0.003').toString(),
			iBTC: parseUnits('0.003').toString(),
			iBNB: parseUnits('0.021').toString(),
			sXTZ: parseUnits('0.0085').toString(),
			iXTZ: parseUnits('0.0085').toString(),
			sEOS: parseUnits('0.0085').toString(),
			iEOS: parseUnits('0.009').toString(),
			sETC: parseUnits('0.0085').toString(),
			sLINK: parseUnits('0.0085').toString(),
			sDASH: parseUnits('0.009').toString(),
			iDASH: parseUnits('0.009').toString(),
			sXRP: parseUnits('0.009').toString(),
		};

		const synthsRatesToUpdate = synths
			.map((synth, i) =>
				Object.assign(
					{
						currentRate: parseUnits(synthRates[i] || '0').toString(),
						targetRate:
							synth.name in synthExchangeRateOverride
								? synthExchangeRateOverride[synth.name]
								: exchangeFeeRates[synth.category],
					},
					synth
				)
			)
			.filter(({ currentRate }) => currentRate === '0');

		console.log(gray(`Found ${synthsRatesToUpdate.length} synths needs exchange rate pricing`));

		if (synthsRatesToUpdate.length) {
			console.log(
				gray(
					'Setting the following:',
					synthsRatesToUpdate
						.map(
							({ name, targetRate, currentRate }) =>
								`\t${name} from ${currentRate * 100}% to ${formatUnits(targetRate) * 100}%`
						)
						.join('\n')
				)
			);

			await runStep({
				gasLimit: Math.max(methodCallGasLimit, 150e3 * synthsRatesToUpdate.length), // higher gas required, 150k per synth is sufficient (in OVM)
				contract: 'SystemSettings',
				target: systemSettings,
				write: 'setExchangeFeeRateForSynths',
				writeArg: [
					synthsRatesToUpdate.map(({ name }) => toBytes32(name)),
					synthsRatesToUpdate.map(({ targetRate }) => targetRate),
				],
			});
		}

		// setup initial values if they are unset

		const waitingPeriodSecs = await getDeployParameter('WAITING_PERIOD_SECS');
		await runStep({
			contract: 'SystemSettings',
			target: systemSettings,
			read: 'waitingPeriodSecs',
			expected: input => (waitingPeriodSecs === '0' ? true : input !== '0'),
			write: 'setWaitingPeriodSecs',
			writeArg: waitingPeriodSecs,
		});

		await runStep({
			contract: 'SystemSettings',
			target: systemSettings,
			read: 'priceDeviationThresholdFactor',
			expected: input => input !== '0', // only change if zero
			write: 'setPriceDeviationThresholdFactor',
			writeArg: await getDeployParameter('PRICE_DEVIATION_THRESHOLD_FACTOR'),
		});

		const tradingRewardsEnabled = await getDeployParameter('TRADING_REWARDS_ENABLED');
		await runStep({
			contract: 'SystemSettings',
			target: systemSettings,
			read: 'tradingRewardsEnabled',
			expected: input => input === tradingRewardsEnabled, // only change if non-default
			write: 'setTradingRewardsEnabled',
			writeArg: tradingRewardsEnabled,
		});

		await runStep({
			contract: 'SystemSettings',
			target: systemSettings,
			read: 'issuanceRatio',
			expected: input => input !== '0', // only change if zero
			write: 'setIssuanceRatio',
			writeArg: await getDeployParameter('ISSUANCE_RATIO'),
		});

		await runStep({
			contract: 'SystemSettings',
			target: systemSettings,
			read: 'feePeriodDuration',
			expected: input => input !== '0', // only change if zero
			write: 'setFeePeriodDuration',
			writeArg: await getDeployParameter('FEE_PERIOD_DURATION'),
		});

		await runStep({
			contract: 'SystemSettings',
			target: systemSettings,
			read: 'targetThreshold',
			expected: input => input !== '0', // only change if zero
			write: 'setTargetThreshold',
			writeArg: await getDeployParameter('TARGET_THRESHOLD'),
		});

		await runStep({
			contract: 'SystemSettings',
			target: systemSettings,
			read: 'liquidationDelay',
			expected: input => input !== '0', // only change if zero
			write: 'setLiquidationDelay',
			writeArg: await getDeployParameter('LIQUIDATION_DELAY'),
		});

		await runStep({
			contract: 'SystemSettings',
			target: systemSettings,
			read: 'liquidationRatio',
			expected: input => input !== '0', // only change if zero
			write: 'setLiquidationRatio',
			writeArg: await getDeployParameter('LIQUIDATION_RATIO'),
		});

		await runStep({
			contract: 'SystemSettings',
			target: systemSettings,
			read: 'liquidationPenalty',
			expected: input => input !== '0', // only change if zero
			write: 'setLiquidationPenalty',
			writeArg: await getDeployParameter('LIQUIDATION_PENALTY'),
		});

		await runStep({
			contract: 'SystemSettings',
			target: systemSettings,
			read: 'rateStalePeriod',
			expected: input => input !== '0', // only change if zero
			write: 'setRateStalePeriod',
			writeArg: await getDeployParameter('RATE_STALE_PERIOD'),
		});

		await runStep({
			contract: 'SystemSettings',
			target: systemSettings,
			read: 'minimumStakeTime',
			expected: input => input !== '0', // only change if zero
			write: 'setMinimumStakeTime',
			writeArg: await getDeployParameter('MINIMUM_STAKE_TIME'),
		});

		await runStep({
			contract: 'SystemSettings',
			target: systemSettings,
			read: 'debtSnapshotStaleTime',
			expected: input => input !== '0', // only change if zero
			write: 'setDebtSnapshotStaleTime',
			writeArg: await getDeployParameter('DEBT_SNAPSHOT_STALE_TIME'),
		});

		await runStep({
			contract: 'SystemSettings',
			target: systemSettings,
			read: 'crossDomainMessageGasLimit',
			readArg: 0,
			expected: input => input !== '0', // only change if zero
			write: 'setCrossDomainMessageGasLimit',
			writeArg: [0, await getDeployParameter('CROSS_DOMAIN_DEPOSIT_GAS_LIMIT')],
		});

		await runStep({
			contract: 'SystemSettings',
			target: systemSettings,
			read: 'crossDomainMessageGasLimit',
			readArg: 1,
			expected: input => input !== '0', // only change if zero
			write: 'setCrossDomainMessageGasLimit',
			writeArg: [1, await getDeployParameter('CROSS_DOMAIN_ESCROW_GAS_LIMIT')],
		});

		await runStep({
			contract: 'SystemSettings',
			target: systemSettings,
			read: 'crossDomainMessageGasLimit',
			readArg: 2,
			expected: input => input !== '0', // only change if zero
			write: 'setCrossDomainMessageGasLimit',
			writeArg: [2, await getDeployParameter('CROSS_DOMAIN_REWARD_GAS_LIMIT')],
		});
		await runStep({
			contract: 'SystemSettings',
			target: systemSettings,
			read: 'crossDomainMessageGasLimit',
			readArg: 3,
			expected: input => input !== '0', // only change if zero
			write: 'setCrossDomainMessageGasLimit',
			writeArg: [3, await getDeployParameter('CROSS_DOMAIN_WITHDRAWAL_GAS_LIMIT')],
		});

		const aggregatorWarningFlags = (await getDeployParameter('AGGREGATOR_WARNING_FLAGS'))[network];
		// If deploying to OVM avoid ivoking setAggregatorWarningFlags for now.
		if (aggregatorWarningFlags && !useOvm) {
			await runStep({
				contract: 'SystemSettings',
				target: systemSettings,
				read: 'aggregatorWarningFlags',
				expected: input => input !== ZERO_ADDRESS, // only change if zero
				write: 'setAggregatorWarningFlags',
				writeArg: aggregatorWarningFlags,
			});
		}

		await runStep({
			contract: 'SystemSettings',
			target: systemSettings,
			read: 'etherWrapperMaxETH',
			expected: input => input !== '0', // only change if zero
			write: 'setEtherWrapperMaxETH',
			writeArg: await getDeployParameter('ETHER_WRAPPER_MAX_ETH'),
		});
		await runStep({
			contract: 'SystemSettings',
			target: systemSettings,
			read: 'etherWrapperMintFeeRate',
			expected: input => input !== '0', // only change if zero
			write: 'setEtherWrapperMintFeeRate',
			writeArg: await getDeployParameter('ETHER_WRAPPER_MINT_FEE_RATE'),
		});
		await runStep({
			contract: 'SystemSettings',
			target: systemSettings,
			read: 'etherWrapperBurnFeeRate',
			expected: input => input !== '0', // only change if zero
			write: 'setEtherWrapperBurnFeeRate',
			writeArg: await getDeployParameter('ETHER_WRAPPER_BURN_FEE_RATE'),
		});

		if (!useOvm) {
			// TODO: finish configuring new atomic exchange system settings
			await runStep({
				contract: 'SystemSettings',
				target: systemSettings,
				read: 'atomicMaxVolumePerBlock',
				expected: input => input !== '0', // only change if zero
				write: 'setAtomicMaxVolumePerBlock',
				writeArg: await getDeployParameter('ATOMIC_MAX_VOLUME_PER_BLOCK'),
			});
			await runStep({
				contract: 'SystemSettings',
				target: systemSettings,
				read: 'atomicTwapPriceWindow',
				expected: input => input !== '0', // only change if zero
				write: 'setAtomicTwapPriceWindow',
				writeArg: await getDeployParameter('ATOMIC_TWAP_PRICE_WINDOW'),
			});
		}
	}

	if (!useOvm) {
		console.log(gray(`\n------ INITIALISING MULTI COLLATERAL ------\n`));
		const collateralsArg = [collateralEth, collateralErc20, collateralShort].map(addressOf);
		await runStep({
			contract: 'CollateralManager',
			target: collateralManager,
			read: 'hasAllCollaterals',
			readArg: [collateralsArg],
			expected: input => input,
			write: 'addCollaterals',
			writeArg: [collateralsArg],
		});

		await runStep({
			contract: 'CollateralEth',
			target: collateralEth,
			read: 'manager',
			expected: input => input === addressOf(collateralManager),
			write: 'setManager',
			writeArg: addressOf(collateralManager),
		});

		const collateralEthSynths = (await getDeployParameter('COLLATERAL_ETH'))['SYNTHS']; // COLLATERAL_ETH synths - ['sUSD', 'sETH']
		await runStep({
			contract: 'CollateralEth',
			gasLimit: 1e6,
			target: collateralEth,
			read: 'areSynthsAndCurrenciesSet',
			readArg: [
				collateralEthSynths.map(key => toBytes32(`Synth${key}`)),
				collateralEthSynths.map(toBytes32),
			],
			expected: input => input,
			write: 'addSynths',
			writeArg: [
				collateralEthSynths.map(key => toBytes32(`Synth${key}`)),
				collateralEthSynths.map(toBytes32),
			],
		});

		await runStep({
			contract: 'CollateralErc20',
			target: collateralErc20,
			read: 'manager',
			expected: input => input === addressOf(collateralManager),
			write: 'setManager',
			writeArg: addressOf(collateralManager),
		});

		const collateralErc20Synths = (await getDeployParameter('COLLATERAL_RENBTC'))['SYNTHS']; // COLLATERAL_RENBTC synths - ['sUSD', 'sBTC']
		await runStep({
			contract: 'CollateralErc20',
			gasLimit: 1e6,
			target: collateralErc20,
			read: 'areSynthsAndCurrenciesSet',
			readArg: [
				collateralErc20Synths.map(key => toBytes32(`Synth${key}`)),
				collateralErc20Synths.map(toBytes32),
			],
			expected: input => input,
			write: 'addSynths',
			writeArg: [
				collateralErc20Synths.map(key => toBytes32(`Synth${key}`)),
				collateralErc20Synths.map(toBytes32),
			],
		});

		await runStep({
			contract: 'CollateralShort',
			target: collateralShort,
			read: 'manager',
			expected: input => input === addressOf(collateralManager),
			write: 'setManager',
			writeArg: addressOf(collateralManager),
		});

		const collateralShortSynths = (await getDeployParameter('COLLATERAL_SHORT'))['SYNTHS']; // COLLATERAL_SHORT synths - ['sBTC', 'sETH']
		await runStep({
			contract: 'CollateralShort',
			gasLimit: 1e6,
			target: collateralShort,
			read: 'areSynthsAndCurrenciesSet',
			readArg: [
				collateralShortSynths.map(key => toBytes32(`Synth${key}`)),
				collateralShortSynths.map(toBytes32),
			],
			expected: input => input,
			write: 'addSynths',
			writeArg: [
				collateralShortSynths.map(key => toBytes32(`Synth${key}`)),
				collateralShortSynths.map(toBytes32),
			],
		});

		await runStep({
			contract: 'CollateralManager',
			target: collateralManager,
			read: 'maxDebt',
			expected: input => input !== '0', // only change if zero
			write: 'setMaxDebt',
			writeArg: [collateralManagerDefaults['MAX_DEBT']],
		});

		await runStep({
			contract: 'CollateralManager',
			target: collateralManager,
			read: 'baseBorrowRate',
			expected: input => input !== '0', // only change if zero
			write: 'setBaseBorrowRate',
			writeArg: [collateralManagerDefaults['BASE_BORROW_RATE']],
		});

		await runStep({
			contract: 'CollateralManager',
			target: collateralManager,
			read: 'baseShortRate',
			expected: input => input !== '0', // only change if zero
			write: 'setBaseShortRate',
			writeArg: [collateralManagerDefaults['BASE_SHORT_RATE']],
		});

		// add to the manager.
		const collateralManagerSynths = collateralManagerDefaults['SYNTHS'];
		await runStep({
			gasLimit: 1e6,
			contract: 'CollateralManager',
			target: collateralManager,
			read: 'areSynthsAndCurrenciesSet',
			readArg: [
				collateralManagerSynths.map(key => toBytes32(`Synth${key}`)),
				collateralManagerSynths.map(toBytes32),
			],
			expected: input => input,
			write: 'addSynths',
			writeArg: [
				collateralManagerSynths.map(key => toBytes32(`Synth${key}`)),
				collateralManagerSynths.map(toBytes32),
			],
		});

		const collateralManagerShorts = collateralManagerDefaults['SHORTS'];
		await runStep({
			gasLimit: 1e6,
			contract: 'CollateralManager',
			target: collateralManager,
			read: 'areShortableSynthsSet',
			readArg: [
				collateralManagerShorts.map(({ long }) => toBytes32(`Synth${long}`)),
				collateralManagerShorts.map(({ long }) => toBytes32(long)),
			],
			expected: input => input,
			write: 'addShortableSynths',
			writeArg: [
				collateralManagerShorts.map(({ long, short }) =>
					[`Synth${long}`, `Synth${short}`].map(toBytes32)
				),
				collateralManagerShorts.map(({ long }) => toBytes32(long)),
			],
		});

		const collateralShortInteractionDelay = (await getDeployParameter('COLLATERAL_SHORT'))[
			'INTERACTION_DELAY'
		];

		await runStep({
			contract: 'CollateralShort',
			target: collateralShort,
			read: 'interactionDelay',
			expected: input => input !== '0', // only change if zero
			write: 'setInteractionDelay',
			writeArg: collateralShortInteractionDelay,
		});

		await runStep({
			contract: 'CollateralEth',
			target: collateralEth,
			read: 'issueFeeRate',
			expected: input => input !== '0', // only change if zero
			write: 'setIssueFeeRate',
			writeArg: (await getDeployParameter('COLLATERAL_ETH'))['ISSUE_FEE_RATE'],
		});

		await runStep({
			contract: 'CollateralErc20',
			target: collateralErc20,
			read: 'issueFeeRate',
			expected: input => input !== '0', // only change if zero
			write: 'setIssueFeeRate',
			writeArg: (await getDeployParameter('COLLATERAL_RENBTC'))['ISSUE_FEE_RATE'],
		});

		await runStep({
			contract: 'CollateralShort',
			target: collateralShort,
			read: 'issueFeeRate',
			expected: input => input !== '0', // only change if zero
			write: 'setIssueFeeRate',
			writeArg: (await getDeployParameter('COLLATERAL_SHORT'))['ISSUE_FEE_RATE'],
		});
	}

	console.log(gray(`\n------ CHECKING DEBT CACHE ------\n`));

	const refreshSnapshotIfPossible = async (wasInvalid, isInvalid, force = false) => {
		const validityChanged = wasInvalid !== isInvalid;

		if (force || validityChanged) {
			console.log(yellow(`Refreshing debt snapshot...`));
			await runStep({
				gasLimit: useOvm ? 4.0e6 : 5.0e6, // About 3.34 million gas is required to refresh the snapshot with ~40 synths on L1
				contract: 'DebtCache',
				target: debtCache,
				write: 'takeDebtSnapshot',
				writeArg: [],
				publiclyCallable: true, // does not require owner
			});
		} else if (!validityChanged) {
			console.log(
				red('⚠⚠⚠ WARNING: Deployer attempted to refresh the debt cache, but it cannot be.')
			);
		}
	};

	const checkSnapshot = async () => {
		const [cacheInfo, currentDebt] = await Promise.all([
			debtCache.methods.cacheInfo().call(),
			debtCache.methods.currentDebt().call(),
		]);

		// Check if the snapshot is stale and can be fixed.
		if (cacheInfo.isStale && !currentDebt.anyRateIsInvalid) {
			console.log(yellow('Debt snapshot is stale, and can be refreshed.'));
			await refreshSnapshotIfPossible(
				cacheInfo.isInvalid,
				currentDebt.anyRateIsInvalid,
				cacheInfo.isStale
			);
			return true;
		}

		// Otherwise, if the rates are currently valid,
		// we might still need to take a snapshot due to invalidity or deviation.
		if (!currentDebt.anyRateIsInvalid) {
			if (cacheInfo.isInvalid) {
				console.log(yellow('Debt snapshot is invalid, and can be refreshed.'));
				await refreshSnapshotIfPossible(
					cacheInfo.isInvalid,
					currentDebt.anyRateIsInvalid,
					cacheInfo.isStale
				);
				return true;
			} else {
				const cachedDebtEther = formatUnits(cacheInfo.debt);
				const currentDebtEther = formatUnits(currentDebt.debt);
				const deviation =
					(Number(currentDebtEther) - Number(cachedDebtEther)) / Number(cachedDebtEther);
				const maxDeviation = DEFAULTS.debtSnapshotMaxDeviation;

				if (maxDeviation <= Math.abs(deviation)) {
					console.log(
						yellow(
							`Debt cache deviation is ${deviation * 100}% >= ${maxDeviation *
								100}%; refreshing it...`
						)
					);
					await refreshSnapshotIfPossible(cacheInfo.isInvalid, currentDebt.anyRateIsInvalid, true);
					return true;
				}
			}
		}

		// Finally, if the debt cache is currently valid, but needs to be invalidated, we will also perform a snapshot.
		if (!cacheInfo.isInvalid && currentDebt.anyRateIsInvalid) {
			console.log(yellow('Debt snapshot needs to be invalidated.'));
			await refreshSnapshotIfPossible(cacheInfo.isInvalid, currentDebt.anyRateIsInvalid, false);
			return true;
		}
		return false;
	};

	const performedSnapshot = await checkSnapshot();

	if (performedSnapshot) {
		console.log(gray('Snapshot complete.'));
	} else {
		console.log(gray('No snapshot required.'));
	}

	console.log(gray(`\n------ DEPLOY COMPLETE ------\n`));

	reportDeployedContracts({ deployer });
};

module.exports = {
	deploy,
	DEFAULTS,
	cmd: program =>
		program
			.command('deploy')
			.description('Deploy compiled solidity files')
			.option(
				'-a, --add-new-synths',
				`Whether or not any new synths in the ${SYNTHS_FILENAME} file should be deployed if there is no entry in the config file`
			)
			.option(
				'-b, --build-path [value]',
				'Path to a folder hosting compiled files from the "build" step in this script',
				DEFAULTS.buildPath
			)
			.option(
				'-c, --contract-deployment-gas-limit <value>',
				'Contract deployment gas limit',
				parseFloat,
				DEFAULTS.contractDeploymentGasLimit
			)
			.option(
				'-d, --deployment-path <value>',
				`Path to a folder that has your input configuration file ${CONFIG_FILENAME}, the synth list ${SYNTHS_FILENAME} and where your ${DEPLOYMENT_FILENAME} files will go`
			)
			.option(
				'-e, --concurrency <value>',
				'Number of parallel calls that can be made to a provider',
				10
			)
			.option(
				'-f, --fee-auth <value>',
				'The address of the fee authority for this network (default is to use existing)'
			)
			.option('-g, --gas-price <value>', 'Gas price in GWEI', DEFAULTS.gasPrice)
			.option(
				'-h, --fresh-deploy',
				'Perform a "fresh" deploy, i.e. the first deployment on a network.'
			)
			.option(
				'-i, --ignore-safety-checks',
				'Ignores some validations regarding paths, compiler versions, etc.',
				false
			)
			.option(
				'--ignore-custom-parameters',
				'Ignores deployment parameters specified in params.json',
				false
			)
			.option(
				'-k, --use-fork',
				'Perform the deployment on a forked chain running on localhost (see fork command).',
				false
			)
			.option(
				'-l, --oracle-gas-limit <value>',
				'The address of the gas limit oracle for this network (default is use existing)'
			)
			.option(
				'-m, --method-call-gas-limit <value>',
				'Method call gas limit',
				parseFloat,
				DEFAULTS.methodCallGasLimit
			)
			.option(
				'-n, --network <value>',
				'The network to run off.',
				x => x.toLowerCase(),
				DEFAULTS.network
			)
			.option(
				'-o, --oracle-exrates <value>',
				'The address of the oracle for this network (default is use existing)'
			)
			.option(
				'-q, --manage-nonces',
				'The command makes sure that no repeated nonces are sent (which may be the case when reorgs are common, i.e. in Goerli. Not to be confused with --manage-nonsense.)',
				false
			)
			.option(
				'-p, --provider-url <value>',
				'Ethereum network provider URL. If default, will use PROVIDER_URL found in the .env file.'
			)
			.option(
				'-r, --dry-run',
				'If enabled, will not run any transactions but merely report on them.'
			)
			.option(
				'-v, --private-key [value]',
				'The private key to deploy with (only works in local mode, otherwise set in .env).'
			)
			.option(
				'-u, --force-update-inverse-synths-on-testnet',
				'Allow inverse synth pricing to be updated on testnet regardless of total supply'
			)
			.option(
				'-x, --specify-contracts <value>',
				'Ignore config.json  and specify contracts to be deployed (Comma separated list)'
			)
			.option('-y, --yes', 'Dont prompt, just reply yes.')
			.option('-z, --use-ovm', 'Target deployment for the OVM (Optimism).')
			.action(async (...args) => {
				try {
					await deploy(...args);
				} catch (err) {
					// show pretty errors for CLI users
					console.error(red(err));
					console.log(err.stack);
					process.exitCode = 1;
				}
			}),
};
