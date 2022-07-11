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

const { getUsers } = require('../../..');

const checkSettlmentOwing = async ({
	network,
	deploymentPath,
	privateKey,
	useOvm,
	useFork,
	providerUrl,
	csv,
	threshold,
}) => {
	ensureNetwork(network);
	deploymentPath = deploymentPath || getDeploymentPathForNetwork({ network, useOvm });
	ensureDeploymentPath(deploymentPath);

	const { providerUrl: envProviderUrl, privateKey: envPrivateKey } = loadConnections({
		network,
		useFork,
		useOvm,
	});

	const { deployment } = loadAndCheckRequiredSources({
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

	// Instantiate Exchanger contract
	const { address: exchangerAddress } = deployment.targets['Exchanger'];
	const { abi: exchangerABI } = deployment.sources[deployment.targets['Exchanger'].source];
	const Exchanger = new ethers.Contract(exchangerAddress, exchangerABI, signer);

	// Parse the csv file to get the revelant accounts
	const addrs = fs.readFileSync(csv).toString('utf8');
	const lines = addrs.split('\n');

	try {
		console.log('checking settlement owing...');

		let totalAmountReclaimed = ethers.BigNumber.from(0);
		let totalRebateAmount = ethers.BigNumber.from(0);

		await async.eachOfLimit(lines, 50, async (line, i) => {
			if (line === '') return;

			const address = JSON.parse(line.split(',')[0]);

			if (i % 100 === 0) {
				console.log('scanning address', i, 'of', lines.length);
			}

			try {
				const settlementOwing = await Exchanger.settlementOwing(
					address,
					'0x7344454649000000000000000000000000000000000000000000000000000000' // sDEFI
				);
				console.log(`Settlement owing for ${address} is : ${settlementOwing.toString()}`);
				totalAmountReclaimed = totalAmountReclaimed.add(settlementOwing[0]);
				totalRebateAmount = totalRebateAmount.add(settlementOwing[1]);
			} catch (err) {
				console.log('had error for address', address, err);
			}
		});
		console.log(`totalAmountReclaimed is : ${totalAmountReclaimed.toString()}`);
		console.log(`totalRebateAmount is : ${totalRebateAmount.toString()}`);

		console.log(green('Completed!'));
	} catch (error) {
		console.log('Error!', error);
	}
};

module.exports = {
	checkSettlmentOwing,
	cmd: program =>
		program
			.command('check-settlement-owing')
			.description('Checks total rebates and amount reclaimed for a given list of accounts')
			.option('-g, --max-fee-per-gas <value>', 'Maximum base gas fee price in GWEI')
			.option('--max-priority-fee-per-gas <value>', 'Priority gas fee price in GWEI', '2')
			.option('-n, --network <value>', 'The network to run off.', x => x.toLowerCase(), 'goerli')
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
			.option(
				'--threshold <amount>',
				'Filter out small amounts that are not worth the gas cost',
				'50'
			)
			.option('--csv <file>', 'CSV of all addresses to scan')
			.action(checkSettlmentOwing),
};
