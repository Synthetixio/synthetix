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
	threshold,
	batchSize,
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
	const { address: synthetixAddress } = deployment.targets['ProxySynthetix'];
	const { abi: synthetixABI } = deployment.sources[deployment.targets['Synthetix'].source];
	const Synthetix = new ethers.Contract(synthetixAddress, synthetixABI, provider);

	const { address: debtSharesAddress } = deployment.targets['SynthetixDebtShare'];
	const { abi: debtSharesABI } = deployment.sources[
		deployment.targets['SynthetixDebtShare'].source
	];
	const SynthetixDebtShare = new ethers.Contract(debtSharesAddress, debtSharesABI, signer);

	// get a list of addresses
	const addrs = fs.readFileSync(etherscanAddressCsv).toString('utf8');

	const lines = addrs.split('\n');

	const addressCollateralAmounts = [];

	const sUSD = ethers.utils.formatBytes32String('sUSD');

	let totalDebtAccounted = ethers.BigNumber.from(0);
	let totalDebtForgiven = ethers.BigNumber.from(0);

	await async.eachOfLimit(lines, 50, async (line, i) => {
		if (line === '') return;

		const address = line.split(',')[1];

		if (i % 100 === 0) {
			console.log('scanning address', i, 'of', lines.length);
		}

		try {
			const debtBalanceOf = await Synthetix.debtBalanceOf(address, sUSD);

			if (debtBalanceOf.gt(ethers.utils.parseEther(threshold))) {
				addressCollateralAmounts.push({ address, debtBalanceOf });
				totalDebtAccounted = totalDebtAccounted.add(debtBalanceOf);
			} else {
				totalDebtForgiven = totalDebtForgiven.add(debtBalanceOf);
			}
		} catch (err) {
			console.log('had error for address', address, err);
		}
	});

	console.log(
		'recorded',
		addressCollateralAmounts.length,
		'addresses with debt totalling',
		ethers.utils.formatEther(totalDebtAccounted),
		'forgiving',
		ethers.utils.formatEther(totalDebtForgiven)
	);

	for (let i = 0; i < addressCollateralAmounts.length; i += batchSize) {
		const batch = addressCollateralAmounts.slice(i, i + batchSize);

		const addrs = batch.map(a => a.address);
		const amounts = batch.map(a => a.debtBalanceOf);

		console.log('write action for import of addresses', i, 'through', i + batchSize);

		await performTransactionalStep({
			contract: 'SynthetixDebtShare',
			// encodeABI: network === 'mainnet',
			// maxFeePerGas,
			// maxPriorityFeePerGas:  //ethers.utils.parseUnits('5', 'gwei'),
			ownerActions,
			ownerActionsFile,
			signer,
			target: SynthetixDebtShare,
			write: 'importAddresses',
			writeArg: [addrs, amounts], // explicitly pass array of args so array not splat as params
		});
	}

	console.log(green('Completed successfully'));
};

module.exports = {
	migrateDebtShares,
	cmd: program =>
		program
			.command('migrate-debt-shares')
			.description('Migrate to Debt Shares from debtLedger')
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
			.option(
				'--threshold <amount>',
				'Forgive debt amounts for holders who have less than the given threshold of debt',
				'0'
			)
			.option('--batch-size <value>', 'Number of addresses per import transaction', 200)
			.action(migrateDebtShares),
};
