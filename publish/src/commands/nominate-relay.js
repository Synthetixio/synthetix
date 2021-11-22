'use strict';

const ethers = require('ethers');
const { gray, yellow, red, cyan } = require('chalk');

const {
	getUsers,
	constants: { CONFIG_FILENAME, DEPLOYMENT_FILENAME },
} = require('../../..');

const {
	ensureNetwork,
	getDeploymentPathForNetwork,
	ensureDeploymentPath,
	loadAndCheckRequiredSources,
	confirmAction,
} = require('../util');

const SafeBatchSubmitter = require('../SafeBatchSubmitter');

const { getContract } = require('../command-utils/contract');
const { getBatchCallData } = require('../command-utils/bridge');

const nominateRelay = async ({
	l1Network,
	l2Network,
	l1DeploymentPath,
	l2DeploymentPath,
	l1ProviderUrl,
	l2ProviderUrl,
	l1PrivateKey,
	newOwner,
	safeOwner,
	contracts,
	gasPrice,
	gasLimit,
	xDomainGasLimit,
	isContract,
	yes,
	maxBatchSize,
}) => {
	/// ////////////////////////////////////
	// SETUP / SANITY CHECK
	/// ////////////////////////////////////
	ensureNetwork(l1Network);
	l1DeploymentPath = l1DeploymentPath || getDeploymentPathForNetwork({ network: l1Network });
	l2DeploymentPath = l2DeploymentPath || getDeploymentPathForNetwork({ network: l2Network });
	ensureDeploymentPath(l1DeploymentPath);
	ensureDeploymentPath(l2DeploymentPath);

	if (!newOwner) {
		newOwner = getUsers({ network: l2Network, user: 'owner' }).address;
	}

	if (!newOwner || !ethers.utils.isAddress(newOwner)) {
		console.error(red('Invalid new owner to nominate. Please check the option and try again.'));
		process.exit(1);
	} else {
		newOwner = newOwner.toLowerCase();
	}

	if (!isContract && !yes) {
		try {
			await confirmAction(
				yellow(
					'\nHeads up! You are about to relay nominate ownership signing with an EOA, i.e. not a multisig or a DAO. Are you sure? (y/n) '
				)
			);
		} catch (err) {
			console.log(gray('Operation cancelled'));
			process.exit();
		}
	}

	const { config: l2Config, deployment: l2Deployment } = loadAndCheckRequiredSources({
		deploymentPath: l2DeploymentPath,
		network: l2Network,
	});

	const { deployment: l1Deployment } = loadAndCheckRequiredSources({
		deploymentPath: l1DeploymentPath,
		network: l1Network,
	});

	const l1Provider = new ethers.providers.JsonRpcProvider(l1ProviderUrl);
	const l2Provider = new ethers.providers.JsonRpcProvider(l2ProviderUrl);

	let l1Wallet;
	if (!l1PrivateKey) {
		const account = getUsers({ network: l1Network, user: 'owner' }).address; // protocolDAO
		l1Wallet = l1Provider.getSigner(account);
		l1Wallet.address = await l1Wallet.getAddress();
	} else {
		l1Wallet = new ethers.Wallet(l1PrivateKey, l1Provider);
	}

	if (contracts.length > 0) {
		// Validate contract names
		contracts.forEach(contract => {
			if (!(contract in l2Config)) {
				console.error(red(`Contract ${contract} isn't in the config for this deployment!`));
				process.exit(1);
			}
		});
	} else {
		// if contracts not supplied, use all contracts except the DappMaintenance (UI control)
		contracts = Object.keys(l2Config).filter(contract => contract !== 'DappMaintenance');
	}

	const OwnerRelayOnEthereum = getContract({
		deployment: l1Deployment,
		signer: l1Wallet,
		contract: 'OwnerRelayOnEthereum',
	});
	const OwnerRelayOnOptimism = getContract({
		deployment: l2Deployment,
		signer: l2Provider,
		contract: 'OwnerRelayOnOptimism',
	});
	if (OwnerRelayOnOptimism.address.toLowerCase() !== newOwner.toLowerCase()) {
		try {
			await confirmAction(
				yellow(
					'\nHeads up! You are about to nominate ownership to an address different than current OwnerRelayOnOptimism. Are you sure? (y/n) '
				)
			);
		} catch (err) {
			console.log(gray('Operation cancelled'));
			process.exit();
		}
	}

	/// ////////////////////////////////////
	// FILTER TARGET CONTRACTS
	/// ////////////////////////////////////
	const contractsToNominate = [];
	let currentBatchSize = 0;
	for (const contract of contracts) {
		if (currentBatchSize >= maxBatchSize) {
			break;
		}
		const deployedContract = getContract({
			deployment: l2Deployment,
			signer: l2Provider,
			contract,
		});

		// ignore contracts that don't support Owned
		if (!deployedContract.functions.owner) {
			continue;
		}

		const [currentOwner, nominatedOwner] = await Promise.all([
			deployedContract.owner().then(o => o.toLowerCase()),
			deployedContract.nominatedOwner().then(o => o.toLowerCase()),
		]);

		// check if the owner is already assigned
		if (currentOwner === newOwner || nominatedOwner === newOwner) {
			continue;
		}

		// check for legacy function
		const nominationFn = 'nominateOwner' in deployedContract ? 'nominateOwner' : 'nominateNewOwner';
		const calldata = deployedContract.interface.encodeFunctionData(nominationFn, [newOwner]);

		contractsToNominate.push({ contract, address: deployedContract.address, calldata });
		currentBatchSize++;
	}

	if (!contractsToNominate.length) {
		console.log(gray('No contracts to assign.'));
		process.exit();
	}

	if (!yes) {
		try {
			await confirmAction(
				cyan(
					`${yellow(
						'WARNING'
					)}: This action will nominate ${newOwner} as the owner in ${l2Network} of the following contracts:\n- ${contractsToNominate
						.map(c => c.contract)
						.join('\n- ')}\nTotal: ${contractsToNominate.length}`
				) + '\nDo you want to continue? (y/n) '
			);
		} catch (err) {
			console.log(gray('Operation cancelled'));
			process.exit();
		}
	}

	/// ////////////////////////////////////
	// DO THE ACTION
	/// ////////////////////////////////////
	const contractsToNominateCalldata = getBatchCallData({
		contractsCallData: contractsToNominate,
		OwnerRelayOnEthereum,
		xDomainGasLimit: ethers.BigNumber.from(xDomainGasLimit),
	});

	if (!isContract) {
		const relayOwner = await OwnerRelayOnEthereum.owner().then(o => o.toLowerCase());

		// Using a relay owned by EOA, we can execute the calls
		if (relayOwner !== l1Wallet.address.toLowerCase()) {
			console.log(red('The given L1 wallet is not owner of the OwnerRelayOnEthereum contract'));
			process.exit(1);
		}

		const overrides = {
			gasPrice: ethers.utils.parseUnits(gasPrice, 'gwei'),
		};
		if (gasLimit) {
			overrides.gasLimit = gasLimit;
		}

		const tx = await OwnerRelayOnEthereum.initiateRelayBatch(
			contractsToNominateCalldata.targets,
			contractsToNominateCalldata.payloads,
			ethers.BigNumber.from(xDomainGasLimit),
			overrides
		);
		await tx.wait();
	} else {
		const target = OwnerRelayOnEthereum.address();
		// Using a relay owned by teh DAO. We need to stage the transaction in Gnosis Safe.
		const safeBatchSubmitter = new SafeBatchSubmitter({
			l1Network,
			l1Wallet,
			safeAddress: safeOwner,
		});

		try {
			// attempt to initialize a gnosis safe
			const { currentNonce, pendingTxns } = await safeBatchSubmitter.init();
			console.log(
				gray(
					'Loaded safe at address',
					yellow(safeOwner),
					'nonce',
					yellow(currentNonce),
					'with',
					yellow(pendingTxns.count),
					'transactions pending signing'
				)
			);
		} catch (err) {
			if (
				!/Safe Proxy contract is not deployed in the current network/.test(err.message) &&
				!/Safe contracts not found in the current network/.test(err.message)
			) {
				throw err;
			}

			if (l1Wallet.address.toLowerCase() !== safeOwner.toLowerCase()) {
				throw new Error(
					`Safe owner is ${safeOwner} and signer is ${l1Wallet.address}. 
					The signer needs to be the safe owner in order to be able to claim ownership and/or execute owner actions.`
				);
			}
		}

		const confirmOrEnd = async message => {
			try {
				if (yes) {
					console.log(message);
				} else {
					await confirmAction(
						message +
							cyan(
								`\nPlease type "y" to stage transaction, 
								or enter "n" to cancel and resume this later? (y/n) `
							)
					);
				}
			} catch (err) {
				console.log(gray('Operation cancelled'));
				process.exit();
			}
		};

		console.log(gray('Attempting to append to the batch'));
		const { appended } = await safeBatchSubmitter.appendTransaction({
			to: target,
			data: contractsToNominateCalldata.batchData,
		});
		if (!appended) {
			console.log(gray('Skipping adding to the batch as already in pending queue'));
		} else {
			console.log(gray('Transaction successfully added to the batch.'));
		}

		const { transactions } = safeBatchSubmitter;

		if (transactions.length) {
			if (!yes) {
				await confirmOrEnd(
					gray(
						`Confirm: Stage`,
						yellow(`${transactions.length}`),
						`transactions to the safe in a batch?`
					)
				);
			}

			const { nonce } = await safeBatchSubmitter.submit();

			console.log(
				gray(
					'Submitted a batch of',
					yellow(transactions.length),
					'transactions to the safe',
					yellow(safeOwner),
					'at nonce position',
					yellow(nonce)
				)
			);
		} else {
			console.log(gray('No transactions to stage'));
		}
	}
};

