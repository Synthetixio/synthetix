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

	// get the current supply as it changes as we mint after each period
	const getExistingContract = ({ contract }) =>
		deployer.getContract({
			abi: deployment.sources[contract].abi,
			address: deployment.targets[contract].address,
		});

	let currentSynthetixSupply;
	let currentExchangeFee;
	let currentSynthetixPrice;
	if (network === 'local') {
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

		// sETH and sUSD are used in Uniswap and thus cannot be easily changed.
		// For now, they still require the old proxy (v2.9.x), hence we need to track these here.
		const synthIsLegacy = currencyKey === 'sETH' && network !== 'local';
		const proxyForSynth = await deployContract({
			name: `Proxy${currencyKey}`,
			source: synthIsLegacy ? 'Proxy' : 'ProxyERC20',
			args: [account],
			force: addNewSynths,
		});

		// As sETH is used for Uniswap liquidity, we cannot switch out its proxy,
		// thus we have these values we switch on to ensure sETH remains fixed to the
		// v2.9.x version of Synth.sol and Proxy.sol - JJ
		let currencyKeyInBytes;
		let synthetixAddressForSynth;
		let feePoolAddressForSynth;
		if (synthIsLegacy) {
			// requirements for v2.9.x and below Synths
			currencyKeyInBytes = toBytes4(currencyKey);
			synthetixAddressForSynth = synthetixAddress || '';
			feePoolAddressForSynth = feePool.options.address || '';
		} else {
			// requirements for v2.10.x+ Synths
			currencyKeyInBytes = w3utils.asciiToHex(currencyKey);
			synthetixAddressForSynth = synthetixProxyAddress || '';
			feePoolAddressForSynth = proxyFeePool.options.address || '';
		}

		const additionalConstructorArgsMap = {
			PurgeableSynth: [exchangeRatesAddress],
			// future subclasses...
		};

		const synth = await deployContract({
			name: `Synth${currencyKey}`,
			source: subclass || 'Synth',
			deps: [`TokenState${currencyKey}`, `Proxy${currencyKey}`, 'Synthetix', 'FeePool'],
			args: [
				proxyForSynth ? proxyForSynth.options.address : '',
				tokenStateForSynth ? tokenStateForSynth.options.address : '',
				synthetixAddressForSynth,
				feePoolAddressForSynth,
				`Synth ${currencyKey}`,
				currencyKey,
				account,
				currencyKeyInBytes,
			].concat(additionalConstructorArgsMap[subclass] || []),
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

		// Setup proxy for synth (either ProxyERC20 or legacy Proxy for sETH)
		if (proxyForSynth && synth) {
			await runStep({
				contract: `Proxy${currencyKey}`,
				target: proxyForSynth,
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

			if (synthIsLegacy) {
				// For legacy synths (v2.9.x) we need to use Synth.setSynthetix
				await runStep({
					contract: `Synth${currencyKey}`,
					target: synth,
					read: 'synthetix',
					expected: input => input === synthetixAddress,
					write: 'setSynthetix',
					writeArg: synthetixAddress,
				});

				// For legacy synths (v2.9.x) we need to use Synth.setFeePool
				if (feePool) {
					await runStep({
						contract: `Synth${currencyKey}`,
						target: synth,
						read: 'feePool',
						expected: input => input === feePoolAddress,
						write: 'setFeePool',
						writeArg: feePoolAddress,
					});
				}
			} else {
				// For latest synths (v2.10.x) we need to use Synth.setSynthetixProxy
				await runStep({
					contract: `Synth${currencyKey}`,
					target: synth,
					read: 'synthetixProxy',
					expected: input => input === synthetixProxyAddress,
					write: 'setSynthetixProxy',
					writeArg: synthetixProxyAddress,
				});

				// For latest synths (v2.10.x) we need to use Synth.setFeePoolProxy
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
			}
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

	const depot = await deployContract({
		name: 'Depot',
		deps: ['Synthetix', 'SynthsUSD', 'FeePool'],
		args: [
			account,
			account,
			synthetix ? synthetixAddress : '',
			deployer.deployedContracts['SynthsUSD']
				? deployer.deployedContracts['SynthsUSD'].options.address
				: '',
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
