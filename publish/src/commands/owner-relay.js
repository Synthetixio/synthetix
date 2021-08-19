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

const {
	getSafeInstance,
	getSafeNonce,
	getSafeTransactions,
	checkExistingPendingTx,
	getNewTransactionHash,
	saveTransactionToApi,
	getSafeSignature,
} = require('../safe-utils');

const { getContract } = require('../command-utils/contract');
const { getBatchCallData } = require('../command-utils/bridge');

const ownerRelay = async ({
	l1Network,
	l2Network,
	l1DeploymentPath,
	l2DeploymentPath,
	l1ProviderUrl,
	l2ProviderUrl,
	l1PrivateKey,
	safeOwner,
	contracts,
	gasPrice,
	gasLimit,
	xDomainGasLimit,
	isContract,
	yes,
}) => {
	/// ////////////////////////////////////
	// SETUP / SANITY CHECK
	/// ////////////////////////////////////
	ensureNetwork(l1Network);
	l1DeploymentPath = l1DeploymentPath || getDeploymentPathForNetwork({ network: l1Network });
	l2DeploymentPath = l2DeploymentPath || getDeploymentPathForNetwork({ network: l2Network });
	ensureDeploymentPath(l1DeploymentPath);
	ensureDeploymentPath(l2DeploymentPath);

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

	/// ////////////////////////////////////
	// FILTER TARGET CONTRACTS
	/// ////////////////////////////////////
	const contractsToAccept = [];
	const relayAddress = OwnerRelayOnOptimism.address();
	for (const contract of contracts) {
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

		if (currentOwner === relayAddress) {
			console.log(gray(`${relayAddress} is already the owner of ${contract}`));
		} else if (nominatedOwner === relayAddress) {
			const calldata = deployedContract.interface.encodeFunctionData('acceptOwnership', []);

			contractsToAccept.push({ contract, address: deployedContract.address, calldata });
		} else {
			console.log(
				cyan(
					`Cannot acceptOwnership on ${contract} as nominatedOwner: ${nominatedOwner} isn't the OwnerRelayOnOptimism ${relayAddress}. Have you run the nominate command yet?`
				)
			);
		}
	}

	if (!contractsToAccept.length) {
		console.log(gray('No contracts to accept ownership.'));
		process.exit();
	}

	if (!yes) {
		try {
			await confirmAction(
				cyan(
					`${yellow(
						'WARNING'
					)}: This action will confirm (accept) ${relayAddress} as the owner in ${l2Network} of the following contracts:\n- ${contractsToAccept
						.map(c => c.contract)
						.join('\n- ')}\nTotal: ${contractsToAccept.length}`
				) + '\nDo you want to continue? (y/n) '
			);
		} catch (err) {
			console.log(gray('Operation cancelled'));
			process.exit();
		}
	}

	let lastNonce;
	let protocolDaoContract;
	let currentSafeNonce;
	let stagedTransactions;

	/// ////////////////////////////////////
	// DO THE ACTION
	/// ////////////////////////////////////
	const contractsToAcceptCalldata = getBatchCallData({
		contractsCallData: contractsToAccept,
		OwnerRelayOnEthereum,
		xDomainGasLimit,
	});

	if (!isContract) {
		const overrides = {
			gasLimit,
			gasPrice: ethers.utils.parseUnits(gasPrice, 'gwei'),
		};

		const tx = await OwnerRelayOnEthereum.initiateRelayBatch(
			contractsToAcceptCalldata.targets,
			contractsToAcceptCalldata.payloads,
			xDomainGasLimit,
			overrides
		);
		await tx.wait();
	} else {
		const target = OwnerRelayOnEthereum.address();
		// Using a relay owned by teh DAO. We need to stage the transaction in Gnosis Safe.
		// new owner should be gnosis safe proxy address
		protocolDaoContract = getSafeInstance({ provider: l1Provider, safeAddress: safeOwner });

		// get protocolDAO nonce
		currentSafeNonce = await getSafeNonce(protocolDaoContract);

		if (!currentSafeNonce) {
			console.log(gray('Cannot access safe. Exiting.'));
			process.exit();
		}

		console.log(yellow(`Using Protocol DAO Safe contract at ${protocolDaoContract.address}`));

		// Load staged transactions
		stagedTransactions = await getSafeTransactions({
			network: l1Network,
			safeAddress: protocolDaoContract.address,
		});

		const existingTx = checkExistingPendingTx({
			stagedTransactions,
			target,
			encodedData: contractsToAcceptCalldata.batchData,
			currentSafeNonce,
		});

		if (existingTx) return;

		// await confirmOrEnd(yellow('Confirm: ') + `Stage ${bgYellow(black(key))} to (${target})`);

		try {
			const { txHash, newNonce } = await getNewTransactionHash({
				safeContract: protocolDaoContract,
				data: contractsToAcceptCalldata.batchData,
				to: target,
				sender: l1Wallet.address,
				network: l1Network,
				lastNonce,
			});

			// sign txHash to get signature
			const sig = await getSafeSignature({
				privateKey: l1PrivateKey,
				providerUrl: l1ProviderUrl,
				contractTxHash: txHash,
			});

			// save transaction and signature to Gnosis Safe API
			await saveTransactionToApi({
				safeContract: protocolDaoContract,
				network: l1Network,
				data: contractsToAcceptCalldata.batchData,
				nonce: newNonce,
				to: target,
				sender: l1Wallet.address,
				transactionHash: txHash,
				signature: sig,
			});
		} catch (err) {
			console.log(
				gray(`Transaction failed, if sending txn to safe api failed retry manually - ${err}`)
			);
		}
	}
};

module.exports = {
	ownerRelay,
	cmd: program =>
		program
			.command('owner-relay')
			.description(
				'Owner-relay script - accept ownership by OwnerRelayOnOptimism of nominated contracts.'
			)
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
				'--safe-owner <value>',
				'The address of the safe owner (please include the 0x prefix)'
			)
			.option('-y, --yes', 'Dont prompt, just reply yes.')
			.option('--is-contract', 'Wether the bridge owner is a contract wallet or an EOA', false)
			.option(
				'-c, --contracts [value]',
				'The list of contracts. Applies to all contract by default',
				(val, memo) => {
					memo.push(val);
					return memo;
				},
				[]
			)
			.action(ownerRelay),
};
