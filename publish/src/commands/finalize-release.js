'use strict';

const path = require('path');
const fs = require('fs');
const semver = require('semver');

const prettier = require('prettier');

const { versionsUpdate } = require('./versions-update');
const { stringify } = require('../util');

const {
	constants: { RELEASES_FILENAME },
	releases,
} = require('../../../.');

const finalizeRelease = async ({ layer, release, versionTag, yes }) => {
	// Write versions.json for whichever layer requires it
	if (layer === 'base' || layer === 'both') {
		await versionsUpdate({ release, useOvm: false, versionTag });
	}
	if (layer === 'ovm' || layer === 'both') {
		await versionsUpdate({ release, useOvm: true, versionTag });
	}

	// Now modify releases.json locally for the released version
	const major = semver.major(versionTag);
	const minor = semver.minor(versionTag);

	for (const release of releases) {
		const versionMatch = release.version.major === major && release.version.minor === minor;

		const layerMatch = (release.ovm && layer !== 'base') || (!release.ovm && layer !== 'ovm');

		if (versionMatch && layerMatch) {
			release.released = true;
		}
	}

	// get json options
	const options = await prettier.resolveConfig('.json');

	// format correctly
	const output = prettier.format(stringify(releases), Object.assign({ parser: 'json' }, options));

	// write releases back
	fs.writeFileSync(path.join(__dirname, '..', '..', RELEASES_FILENAME), output);
};

module.exports = {
	finalizeRelease,
	cmd: program =>
		program
			.command('finalize-release')
			.description(
				'Finalize a new release. This changes the files locally but does not commit anything.'
			)
			.addOption(
				new program.Option('-l, --layer <value>', `The layer to release`)
					.choices(['base', 'ovm', 'both'])
					.makeOptionMandatory()
			)
			.requiredOption('-r, --release <value>', `The name of this release (e.g. Hadar)`)
			.requiredOption('-v, --version-tag <value>', `The version number (e.g. "2.21.13-alpha")`)
			.option('-y, --yes', "Don't prompt, just reply yes.")
			.action(finalizeRelease),
};
