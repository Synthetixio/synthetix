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

const { getContract } = require('../command-utils/contract');
const { safeInitializer } = require('../command-utils/safe-initializer');

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
	skipOwnership = false,
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
		useOvm,
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
		const account = getUsers({ network, user: 'owner', useOvm }).address;
		signer = provider.getSigner(account);
		signer.address = await signer.getAddress();
	} else {
		signer = new ethers.Wallet(privateKey, provider);
	}

	console.log(gray(`Using account with public key ${signer.address}`));

	let relayers;

	const safeBatchSubmitter = await safeInitializer({ network, signer, safeAddress: newOwner });

	if (!safeBatchSubmitter) {
		console.log(gray('New owner is not a Gnosis safe.'));
		console.log(gray('New owner set to'), yellow(newOwner));

		const deployedCode = await provider.getCode(newOwner);
		const isContract = deployedCode !== '0x';

		if (isContract && useOvm) {
			console.log(gray('New owner is a contract. Assuming it is a relayer.'));
			// load up L1 deployment for relaying
			const { providerUrl: l1ProviderUrl, privateKey: l1PrivateKey } = loadConnections({
				network,
				useOvm: false,
			});
			const l1Owner = getUsers({ network, user: 'owner', useOvm: false }).address;

			const l1Provider = new ethers.providers.JsonRpcProvider(l1ProviderUrl);
			relayers = {
				actions: [],
				l1Provider,
				OwnerRelayOnOptimism: getContract({
					contract: 'OwnerRelayOnOptimism',
					network,
					useOvm,
					provider,
				}),
				OwnerRelayOnEthereum: getContract({
					contract: 'OwnerRelayOnEthereum',
					network,
					useOvm: false,
					provider: l1Provider,
				}),
				l1Signer: new ethers.Wallet(l1PrivateKey, l1Provider),
				l1Owner,
			};

			console.log(
				gray('L2 relayer'),
				yellow(relayers.OwnerRelayOnOptimism.address),
				gray('L1 base relayer'),
				yellow(relayers.OwnerRelayOnEthereum.address)
			);
		} else if (signer.address.toLowerCase() !== newOwner.toLowerCase()) {
			throw new Error(
				`New owner is ${newOwner} and signer is ${signer.address}. The signer needs to be the new owner in order to be able to claim ownership and/or execute owner actions.`
			);
		}

		if (!yes && !isContract) {
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

		console.log(gray(`Gas: base fee ${maxFeePerGas} GWEI, miner tip ${maxPriorityFeePerGas} GWEI`));
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
								safeBatchSubmitter ? 'stage' : 'submit'
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
		if (safeBatchSubmitter && !useFork) {
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
		} else if (relayers) {
			// Relayer
			console.log(gray('Adding'), yellow(key), gray('to the relayer actions'));
			relayers.actions.push({ target, data });
		} else {
			try {
				await confirmOrEnd(yellow('Confirm: ') + `Submit ${bgYellow(black(key))} to (${target})`);
				const params = await assignGasOptions({
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

	const warnings = [];
	if (!skipOwnership) {
		console.log(gray('Looking for contracts whose ownership we should accept'));
		// prevent dupes if some contracts are in there twice (looking at you ProxyERC20 and ProxyERC20sUSD)
		const appendedOwnerCache = {};
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
				console.log(gray(`${newOwner} is already the owner of ${contract} ${address}`));
			} else if (nominatedOwner === newOwner.toLowerCase()) {
				const encodedData = deployedContract.interface.encodeFunctionData('acceptOwnership', []);

				if (address in appendedOwnerCache) {
					console.log(gray('Skipping as this action is already in the batch'));
					continue;
				} else {
					appendedOwnerCache[address] = true;
				}

				if (safeBatchSubmitter && !useFork) {
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
				} else if (relayers) {
					// Relayer
					console.log(
						gray('Adding'),
						yellow(`${contract}.acceptOwnership()`),
						gray('to the relayer actions')
					);
					relayers.actions.push({ target: address, data: encodedData });
				} else {
					try {
						await confirmOrEnd(
							gray(`Confirm: Submit`, yellow(`${contract}.acceptOwnership()`), `?`)
						);

						const params = await assignGasOptions({
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
	}

	if (safeBatchSubmitter) {
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
	} else if (relayers) {
		const { l1Provider, actions, OwnerRelayOnEthereum, l1Signer, l1Owner } = relayers;

		// Load the equivalent L1 safe
		const safeBatchSubmitter = await safeInitializer({
			network,
			signer: l1Signer,
			safeAddress: l1Owner,
		});

		if (!safeBatchSubmitter) {
			console.log('The L1 owner for this relayer is NOT a safe, proceeding directly');
			// await OwnerRelayOnEthereum.connect(l1Signer);
		}

		// This is the batch of transactions to relay at a time to L2, it's based on the
		// number of transactions that can be done on a single L2 transaction and fit within the
		// crossDomainMessageGasLimit for type "Relay" (4)
		const batchSize = 20;

		for (let i = 0; i < actions.length; i += batchSize) {
			const batchActions = actions.slice(i, i + batchSize);
			const batchData = OwnerRelayOnEthereum.interface.encodeFunctionData('initiateRelayBatch', [
				batchActions.map(({ target }) => target),
				batchActions.map(({ data }) => data),
				ethers.BigNumber.from('0'),
			]);
			if (safeBatchSubmitter) {
				await safeBatchSubmitter.appendTransaction({
					to: OwnerRelayOnEthereum.address,
					data: batchData,
				});
			} else {
				try {
					await confirmOrEnd(
						gray(`Confirm: Submit relay batch of`, yellow(batchActions.length), `transactions?`)
					);

					console.log(gray('Performing action directly'));

					const params = await assignGasOptions({
						tx: {
							to: OwnerRelayOnEthereum.address,
							data: batchData,
						},
						provider: l1Provider,
						maxFeePerGas,
						maxPriorityFeePerGas,
					});

					const tx = await l1Signer.sendTransaction(params);

					const receipt = await tx.wait();

					logTx(receipt);
				} catch (err) {
					throw Error(`Transaction failed to submit.\n${err}`);
				}
			}
		}

		if (safeBatchSubmitter) {
			const { nonce } = await safeBatchSubmitter.submit();

			console.log(
				gray(
					'Submitted a batch of',
					yellow(Math.ceil(actions.length / batchSize)),
					'transactions to the safe',
					yellow(l1Owner),
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
			.option('-s, --skip-ownership', 'Skip ownership checks.')
			.option('-y, --yes', 'Dont prompt, just reply yes.')
			.option('-z, --use-ovm', 'Target deployment for the OVM (Optimism).')
			.option(
				'-p, --provider-url <value>',
				'Ethereum network provider URL. If default, will use PROVIDER_URL found in the .env file.'
			)
			.action(owner),
};
