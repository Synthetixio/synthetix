'use strict';

const fs = require('fs');
const { gray, yellow, red, cyan } = require('chalk');
const Web3 = require('web3');
const w3utils = require('web3-utils');

const {
	toBytes32,
	constants: { CONFIG_FILENAME, DEPLOYMENT_FILENAME },
} = require('../../..');

const {
	ensureNetwork,
	ensureDeploymentPath,
	getDeploymentPathForNetwork,
	loadAndCheckRequiredSources,
	loadConnections,
	confirmAction,
	stringify,
	performTransactionalStep,
} = require('../util');

const DEFAULTS = {
	network: 'kovan',
	gasLimit: 3e5,
	gasPrice: '1',
};

const removeSynths = async ({
	network = DEFAULTS.network,
	deploymentPath,
	gasPrice = DEFAULTS.gasPrice,
	gasLimit = DEFAULTS.gasLimit,
	synthsToRemove = [],
	yes,
	privateKey,
}) => {
	ensureNetwork(network);
	deploymentPath = deploymentPath || getDeploymentPathForNetwork({ network });
	ensureDeploymentPath(deploymentPath);

	const {
		synths,
		synthsFile,
		deployment,
		deploymentFile,
		config,
		configFile,
		ownerActions,
		ownerActionsFile,
	} = loadAndCheckRequiredSources({
		deploymentPath,
		network,
	});

	if (synthsToRemove.length < 1) {
		console.log(gray('No synths provided. Please use --synths-to-remove option'));
		return;
	}

	// sanity-check the synth list
	for (const synth of synthsToRemove) {
		if (synths.filter(({ name }) => name === synth).length < 1) {
			console.error(red(`Synth ${synth} not found!`));
			process.exitCode = 1;
			return;
		} else if (['sUSD'].indexOf(synth) >= 0) {
			console.error(red(`Synth ${synth} cannot be removed`));
			process.exitCode = 1;
			return;
		}
	}

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
	console.log(gray(`Using account with public key ${account}`));
	console.log(gray(`Using gas of ${gasPrice} GWEI with a max of ${gasLimit}`));

	if (!yes) {
		try {
			await confirmAction(
				cyan(
					`${yellow(
						'⚠ WARNING'
					)}: This action will remove the following synths from the Synthetix contract on ${network}:\n- ${synthsToRemove.join(
						'\n- '
					)}`
				) + '\nDo you want to continue? (y/n) '
			);
		} catch (err) {
			console.log(gray('Operation cancelled'));
			return;
		}
	}

	const Synthetix = new web3.eth.Contract(
		deployment.sources['Synthetix'].abi,
		deployment.targets['Synthetix'].address
	);

	const Issuer = new web3.eth.Contract(
		deployment.sources['Issuer'].abi,
		deployment.targets['Issuer'].address
	);

	// deep clone these configurations so we can mutate and persist them
	const updatedConfig = JSON.parse(JSON.stringify(config));
	const updatedDeployment = JSON.parse(JSON.stringify(deployment));
	let updatedSynths = JSON.parse(fs.readFileSync(synthsFile));

	for (const currencyKey of synthsToRemove) {
		const { address: synthAddress, source: synthSource } = deployment.targets[
			`Synth${currencyKey}`
		];
		const { abi: synthABI } = deployment.sources[synthSource];
		const Synth = new web3.eth.Contract(synthABI, synthAddress);

		const currentSynthInSNX = await Synthetix.methods.synths(toBytes32(currencyKey)).call();

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

		// now check total supply (is required in Synthetix.removeSynth)
		const totalSupply = w3utils.fromWei(await Synth.methods.totalSupply().call());
		if (Number(totalSupply) > 0) {
			console.error(
				red(
					`Cannot remove as Synth${currencyKey}.totalSupply is non-zero: ${yellow(
						totalSupply
					)}\nThe Synth must be purged of holders.`
				)
			);
			process.exitCode = 1;
			return;
		}

		// perform transaction if owner of Synthetix or append to owner actions list
		await performTransactionalStep({
			account,
			contract: 'Issuer',
			target: Issuer,
			write: 'removeSynth',
			writeArg: toBytes32(currencyKey),
			gasLimit,
			gasPrice,
			etherscanLinkPrefix,
			ownerActions,
			ownerActionsFile,
			encodeABI: network === 'mainnet',
		});

		// now update the config and deployment JSON files
		const contracts = ['Proxy', 'TokenState', 'Synth'].map(name => `${name}${currencyKey}`);
		for (const contract of contracts) {
			delete updatedConfig[contract];
			delete updatedDeployment.targets[contract];
		}
		fs.writeFileSync(configFile, stringify(updatedConfig));
		fs.writeFileSync(deploymentFile, stringify(updatedDeployment));

		// and update the synths.json file
		updatedSynths = updatedSynths.filter(({ name }) => name !== currencyKey);
		fs.writeFileSync(synthsFile, stringify(updatedSynths));
	}
};

module.exports = {
	removeSynths,
	cmd: program =>
		program
			.command('remove-synths')
			.description('Remove a number of synths from the system')
			.option(
				'-d, --deployment-path <value>',
				`Path to a folder that has your input configuration file ${CONFIG_FILENAME} and where your ${DEPLOYMENT_FILENAME} files will go`
			)
			.option('-g, --gas-price <value>', 'Gas price in GWEI', 1)
			.option('-l, --gas-limit <value>', 'Gas limit', 1e6)
			.option('-n, --network <value>', 'The network to run off.', x => x.toLowerCase(), 'kovan')
			.option(
				'-s, --synths-to-remove <value>',
				'The list of synths to remove',
				(val, memo) => {
					memo.push(val);
					return memo;
				},
				[]
			)
			.action(removeSynths),
};
