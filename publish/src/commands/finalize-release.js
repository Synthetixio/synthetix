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

const finalizeRelease = async ({ layer, release, versionTag }) => {
	const isBase = layer === 'base' || layer === 'both';
	const isOvm = layer === 'ovm' || layer === 'both';

	// Write versions.json for whichever layer requires it
	if (isBase) {
		await versionsUpdate({ release, useOvm: false, versionTag });
	}
	if (isOvm) {
		await versionsUpdate({ release, useOvm: true, versionTag });
	}

	const prerelease = semver.prerelease(versionTag) && semver.prerelease(versionTag)[0] !== 'ovm';

	if (prerelease) {
		console.log(
			'Not updating the releases.json as this is a prerelease of',
			semver.prerelease(versionTag)[0]
		);
		return;
	}

	// Now modify releases.json locally for the released version
	const major = semver.major(versionTag);
	const minor = semver.minor(versionTag);

	let sips = [];
	// Mark as released the ones that have the specified version and layer
	for (const release of releases.releases) {
		const versionMatch = release.version.major === major && release.version.minor === minor;
		const layerMatch = (release.ovm && isOvm) || (!release.ovm && isBase);

		if (versionMatch && layerMatch) {
			release.released = true;
			sips = sips.concat(release.sips);
		}
	}

	// now mark all sips as released on that layer
	for (const sipNumber of sips) {
		const sip = releases.sips.find(s => s.sip === sipNumber);
		if (!sip) {
			console.log(
				'WARNING: Cannot find entry for SIP',
				sipNumber,
				'and thus cannot update its releasability'
			);
			continue;
		}
		// when it's the first release of the sip, or if the new release is both, then
		// use the given layer
		if (!sip.released || layer === 'both') {
			sip.released = layer;
			// else when releasing the other layer, then mark both released
		} else if (sip.released !== layer) {
			sip.released = 'both';
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
