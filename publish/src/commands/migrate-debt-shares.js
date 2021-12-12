'use strict';

const fs = require('fs');

const async = require('async');

const ethers = require('ethers');

const { gray, green } = require('chalk');

//const { getUsers } = require('../..');
const {
	ensureDeploymentPath,
	ensureNetwork,
	getDeploymentPathForNetwork,
	loadConnections,
	loadAndCheckRequiredSources,
} = require('../util');

const migrateDebtShares = async ({
	network,
	deploymentPath,
	privateKey,
	useOvm,
	useFork,
	maxFeePerGas,
	maxPriorityFeePerGas,
	providerUrl,
	etherscanAddressCsv,
	batchSize
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

	// get synthetix system contract
	const { address: synthetixAddress, source } = deployment.targets['Synthetix'];
	const { abi: synthetixABI } = deployment.sources[source];
	const Synthetix = new ethers.Contract(synthetixAddress, synthetixABI, provider);

	// get a list of addresses
	const addrs = fs.readFileSync(etherscanAddressCsv).toString('utf8');

	const lines = addrs.split('\n');

	const addressCollateralAmounts = [];

	const sUSD = ethers.utils.formatBytes32String('sUSD');

	await async.eachOfLimit(lines.slice(1, 5000), 30, async (line, i) => {
		if (line === '') return;

		const address = JSON.parse(line.split(',')[0]);

		if (i % 1000 === 0) {
			console.log('scanning address', i, 'of', lines.length);
		}

		try {

			const debtBalanceOf = await  Synthetix.debtBalanceOf(address, sUSD);
	
			if (debtBalanceOf.gt(0)) {
				//console.log('adding address', address, 'with debt', debtBalanceOf.toString());
				addressCollateralAmounts.push({ address, debtBalanceOf });
			}
		} catch(err) {
			console.log('had error for address', address, err);
		}

	});

	/*for(const line of lines.slice(1)) {
	}*/

	console.log('recorded', addressCollateralAmounts.length, 'addresses with debt');

	for (const i = 0;i < addressCollateralAmounts.length;i += batchSize) {

		const batch = addressCollateralAmounts.slice(i, i + batchSize);

		const addrs = batch.map(a => a.address);
		const amounts = batch.map(a => a.amount);

		await performTransactionalStep({
			SynthetixDebtShare,
			encodeABI: network === 'mainnet',
			maxFeePerGas,
			maxPriorityFeePerGas,
			ownerActions,
			ownerActionsFile,
			signer,
			target: SynthetixDebtShare,
			write: 'importAddresses',
			writeArg: [addrs, amounts], // explicitly pass array of args so array not splat as params
		});

		console.log('wrote action for import of addresses', i, 'through', i + batchSize);
	}

	console.log(green('Completed successfully'));
};

module.exports = {
	migrateDebtShares,
	cmd: program =>
		program
			.command('migrate-debt-shares')
			.description(
				'Migrate to Debt Shares from debtLedger'
			)
            .option('-g, --max-fee-per-gas <value>', 'Maximum base gas fee price in GWEI')
			.option('--max-priority-fee-per-gas <value>', 'Priority gas fee price in GWEI', '2')
			.option('-n, --network <value>', 'The network to run off.', x => x.toLowerCase(), 'kovan')
			.option('-y, --yes', 'Dont prompt, just reply yes.')
			.option('-z, --use-ovm', 'Target deployment for the OVM (Optimism).')
			.option(
				'-p, --provider-url <value>',
				'Ethereum network provider URL. If default, will use PROVIDER_URL found in the .env file.'
			)
            .option('--etherscan-address-csv <file>', 'CSV of all addresses to scan', 'snx-addrs.csv')
			.option('--batch-size', 'Number of addresses per import transaction', 500)
			.action(migrateDebtShares),
};
