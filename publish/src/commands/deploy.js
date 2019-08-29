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

	await deployContract({
		name: 'SafeDecimalMath',
	});

	const exchangeRates = await deployContract({
		name: 'ExchangeRates',
		args: [account, oracleExrates, [toBytes4('SNX')], [currentSynthetixPrice]],
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
			w3utils.toWei('0'), // transfer fee
			currentExchangeFee, // exchange fee
		],
	});

	const feePoolAddress = feePool ? feePool.options.address : '';
	const feePoolOwner = feePool ? await feePool.methods.owner().call() : '';

	if (proxyFeePool && feePool) {
		const target = await proxyFeePool.methods.target().call();

		if (target !== feePool.options.address) {
			const proxyFeePoolOwner = await proxyFeePool.methods.owner().call();

			if (proxyFeePoolOwner === account) {
				console.log(yellow('Invoking ProxyFeePool.setTarget(FeePool)...'));

				await proxyFeePool.methods
					.setTarget(feePool.options.address)
					.send(deployer.sendParameters());
			} else {
				appendOwnerAction({
					key: `ProxyFeePool.setTarget(FeePool)`,
					target: proxyFeePool.options.address,
					action: `setTarget(${feePool.options.address})`,
				});
			}
		}
	}

	if (feePoolEternalStorage && feePool) {
		const associatedFPContract = await feePoolEternalStorage.methods.associatedContract().call();

		if (associatedFPContract !== feePoolAddress) {
			const feePoolEternalStorageOwner = await feePoolEternalStorage.methods.owner().call();

			if (feePoolEternalStorageOwner === account) {
				console.log(yellow('Invoking feePoolEternalStorage.setAssociatedContract(FeePool)...'));

				await feePoolEternalStorage.methods
					.setAssociatedContract(feePoolAddress)
					.send(deployer.sendParameters());
			} else {
				appendOwnerAction({
					key: `FeePoolEternalStorage.setAssociatedContract(FeePool)`,
					target: feePoolEternalStorage.options.address,
					action: `setAssociatedContract(${feePoolAddress})`,
				});
			}
		}
	}

	if (feePoolDelegateApprovals && feePool) {
		const delegateApprovalsAddress = feePoolDelegateApprovals.options.address;
		const feePoolOwner = await feePool.methods.owner().call();
		const currentDelegateApprovals = await feePool.methods.delegates().call();

		if (currentDelegateApprovals !== delegateApprovalsAddress) {
			if (feePoolOwner === account) {
				console.log(yellow('Invoking feePool.setDelegateApprovals(DelegateApproval)...'));
				await feePool.methods
					.setDelegateApprovals(delegateApprovalsAddress)
					.send(deployer.sendParameters());
			} else {
				appendOwnerAction({
					key: `FeePool.setDelegateApprovals(DelegateApprovals)`,
					target: feePool.options.address,
					action: `setDelegateApprovals(${delegateApprovalsAddress})`,
				});
			}
		}

		const associatedContract = await feePoolDelegateApprovals.methods.associatedContract().call();

		if (associatedContract !== feePoolAddress) {
			const feePoolDelegateApprovalsOwner = await feePoolDelegateApprovals.methods.owner().call();

			if (feePoolDelegateApprovalsOwner === account) {
				console.log(yellow('Invoking feePoolDelegateApprovals.setAssociatedContract(FeePool)...'));

				await feePoolDelegateApprovals.methods
					.setAssociatedContract(feePoolAddress)
					.send(deployer.sendParameters());
			} else {
				appendOwnerAction({
					key: `DelegateApprovals.setAssociatedContract(FeePool)`,
					target: feePoolDelegateApprovals.options.address,
					action: `setAssociatedContract(${feePoolAddress})`,
				});
			}
		}
	}

	const feePoolState = await deployContract({
		name: 'FeePoolState',
		deps: ['FeePool'],
		args: [account, feePoolAddress],
	});

	if (feePool && feePoolState) {
		const deployedFeePoolState = await feePool.methods.feePoolState().call();
		const feePoolStateAddress = feePoolState.options.address;

		if (deployedFeePoolState !== feePoolStateAddress) {
			if (feePoolOwner === account) {
				console.log(yellow('Invoking FeePool.setFeePoolState(FeePoolState)...'));

				await feePool.methods.setFeePoolState(feePoolStateAddress).send(deployer.sendParameters());
			} else {
				appendOwnerAction({
					key: 'FeePool.setFeePoolState(FeePoolState)',
					target: feePoolStateAddress,
					action: `setFeePoolState(${feePoolStateAddress})`,
				});
			}
		}
		// Rewire feePoolState if there is a feePool upgrade
		const configuredFeePoolAddress = await feePoolState.methods.feePool().call();
		if (configuredFeePoolAddress !== feePool.options.address) {
			const feePoolStateOwner = await feePoolState.methods.owner().call();
			if (feePoolStateOwner === account) {
				console.log(yellow('Invoking FeePoolState.setFeePool(FeePool)...'));

				await feePoolState.methods
					.setFeePool(feePool.options.address)
					.send(deployer.sendParameters());
			} else {
				appendOwnerAction({
					key: 'FeePoolState.setFeePool(FeePool)',
					target: feePoolState.options.address,
					action: `setFeePool(${feePool.options.address})`,
				});
			}
		}
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
		const rewardsAuthorityAddress = await feePool.methods.rewardsAuthority().call();
		if (rewardsAuthorityAddress !== rewardsDistribution.options.address) {
			if (feePoolOwner === account) {
				console.log(yellow('Invoking feePool.setRewardsAuthority(RewardsDistribution)...'));
				await feePool.methods
					.setRewardsAuthority(rewardsDistribution.options.address)
					.send(deployer.sendParameters());
			} else {
				appendOwnerAction({
					key: `FeePool.setRewardsAuthority(RewardsDistribution)`,
					target: feePool.options.address,
					action: `setRewardsAuthority(${rewardsDistribution.options.address})`,
				});
			}
		}
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
	// get the owner (might not be us if we didn't just do a deploy)
	const synthetixOwner = await synthetix.methods.owner().call();

	if (proxySynthetix && synthetix) {
		const target = await proxySynthetix.methods.target().call();
		if (target !== synthetixAddress) {
			const proxyOwner = await proxySynthetix.methods.owner().call();

			if (proxyOwner === account) {
				console.log(yellow('Invoking ProxySynthetix.setTarget(Synthetix)...'));
				await proxySynthetix.methods.setTarget(synthetixAddress).send(deployer.sendParameters());
			} else {
				appendOwnerAction({
					key: `ProxySynthetix.setTarget(Synthetix)`,
					target: proxySynthetix.options.address,
					action: `setTarget(${synthetixAddress})`,
				});
			}
		}
	}

	if (synthetix && feePool) {
		const synthetixFeePool = await synthetix.methods.feePool().call();

		if (synthetixFeePool !== feePoolAddress) {
			if (synthetixOwner === account) {
				console.log(yellow('Invoking Synthetix.setFeePool(FeePool)...'));
				await synthetix.methods.setFeePool(feePoolAddress).send(deployer.sendParameters());
			} else {
				appendOwnerAction({
					key: `Synthetix.setFeePool(FeePool)`,
					target: synthetixAddress,
					action: `setFeePool(${feePoolAddress})`,
				});
			}
		}
	}

	if (synthetix && exchangeRates) {
		const synthetixExRates = await synthetix.methods.exchangeRates().call();

		if (synthetixExRates !== exchangeRatesAddress) {
			if (synthetixOwner === account) {
				console.log(yellow('Invoking Synthetix.setExchangeRates(ExchangeRates)...'));
				await synthetix.methods
					.setExchangeRates(exchangeRatesAddress)
					.send(deployer.sendParameters());
			} else {
				appendOwnerAction({
					key: `Synthetix.setExchangeRates(ExchangeRates)`,
					target: synthetixAddress,
					action: `setExchangeRates(${exchangeRatesAddress})`,
				});
			}
		}
	}

	// only reset token state if redeploying
	if (tokenStateSynthetix && config['TokenStateSynthetix'].deploy) {
		const balance = await tokenStateSynthetix.methods.balanceOf(account).call();

		const initialIssuance = w3utils.toWei('100000000');
		if (balance !== initialIssuance) {
			console.log(yellow('Invoking TokenStateSynthetix.setBalanceOf(100M)...'));
			await tokenStateSynthetix.methods
				.setBalanceOf(account, initialIssuance)
				.send(deployer.sendParameters());
		}
	}

	if (tokenStateSynthetix && synthetix) {
		const associatedTSContract = await tokenStateSynthetix.methods.associatedContract().call();
		if (associatedTSContract !== synthetixAddress) {
			const tokenStateSynthetixOwner = await tokenStateSynthetix.methods.owner().call();

			if (tokenStateSynthetixOwner === account) {
				console.log(yellow('Invoking TokenStateSynthetix.setAssociatedContract(Synthetix)...'));
				await tokenStateSynthetix.methods
					.setAssociatedContract(synthetixAddress)
					.send(deployer.sendParameters());
			} else {
				appendOwnerAction({
					key: `TokenStateSynthetix.setAssociatedContract(Synthetix)`,
					target: tokenStateSynthetix.options.address,
					action: `setAssociatedContract(${synthetixAddress})`,
				});
			}
		}
		const associatedSSContract = await synthetixState.methods.associatedContract().call();
		if (associatedSSContract !== synthetixAddress) {
			const synthetixStateOwner = await synthetixState.methods.owner().call();

			if (synthetixStateOwner === account) {
				console.log(yellow('Invoking SynthetixState.setAssociatedContract(Synthetix)...'));
				await synthetixState.methods
					.setAssociatedContract(synthetixAddress)
					.send(deployer.sendParameters());
			} else {
				appendOwnerAction({
					key: `SynthetixState.setAssociatedContract(Synthetix)`,
					target: synthetixState.options.address,
					action: `setAssociatedContract(${synthetixAddress})`,
				});
			}
		}
	}

	if (synthetixEscrow) {
		await deployContract({
			name: 'EscrowChecker',
			deps: ['SynthetixEscrow'],
			args: [synthetixEscrow.options.address],
		});
	}

	if (rewardEscrow && synthetix) {
		const rewardEscrowSynthetix = await rewardEscrow.methods.synthetix().call();

		if (rewardEscrowSynthetix !== synthetixAddress) {
			// only the owner can do this
			const rewardEscrowOwner = await rewardEscrow.methods.owner().call();

			if (rewardEscrowOwner === account) {
				console.log(yellow('Invoking RewardEscrow.setSynthetix()...'));
				await rewardEscrow.methods.setSynthetix(synthetixAddress).send(deployer.sendParameters());
			} else {
				appendOwnerAction({
					key: `RewardEscrow.setSynthetix(Synthetix)`,
					target: rewardEscrow.options.address,
					action: `setSynthetix(${synthetixAddress})`,
				});
			}
		}
	}

	if (rewardEscrow && feePool) {
		const rewardEscrowFeePool = await rewardEscrow.methods.feePool().call();

		if (rewardEscrowFeePool !== feePoolAddress) {
			// only the owner can do this
			const rewardEscrowOwner = await rewardEscrow.methods.owner().call();

			if (rewardEscrowOwner === account) {
				console.log(yellow('Invoking RewardEscrow.setFeePool(FeePool)...'));
				await rewardEscrow.methods.setFeePool(feePoolAddress).send(deployer.sendParameters());
			} else {
				appendOwnerAction({
					key: `RewardEscrow.setFeePool(FeePool)`,
					target: rewardEscrow.options.address,
					action: `setFeePool(${feePoolAddress})`,
				});
			}
		}
	}

	// Skip setting unless redeploying either of these, as
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
			const escrowSNXAddress = await synthetixEscrow.methods.synthetix().call();
			if (escrowSNXAddress !== synthetixAddress) {
				// only the owner can do this
				const synthetixEscrowOwner = await synthetixEscrow.methods.owner().call();

				if (synthetixEscrowOwner === account) {
					console.log(yellow('Invoking SynthetixEscrow.setSynthetix(Synthetix)...'));
					await synthetixEscrow.methods
						.setSynthetix(synthetixAddress)
						.send(deployer.sendParameters());
				} else {
					appendOwnerAction({
						key: `SynthetixEscrow.setSynthetix(Synthetix)`,
						target: synthetixEscrow.options.address,
						action: `setSynthetix(${synthetixAddress})`,
					});
				}
			}
		}
	}

	if (feePool && synthetix) {
		const fpSNXAddress = await feePool.methods.synthetix().call();
		if (fpSNXAddress !== synthetixAddress) {
			// only the owner can do this
			if (feePoolOwner === account) {
				console.log(yellow('Invoking FeePool.setSynthetix(Synthetix)...'));
				await feePool.methods.setSynthetix(synthetixAddress).send(deployer.sendParameters());
			} else {
				appendOwnerAction({
					key: `FeePool.setSynthetix(Synthetix)`,
					target: feePool.options.address,
					action: `setSynthetix(${synthetixAddress})`,
				});
			}
		}
	}

	if (supplySchedule && synthetix) {
		const supplyScheduleSynthetix = await supplySchedule.methods.synthetix().call();

		if (supplyScheduleSynthetix !== synthetixAddress) {
			const supplyScheduleOwner = await supplySchedule.methods.owner().call();
			// Only owner
			if (supplyScheduleOwner === account) {
				console.log(yellow('Invoking SupplySchedule.setSynthetix(Synthetix)'));
				await supplySchedule.methods.setSynthetix(synthetixAddress).send(deployer.sendParameters());
			} else {
				appendOwnerAction({
					key: `SupplySchedule.setSynthetix(Synthetix)`,
					target: supplySchedule.options.address,
					action: `setSynthetix(${synthetixAddress})`,
				});
			}
		}
	}

	// ----------------
	// Synths
	// ----------------
	for (const { name: currencyKey, inverted, subclass } of synths) {
		const tokenStateForSynth = await deployContract({
			name: `TokenState${currencyKey}`,
			source: 'TokenState',
			args: [account, ZERO_ADDRESS],
			force: addNewSynths,
		});
		const proxyForSynth = await deployContract({
			name: `Proxy${currencyKey}`,
			source: 'Proxy',
			args: [account],
			force: addNewSynths,
		});
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
				synthetix ? synthetixAddress : '',
				feePool ? feePool.options.address : '',
				`Synth ${currencyKey}`,
				currencyKey,
				account,
				toBytes4(currencyKey),
			].concat(additionalConstructorArgsMap[subclass] || []),
			force: addNewSynths,
		});
		const synthAddress = synth ? synth.options.address : '';
		if (synth && tokenStateForSynth) {
			const tsAssociatedContract = await tokenStateForSynth.methods.associatedContract().call();
			if (tsAssociatedContract !== synthAddress) {
				const tsOwner = await tokenStateForSynth.methods.owner().call();

				if (tsOwner === account) {
					console.log(
						yellow(`Invoking TokenState${currencyKey}.setAssociatedContract(Synth${currencyKey})`)
					);

					await tokenStateForSynth.methods
						.setAssociatedContract(synthAddress)
						.send(deployer.sendParameters());
				} else {
					appendOwnerAction({
						key: `TokenState${currencyKey}.setAssociatedContract(Synth${currencyKey})`,
						target: tokenStateForSynth.options.address,
						action: `setAssociatedContract(${synthAddress})`,
					});
				}
			}
		}
		if (proxyForSynth && synth) {
			const target = await proxyForSynth.methods.target().call();
			if (target !== synthAddress) {
				const proxyForSynthOwner = await proxyForSynth.methods.owner().call();

				if (proxyForSynthOwner === account) {
					console.log(yellow(`Invoking Proxy${currencyKey}.setTarget(Synth${currencyKey})`));

					await proxyForSynth.methods.setTarget(synthAddress).send(deployer.sendParameters());
				} else {
					appendOwnerAction({
						key: `Proxy${currencyKey}.setTarget(Synth${currencyKey})`,
						target: proxyForSynth.options.address,
						action: `setTarget(${synthAddress})`,
					});
				}
			}
		}

		if (synth && synthetix) {
			const currentSynthInSNX = await synthetix.methods.synths(toBytes4(currencyKey)).call();
			if (currentSynthInSNX !== synthAddress) {
				// only owner of Synthetix can do this
				if (synthetixOwner === account) {
					console.log(yellow(`Invoking Synthetix.addSynth(Synth${currencyKey})...`));
					await synthetix.methods.addSynth(synthAddress).send(deployer.sendParameters());
				} else {
					appendOwnerAction({
						key: `Synthetix.addSynth(Synth${currencyKey})`,
						target: synthetixAddress,
						action: `addSynth(${synthAddress})`,
					});
				}
			}

			const synthSNXAddress = await synth.methods.synthetix().call();
			const synthOwner = await synth.methods.owner().call();

			// ensure synth has correct Synthetix
			if (synthSNXAddress !== synthetixAddress) {
				if (synthOwner === account) {
					console.log(yellow(`Invoking Synth${currencyKey}.setSynthetix(Synthetix)...`));
					await synth.methods.setSynthetix(synthetixAddress).send(deployer.sendParameters());
				} else {
					appendOwnerAction({
						key: `Synth${currencyKey}.setSynthetix(Synthetix)`,
						target: synthAddress,
						action: `setSynthetix(${synthetixAddress})`,
					});
				}
			}

			// ensure synth has correct FeePool
			if (synth && feePool) {
				const synthFeePoolAddress = await synth.methods.feePool().call();

				if (synthFeePoolAddress !== feePoolAddress) {
					if (synthOwner === account) {
						console.log(yellow(`Invoking Synth${currencyKey}.setFeePool(FeePool)...`));
						await synth.methods.setFeePool(feePoolAddress).send(deployer.sendParameters());
					} else {
						appendOwnerAction({
							key: `Synth${currencyKey}.setFeePool(FeePool)`,
							target: synthAddress,
							action: `setFeePool(${feePoolAddress})`,
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
								toBytes4(currencyKey),
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
							)}, ${w3utils.toWei(upperLimit.toString())}, ${w3utils.toWei(
								lowerLimit.toString()
							)})`,
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
		const depotSNXAddress = await depot.methods.synthetix().call();
		if (depotSNXAddress !== synthetixAddress) {
			const depotOwner = await depot.methods.owner().call();
			if (depotOwner === account) {
				console.log(yellow(`Invoking Depot.setSynthetix()...`));
				await depot.methods.setSynthetix(synthetixAddress).send(deployer.sendParameters());
			} else {
				appendOwnerAction({
					key: `Depot.setSynthetix(Synthetix)`,
					target: depot.options.address,
					action: `setSynthetix(${synthetixAddress})`,
				});
			}
		}
	}

	const proxyERC20 = await deployContract({
		name: 'ProxyERC20',
		deps: ['Synthetix'],
		args: [account],
	});

	if (synthetix && proxyERC20) {
		const proxySynthetixAddress = await proxyERC20.methods.target().call();
		if (proxySynthetixAddress !== synthetixAddress) {
			const iProxyOwner = await proxyERC20.methods.owner().call();
			if (iProxyOwner === account) {
				console.log(yellow(`Invoking ProxyERC20.setTarget()...`));
				await proxyERC20.methods.setTarget(synthetixAddress).send(deployer.sendParameters());
			} else {
				appendOwnerAction({
					key: `ProxyERC20.setTarget(Synthetix)`,
					target: proxyERC20.options.address,
					action: `setTarget(${synthetixAddress})`,
				});
			}
		}

		const synthetixProxyAddress = await synthetix.methods.integrationProxy().call();
		if (proxyERC20.options.address !== synthetixProxyAddress) {
			const synthetixOwner = await synthetix.methods.owner().call();
			if (synthetixOwner === account) {
				console.log(yellow(`Invoking Synthetix.setIntegrationProxy()...`));
				await synthetix.methods
					.setIntegrationProxy(proxyERC20.options.address)
					.send(deployer.sendParameters());
			} else {
				appendOwnerAction({
					key: `Synthetix.setIntegrationProxy(ProxyERC20)`,
					target: synthetix.options.address,
					action: `setIntegrationProxy(${proxyERC20.options.address})`,
				});
			}
		}

		if (synthetix && rewardsDistribution) {
			const synthetixAddress = synthetix ? synthetix.options.address : '';
			const synthetixProxyAddress = proxyERC20 ? proxyERC20.options.address : '';
			const rewardsDistributionOwner = await rewardsDistribution.methods.owner().call();
			const rewardsDistributionAuthorityAddress = await rewardsDistribution.methods
				.authority()
				.call();
			const rewardsDistSNXProxyAddress = await rewardsDistribution.methods.synthetixProxy().call();
			if (synthetixAddress !== rewardsDistributionAuthorityAddress) {
				if (rewardsDistributionOwner === account) {
					console.log(yellow('Invoking RewardsDistribution.setAuthority(Synthetix)...'));
					await rewardsDistribution.methods
						.setAuthority(synthetixAddress)
						.send(deployer.sendParameters());
				} else {
					appendOwnerAction({
						key: `RewardsDistribution.setAuthority(Synthetix)`,
						target: rewardsDistribution.options.address,
						action: `setAuthority(${synthetixAddress})`,
					});
				}
			}
			if (synthetixAddress !== rewardsDistSNXProxyAddress) {
				if (rewardsDistributionOwner === account) {
					console.log(yellow('Invoking RewardsDistribution.setSynthetixProxy(SynthetixProxy)...'));
					await rewardsDistribution.methods
						.setSynthetixProxy(synthetixProxyAddress)
						.send(deployer.sendParameters());
				} else {
					appendOwnerAction({
						key: `RewardsDistribution.setSynthetixProxy(SynthetixProxy)`,
						target: rewardsDistribution.options.address,
						action: `setSynthetixProxy(${synthetixProxyAddress})`,
					});
				}
			}
		}
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
