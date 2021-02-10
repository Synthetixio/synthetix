'use strict';

const w3utils = require('web3-utils');
const Web3 = require('web3');
const { red, gray, green, yellow } = require('chalk');

const {
	constants: { CONFIG_FILENAME, DEPLOYMENT_FILENAME },
} = require('../../..');

const DEFAULTS = {
	gasPrice: '1',
	gasLimit: 2.0e6, // 1.5m
	network: 'kovan',
	chunkSize: 15,
};

const {
	ensureNetwork,
	ensureDeploymentPath,
	getDeploymentPathForNetwork,
	loadAndCheckRequiredSources,
	loadConnections,
	confirmAction,
	stringify,
} = require('../util');

const migrateBinaryOptionMarkets = async ({
	deploymentPath,
	network = DEFAULTS.network,
	gasPrice = DEFAULTS.gasPrice,
	gasLimit = DEFAULTS.gasLimit,
	chunkSize = DEFAULTS.chunkSize,
	sourceContractAddress,
	targetContractAddress,
	privateKey,
	yes,
}) => {
	ensureNetwork(network);
	deploymentPath = deploymentPath || getDeploymentPathForNetwork({ network });
	ensureDeploymentPath(deploymentPath);

	const { deployment } = loadAndCheckRequiredSources({
		deploymentPath,
		network,
	});

	const { providerUrl, privateKey: envPrivateKey, etherscanLinkPrefix } = loadConnections({
		network,
	});

	// allow local deployments to use the private key passed as a CLI option
	if (network !== 'local' || !privateKey) {
		privateKey = envPrivateKey;
	}

	const web3 = new Web3(new Web3.providers.HttpProvider(providerUrl));
	web3.eth.accounts.wallet.add(privateKey);
	const account = web3.eth.accounts.wallet[0].address;
	console.log(gray(`Using account with public key ${yellow(account)}`));

	const { address: resolverAddress } = deployment.targets['AddressResolver'];
	console.log(gray(`Using AddressResolver at ${yellow(resolverAddress)}.`));
	console.log(gray(`Gas Price: ${yellow(gasPrice)} gwei`));

	const { source } = deployment.targets['BinaryOptionMarketManager'];

	if (!w3utils.isAddress(sourceContractAddress)) {
		throw Error(
			'Invalid address detected for source (please check your inputs): ',
			sourceContractAddress
		);
	}
	if (!w3utils.isAddress(targetContractAddress)) {
		throw Error(
			'Invalid address detected for target (please check your inputs): ',
			targetContractAddress
		);
	}

	const { abi } = deployment.sources[source];
	if (sourceContractAddress.toLowerCase() === targetContractAddress.toLowerCase()) {
		throw Error('Cannot use the same address as the source and the target. Check your inputs.');
	} else {
		console.log(
			gray(`Migrating from source BinaryOptionMarketManager at: ${yellow(sourceContractAddress)}`)
		);
		console.log(
			gray(`Receiving into target BinaryOptionMarketManager at: ${yellow(targetContractAddress)}`)
		);
	}
	const sourceContract = new web3.eth.Contract(abi, sourceContractAddress);
	const targetContract = new web3.eth.Contract(abi, targetContractAddress);

	const numActiveMarkets = parseInt(await sourceContract.methods.numActiveMarkets().call());
	const numMaturedMarkets = parseInt(await sourceContract.methods.numMaturedMarkets().call());

	console.log(
		gray(
			`Found ${yellow(numActiveMarkets)} active markets and ${yellow(
				numMaturedMarkets
			)} matured markets. Fetching...`
		)
	);

	const activeMarkets = [];
	const maturedMarkets = [];
	const fetchChunkSize = 100;

	for (let i = 0; i < numActiveMarkets; i += fetchChunkSize) {
		activeMarkets.push(
			...(await sourceContract.methods.activeMarkets(i, i + fetchChunkSize).call())
		);
	}

	if (activeMarkets.length !== numActiveMarkets) {
		throw Error(
			`Number of active markets fetched does not match expected. (${activeMarkets.length} != ${numActiveMarkets})`
		);
	}

	for (let i = 0; i < numMaturedMarkets; i += fetchChunkSize) {
		maturedMarkets.push(
			...(await sourceContract.methods.maturedMarkets(i, i + fetchChunkSize).call())
		);
	}

	if (maturedMarkets.length !== numMaturedMarkets) {
		throw Error(
			`Number of active markets fetched does not match expected. (${maturedMarkets.length} != ${numMaturedMarkets})`
		);
	}

	console.log(gray('The active markets to migrate:'));
	console.log(gray(stringify(activeMarkets)));
	console.log(gray('The matured markets to migrate:'));
	console.log(gray(stringify(maturedMarkets)));

	console.log(
		gray(
			`Setting the migrating manager in ${yellow(targetContractAddress)} to ${yellow(
				sourceContractAddress
			)}.`
		)
	);

	if (!yes) {
		try {
			await confirmAction(
				yellow(`Attempt to set the migrating manager on the receiving manager (y/n) ?`)
			);
		} catch (err) {
			console.log(gray('Operation cancelled'));
			return;
		}
	}

	console.log(
		yellow(`Attempting action BinaryOptionMarket.setMigratingManager(${sourceContractAddress})`)
	);
	const { transactionHash } = await targetContract.methods
		.setMigratingManager(sourceContractAddress)
		.send({
			from: account,
			gasLimit: Number(gasLimit),
			gasPrice: w3utils.toWei(gasPrice.toString(), 'gwei'),
		});
	console.log(
		green(
			`Successfully set migrating manager with transaction: ${etherscanLinkPrefix}/tx/${transactionHash}`
		)
	);

	console.log(gray(`Migration will be attempted in batches of ${yellow(chunkSize)}.`));

	console.log(
		gray(
			`Beginning migration of active markets from ${yellow(targetContractAddress)} to ${yellow(
				sourceContractAddress
			)}.`
		)
	);
	for (let i = 0; i < activeMarkets.length; i += chunkSize) {
		console.log(yellow('Migrate the following active markets?'));
		const chunk = activeMarkets.slice(i, i + chunkSize);
		console.log(yellow(stringify(chunk)));

		if (!yes) {
			try {
				await confirmAction(
					yellow(`Do you want to continue importing these ${chunk.length} active markets (y/n) ?`)
				);
			} catch (err) {
				console.log(gray('Operation cancelled'));
				return;
			}
		}

		console.log(
			gray(
				`Attempting to invoke BinaryOptionMarketManager.rebuildMarketCaches(${stringify(chunk)}).`
			)
		);
		let result = await sourceContract.methods.rebuildMarketCaches(chunk).send({
			from: account,
			gasLimit: Number(gasLimit),
			gasPrice: w3utils.toWei(gasPrice.toString(), 'gwei'),
		});
		console.log(
			green(
				`Successfully synchronised markets with transaction: ${etherscanLinkPrefix}/tx/${result.transactionHash}`
			)
		);

		console.log(
			gray(
				`Attempting to invoke BinaryOptionMarketManager.migrateMarkets(${targetContractAddress}, true, ${stringify(
					chunk
				)}).`
			)
		);
		result = await sourceContract.methods.migrateMarkets(targetContractAddress, true, chunk).send({
			from: account,
			gasLimit: Number(gasLimit),
			gasPrice: w3utils.toWei(gasPrice.toString(), 'gwei'),
		});
		console.log(
			green(
				`Successfully migrated markets with transaction: ${etherscanLinkPrefix}/tx/${result.transactionHash}`
			)
		);
	}

	console.log(
		gray(
			`Beginning migration of matured markets from ${yellow(targetContractAddress)} to ${yellow(
				sourceContractAddress
			)}.`
		)
	);
	for (let i = 0; i < maturedMarkets.length; i += chunkSize) {
		console.log(yellow('Migrate the following markets?'));

		const chunk = maturedMarkets.slice(i, i + chunkSize);
		console.log(yellow(stringify(chunk)));

		if (!yes) {
			try {
				await confirmAction(
					yellow(`Do you want to continue importing these ${chunk.length} matured markets (y/n) ?`)
				);
			} catch (err) {
				console.log(gray('Operation cancelled'));
				return;
			}
		}

		console.log(
			gray(
				`Attempting to invoke BinaryOptionMarketManager.rebuildMarketCaches(${stringify(chunk)}).`
			)
		);
		let result = await sourceContract.methods.rebuildMarketCaches(chunk).send({
			from: account,
			gasLimit: Number(gasLimit),
			gasPrice: w3utils.toWei(gasPrice.toString(), 'gwei'),
		});
		console.log(
			green(
				`Successfully synchronised markets with transaction: ${etherscanLinkPrefix}/tx/${result.transactionHash}`
			)
		);
		console.log(
			gray(
				`Attempting to invoke BinaryOptionMarketManager.migrateMarkets(${targetContractAddress}, false, ${stringify(
					chunk
				)}).`
			)
		);
		result = await sourceContract.methods.migrateMarkets(targetContractAddress, false, chunk).send({
			from: account,
			gasLimit: Number(gasLimit),
			gasPrice: w3utils.toWei(gasPrice.toString(), 'gwei'),
		});
		console.log(
			green(
				`Successfully migrated markets with transaction: ${etherscanLinkPrefix}/tx/${result.transactionHash}`
			)
		);
	}

	console.log(gray('Action complete.'));
};

