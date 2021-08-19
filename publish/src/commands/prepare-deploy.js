'use strict';

const path = require('path');
const fs = require('fs');
const { ensureDeploymentPath, getDeploymentPathForNetwork, ensureNetwork } = require('../util');
const { red, gray, yellow } = require('chalk');

const {
	constants: { CONFIG_FILENAME },
	releases,
} = require('../../../.');

const DEFAULTS = {
	network: 'kovan',
};

const { stringify } = require('../util');

const prepareDeploy = async ({ network = DEFAULTS.network, useOvm }) => {
	ensureNetwork(network);

	const deploymentPath = getDeploymentPathForNetwork({ network, useOvm });
	ensureDeploymentPath(deploymentPath);

	// Pick unreleases releases that have contracts that need to be prepared
	const unreleased = releases.releases.filter(
		release => !release.released && !!release.ovm === useOvm && release.sips.length > 0
	);

	if (unreleased.length === 0) {
		console.log(gray('There are no releases that need to be prepared'));
		return;
	}

	const releasesNames = `"${unreleased.map(r => r.name).join('", "')}"`;

	console.log(gray(`Preparing ${releasesNames} on network ${network}...`));

	// Get config.js
	const configFile = path.join(deploymentPath, CONFIG_FILENAME);
	const config = JSON.parse(fs.readFileSync(configFile));

	// Get all the sources coming from the SIPs from the release on the required layer
	const sources = unreleased
		.map(({ sips }) => sips)
		.flat()
		.map(sipNumber => {
			const sip = releases.sips.find(sip => sip.sip === sipNumber);
			if (!sip.sources) return null;
			if (Array.isArray(sip.sources)) return sip.sources;
			const baseSources = sip.sources.base || [];
			const layerSources = sip.sources[useOvm ? 'ovm' : 'base'];
			return [...baseSources, ...layerSources];
		})
		.filter(sources => !!sources)
		.flat();

	// Sweep sources and,
	// (1) make sure they have an entry in config.json and,
	// (2) its deploy value is set to true.
	sources.forEach(source => {
		// If any non alpha characters in the name, assume regex and match existing names
		if (/[^\w]/.test(source)) {
			Object.keys(config)
				.filter(contract => new RegExp(`^${source}$`).test(contract))
				.forEach(contract => (config[contract] = { deploy: true }));
		} else {
			// otherwise upsert this entry into the config file
			config[source] = { deploy: true };
		}
	});

	// Update config file
	fs.writeFileSync(configFile, stringify(config));
	console.log(yellow(`${configFile} updated for ${releasesNames}.`));
};

module.exports = {
	prepareDeploy,
	cmd: program =>
		program
			.command('prepare-deploy')
			.description(
				'Reads releases.json and switches all entries to true in config.json for the target network.'
			)
			.option('-z, --use-ovm', 'Target deployment for the OVM (Optimism).')
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
					console.log(err.stack);
					process.exitCode = 1;
				}
			}),
};
