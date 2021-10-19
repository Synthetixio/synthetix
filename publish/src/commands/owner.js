'use strict';

const ethers = require('ethers');
const fs = require('fs');
const { gray, yellow, red, cyan, bgYellow, black } = require('chalk');

const {
	getUsers,
	constants: { CONFIG_FILENAME, DEPLOYMENT_FILENAME },
} = require('../../..');

const {
	ensureNetwork,
	ensureDeploymentPath,
	getDeploymentPathForNetwork,
	loadAndCheckRequiredSources,
	loadConnections,
	confirmAction,
	stringify,
	assignGasOptions,
} = require('../util');

const SafeBatchSubmitter = require('../SafeBatchSubmitter');

const DEFAULTS = {
	priorityGasPrice: '1',
	gasLimit: 2e5, // 200,000
};

const owner = async ({
	network,
	newOwner,
	deploymentPath,
	maxFeePerGas,
	maxPriorityFeePerGas = DEFAULTS.priorityGasPrice,
	gasLimit = DEFAULTS.gasLimit,
	privateKey,
	yes,
	useOvm,
	useFork,
	providerUrl,
	throwOnNotNominatedOwner = false,
}) => {
	ensureNetwork(network);
	deploymentPath = deploymentPath || getDeploymentPathForNetwork({ network, useOvm });
	ensureDeploymentPath(deploymentPath);

	function logTx(tx) {
		console.log(gray(`  > tx hash: ${tx.transactionHash}`));
	}

	if (!newOwner) {
		newOwner = getUsers({ network, useOvm, user: 'owner' }).address;
	}

	if (!ethers.utils.isAddress(newOwner)) {
		console.error(red('Invalid new owner to nominate. Please check the option and try again.'));
		process.exitCode = 1;
		return;
	}
	// ensure all nominated owners are accepted
	const { config, deployment, ownerActions, ownerActionsFile } = loadAndCheckRequiredSources({
		deploymentPath,
		network,
	});

	const { providerUrl: envProviderUrl, privateKey: envPrivateKey } = loadConnections({
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
	if (network !== 'local' && !privateKey && !useFork) {
		privateKey = envPrivateKey;
	}

	const provider = new ethers.providers.JsonRpcProvider(providerUrl);

	let signer;
	if (!privateKey) {
		const account = getUsers({ network, user: 'owner' }).address; // protocolDAO
		signer = provider.getSigner(account);
		signer.address = await signer.getAddress();
	} else {
		signer = new ethers.Wallet(privateKey, provider);
	}

	console.log(gray(`Using account with public key ${signer.address}`));

	const safeBatchSubmitter = new SafeBatchSubmitter({ network, signer, safeAddress: newOwner });
	let isOwnerASafe = false;

	try {
		// attempt to initialize a gnosis safe from the new owner
		const { currentNonce, pendingTxns } = await safeBatchSubmitter.init();
		isOwnerASafe = true;
		console.log(
			gray(
				'Loaded safe at address',
				yellow(newOwner),
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

		console.log(gray('New owner is not a Gnosis safe.'));

		if (signer.address.toLowerCase() !== newOwner.toLowerCase()) {
			throw new Error(
				`New owner is ${newOwner} and signer is ${signer.address}. The signer needs to be the new owner in order to be able to claim ownership and/or execute owner actions.`
			);
		}

		if (!yes) {
			try {
				await confirmAction(
					yellow(
						'\nHeads up! You are about to set ownership to an EOA (externally owned address), i.e. not a multisig or a DAO. Are you sure? (y/n) '
					)
				);
			} catch (err) {
				console.log(gray('Operation cancelled'));
				return;
			}
		}

		console.log(gray(`Gas: base fee${maxFeePerGas} GWEI, miner tip ${maxPriorityFeePerGas} GWEI`));
	}

	const confirmOrEnd = async message => {
		try {
			if (yes) {
				console.log(message);
			} else {
				await confirmAction(
					message +
						cyan(
							`\nPlease type "y" to ${
								isOwnerASafe ? 'stage' : 'submit'
							} transaction, or enter "n" to cancel and resume this later? (y/n) `
						)
				);
			}
		} catch (err) {
			console.log(gray('Operation cancelled'));
			process.exit();
		}
	};

	console.log(
		gray('Running through operations during deployment that could not complete as not owner.')
	);

	// Read owner-actions.json + encoded data to stage tx's
	for (const [key, entry] of Object.entries(ownerActions)) {
		const { target, data, complete } = entry;
		if (complete) continue;

		entry.complete = true;
		if (isOwnerASafe && !useFork) {
			console.log(gray(`Attempting to append`, yellow(key), `to the batch`));
			const { appended } = await safeBatchSubmitter.appendTransaction({
				to: target,
				data,
			});
			if (!appended) {
				console.log(gray('Skipping adding to the batch as already in pending queue'));
			} else {
				console.log(gray('Transaction successfully added to the batch.'));
			}
		} else {
			try {
				await confirmOrEnd(yellow('Confirm: ') + `Submit ${bgYellow(black(key))} to (${target})`);
				const params = assignGasOptions({
					tx: {
						to: target,
						data,
					},
					provider,
					maxFeePerGas,
					maxPriorityFeePerGas,
				});

				if (gasLimit) {
					params.gasLimit = ethers.BigNumber.from(gasLimit);
				}

				const tx = await signer.sendTransaction(params);
				const receipt = await tx.wait();

				logTx(receipt);

				fs.writeFileSync(ownerActionsFile, stringify(ownerActions));
			} catch (err) {
				throw Error(`Transaction failed to send.\n${err}`);
			}
		}
	}

	console.log(gray('Looking for contracts whose ownership we should accept'));
	const warnings = [];
	for (const contract of Object.keys(config)) {
		if (!deployment.targets[contract]) {
			const msg = yellow(`WARNING: contract ${contract} not found in deployment file`);
			console.log(msg);
			warnings.push(msg);
			continue;
		}
		const { address, source } = deployment.targets[contract];
		const { abi } = deployment.sources[source];
		const deployedContract = new ethers.Contract(address, abi, provider);

		// ignore contracts that don't support Owned
		if (!deployedContract.functions.owner) {
			continue;
		}
		const currentOwner = (await deployedContract.owner()).toLowerCase();
		const nominatedOwner = (await deployedContract.nominatedOwner()).toLowerCase();

		if (currentOwner === newOwner.toLowerCase()) {
			console.log(gray(`${newOwner} is already the owner of ${contract}`));
		} else if (nominatedOwner === newOwner.toLowerCase()) {
			const encodedData = deployedContract.interface.encodeFunctionData('acceptOwnership', []);

			if (isOwnerASafe && !useFork) {
				console.log(
					gray(`Attempting to append`, yellow(`${contract}.acceptOwnership()`), `to the batch`)
				);
				const { appended } = await safeBatchSubmitter.appendTransaction({
					to: address,
					data: encodedData,
				});
				if (!appended) {
					console.log(gray('Skipping adding to the batch as already in pending queue'));
				}
			} else {
				try {
					await confirmOrEnd(gray(`Confirm: Submit`, yellow(`${contract}.acceptOwnership()`), `?`));
					console.log('address is', address);
					console.log('encoded data is', encodedData);

					const params = assignGasOptions({
						tx: {
							to: address,
							data: encodedData,
						},
						provider,
						maxFeePerGas,
						maxPriorityFeePerGas,
					});

					if (gasLimit) {
						params.gasLimit = ethers.BigNumber.from(gasLimit);
					}
					
					console.log('final params', params);

					const tx = await signer.sendTransaction(params);
					const receipt = await tx.wait();

					logTx(receipt);
				} catch (err) {
					throw Error(`Transaction failed to submit.\n${err}`);
				}
			}
		} else {
			const msg = `Cannot acceptOwnership on ${contract} as nominatedOwner: ${nominatedOwner} isn't the newOwner ${newOwner} you specified. Have you run the nominate command yet?`;
			if (throwOnNotNominatedOwner && contract !== 'DappMaintenance') {
				throw Error(msg);
			} else {
				console.log(cyan(msg));
			}
		}
	}

	if (isOwnerASafe) {
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
					yellow(newOwner),
					'at nonce position',
					yellow(nonce)
				)
			);

			fs.writeFileSync(ownerActionsFile, stringify(ownerActions));
		} else {
			console.log(gray('No transactions to stage'));
		}
	}

	if (warnings.length) {
		console.log(yellow('\nThere were some issues during ownership\n'));
		console.log(yellow('---'));
		warnings.forEach(warning => console.log(warning));
		console.log(yellow('---'));
	}
};

module.exports = {
	owner,
	cmd: program =>
		program
			.command('owner')
			.description('Owner script - a list of transactions required by the owner.')
			.option(
				'-d, --deployment-path <value>',
				`Path to a folder that has your input configuration file ${CONFIG_FILENAME} and where your ${DEPLOYMENT_FILENAME} files will go`
			)
			.option(
				'-k, --use-fork',
				'Perform the deployment on a forked chain running on localhost (see fork command).',
				false
			)
			.option(
				'-o, --new-owner <value>',
				'The address of protocolDAO proxy contract as owner (please include the 0x prefix)'
			)
			.option('-v, --private-key [value]', 'The private key of wallet to stage with.')
			.option('-g, --max-fee-per-gas <value>', 'Maximum base gas fee price in GWEI')
			.option('--max-priority-fee-per-gas <value>', 'Priority gas fee price in GWEI', '1')
			.option('-l, --gas-limit <value>', 'Gas limit', parseInt, DEFAULTS.gasLimit)
			.option('-n, --network <value>', 'The network to run off.', x => x.toLowerCase(), 'kovan')
			.option('-y, --yes', 'Dont prompt, just reply yes.')
			.option('-z, --use-ovm', 'Target deployment for the OVM (Optimism).')
			.option(
				'-p, --provider-url <value>',
				'Ethereum network provider URL. If default, will use PROVIDER_URL found in the .env file.'
			)
			.action(owner),
};
