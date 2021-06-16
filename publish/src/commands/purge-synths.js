'use strict';

const { gray, green, yellow, red, cyan } = require('chalk');
const ethers = require('ethers');
const axios = require('axios');

const {
	toBytes32,
	getUsers,
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

const { performTransactionalStep } = require('../command-utils/transact');

const DEFAULTS = {
	network: 'kovan',
	gasLimit: 3e6,
	gasPrice: '1',
	batchSize: 15,
};

const purgeSynths = async ({
	network = DEFAULTS.network,
	deploymentPath,
	gasPrice = DEFAULTS.gasPrice,
	gasLimit = DEFAULTS.gasLimit,
	synthsToPurge = [],
	dryRun = false,
	yes,
	privateKey,
	addresses = [],
	batchSize = DEFAULTS.batchSize,
	proxyAddress,
	useFork,
}) => {
	ensureNetwork(network);
	deploymentPath = deploymentPath || getDeploymentPathForNetwork({ network });
	ensureDeploymentPath(deploymentPath);

	const { synths, deployment } = loadAndCheckRequiredSources({
		deploymentPath,
		network,
	});

	if (synthsToPurge.length < 1) {
		console.log(gray('No synths provided. Please use --synths-to-purge option'));
		return;
	}

	// sanity-check the synth list
	for (const synth of synthsToPurge) {
		if (synths.filter(({ name }) => name === synth).length < 1) {
			console.error(red(`Synth ${synth} not found!`));
			process.exitCode = 1;
			return;
		} else if (['sUSD'].indexOf(synth) >= 0) {
			console.error(red(`Synth ${synth} cannot be purged`));
			process.exitCode = 1;
			return;
		}
	}

	if (synthsToPurge.length > 1 && proxyAddress) {
		console.error(red(`Cannot provide a proxy address with multiple synths`));
		process.exitCode = 1;
		return;
	}

	const { providerUrl, privateKey: envPrivateKey, etherscanLinkPrefix } = loadConnections({
		network,
		useFork,
	});

	// allow local deployments to use the private key passed as a CLI option
	if (network !== 'local' || !privateKey) {
		privateKey = envPrivateKey;
	}

	console.log(gray(`Provider url: ${providerUrl}`));
	const provider = new ethers.providers.JsonRpcProvider(providerUrl);

	let wallet;
	if (useFork) {
		const account = getUsers({ network, user: 'owner' }).address; // protocolDAO
		wallet = provider.getSigner(account);
	} else {
		wallet = new ethers.Wallet(privateKey, provider);
	}
	wallet.address = wallet._address;
	console.log(gray(`Using account with public key ${wallet.address}`));
	console.log(gray(`Using gas of ${gasPrice} GWEI with a max of ${gasLimit}`));

	console.log(gray('Dry-run:'), dryRun ? green('yes') : yellow('no'));

	if (!yes) {
		try {
			await confirmAction(
				cyan(
					`${yellow(
						'⚠ WARNING'
					)}: This action will purge the following synths from the Synthetix contract on ${network}:\n- ${synthsToPurge.join(
						'\n- '
					)}`
				) + '\nDo you want to continue? (y/n) '
			);
		} catch (err) {
			console.log(gray('Operation cancelled'));
			return;
		}
	}

	const { address: synthetixAddress, source } = deployment.targets['Synthetix'];
	const { abi: synthetixABI } = deployment.sources[source];
	const Synthetix = new ethers.Contract(synthetixAddress, synthetixABI, wallet);

	let totalBatches = 0;
	for (const currencyKey of synthsToPurge) {
		const { address: synthAddress, source: synthSource } = deployment.targets[
			`Synth${currencyKey}`
		];

		const { abi: synthABI } = deployment.sources[synthSource];
		const Synth = new ethers.Contract(synthAddress, synthABI, wallet);
		proxyAddress = proxyAddress || deployment.targets[`Proxy${currencyKey}`].address;

		console.log(
			gray(
				'For',
				currencyKey,
				'using source of',
				synthSource,
				'at address',
				synthAddress,
				'proxy',
				proxyAddress
			)
		);

		const currentSynthInSNX = await Synthetix.synths(toBytes32(currencyKey));

		if (synthAddress !== currentSynthInSNX) {
			console.error(
				red(
					`Synth address in Synthetix for ${currencyKey} is different from what's deployed in Synthetix to the local ${DEPLOYMENT_FILENAME} of ${network} \ndeployed: ${yellow(
						currentSynthInSNX
					)}\nlocal:    ${yellow(synthAddress)}`
				)
			);
			process.exitCode = 1;
			return;
		}

		// step 1. fetch all holders via ethplorer api
		if (network === 'mainnet') {
			const topTokenHoldersUrl = `http://api.ethplorer.io/getTopTokenHolders/${proxyAddress}`;
			const response = await axios.get(topTokenHoldersUrl, {
				params: {
					apiKey: process.env.ETHPLORER_API_KEY || 'freekey',
					limit: 1000,
				},
			});

			const topTokenHolders = response.data.holders.map(({ address }) => address);
			console.log(gray(`Found ${topTokenHolders.length} possible holders of ${currencyKey}`));
			// Filter out any 0 holder
			const supplyPerEntry = await Promise.all(
				topTokenHolders.map(entry => Synth.balanceOf(entry))
			);
			addresses = topTokenHolders.filter((e, i) => supplyPerEntry[i] !== '0');
			console.log(gray(`Filtered to ${addresses.length} with supply`));
		}

		const totalSupplyBefore = ethers.utils.formatEther(await Synth.totalSupply());

		if (Number(totalSupplyBefore) === 0) {
			console.log(gray('Total supply is 0, exiting.'));
			continue;
		} else {
			console.log(gray('Total supply before purge is:', totalSupplyBefore));
		}

		// Split the addresses into batch size
		// step 2. start the purge
		for (let batch = 0; batch * batchSize < addresses.length; batch++) {
			const start = batch * batchSize;
			const end = Math.min((batch + 1) * batchSize, addresses.length);
			const entries = addresses.slice(start, end);

			totalBatches++;

			console.log(`batch: ${batch} of addresses with ${entries.length} entries`);

			if (dryRun) {
				console.log(green('Would attempt to purge:', entries));
			} else {
				await performTransactionalStep({
					account: wallet,
					contract: `Synth${currencyKey}`,
					target: Synth,
					write: 'purge',
					writeArg: [entries], // explicitly pass array of args so array not splat as params
					gasLimit,
					gasPrice,
					etherscanLinkPrefix,
					encodeABI: network === 'mainnet',
				});
			}
		}

		// step 3. confirmation
		const totalSupply = ethers.utils.formatEther(await Synth.totalSupply());
		if (Number(totalSupply) > 0) {
			console.log(
				yellow(
					`⚠⚠⚠ WARNING: totalSupply is not 0 after purge of ${currencyKey}. It is ${totalSupply}. ` +
						`Were there 100 or 1000 holders noted above? If so then we have likely hit the tokenHolder ` +
						`API limit; another purge is required for this synth.`
				)
			);
		}
	}
	console.log(`Total number of batches: ${totalBatches}`);
};

module.exports = {
	purgeSynths,
	cmd: program =>
		program
			.command('purge-synths')
			.description('Purge a number of synths from the system')
			.option(
				'-a, --addresses <value>',
				'The list of holder addresses (use in testnets when Ethplorer API does not return holders)',
				(val, memo) => {
					memo.push(val);
					return memo;
				},
				[]
			)
			.option(
				'-d, --deployment-path <value>',
				`Path to a folder that has your input configuration file ${CONFIG_FILENAME} and where your ${DEPLOYMENT_FILENAME} files will go`
			)
			.option('-g, --gas-price <value>', 'Gas price in GWEI', DEFAULTS.gasPrice)
			.option('-l, --gas-limit <value>', 'Gas limit', DEFAULTS.gasLimit)
			.option(
				'-n, --network [value]',
				'The network to run off.',
				x => x.toLowerCase(),
				DEFAULTS.network
			)
			.option('-r, --dry-run', 'Dry run - no changes transacted')
			.option(
				'-v, --private-key [value]',
				'The private key to transact with (only works in local mode, otherwise set in .env).'
			)
			.option(
				'-bs, --batch-size [value]',
				'Batch size for the addresses to be split into',
				DEFAULTS.batchSize
			)
			.option(
				'-p, --proxy-address <value>',
				'Override the proxy address for the token (only works with a single synth given)'
			)
			.option(
				'-k, --use-fork',
				'Perform the deployment on a forked chain running on localhost (see fork command).',
				false
			)
			.option('-y, --yes', 'Dont prompt, just reply yes.')
			.option(
				'-s, --synths-to-purge <value>',
				'The list of synths to purge',
				(val, memo) => {
					memo.push(val);
					return memo;
				},
				[]
			)
			.action(purgeSynths),
};
