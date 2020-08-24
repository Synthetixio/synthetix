'use strict';

const path = require('path');
const fs = require('fs');
const { ensureDeploymentPath, getDeploymentPathForNetwork } = require('../util');

const {
	constants: { CONFIG_FILENAME, RELEASES_FILENAME, SYNTHS_FILENAME, DEPLOYMENT_FILENAME },
} = require('../../../.');

const prepareRelease = async ({ deploymentPath, releaseName }) => {
	deploymentPath = deploymentPath || getDeploymentPathForNetwork(network);
	ensureDeploymentPath(deploymentPath);

	console.log(`Preparing release of ${releaseName} on network ${deploymentPath}...`);

	// Get config.js
	const configFile = path.join(deploymentPath, CONFIG_FILENAME);
	const config = JSON.parse(fs.readFileSync(configFile));

	// Get releases.js
	const releasesFile = path.join(deploymentPath, '../../', RELEASES_FILENAME);
	const releases = JSON.parse(fs.readFileSync(releasesFile));

	// Verify that the requested release exists
	const release = releases.find(release => {
		return release.name.toLowerCase() === releaseName.toLowerCase();
	});
	if (!release) {
		throw new Error(`Unable to find an entry in ${RELEASES_FILENAME} for ${releaseName}`);
	}

	// Sweep releases.sources and,
	// (1) make sure they have an entry in config.json and,
	// (2) its deploy value is set to true.
	release.sources.map(source => {
		config[source] = { deploy: true };
	});

	// Update config file
	fs.writeFileSync(configFile, JSON.stringify(config, null, 2));
	console.log(`${configFile} updated for ${releaseName} release.`);
};

module.exports = {
	prepareRelease,
	cmd: program =>
		program
			.command('prepare-release')
			.description(
				'Reads releases.json and switches all entries to true in config.json for the target network.'
			)
			.requiredOption('-r, --release-name <value', 'Release name, E.g: pollux')
			.requiredOption(
				'-d, --deployment-path <value>',
				`Path to a folder that has your input configuration file ${CONFIG_FILENAME}, the synth list ${SYNTHS_FILENAME} and where your ${DEPLOYMENT_FILENAME} files will go`
			)
			.action(prepareRelease),
};
