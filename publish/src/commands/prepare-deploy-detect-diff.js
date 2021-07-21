'use strict';

const path = require('path');
const fs = require('fs');

const { ensureDeploymentPath, getDeploymentPathForNetwork, ensureNetwork } = require('../util');
const { red, gray, yellow } = require('chalk');

const {
	constants: { BUILD_FOLDER },
} = require('../../..');

const { loadAndCheckRequiredSources } = require('../util');

const DEFAULTS = {
	network: 'kovan',
};

const { stringify } = require('../util');

const prepareDeployDetectDiff = async ({ network = DEFAULTS.network }) => {
	ensureNetwork(network);

	const deploymentPath = getDeploymentPathForNetwork({ network });
	ensureDeploymentPath(deploymentPath);

	const { config, configFile, deployment } = loadAndCheckRequiredSources({
		deploymentPath,
		network,
	});

	console.log(gray('Checking if there are contracts with updated bytecode...'));

	const buildPath = path.join(__dirname, '..', '..', '..', BUILD_FOLDER);

	// Counts the number of contracts that their bytecode diverges from the one being deployed on the current fork
	let updated = 0;
	for (const name of Object.keys(config)) {
		const { source } = deployment.targets[name];
		const deployedBytecode = deployment.sources[source].bytecode;
		const compiledFilename = path.join(buildPath, 'compiled', `${source}.json`);
		const compiled = require(compiledFilename);
		if (
			ethers.utils.keccak256(deployedBytecode) !==
			ethers.utils.keccak256(compiled.evm.bytecode.object)
		) {
			config[name] = { deploy: true };
			updated++;
		}
	}

	if (updated) {
		fs.writeFileSync(configFile, stringify(config));
		// Update config file
		console.log(yellow(`${updated} contracts have been updated and need to be redeployed.`));
	} else {
		console.log(gray('No contracts need to be redeployed'));
	}
};

module.exports = {
	prepareDeployDetectDiff,
	cmd: program =>
		program
			.command('prepare-deploy-detect-diff')
			.description(
				'Compares the bytecodes of the locally compiled contracts to the ones deployed on the current fork and switches all relevant entries to true in config.json for the target network.'
			)
			.option(
				'-n, --network <value>',
				'The network to run off.',
				x => x.toLowerCase(),
				DEFAULTS.network
			)
			.action(async (...args) => {
				try {
					await prepareDeployDetectDiff(...args);
				} catch (err) {
					// show pretty errors for CLI users
					console.error(red(err));
					process.exitCode = 1;
				}
			}),
};
