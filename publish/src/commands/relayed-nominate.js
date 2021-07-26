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

const relayedNominate = async ({
	l1Network,
	l2Network,
	l1DeploymentPath,
	l2DeploymentPath,
	l1ProviderUrl,
	l2ProviderUrl,
	l1PrivateKey,
	newOwner,
	contracts,
	gasPrice,
	gasLimit,
	yes,
}) => {
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

	// @TODO: get network provider urls using loadConnections method
	// (but right now this would break the posibility of setting a custom network for L2 on manual tests)
	//
	// const { providerUrl: envProviderUrl, privateKey: envPrivateKey } = loadConnections({
	// 	network,
	// 	useFork,
	// });

	// if (!providerUrl) {
	// 	if (!envProviderUrl) {
	// 		throw new Error('Missing .env key of PROVIDER_URL. Please add and retry.');
	// 	}

	// 	providerUrl = envProviderUrl;
	// }

	// // if not specified, or in a local network, override the private key passed as a CLI option, with the one specified in .env
	// if (network !== 'local' && !privateKey && !useFork) {
	// 	privateKey = envPrivateKey;
	// }

	const { config: l2Config, deployment: l2Deployment } = loadAndCheckRequiredSources({
		deploymentPath: l2DeploymentPath,
		network: l2Network,
	});

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

	const contractsToNominate = [];

	const l2Provider = new ethers.providers.JsonRpcProvider(l2ProviderUrl);

	for (const contract of contracts) {
		const { address, source } = l2Deployment.targets[contract];
		const { abi } = l2Deployment.sources[source];
		const deployedContract = new ethers.Contract(address, abi, l2Provider);

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

	const l1Provider = new ethers.providers.JsonRpcProvider(l1ProviderUrl);

	let l1Wallet;
	if (!l1PrivateKey) {
		const account = getUsers({ network: l1Network, user: 'owner' }).address; // protocolDAO
		l1Wallet = l1Provider.getSigner(account);
		l1Wallet.address = await l1Wallet.getAddress();
	} else {
		l1Wallet = new ethers.Wallet(l1PrivateKey, l1Provider);
	}

	const { deployment: l1Deployment } = loadAndCheckRequiredSources({
		deploymentPath: l1DeploymentPath,
		network: l1Network,
	});

	const getL1Contract = contract => {
		const { address, source } = l1Deployment.targets[contract];
		const { abi } = l1Deployment.sources[source];
		return new ethers.Contract(address, abi, l1Wallet);
	};

	const OwnerRelayOnEthereum = getL1Contract('OwnerRelayOnEthereum');

	const relayOwner = await OwnerRelayOnEthereum.owner().then(o => o.toLowerCase());

	if (relayOwner !== l1Wallet.address) {
		console.log(red('The given L1 wallet is not owner of the OwnerRelayOnEthereum contract'));
		process.exit(1);
	}

	const overrides = {
		gasLimit,
		gasPrice: ethers.utils.parseUnits(gasPrice, 'gwei'),
	};

	for (const contractData of contracts) {
		const { contract, address, calldata } = contractData;
		console.log(yellow(`Nominating owner on ${contract}...`));

		const tx = await OwnerRelayOnEthereum.initiateRelay(address, calldata, overrides);
		await tx.wait();
	}
};

module.exports = {
	relayedNominate,
	cmd: program =>
		program
			.command('relayed-nominate')
			.description('Nominate a new owner for one or more contracts, realyed from L1 to L2')
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
			.option('--l2-provider-url <value>', 'Ethereum network provider URL.')
			.option('--l1-private-key [value]', 'The private key to execute the commnad with on L1.')
			.option('-g, --gas-price <value>', 'Gas price in GWEI', '1')
			.option('-l, --gas-limit <value>', 'Gas limit', parseInt, 15e4)
			.option(
				'-o, --new-owner <value>',
				'The address of the new owner (please include the 0x prefix)'
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
			.action(relayedNominate),
};
