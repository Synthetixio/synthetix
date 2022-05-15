'use strict';

const fs = require('fs');

const async = require('async');

const ethers = require('ethers');

const { gray, green } = require('chalk');

const {
	ensureDeploymentPath,
	ensureNetwork,
	getDeploymentPathForNetwork,
	loadConnections,
	loadAndCheckRequiredSources,
} = require('../util');

const { performTransactionalStep } = require('../command-utils/transact');

const { getUsers } = require('../../..');

const initiateLiquidatorRewards = async ({
	network,
	deploymentPath,
	privateKey,
	useOvm,
	useFork,
	providerUrl,
	etherscanAddressCsv,
}) => {
	ensureNetwork(network);
	deploymentPath = deploymentPath || getDeploymentPathForNetwork({ network, useOvm });
	ensureDeploymentPath(deploymentPath);

	const { providerUrl: envProviderUrl, privateKey: envPrivateKey } = loadConnections({
		network,
		useFork,
		useOvm,
	});

	const { deployment, ownerActions, ownerActionsFile } = loadAndCheckRequiredSources({
		deploymentPath,
		network,
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

	const { address: liquidatorRewardsAddress } = deployment.targets['LiquidatorRewards'];
	const { abi: liquidatorRewardsABI } = deployment.sources[
		deployment.targets['LiquidatorRewards'].source
	];
	const LiquidatorRewards = new ethers.Contract(
		liquidatorRewardsAddress,
		liquidatorRewardsABI,
		signer
	);

	// get a list of addresses
	const addrs = fs.readFileSync(etherscanAddressCsv).toString('utf8');

	const lines = addrs.split('\n');

	const addresses = [];

	await async.eachOfLimit(lines, 50, async (line, i) => {
		if (line === '') return;

		const address = JSON.parse(line.split(',')[0]);

		if (i % 100 === 0) {
			console.log('scanning address', i, 'of', lines.length);
		}

		try {
			await performTransactionalStep({
				contract: 'LiquidatorRewards',
				// encodeABI: network === 'mainnet',
				// maxFeePerGas,
				// maxPriorityFeePerGas:  //ethers.utils.parseUnits('5', 'gwei'),
				ownerActions,
				ownerActionsFile,
				signer,
				target: LiquidatorRewards,
				write: 'updateEntry',
				writeArg: [address],
			});
		} catch (err) {
			console.log('had error for address', address, err);
		}
	});

	console.log('updated entries for ', addresses.length, 'addresses');
	console.log(green('Completed successfully'));
};

module.exports = {
	initiateLiquidatorRewards,
	cmd: program =>
		program
			.command('initiate-liquidator-rewards')
			.description('Initialize entries for liquidator rewards')
			.option('-g, --max-fee-per-gas <value>', 'Maximum base gas fee price in GWEI')
			.option('--max-priority-fee-per-gas <value>', 'Priority gas fee price in GWEI', '2')
			.option('-n, --network <value>', 'The network to run off.', x => x.toLowerCase(), 'kovan')
			.option(
				'-k, --use-fork',
				'Perform the deployment on a forked chain running on localhost (see fork command).',
				false
			)
			.option('-y, --yes', 'Dont prompt, just reply yes.')
			.option('-z, --use-ovm', 'Target deployment for the OVM (Optimism).')
			.option(
				'-p, --provider-url <value>',
				'Ethereum network provider URL. If default, will use PROVIDER_URL found in the .env file.'
			)
			.option('--etherscan-address-csv <file>', 'CSV of all addresses to scan', 'snx-addrs.csv')
			.action(initiateLiquidatorRewards),
};
