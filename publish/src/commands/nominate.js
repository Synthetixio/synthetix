'use strict';

const { gray, yellow, red, cyan } = require('chalk');
const w3utils = require('web3-utils');
const Web3 = require('web3');

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

const nominate = async ({
	network,
	newOwner,
	contracts,
	useFork = false,
	deploymentPath,
	gasPrice,
	gasLimit,
	useOvm,
	providerUrl,
}) => {
	ensureNetwork(network);
	deploymentPath = deploymentPath || getDeploymentPathForNetwork({ network, useOvm });
	ensureDeploymentPath(deploymentPath);

	if (!newOwner) {
		newOwner = getUsers({ network, useOvm, user: 'owner' }).address;
	}

	if (!newOwner || !w3utils.isAddress(newOwner)) {
		console.error(red('Invalid new owner to nominate. Please check the option and try again.'));
		process.exit(1);
	} else {
		newOwner = newOwner.toLowerCase();
	}

	const { config, deployment } = loadAndCheckRequiredSources({
		deploymentPath,
		network,
	});

	contracts.forEach(contract => {
		if (!(contract in config)) {
			console.error(red(`Contract ${contract} isn't in the config for this deployment!`));
			process.exit(1);
		}
	});
	if (!contracts.length) {
		// if contracts not supplied, use all contracts except the DappMaintenance (UI control)
		contracts = Object.keys(config).filter(contract => contract !== 'DappMaintenance');
	}

	const { providerUrl: envProviderUrl, privateKey } = loadConnections({
		network,
		useFork,
	});

	if (!providerUrl) {
		if (!envProviderUrl) {
			throw new Error('Missing .env key of PROVIDER_URL. Please add and retry.');
		}

		providerUrl = envProviderUrl;
	}

	const web3 = new Web3(new Web3.providers.HttpProvider(providerUrl));
	web3.eth.accounts.wallet.add(privateKey);
	const account = web3.eth.accounts.wallet[0].address;
	console.log(gray(`Using account with public key ${account}`));

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

	for (const contract of contracts) {
		const { address, source } = deployment.targets[contract];
		const { abi } = deployment.sources[source];
		const deployedContract = new web3.eth.Contract(abi, address);

		// ignore contracts that don't support Owned
		if (!deployedContract.methods.owner) {
			continue;
		}

		const currentOwner = (await deployedContract.methods.owner().call()).toLowerCase();
		const nominatedOwner = (await deployedContract.methods.nominatedOwner().call()).toLowerCase();

		console.log(
			gray(
				`${contract} current owner is ${currentOwner}.\nCurrent nominated owner is ${nominatedOwner}.`
			)
		);
		if (account.toLowerCase() !== currentOwner) {
			console.log(cyan(`Cannot nominateNewOwner for ${contract} as you aren't the owner!`));
		} else if (currentOwner !== newOwner && nominatedOwner !== newOwner) {
			console.log(yellow(`Invoking ${contract}.nominateNewOwner(${newOwner})`));
			await deployedContract.methods.nominateNewOwner(newOwner).send({
				from: account,
				gas: gasLimit,
				gasPrice: w3utils.toWei(gasPrice, 'gwei'),
			});
		} else {
			console.log(gray('No change required.'));
		}
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
