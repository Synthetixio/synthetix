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

const DEFAULTS = {
	gasPrice: '15',
	gasLimit: 2e5, // 200,000
};

const owner = async ({
	network,
	newOwner,
	deploymentPath,
	gasPrice = DEFAULTS.gasPrice,
	gasLimit = DEFAULTS.gasLimit,
	privateKey,
	yes,
	useOvm,
	useFork,
	providerUrl,
	isContract,
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
		process.exit(1);
	} else {
		newOwner = newOwner.toLowerCase();
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

	if (!privateKey) {
		privateKey = envPrivateKey;
	}

	const provider = new ethers.providers.JsonRpcProvider(providerUrl);

	if (!isContract && !yes) {
		try {
			await confirmAction(
				yellow(
					'\nHeads up! You are about to set ownership to an EOA (externally owned address), i.e. not a multisig or a DAO. Are you sure? (y/n) '
				)
			);
		} catch (err) {
			console.log(gray('Operation cancelled'));
			process.exit();
		}
	}

	const wallet = new ethers.Wallet(privateKey, provider);
	console.log(gray(`Using account with public key ${wallet.address}`));

	if (!isContract && wallet.address.toLowerCase() !== newOwner.toLowerCase()) {
		throw new Error(
			`New owner is ${newOwner} and signer is ${wallet.address}. The signer needs to be the new owner in order to be able to claim ownership and/or execute owner actions.`
		);
	}

	console.log(gray(`Gas Price: ${gasPrice} gwei`));

	let lastNonce;
	let protocolDaoContract;
	let currentSafeNonce;
	if (isContract) {
		// new owner should be gnosis safe proxy address
		protocolDaoContract = getSafeInstance({ provider, safeAddress: newOwner });

		// get protocolDAO nonce
		currentSafeNonce = await getSafeNonce(protocolDaoContract);

		if (!currentSafeNonce) {
			console.log(gray('Cannot access safe. Exiting.'));
			process.exit();
		}

		console.log(yellow(`Using Protocol DAO Safe contract at ${protocolDaoContract.address}`));
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
								isContract ? 'stage' : 'submit'
							} transaction, or enter "n" to cancel and resume this later? (y/n) `
						)
				);
			}
		} catch (err) {
			console.log(gray('Operation cancelled'));
			process.exit();
		}
	};

	let stagedTransactions;
	if (isContract) {
		// Load staged transactions
		stagedTransactions = await getSafeTransactions({
			network,
			safeAddress: protocolDaoContract.address,
		});
	}

	console.log(
		gray('Running through operations during deployment that couldnt complete as not owner.')
	);
	// Read owner-actions.json + encoded data to stage tx's
	for (const [key, entry] of Object.entries(ownerActions)) {
		const { target, data, complete } = entry;
		if (complete) continue;

		let existingTx;
		if (isContract) {
			existingTx = checkExistingPendingTx({
				stagedTransactions,
				target,
				encodedData: data,
				currentSafeNonce,
			});

			if (existingTx) continue;
		}

		await confirmOrEnd(yellow('Confirm: ') + `Stage ${bgYellow(black(key))} to (${target})`);

		try {
			if (isContract) {
				const { txHash, newNonce } = await getNewTransactionHash({
					safeContract: protocolDaoContract,
					data,
					to: target,
					sender: wallet.address,
					network,
					lastNonce,
				});

				// sign txHash to get signature
				const sig = await getSafeSignature({
					privateKey,
					providerUrl,
					contractTxHash: txHash,
				});

				// save transaction and signature to Gnosis Safe API
				await saveTransactionToApi({
					safeContract: protocolDaoContract,
					network,
					data,
					nonce: newNonce,
					to: target,
					sender: wallet.address,
					transactionHash: txHash,
					signature: sig,
				});

				// track lastNonce submitted
				lastNonce = newNonce;
			} else {
				const params = {
					to: target,
					gasPrice: ethers.utils.parseUnits(gasPrice, 'gwei'),
					data,
				};
				if (gasLimit) {
					params.gasLimit = ethers.BigNumber.from(gasLimit);
				}

				const tx = await wallet.sendTransaction(params);
				const receipt = await tx.wait();

				logTx(receipt);
			}

			entry.complete = true;
			fs.writeFileSync(ownerActionsFile, stringify(ownerActions));
		} catch (err) {
			console.log(
				gray(`Transaction failed, if sending txn to safe api failed retry manually - ${err}`)
			);
			return;
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

		if (currentOwner === newOwner) {
			console.log(gray(`${newOwner} is already the owner of ${contract}`));
		} else if (nominatedOwner === newOwner) {
			const encodedData = deployedContract.interface.encodeFunctionData('acceptOwnership', []);

			if (isContract) {
				// Check if similar one already staged and pending
				const existingTx = checkExistingPendingTx({
					stagedTransactions,
					target: address,
					encodedData,
					currentSafeNonce,
				});

				if (existingTx) continue;
			}

			// continue if no pending tx found
			await confirmOrEnd(yellow(`Confirm: ${contract}.acceptOwnership()?`));

			if (isContract) console.log(yellow(`Attempting action protocolDaoContract.approveHash()`));
			else console.log(yellow(`Calling acceptOwnership() on ${contract}...`));

			try {
				if (isContract && !useFork) {
					const { txHash, newNonce } = await getNewTransactionHash({
						safeContract: protocolDaoContract,
						data: encodedData,
						to: address,
						sender: wallet.address,
						network,
						lastNonce,
					});

					// sign txHash to get signature
					const sig = await getSafeSignature({
						privateKey,
						providerUrl,
						contractTxHash: txHash,
					});

					// save transaction and signature to Gnosis Safe API
					await saveTransactionToApi({
						safeContract: protocolDaoContract,
						network,
						data: encodedData,
						nonce: newNonce,
						to: address,
						sender: wallet.address,
						transactionHash: txHash,
						signature: sig,
					});

					// track lastNonce submitted
					lastNonce = newNonce;
				} else {
					const params = {
						to: address,
						gasPrice: ethers.utils.parseUnits(gasPrice, 'gwei'),
						data: encodedData,
					};
					if (gasLimit) {
						params.gasLimit = ethers.BigNumber.from(gasLimit);
					}

					const tx = await wallet.sendTransaction(params);
					const receipt = await tx.wait();

					logTx(receipt);
				}
			} catch (err) {
				console.log(
					gray(`Transaction failed, if sending txn to safe api failed retry manually - ${err}`)
				);
				return;
			}
		} else {
			console.log(
				cyan(
					`Cannot acceptOwnership on ${contract} as nominatedOwner: ${nominatedOwner} isn't the newOwner ${newOwner} you specified. Have you run the nominate command yet?`
				)
			);
		}
	}
	if (warnings.length) {
		console.log(yellow('\nThere were some issues nominating owner\n'));
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
			.option(
				'-k, --use-fork',
				'Perform the deployment on a forked chain running on localhost (see fork command).',
				false
			)
			.option('--is-contract', 'Wether the new owner is a contract wallet or an EOA', false)
			.option('-v, --private-key [value]', 'The private key of wallet to stage with.')
			.option('-g, --gas-price <value>', 'Gas price in GWEI', DEFAULTS.gasPrice)
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
