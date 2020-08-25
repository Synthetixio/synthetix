'use strict';

const path = require('path');
const fs = require('fs');
const { ensureDeploymentPath, getDeploymentPathForNetwork, ensureNetwork } = require('../util');
const { red, gray, yellow } = require('chalk');

const {
	constants: { CONFIG_FILENAME, RELEASES_FILENAME },
} = require('../../../.');

const DEFAULTS = {
	network: 'kovan',
};

const prepareDeploy = async ({ network = DEFAULTS.network }) => {
	ensureNetwork(network);

	const deploymentPath = getDeploymentPathForNetwork(network);
	ensureDeploymentPath(deploymentPath);

	// Get config.js
	const configFile = path.join(deploymentPath, CONFIG_FILENAME);
	const config = JSON.parse(fs.readFileSync(configFile));

	// Get releases.js
	const releasesFile = path.join(deploymentPath, '../../', RELEASES_FILENAME);
	const releases = JSON.parse(fs.readFileSync(releasesFile));

	// Pick the latest release from the list
	const release = releases.slice(-1)[0];
	console.log(gray(`Preparing release for ${release.name} on network ${network}...`));

	// Sweep releases.sources and,
	// (1) make sure they have an entry in config.json and,
	// (2) its deploy value is set to true.
	release.sources.map(source => {
		config[source] = { deploy: true };
	});

	// Update config file
	fs.writeFileSync(configFile, JSON.stringify(config, null, 2));
	console.log(yellow(`${configFile} updated for ${release.name} release.`));
};

module.exports = {
	prepareDeploy,
	cmd: program =>
		program
			.command('prepare-deploy')
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
					await prepareDeploy(...args);
				} catch (err) {
					// show pretty errors for CLI users
					console.error(red(err));
					process.exitCode = 1;
				}
			}),
};
