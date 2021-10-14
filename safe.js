const fs = require('fs');
const ethers = require('ethers');
const { gray, yellow } = require('chalk');
const { EthersAdapter } = require('@gnosis.pm/safe-core-sdk');
const Safe = require('@gnosis.pm/safe-core-sdk').default;

const SafeServiceClient = require('@gnosis.pm/safe-service-client').default;

require('dotenv').config();

const { getUsers } = require('.');
const {
	confirmAction,
	ensureDeploymentPath,
	ensureNetwork,
	getDeploymentPathForNetwork,
	loadAndCheckRequiredSources,
	loadConnections,
	stringify,
} = require('./publish/src/util');

(async function() {
	const network = 'mainnet';
	const safeAddress = getUsers({ network, user: 'owner' }).address;

	ensureNetwork(network);
	const deploymentPath = getDeploymentPathForNetwork({ network });
	ensureDeploymentPath(deploymentPath);

	const { ownerActions, ownerActionsFile } = loadAndCheckRequiredSources({
		network,
		deploymentPath,
	});

	const {
		providerUrl,
		privateKey,
		// explorerLinkPrefix,
	} = loadConnections({
		network,
		// useFork,
		// useOvm,
	});

	const provider = new ethers.providers.JsonRpcProvider(providerUrl);
	const signer = new ethers.Wallet(privateKey, provider);

	const ethAdapter = new EthersAdapter({
		ethers,
		signer,
	});

	const safeSdk = await Safe.create({
		ethAdapter,
		safeAddress,
	});

	const transactions = Object.values(ownerActions)
		.filter(({ complete }) => !complete)
		.map(({ target, data }) => ({
			to: target,
			data,
			value: '0',
		}));

	if (!transactions.length) {
		console.log(gray('No transactions to submit in owner-actions'));
		return;
	}

	try {
		await confirmAction(
			gray(
				'Found',
				yellow(transactions.length),
				'incomplete transactions to stage to safe',
				yellow(safeAddress),
				'on network',
				yellow(network),
				'. Continue (y/n)? '
			)
		);
	} catch (err) {
		console.log(gray('Operation cancelled'));
		return;
	}

	const safeTransaction = await safeSdk.createTransaction(...transactions);
	const txHash = await safeSdk.getTransactionHash(safeTransaction);
	const signature = await safeSdk.signTransactionHash(txHash);

	const safeService = new SafeServiceClient(
		`https://safe-transaction${network === 'rinkeby' ? '.rinkeby' : ''}.gnosis.io`
	);
	try {
		await safeService.proposeTransaction(safeAddress, safeTransaction.data, txHash, signature);

		console.log(
			gray(
				'Submitted a batch of',
				yellow(transactions.length),
				'transactions to the safe',
				yellow(safeAddress)
			)
		);
		const ownerActionsMutated = Object.entries(ownerActions).reduce((prev, [key, value]) => {
			prev[key] = Object.assign({}, value, { complete: true });
			return prev;
		}, {});

		fs.writeFileSync(ownerActionsFile, stringify(ownerActionsMutated));
	} catch (err) {
		console.log(require('util').inspect(err, true, null, true));
	}
})();