module.exports = {
	migrateBinaryOptionMarkets,
	cmd: program =>
		program
			.command('migrate-binary-option-markets')
			.description('Migrate binary option markets')
			.option(
				'-d, --deployment-path <value>',
				`Path to a folder that has your input configuration file (${CONFIG_FILENAME}) and where your ${DEPLOYMENT_FILENAME} files will go`
			)
			.option('-g, --gas-price <value>', 'Gas price in GWEI', DEFAULTS.gasPrice)
			.option('-l, --gas-limit <value>', 'Gas limit', parseInt, DEFAULTS.gasLimit)
			.option(
				'-s, --source-contract-address <value>',
				'The Binary Option Market Manager source contract address'
			)
			.option(
				'-t, --target-contract-address <value>',
				'The Binary Option Market Manager target contract address'
			)
			.option(
				'-c, --chunk-size <value>',
				'The number of markets to migrate per chunk',
				DEFAULTS.chunkSize
			)
			.option(
				'-n, --network <value>',
				'The network to run off.',
				x => x.toLowerCase(),
				DEFAULTS.network
			)
			.option(
				'-v, --private-key [value]',
				'The private key to deploy with (only works in local mode, otherwise set in .env).'
			)
			.option('-y, --yes', 'Dont prompt, just reply yes.')

			.action(async (...args) => {
				try {
					await migrateBinaryOptionMarkets(...args);
				} catch (err) {
					// show pretty errors for CLI users
					console.error(red(err));
					process.exitCode = 1;
				}
			}),
};
