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

const ownerRelay = async ({
	l1Network,
	l2Network,
	l1DeploymentPath,
	l2DeploymentPath,
	l1ProviderUrl,
	l2ProviderUrl,
	l1PrivateKey,
	l2PrivateKey,
	newOwner,
	contracts,
	gasPrice,
	gasLimit,
	isContract,
	yes,
}) => {
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

	const getL1Contract = contract => {
		const { address, source } = l1Deployment.targets[contract];
		const { abi } = l1Deployment.sources[source];
		return new ethers.Contract(address, abi, l1Wallet);
	};

	const getL2Contract = contract => {
		const { address, source } = l2Deployment.targets[contract];
		const { abi } = l2Deployment.sources[source];
		return new ethers.Contract(address, abi, l2Provider);
	};

	let l1Wallet;
	if (!l1PrivateKey) {
		const account = getUsers({ network: l1Network, user: 'owner' }).address; // protocolDAO
		l1Wallet = l1Provider.getSigner(account);
		l1Wallet.address = await l1Wallet.getAddress();
	} else {
		l1Wallet = new ethers.Wallet(l1PrivateKey, l1Provider);
	}

	let l2Wallet;
	if (!l2PrivateKey) {
		const account = getUsers({ network: l1Network, user: 'owner' }).address; // protocolDAO
		l2Wallet = l1Provider.getSigner(account);
		l2Wallet.address = await l2Wallet.getAddress();
	} else {
		l2Wallet = new ethers.Wallet(l2PrivateKey, l1Provider);
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

	const OwnerRelayOnEthereum = getL1Contract('OwnerRelayOnEthereum');
	const OwnerRelayOnOptimism = getL2Contract('OwnerRelayOnOptimism');

	const contractsToAccept = [];
	const relayAddress = OwnerRelayOnOptimism.address();
	for (const contract of contracts) {
		const deployedContract = getL2Contract(contract);

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

	const getBatchRelayData = ({ batchData }) => {
		const targets = [];
		const datas = [];
		for (const data of batchData) {
			const { address, calldata } = data;
			targets.push(address);
			datas.push(calldata);
		}
		return OwnerRelayOnOptimism.interface.encodeFunctionData('initiateRelayBatch', [
			targets,
			datas,
		]);
	};

	if (!isContract) {
		const overrides = {
			gasLimit,
			gasPrice: ethers.utils.parseUnits(gasPrice, 'gwei'),
		};

		for (const contractData of contractsToAccept) {
			const { contract, address, calldata } = contractData;
			console.log(yellow(`Accepting ownership on ${contract}...`));

			const tx = await OwnerRelayOnEthereum.initiateRelay(address, calldata, overrides);
			await tx.wait();
		}
	} else {
		const target = OwnerRelayOnEthereum.address();
		const data = getBatchRelayData(contractsToAccept);
		// Using a relay owned by teh DAO. We need to stage the transaction in Gnosis Safe.
		// new owner should be gnosis safe proxy address
		protocolDaoContract = getSafeInstance({ provider: l1Provider, safeAddress: newOwner });

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
			encodedData: data,
			currentSafeNonce,
		});

		if (existingTx) return;

		// await confirmOrEnd(yellow('Confirm: ') + `Stage ${bgYellow(black(key))} to (${target})`);

		try {
			const { txHash, newNonce } = await getNewTransactionHash({
				safeContract: protocolDaoContract,
				data,
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
				data,
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
				x => x.toLowerCase()
			)
			.option('--l1-provider-url <value>', 'Ethereum network provider URL.')
			.option('--l2-provider-url <value>', 'Optimism network provider URL.')
			.option('--l1-private-key [value]', 'The private key to execute the commnad with on L1.')
			.option('--l2-private-key [value]', 'The private key to execute the commnad with on L2.')
			.option('-g, --gas-price <value>', 'Gas price in GWEI', '1')
			.option('-l, --gas-limit <value>', 'Gas limit', parseInt, 15e4)
			.option(
				'-o, --new-owner <value>',
				'The address of the new owner (please include the 0x prefix)'
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
