'use strict';

const path = require('path');
const fs = require('fs');
const w3utils = require('web3-utils');


const { ensureDeploymentPath, getDeploymentPathForNetwork, ensureNetwork } = require('../util');
const { red, gray, yellow } = require('chalk');

const {
	constants: { BUILD_FOLDER, CONFIG_FILENAME },
} = require('../../..');

const {
	loadAndCheckRequiredSources,
} = require('../util');

const DEFAULTS = {
	network: 'kovan',
};

const { stringify } = require('../util');

const prepareDeployDetectDiff = async ({ network = DEFAULTS.network }) => {
	ensureNetwork(network);

	const deploymentPath = getDeploymentPathForNetwork(network);
	ensureDeploymentPath(deploymentPath);

	const { config, configFile, deployment } = loadAndCheckRequiredSources({
		deploymentPath,
		network,
	});

	console.log(
		gray('Checking if there are contracts with updated bytecode...')
	);
	
	const buildPath = path.join(__dirname, '..', '..', '..', BUILD_FOLDER);

	for (const name of Object.keys(config)) {
		const { source } = deployment.targets[name];
		const deployedBytecode = deployment.sources[source].bytecode;
		const compiledFilename = path.join(buildPath, 'compiled', `${source}.json`);
		const compiled = require(compiledFilename);	
		if (w3utils.keccak256(deployedBytecode) !== w3utils.keccak256(compiled.evm.bytecode.object)){
			config[name] = { deploy: true };
		}
	}

	// Update config file
	fs.writeFileSync(configFile, stringify(config));
};

module.exports = {
	prepareDeployDetectDiff,
	cmd: program =>
		program
			.command('prepare-deploy-detect-diff')
			.description(
				'Reads releases.json and switches all entries to true in config.json for the target network.'
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
