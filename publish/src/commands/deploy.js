'use strict';

const path = require('path');
const fs = require('fs');
const { gray, green, yellow, redBright, red } = require('chalk');
const { table } = require('table');
const w3utils = require('web3-utils');
const Deployer = require('../Deployer');
const { findSolFiles, loadCompiledFiles } = require('../solidity');

const {
	BUILD_FOLDER,
	CONTRACTS_FOLDER,
	CONFIG_FILENAME,
	SYNTHS_FILENAME,
	DEPLOYMENT_FILENAME,
	ZERO_ADDRESS,
} = require('../constants');

const {
	toBytes4,
	ensureNetwork,
	ensureDeploymentPath,
	loadAndCheckRequiredSources,
	loadConnections,
	confirmAction,
	appendOwnerActionGenerator,
	performTransactionalStep,
	stringify,
} = require('../util');

const parameterNotice = props => {
	console.log(gray('-'.repeat(50)));
	console.log('Please check the following parameters are correct:');
	console.log(gray('-'.repeat(50)));

	Object.entries(props).forEach(([key, val]) => {
		console.log(gray(key) + ' '.repeat(30 - key.length) + redBright(val));
	});

	console.log(gray('-'.repeat(50)));
};

const DEFAULTS = {
	gasPrice: '1',
	methodCallGasLimit: 15e4,
	contractDeploymentGasLimit: 7e6,
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
	oracleDepot,
	privateKey,
	yes,
} = {}) => {
	ensureNetwork(network);
	ensureDeploymentPath(deploymentPath);

	const {
		config,
		configFile,
		synths,
		deployment,
		deploymentFile,
		ownerActions,
		ownerActionsFile,
	} = loadAndCheckRequiredSources({
		deploymentPath,
		network,
	});

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
	let latestSolTimestamp = 0;
	Object.keys(findSolFiles(CONTRACTS_FOLDER)).forEach(file => {
		const sourceFilePath = path.join(CONTRACTS_FOLDER, file);
		latestSolTimestamp = Math.max(latestSolTimestamp, fs.statSync(sourceFilePath).mtimeMs);
	});

	// now clone these so we can update and write them after each deployment but keep the original
	// flags available
	const updatedConfig = JSON.parse(JSON.stringify(config));

	const { providerUrl, privateKey: envPrivateKey, etherscanLinkPrefix } = loadConnections({
		network,
	});

	// allow local deployments to use the private key passed as a CLI option
	if (network !== 'local' || !privateKey) {
		privateKey = envPrivateKey;
	}

	// load accounts used by local ganache in keys.json
	const users = Object.entries(
		JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', '..', 'keys.json'))).private_keys
	).map(([pub, pri]) => ({
		public: pub,
		private: `0x${pri}`,
	}));

	privateKey = users[0].private;

	const deployer = new Deployer({
		compiled,
		config,
		gasPrice,
		methodCallGasLimit,
		contractDeploymentGasLimit,
		deployment,
		privateKey,
		providerUrl,
	});

	const { account } = deployer;

	const getExistingContract = ({ contract }) => {
		const { address, source } = deployment.targets[contract];
		const { abi } = deployment.sources[source];

		return deployer.getContract({
			address,
			abi,
		});
	};

	let currentSynthetixSupply;
	let currentExchangeFee;
	let currentSynthetixPrice;
	if (network === 'local') {
		// get the current supply as it changes as we mint after each period
		currentSynthetixSupply = w3utils.toWei((100e6).toString());
		currentExchangeFee = w3utils.toWei('0.003'.toString());
		oracleExrates = account;
		oracleDepot = account;
		currentSynthetixPrice = w3utils.toWei('0.2');
	} else {
		// do requisite checks
		try {
			const oldSynthetix = getExistingContract({ contract: 'Synthetix' });
			currentSynthetixSupply = await oldSynthetix.methods.totalSupply().call();

			const oldFeePool = getExistingContract({ contract: 'FeePool' });
			currentExchangeFee = await oldFeePool.methods.exchangeFeeRate().call();

			const currentExrates = getExistingContract({ contract: 'ExchangeRates' });
			currentSynthetixPrice = await currentExrates.methods.rateForCurrency(toBytes4('SNX')).call();

			if (!oracleExrates) {
				oracleExrates = await currentExrates.methods.oracle().call();
			}

			if (!oracleDepot) {
				const currentDepot = getExistingContract({ contract: 'Depot' });
				oracleDepot = await currentDepot.methods.oracle().call();
			}
		} catch (err) {
			console.error(
				red(
					'Cannot connect to existing contracts. Please double check the deploymentPath is correct for the network allocated'
				)
			);
			process.exitCode = 1;
			return;
		}
	}

	for (const address of [account, oracleExrates, oracleDepot]) {
		if (!w3utils.isAddress(address)) {
			console.error(red('Invalid address detected (please check your inputs):', address));
			process.exitCode = 1;
			return;
		}
	}

	parameterNotice({
		Network: network,
		'Gas price to use': `${gasPrice} GWEI`,
		'Deployment Path': new RegExp(network, 'gi').test(deploymentPath)
			? deploymentPath
			: yellow('⚠⚠⚠ cant find network name in path. Please double check this! ') + deploymentPath,
		'Local build last modified': `${new Date(earliestCompiledTimestamp)} ${yellow(
			((new Date().getTime() - earliestCompiledTimestamp) / 60000).toFixed(2) + ' mins ago'
		)}`,
		'Last Solidity update':
			new Date(latestSolTimestamp) +
			(latestSolTimestamp > earliestCompiledTimestamp
				? yellow(' ⚠⚠⚠ this is later than the last build! Is this intentional?')
				: green(' ✅')),
		'Add any new synths found?': addNewSynths ? green('✅ YES') : yellow('⚠ NO'),
		'Deployer account:': account,
		'Synthetix totalSupply': `${Math.round(w3utils.fromWei(currentSynthetixSupply) / 1e6)}m`,
		'FeePool exchangeFeeRate': `${w3utils.fromWei(currentExchangeFee)}`,
		'ExchangeRates Oracle': oracleExrates,
		'Depot Oracle': oracleDepot,
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

	console.log(gray(`Starting deployment to ${network.toUpperCase()} via Infura...`));
	// force flag indicates to deploy even when no config for the entry (useful for new synths)
	const deployContract = async ({ name, source = name, args, deps, force = false }) => {
		const deployedContract = await deployer.deploy({ name, source, args, deps, force });
		if (!deployedContract) {
			return;
		}
		const { address } = deployedContract.options;

		let timestamp = new Date();
		let txn = '';
		if (config[name] && !config[name].deploy) {
			// deploy is false, so we reused a deployment, thus lets grab the details that already exist
			timestamp = deployment.targets[name].timestamp;
			txn = deployment.targets[name].txn;
		}
		// now update the deployed contract information
		deployment.targets[name] = {
			name,
			address,
			source,
			link: `https://${network !== 'mainnet' ? network + '.' : ''}etherscan.io/address/${
				deployer.deployedContracts[name].options.address
			}`,
			timestamp,
			txn,
			network,
		};
		deployment.sources[source] = {
			bytecode: compiled[source].evm.bytecode.object,
			abi: compiled[source].abi,
		};
		fs.writeFileSync(deploymentFile, stringify(deployment));

		// now update the flags to indicate it no longer needs deployment,
		// ignoring this step for local, which wants a full deployment by default
		if (network !== 'local') {
			updatedConfig[name] = { deploy: false };
			fs.writeFileSync(configFile, stringify(updatedConfig));
		}

		return deployedContract;
	};

	// track an action we cannot perform because we aren't an OWNER (so we can iterate later in the owner step)
	const appendOwnerAction = appendOwnerActionGenerator({
		ownerActions,
		ownerActionsFile,
		etherscanLinkPrefix,
	});

	const runStep = async opts =>
		performTransactionalStep({
			...opts,
			account,
			gasLimit: methodCallGasLimit,
			gasPrice,
			etherscanLinkPrefix,
			ownerActions,
			ownerActionsFile,
		});

	await deployContract({
		name: 'SafeDecimalMath',
	});

	const exchangeRates = await deployContract({
		name: 'ExchangeRates',
		args: [account, oracleExrates, [w3utils.asciiToHex('SNX')], [currentSynthetixPrice]],
	});
	const exchangeRatesAddress = exchangeRates ? exchangeRates.options.address : '';

	const rewardEscrow = await deployContract({
		name: 'RewardEscrow',
		args: [account, ZERO_ADDRESS, ZERO_ADDRESS],
	});

	const synthetixEscrow = await deployContract({
		name: 'SynthetixEscrow',
		args: [account, ZERO_ADDRESS],
	});

	const synthetixState = await deployContract({
		name: 'SynthetixState',
		args: [account, account],
	});

	const proxyFeePool = await deployContract({
		name: 'ProxyFeePool',
		source: 'Proxy',
		args: [account],
	});

	const feePoolDelegateApprovals = await deployContract({
		name: 'DelegateApprovals',
		args: [account, ZERO_ADDRESS],
	});

	const feePoolEternalStorage = await deployContract({
		name: 'FeePoolEternalStorage',
		args: [account, ZERO_ADDRESS],
	});

	const feePool = await deployContract({
		name: 'FeePool',
		deps: ['ProxyFeePool'],
		args: [
			proxyFeePool ? proxyFeePool.options.address : '',
			account,
			ZERO_ADDRESS, // Synthetix
			ZERO_ADDRESS, // FeePoolState
			feePoolEternalStorage ? feePoolEternalStorage.options.address : '',
			synthetixState ? synthetixState.options.address : '',
			rewardEscrow ? rewardEscrow.options.address : '',
			ZERO_ADDRESS,
			currentExchangeFee, // exchange fee
		],
	});

	const feePoolAddress = feePool ? feePool.options.address : '';

	if (proxyFeePool && feePool) {
		await runStep({
			contract: 'ProxyFeePool',
			target: proxyFeePool,
			read: 'target',
			expected: input => input === feePoolAddress,
			write: 'setTarget',
			writeArg: feePoolAddress,
		});
	}

	if (feePoolEternalStorage && feePool) {
		await runStep({
			contract: 'FeePoolEternalStorage',
			target: feePoolEternalStorage,
			read: 'associatedContract',
			expected: input => input === feePoolAddress,
			write: 'setAssociatedContract',
			writeArg: feePoolAddress,
		});
	}

	if (feePoolDelegateApprovals && feePool) {
		const delegateApprovalsAddress = feePoolDelegateApprovals.options.address;
		await runStep({
			contract: 'FeePool',
			target: feePool,
			read: 'delegates',
			expected: input => input === delegateApprovalsAddress,
			write: 'setDelegateApprovals',
			writeArg: delegateApprovalsAddress,
		});

		await runStep({
			contract: 'DelegateApprovals',
			target: feePoolDelegateApprovals,
			read: 'associatedContract',
			expected: input => input === feePoolAddress,
			write: 'setAssociatedContract',
			writeArg: feePoolAddress,
		});
	}

	const feePoolState = await deployContract({
		name: 'FeePoolState',
		deps: ['FeePool'],
		args: [account, feePoolAddress],
	});

	if (feePool && feePoolState) {
		const feePoolStateAddress = feePoolState.options.address;
		await runStep({
			contract: 'FeePool',
			target: feePool,
			read: 'feePoolState',
			expected: input => input === feePoolStateAddress,
			write: 'setFeePoolState',
			writeArg: feePoolStateAddress,
		});

		// Rewire feePoolState if there is a feePool upgrade
		await runStep({
			contract: 'FeePoolState',
			target: feePoolState,
			read: 'feePool',
			expected: input => input === feePoolAddress,
			write: 'setFeePool',
			writeArg: feePoolAddress,
		});
	}

	const rewardsDistribution = await deployContract({
		name: 'RewardsDistribution',
		deps: ['RewardEscrow', 'ProxyFeePool'],
		args: [
			account, // owner
			ZERO_ADDRESS, // authority (synthetix)
			ZERO_ADDRESS, // Synthetix Proxy
			rewardEscrow ? rewardEscrow.options.address : '',
			proxyFeePool ? proxyFeePool.options.address : '',
		],
	});

	if (rewardsDistribution && feePool) {
		const rewardsDistributionAddress = rewardsDistribution.options.address;
		await runStep({
			contract: 'FeePool',
			target: feePool,
			read: 'rewardsAuthority',
			expected: input => input === rewardsDistributionAddress,
			write: 'setRewardsAuthority',
			writeArg: rewardsDistributionAddress,
		});
	}

	const supplySchedule = await deployContract({
		name: 'SupplySchedule',
		args: [account],
	});

	const proxySynthetix = await deployContract({
		name: 'ProxySynthetix',
		source: 'Proxy',
		args: [account],
	});

	const tokenStateSynthetix = await deployContract({
		name: 'TokenStateSynthetix',
		source: 'TokenState',
		args: [account, account],
	});

	const synthetix = await deployContract({
		name: 'Synthetix',
		deps: [
			'ProxySynthetix',
			'TokenStateSynthetix',
			'SynthetixState',
			'ExchangeRates',
			'FeePool',
			'SupplySchedule',
			'RewardEscrow',
			'SynthetixEscrow',
			'RewardsDistribution',
		],
		args: [
			proxySynthetix ? proxySynthetix.options.address : '',
			tokenStateSynthetix ? tokenStateSynthetix.options.address : '',
			synthetixState ? synthetixState.options.address : '',
			account,
			exchangeRates ? exchangeRates.options.address : '',
			feePool ? feePool.options.address : '',
			supplySchedule ? supplySchedule.options.address : '',
			rewardEscrow ? rewardEscrow.options.address : '',
			synthetixEscrow ? synthetixEscrow.options.address : '',
			rewardsDistribution ? rewardsDistribution.options.address : '',
			currentSynthetixSupply,
		],
	});

	const synthetixAddress = synthetix ? synthetix.options.address : '';

	if (proxySynthetix && synthetix) {
		await runStep({
			contract: 'ProxySynthetix',
			target: proxySynthetix,
			read: 'target',
			expected: input => input === synthetixAddress,
			write: 'setTarget',
			writeArg: synthetixAddress,
		});
	}

	if (synthetix && feePool) {
		await runStep({
			contract: 'Synthetix',
			target: synthetix,
			read: 'feePool',
			expected: input => input === feePoolAddress,
			write: 'setFeePool',
			writeArg: feePoolAddress,
		});

		await runStep({
			contract: 'FeePool',
			target: feePool,
			read: 'synthetix',
			expected: input => input === synthetixAddress,
			write: 'setSynthetix',
			writeArg: synthetixAddress,
		});
	}

	if (synthetix && exchangeRates) {
		await runStep({
			contract: 'Synthetix',
			target: synthetix,
			read: 'exchangeRates',
			expected: input => input === exchangeRatesAddress,
			write: 'setExchangeRates',
			writeArg: exchangeRatesAddress,
		});
	}

	// only reset token state if redeploying
	if (tokenStateSynthetix && config['TokenStateSynthetix'].deploy) {
		const initialIssuance = w3utils.toWei('100000000');
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
			expected: input => input === synthetixAddress,
			write: 'setAssociatedContract',
			writeArg: synthetixAddress,
		});
	}

	if (synthetixState && synthetix) {
		await runStep({
			contract: 'SynthetixState',
			target: synthetixState,
			read: 'associatedContract',
			expected: input => input === synthetixAddress,
			write: 'setAssociatedContract',
			writeArg: synthetixAddress,
		});
	}

	if (synthetixEscrow) {
		await deployContract({
			name: 'EscrowChecker',
			deps: ['SynthetixEscrow'],
			args: [synthetixEscrow.options.address],
		});
	}

	if (rewardEscrow && synthetix) {
		await runStep({
			contract: 'RewardEscrow',
			target: rewardEscrow,
			read: 'synthetix',
			expected: input => input === synthetixAddress,
			write: 'setSynthetix',
			writeArg: synthetixAddress,
		});
	}

	if (rewardEscrow && feePool) {
		await runStep({
			contract: 'RewardEscrow',
			target: rewardEscrow,
			read: 'feePool',
			expected: input => input === feePoolAddress,
			write: 'setFeePool',
			writeArg: feePoolAddress,
		});
	}

	// Skip setting unless redeploying either of these,
	if (config['Synthetix'].deploy || config['SynthetixEscrow'].deploy) {
		// Note: currently on mainnet SynthetixEscrow.methods.synthetix() does NOT exist
		// it is "havven" and the ABI we have here is not sufficient
		if (network === 'mainnet') {
			appendOwnerAction({
				key: `SynthetixEscrow.setHavven(Synthetix)`,
				target: synthetixEscrow.options.address,
				action: `setHavven(${synthetixAddress})`,
			});
		} else {
			await runStep({
				contract: 'SynthetixEscrow',
				target: synthetixEscrow,
				read: 'synthetix',
				expected: input => input === synthetixAddress,
				write: 'setSynthetix',
				writeArg: synthetixAddress,
			});
		}
	}

	if (supplySchedule && synthetix) {
		await runStep({
			contract: 'SupplySchedule',
			target: supplySchedule,
			read: 'synthetix',
			expected: input => input === synthetixAddress,
			write: 'setSynthetix',
			writeArg: synthetixAddress,
		});
	}

	// Setup Synthetix and deploy proxyERC20 for use in Synths
	const proxyERC20Synthetix = await deployContract({
		name: 'ProxyERC20',
		deps: ['Synthetix'],
		args: [account],
	});
	const proxyERC20SynthetixAddress = proxyERC20Synthetix ? proxyERC20Synthetix.options.address : '';

	if (synthetix && proxyERC20Synthetix) {
		await runStep({
			contract: 'ProxyERC20',
			target: proxyERC20Synthetix,
			read: 'target',
			expected: input => input === synthetixAddress,
			write: 'setTarget',
			writeArg: synthetixAddress,
		});

		await runStep({
			contract: 'Synthetix',
			target: synthetix,
			read: 'integrationProxy',
			expected: input => input === proxyERC20SynthetixAddress,
			write: 'setIntegrationProxy',
			writeArg: proxyERC20SynthetixAddress,
		});
	}

	if (synthetix && rewardsDistribution) {
		await runStep({
			contract: 'RewardsDistribution',
			target: rewardsDistribution,
			read: 'authority',
			expected: input => input === synthetixAddress,
			write: 'setAuthority',
			writeArg: synthetixAddress,
		});

		await runStep({
			contract: 'RewardsDistribution',
			target: rewardsDistribution,
			read: 'synthetixProxy',
			expected: input => input === proxyERC20SynthetixAddress,
			write: 'setSynthetixProxy',
			writeArg: proxyERC20SynthetixAddress,
		});
	}

	// ----------------
	// Synths
	// ----------------
	const synthetixProxyAddress = await synthetix.methods.proxy().call();
	for (const { name: currencyKey, inverted, subclass } of synths) {
		const tokenStateForSynth = await deployContract({
			name: `TokenState${currencyKey}`,
			source: 'TokenState',
			args: [account, ZERO_ADDRESS],
			force: addNewSynths,
		});

		// sUSD proxy is used by Kucoin and Bittrex thus requires proxy / integration proxy to be set
		const synthProxyIsLegacy = currencyKey === 'sUSD' && network !== 'local';

		const proxyForSynth = await deployContract({
			name: `Proxy${currencyKey}`,
			source: synthProxyIsLegacy ? 'Proxy' : 'ProxyERC20',
			args: [account],
			force: addNewSynths,
		});

		let proxyERC20ForSynth;

		if (synthProxyIsLegacy) {
			// additionally deploy an ERC20 proxy for the synth if it's legacy (sUSD and not on local)
			proxyERC20ForSynth = await deployContract({
				name: `ProxyERC20${currencyKey}`,
				source: `ProxyERC20`,
				args: [account],
				force: addNewSynths,
			});
		}

		const currencyKeyInBytes = w3utils.asciiToHex(currencyKey);

		// track the original supply if we're deploying a new synth contract for an existing synth
		let originalTotalSupply = 0;
		// cannot check local network as deploy is true for everything
		if (config[`Synth${currencyKey}`].deploy && network !== 'local') {
			const oldSynth = getExistingContract({ contract: `Synth${currencyKey}` });
			originalTotalSupply = await oldSynth.methods.totalSupply().call();
		}

		// PurgeableSynth needs additionalConstructorArgs to be ordered
		const additionalConstructorArgsMap = {
			Synth: [originalTotalSupply],
			PurgeableSynth: [exchangeRatesAddress, originalTotalSupply],
			// future subclasses...
		};

		console.log(yellow(`Original TotalSupply on Synth${currencyKey} is ${originalTotalSupply}`));

		// user confirm totalSupply is correct for oldSynth before deploy new Synth
		if (config[`Synth${currencyKey}`].deploy && !yes) {
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
		const synth = await deployContract({
			name: `Synth${currencyKey}`,
			source: sourceContract,
			deps: [`TokenState${currencyKey}`, `Proxy${currencyKey}`, 'Synthetix', 'FeePool'],
			args: [
				proxyForSynth ? proxyForSynth.options.address : '',
				tokenStateForSynth ? tokenStateForSynth.options.address : '',
				synthetixProxyAddress,
				proxyFeePool ? proxyFeePool.options.address : '',
				`Synth ${currencyKey}`,
				currencyKey,
				account,
				currencyKeyInBytes,
			].concat(additionalConstructorArgsMap[sourceContract] || []),
			force: addNewSynths,
		});

		const synthAddress = synth ? synth.options.address : '';

		if (tokenStateForSynth && synth) {
			await runStep({
				contract: `TokenState${currencyKey}`,
				target: tokenStateForSynth,
				read: 'associatedContract',
				expected: input => input === synthAddress,
				write: 'setAssociatedContract',
				writeArg: synthAddress,
			});
		}

		// Setup proxy for synth
		if (proxyForSynth && synth) {
			await runStep({
				contract: `Proxy${currencyKey}`,
				target: proxyForSynth,
				read: 'target',
				expected: input => input === synthAddress,
				write: 'setTarget',
				writeArg: synthAddress,
			});

			// ensure proxy on synth set
			await runStep({
				contract: `Synth${currencyKey}`,
				target: synth,
				read: 'proxy',
				expected: input => input === proxyForSynth.options.address,
				write: 'setProxy',
				writeArg: proxyForSynth.options.address,
			});
		}

		// Setup integration proxy (ProxyERC20) for Synth (Remove when sUSD Proxy cuts over)
		if (proxyERC20ForSynth && synth) {
			await runStep({
				contract: `Synth${currencyKey}`,
				target: synth,
				read: 'integrationProxy',
				expected: input => input === proxyERC20ForSynth.options.address,
				write: 'setIntegrationProxy',
				writeArg: proxyERC20ForSynth.options.address,
			});

			await runStep({
				contract: `ProxyERC20${currencyKey}`,
				target: proxyERC20ForSynth,
				read: 'target',
				expected: input => input === synthAddress,
				write: 'setTarget',
				writeArg: synthAddress,
			});
		}

		// Now setup connection to the Synth with Synthetix
		if (synth && synthetix) {
			await runStep({
				contract: 'Synthetix',
				target: synthetix,
				read: 'synths',
				readArg: currencyKeyInBytes,
				expected: input => input === synthAddress,
				write: 'addSynth',
				writeArg: synthAddress,
			});

			await runStep({
				contract: `Synth${currencyKey}`,
				target: synth,
				read: 'synthetixProxy',
				expected: input => input === synthetixProxyAddress,
				write: 'setSynthetixProxy',
				writeArg: synthetixProxyAddress,
			});
		}

		if (proxyFeePool) {
			await runStep({
				contract: `Synth${currencyKey}`,
				target: synth,
				read: 'feePoolProxy',
				expected: input => input === proxyFeePool.options.address,
				write: 'setFeePoolProxy',
				writeArg: proxyFeePool.options.address,
			});
		}

		// now configure inverse synths in exchange rates
		if (inverted) {
			// check total supply
			const totalSynthSupply = await synth.methods.totalSupply().call();

			const { entryPoint, upperLimit, lowerLimit } = inverted;

			// only call setInversePricing if either there's no supply or if on a testnet
			if (Number(totalSynthSupply) === 0 || network !== 'mainnet') {
				const exchangeRatesOwner = await exchangeRates.methods.owner().call();
				if (exchangeRatesOwner === account) {
					console.log(
						yellow(
							`Invoking ExchangeRates.setInversePricing(${currencyKey}, ${entryPoint}, ${upperLimit}, ${lowerLimit})...`
						)
					);
					await exchangeRates.methods
						.setInversePricing(
							w3utils.asciiToHex(currencyKey),
							w3utils.toWei(entryPoint.toString()),
							w3utils.toWei(upperLimit.toString()),
							w3utils.toWei(lowerLimit.toString())
						)
						.send(deployer.sendParameters());
				} else {
					appendOwnerAction({
						key: `ExchangeRates.setInversePricing(${currencyKey}, ${entryPoint}, ${upperLimit}, ${lowerLimit})`,
						target: exchangeRatesAddress,
						action: `setInversePricing(${currencyKey}, ${w3utils.toWei(
							entryPoint.toString()
						)}, ${w3utils.toWei(upperLimit.toString())}, ${w3utils.toWei(lowerLimit.toString())})`,
					});
				}
			} else {
				console.log(
					gray(
						`Not setting inverse pricing on ${currencyKey} as totalSupply is > 0 (${w3utils.fromWei(
							totalSynthSupply
						)})`
					)
				);
			}
		}
	}

	// ----------------
	// Depot setup
	// ----------------
	const sUSDAddress = deployer.deployedContracts['SynthsUSD']
		? deployer.deployedContracts['SynthsUSD'].options.address
		: '';

	const depot = await deployContract({
		name: 'Depot',
		deps: ['Synthetix', 'SynthsUSD', 'FeePool'],
		args: [
			account,
			account,
			synthetix ? synthetixAddress : '',
			sUSDAddress,
			feePool ? feePool.options.address : '',
			oracleDepot,
			w3utils.toWei('500'),
			w3utils.toWei('.10'),
		],
	});

	if (synthetix && depot) {
		await runStep({
			contract: 'Depot',
			target: depot,
			read: 'synthetix',
			expected: input => input === synthetixAddress,
			write: 'setSynthetix',
			writeArg: synthetixAddress,
		});
	}

	// ensure Depot has sUSD synth address setup correctly
	await runStep({
		contract: 'Depot',
		target: depot,
		read: 'synth',
		expected: input => input === sUSDAddress,
		write: 'setSynth',
		writeArg: sUSDAddress,
	});

	// ----------------
	// ArbRewarder setup
	// ----------------

	// ArbRewarder contract for sETH uniswap
	const arbRewarder = await deployContract({
		name: 'ArbRewarder',
		deps: ['Synthetix', 'ExchangeRates'],
		args: [account],
	});

	// ensure exchangeRates on arbRewarder set
	await runStep({
		contract: 'ArbRewarder',
		target: arbRewarder,
		read: 'synthetix_rates',
		expected: input => input === exchangeRates.options.address,
		write: 'setExchangeRates',
		writeArg: exchangeRates.options.address,
	});

	// Ensure synthetix ProxyERC20 on arbRewarder set
	await runStep({
		contract: 'ArbRewarder',
		target: arbRewarder,
		read: 'snx_erc20_addr',
		expected: input => input === proxyERC20SynthetixAddress,
		write: 'setSynthetix',
		writeArg: proxyERC20SynthetixAddress,
	});

	// Ensure sETH uniswap exchange address on arbRewarder set
	const requiredSethUniswapExchange = '0xe9Cf7887b93150D4F2Da7dFc6D502B216438F244';
	const requiredSynthAddress = '0x5e74C9036fb86BD7eCdcb084a0673EFc32eA31cb';
	await runStep({
		contract: 'ArbRewarder',
		target: arbRewarder,
		read: 'seth_exchange_addr',
		expected: input => input === requiredSethUniswapExchange,
		write: 'setSynthEthUniswapExchange',
		writeArg: requiredSethUniswapExchange,
	});

	// Ensure sETH proxy address on arbRewarder set
	await runStep({
		contract: 'ArbRewarder',
		target: arbRewarder,
		read: 'seth_erc20',
		expected: input => input === requiredSynthAddress,
		write: 'setSynthEthAddress',
		writeArg: requiredSynthAddress,
	});

	console.log(green('\nSuccessfully deployed all contracts!\n'));

	const tableData = Object.keys(deployer.deployedContracts).map(key => [
		key,
		deployer.deployedContracts[key].options.address,
	]);
	console.log();
	console.log(gray(`Tabular data of all contracts on ${network}`));
	console.log(table(tableData));
};

module.exports = {
	deploy,
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
				parseInt,
				DEFAULTS.contractDeploymentGasLimit
			)
			.option(
				'-d, --deployment-path <value>',
				`Path to a folder that has your input configuration file ${CONFIG_FILENAME}, the synth list ${SYNTHS_FILENAME} and where your ${DEPLOYMENT_FILENAME} files will go`
			)
			.option(
				'-f, --fee-auth <value>',
				'The address of the fee authority for this network (default is to use existing)'
			)
			.option('-g, --gas-price <value>', 'Gas price in GWEI', DEFAULTS.gasPrice)
			.option(
				'-m, --method-call-gas-limit <value>',
				'Method call gas limit',
				parseInt,
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
				'-p, --oracle-depot <value>',
				'The address of the depot oracle for this network (default is use existing)'
			)
			.option(
				'-v, --private-key [value]',
				'The private key to deploy with (only works in local mode, otherwise set in .env).'
			)
			.option('-y, --yes', 'Dont prompt, just reply yes.')
			.action(deploy),
};