module.exports = {
	nominateRelay,
	cmd: program =>
		program
			.command('nominate-relay')
			.description(
				'nominate-relay script - Nominate a new owner for one or more contracts, relayed from L1 to L2 using the OwnerRelayOnEthereum contract'
			)
			.option(
				'--l1-deployment-path <value>',
				`Path to a folder that has your input configuration file ${CONFIG_FILENAME} and where your ${DEPLOYMENT_FILENAME} files will go`
			)
			.option(
				'--l2-deployment-path <value>',
				`Path to a folder that has your input configuration file ${CONFIG_FILENAME} and where your ${DEPLOYMENT_FILENAME} files will go`
			)
			.option(
				'--l1-network <value>',
				'The network to run off the OwnerRelayOnEthereum.initiateRelay command',
				x => x.toLowerCase(),
				'kovan'
			)
			.option(
				'--l2-network <value>',
				'The network where are the contracts we want to set the owner to.',
				x => x.toLowerCase(),
				'kovan'
			)
			.option('--l1-provider-url <value>', 'Ethereum network provider URL.')
			.option('--l2-provider-url <value>', 'Optimism network provider URL.')
			.option('--l1-private-key [value]', 'The private key to execute the commnad with on L1.')
			.option('-g, --gas-price <value>', 'Gas price in GWEI', '1')
			.option('-l, --gas-limit <value>', 'Gas limit', parseInt, 15e4)
			.option('--x-domain-gas-limit <value>', 'Cross Domain Gas Limit ', parseInt, 0)
			.option(
				'-o, --new-owner <value>',
				'The address of the new owner (please include the 0x prefix)'
			)
			.option(
				'--safe-owner <value>',
				'The address of the safe owner (please include the 0x prefix)'
			)
			.option('-y, --yes', 'Dont prompt, just reply yes.')
			.option('--is-contract', 'Wether the bridge owner is a contract wallet or an EOA', false)
			.option(
				'--max-batch-size <value>',
				'Maximun number of contracts to be processed in a batch',
				parseInt,
				25
			)
			.option(
				'-c, --contracts [value]',
				'The list of contracts. Applies to all contract by default',
				(val, memo) => {
					memo.push(val);
					return memo;
				},
				[]
			)
			.action(nominateRelay),
};
