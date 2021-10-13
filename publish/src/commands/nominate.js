'use strict';

const ethers = require('ethers');
const { gray, yellow, cyan } = require('chalk');

const {
	getUsers,
	constants: { CONFIG_FILENAME, DEPLOYMENT_FILENAME },
} = require('../../..');

const {
	ensureNetwork,
	getDeploymentPathForNetwork,
	ensureDeploymentPath,
	loadAndCheckRequiredSources,
	loadConnections,
	confirmAction,
} = require('../util');

const { performTransactionalStep } = require('../command-utils/transact');

const DEFAULTS = {
	gasPrice: '15',
	gasLimit: 2e5, // 200,000
};

const nominate = async ({
	network,
	newOwner,
	contracts,
	useFork = false,
	deploymentPath,
	gasPrice = DEFAULTS.gasPrice,
	gasLimit = DEFAULTS.gasLimit,
	useOvm,
	privateKey,
	providerUrl,
	yes,
}) => {
	ensureNetwork(network);
	deploymentPath = deploymentPath || getDeploymentPathForNetwork({ network, useOvm });
	ensureDeploymentPath(deploymentPath);

	if (!newOwner) {
		newOwner = getUsers({ network, useOvm, user: 'owner' }).address;
	}

	if (!newOwner || !ethers.utils.isAddress(newOwner)) {
		throw Error('Invalid new owner to nominate. Please check the option and try again.');
	} else {
		newOwner = newOwner.toLowerCase();
	}

	const { config, deployment, ownerActions, ownerActionsFile } = loadAndCheckRequiredSources({
		deploymentPath,
		network,
	});

	contracts.forEach(contract => {
		if (!(contract in config)) {
			throw Error(`Contract ${contract} isn't in the config for this deployment!`);
		}
	});
	if (!contracts.length) {
		// if contracts not supplied, use all contracts except the DappMaintenance (UI control)
		contracts = Object.keys(config).filter(contract => contract !== 'DappMaintenance');
	}

	const {
		providerUrl: envProviderUrl,
		privateKey: envPrivateKey,
		explorerLinkPrefix,
	} = loadConnections({
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
	let wallet;
	if (!privateKey) {
		const account = getUsers({ network, user: 'owner' }).address; // protocolDAO
		wallet = provider.getSigner(account);
		wallet.address = await wallet.getAddress();
	} else {
		wallet = new ethers.Wallet(privateKey, provider);
	}

	const signerAddress = wallet.address;

	console.log(gray(`Using account with public key ${signerAddress}`));

	if (!yes) {
		try {
			await confirmAction(
				cyan(
					`${yellow(
						'WARNING'
					)}: This action will nominate ${newOwner} as the owner in ${network} of the following contracts:\n- ${contracts.join(
						'\n- '
					)}`
				) + '\nDo you want to continue? (y/n) '
			);
		} catch (err) {
			console.log(gray('Operation cancelled'));
			process.exit();
		}
	}

	const warnings = [];
	for (const contract of contracts) {
		if (!deployment.targets[contract]) {
			const msg = yellow(`WARNING: contract ${contract} not found in deployment file`);
			console.log(msg);
			warnings.push(msg);
			continue;
		}
		const { address, source } = deployment.targets[contract];
		const { abi } = deployment.sources[source];
		const deployedContract = new ethers.Contract(address, abi, wallet);

		// ignore contracts that don't support Owned
		if (!deployedContract.functions.owner) {
			continue;
		}

		const currentOwner = (await deployedContract.owner()).toLowerCase();
		const nominatedOwner = (await deployedContract.nominatedOwner()).toLowerCase();

		console.log(
			gray(
				`${yellow(contract)} current owner is ${yellow(
					currentOwner
				)}.\nCurrent nominated owner is ${yellow(nominatedOwner)}.`
			)
		);
		if (currentOwner !== newOwner && nominatedOwner !== newOwner) {
			// check for legacy function
			const nominationFnc =
				'nominateOwner' in deployedContract ? 'nominateOwner' : 'nominateNewOwner';

			await performTransactionalStep({
				contract,
				encodeABI: network === 'mainnet',
				explorerLinkPrefix,
				gasLimit,
				gasPrice,
				ownerActions,
				ownerActionsFile,
				signer: wallet,
				target: address,
				write: nominationFnc,
				writeArg: newOwner, // explicitly pass array of args so array not splat as params
			});
		} else {
			console.log(gray('No change required.'));
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
	nominate,
	cmd: program =>
		program
			.command('nominate')
			.description('Nominate a new owner for one or more contracts')
			.option(
				'-d, --deployment-path <value>',
				`Path to a folder that has your input configuration file ${CONFIG_FILENAME} and where your ${DEPLOYMENT_FILENAME} files will go`
			)
			.option('-g, --gas-price <value>', 'Gas price in GWEI', '1')
			.option(
				'-k, --use-fork',
				'Perform the deployment on a forked chain running on localhost (see fork command).',
				false
			)
			.option('-l, --gas-limit <value>', 'Gas limit', parseInt, 15e4)
			.option('-n, --network <value>', 'The network to run off.', x => x.toLowerCase(), 'kovan')
			.option(
				'-o, --new-owner <value>',
				'The address of the new owner (please include the 0x prefix)'
			)
			.option('-z, --use-ovm', 'Target deployment for the OVM (Optimism).')
			.option(
				'-p, --provider-url <value>',
				'Ethereum network provider URL. If default, will use PROVIDER_URL found in the .env file.'
			)
			.option(
				'-v, --private-key [value]',
				'The private key to deploy with (only works in local mode, otherwise set in .env).'
			)
			.option('-y, --yes', 'Dont prompt, just reply yes.')
			.option(
				'-c, --contracts [value]',
				'The list of contracts. Applies to all contract by default',
				(val, memo) => {
					memo.push(val);
					return memo;
				},
				[]
			)
			.action(nominate),
};
