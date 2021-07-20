'use strict';

const ethers = require('ethers');
const { gray, yellow, red, cyan } = require('chalk');

const {
	constants: { CONFIG_FILENAME, DEPLOYMENT_FILENAME },
} = require('../../..');

const {
	ensureNetwork,
	ensureDeploymentPath,
	getDeploymentPathForNetwork,
	loadAndCheckRequiredSources,
	loadConnections,
	confirmAction,
} = require('../util');

const DEFAULTS = {
	gasPrice: '15',
};

const acceptRelayOwner = async ({
	network,
	deploymentPath,
	gasPrice,
	yes,
	useOvm,
	useFork,
	providerUrl,
}) => {
	ensureNetwork(network);
	deploymentPath = deploymentPath || getDeploymentPathForNetwork({ network, useOvm });
	ensureDeploymentPath(deploymentPath);

	function logTx(tx) {
		console.log(gray(`  > tx hash: ${tx.transactionHash}`));
	}

	if (!useOvm) {
		console.error(red('Only runnable in ovm'));
		process.exit(1);
	}

	// ensure all nominated owners are accepted
	const { config, deployment } = loadAndCheckRequiredSources({
		deploymentPath,
		network,
	});

	const { providerUrl: envProviderUrl } = loadConnections({
		network,
		useFork,
	});

	if (!providerUrl) {
		if (!envProviderUrl) {
			throw new Error('Missing .env key of PROVIDER_URL. Please add and retry.');
		}

		providerUrl = envProviderUrl;
	}

	const provider = new ethers.providers.JsonRpcProvider(providerUrl);

	const wallet = provider.getSigner();
	console.log(gray(`Using account with public key ${await wallet.getAddress()}`));

	console.log(gray(`Gas Price: ${gasPrice} gwei`));

	// Get OwnerRelayOnOptimism contract and connect to wallet
	const { address: relayAddress, source: relaySource } = deployment.targets['OwnerRelayOnOptimism'];
	let OwnerRelayOnOptimism = new ethers.Contract(
		relayAddress,
		deployment.sources[relaySource],
		provider
	);
	OwnerRelayOnOptimism = OwnerRelayOnOptimism.connect(wallet);

	try {
		await confirmAction(
			yellow(
				`\nHeads up! You are about to set ownership to OwnerRelayOnOptimism on ${relayAddress}. Are you sure? (y/n) `
			)
		);
	} catch (err) {
		console.log(gray('Operation cancelled'));
		process.exit();
	}

	const confirmOrEnd = async message => {
		try {
			if (yes) {
				console.log(message);
			} else {
				await confirmAction(
					message +
						cyan(
							'\nPlease type "y" to submit transaction, or enter "n" to cancel and resume this later? (y/n)'
						)
				);
			}
		} catch (err) {
			console.log(gray('Operation cancelled'));
			process.exit();
		}
	};

	console.log(gray('Looking for contracts whose ownership we should accept'));
	for (const contract of Object.keys(config)) {
		const { address, source } = deployment.targets[contract];
		const { abi } = deployment.sources[source];
		const deployedContract = new ethers.Contract(address, abi, provider);

		// ignore contracts that don't support Owned
		if (!deployedContract.functions.owner) {
			continue;
		}
		const currentOwner = (await deployedContract.owner()).toLowerCase();
		const nominatedOwner = (await deployedContract.nominatedOwner()).toLowerCase();

		if (currentOwner === relayAddress) {
			console.log(gray(`${relayAddress} is already the owner of ${contract}`));
		} else if (nominatedOwner === relayAddress) {
			// continue if no pending tx found
			await confirmOrEnd(yellow(`Confirm: Accept ownership on ${contract}?`));

			console.log(yellow(`Accepting ownership on ${contract}...`));

			try {
				const tx = await OwnerRelayOnOptimism.acceptOwnershipOn(address, {
					gasLimit: undefined, // Only run on optimism
					gasPrice: ethers.utils.parseUnits(gasPrice, 'gwei'),
				});
				const receipt = await tx.wait();
				logTx(receipt);
			} catch (err) {
				console.log(gray(`Transaction failed - ${err}`));
				return;
			}
		} else {
			console.log(
				cyan(
					`Cannot acceptOwnership on ${contract} as nominatedOwner: ${nominatedOwner} isn't the OwnerRelayOnOptimism ${relayAddress}. Have you run the nominate command yet?`
				)
			);
		}
	}
};

module.exports = {
	acceptRelayOwner,
	cmd: program =>
		program
			.command('accept-relay-owner')
			.description(
				'Accept-relay-owner script - accept ownership by OwnerRelayOnOptimism of nominated contracts.'
			)
			.option(
				'-d, --deployment-path <value>',
				`Path to a folder that has your input configuration file ${CONFIG_FILENAME} and where your ${DEPLOYMENT_FILENAME} files will go`
			)
			.option(
				'-k, --use-fork',
				'Perform the deployment on a forked chain running on localhost (see fork command).',
				false
			)
			.option('-g, --gas-price <value>', 'Gas price in GWEI', DEFAULTS.gasPrice)
			.option('-n, --network <value>', 'The network to run off.', x => x.toLowerCase(), 'kovan')
			.option('-y, --yes', 'Dont prompt, just reply yes.')
			.option('-z, --use-ovm', 'Target deployment for the OVM (Optimism).')
			.option(
				'-p, --provider-url <value>',
				'Ethereum network provider URL. If default, will use PROVIDER_URL found in the .env file.'
			)
			.action(acceptRelayOwner),
};
