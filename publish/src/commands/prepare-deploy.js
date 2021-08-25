'use strict';

const path = require('path');
const fs = require('fs');
const uniq = require('lodash.uniq');
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

// Get unreleased releases
const getReleases = (useOvm = false) =>
	releases.releases.filter(
		release => !release.released && !!release.ovm === useOvm && release.sips.length > 0
	);

// Get unreleased sips
const getSips = (useOvm = false) => {
	const layers = ['both', useOvm ? 'ovm' : 'base'];
	return releases.sips.filter(
		({ layer, released }) => layers.includes(layer) && !layers.includes(released)
	);
};

// Get defined source files from the given sip, or an empty Array
const getSipSources = (sip, useOvm = false) => {
	if (!sip.sources) return [];
	if (Array.isArray(sip.sources)) return sip.sources;
	const baseSources = sip.sources.base || [];
	const layerSources = sip.sources[useOvm ? 'ovm' : 'base'] || [];
	return [...baseSources, ...layerSources];
};

const prepareDeploy = async ({ network = DEFAULTS.network, useOvm, useSips }) => {
	ensureNetwork(network);

	const deploymentPath = getDeploymentPathForNetwork({ network, useOvm });
	ensureDeploymentPath(deploymentPath);

	// Get unreleased source files
	let sources;
	if (useSips) {
		// Pick unreleased sips that have sources that need to be prepared
		const sips = getSips();
		sources = sips.flatMap(sip => getSipSources(sip, useOvm));

		if (sources.length > 0) {
			console.log(gray(`Preparing SIPs: ${sips.map(({ sip }) => sip).join(', ')}`));
		}
	} else {
		// Get all the sources coming from the SIPs from the release on the required layer
		const releases = getReleases();
		sources = releases
			.flatMap(({ sips }) => sips)
			.flatMap(sipNumber => {
				const sip = releases.sips.find(sip => sip.sip === sipNumber);
				if (!sip) throw new Error(`Invalid SIP number "${sipNumber}"`);
				return getSipSources(sipNumber, useOvm);
			});

		if (sources.length > 0) {
			console.log(gray(`Preparing releases: ${releases.map(({ name }) => name).join(', ')}`));
		}
	}

	sources = uniq(sources);

	if (sources.length === 0) {
		console.log(gray('There are no source files that need to be prepared'));
		return;
	}

	console.log(gray(`Preparing sources on ${network}:`));
	console.log(gray(sources.map(source => `  - ${source}`).join('\n')));

	// Get config.js
	const configFile = path.join(deploymentPath, CONFIG_FILENAME);
	const config = JSON.parse(fs.readFileSync(configFile));

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
	console.log(yellow(`${configFile} updated for ${network}.`));
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
			.option('-s, --use-sips', 'Use sources from SIPs directly, instead of releases.')
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
