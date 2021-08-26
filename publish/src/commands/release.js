'use strict';

const { gray, yellow } = require('chalk');
const axios = require('axios').default; // use .default for ts typings

const { confirmAction } = require('../util');

const release = async ({ branch, release, version, layer, yes }) => {
	if (!process.env.CIRCLECI_TOKEN) {
		throw Error('Missing CIRCLECI_TOKEN - required to trigger the release');
	}

	if (!yes) {
		try {
			await confirmAction(
				`\nWARNING: This will initiate a ${yellow(layer)} release of ${yellow(
					version
				)} from branch ${yellow(branch)} named ${yellow(release)}\n` +
					gray('-'.repeat(50)) +
					'\nDo you want to continue? (y/n) '
			);
		} catch (err) {
			console.log(gray('Operation cancelled'));
			return;
		}
	}

	console.log(`Invoking CircleCI Release Name: ${release} on branch ${branch}, version ${version}`);

	await axios({
		method: 'post',
		url: 'https://circleci.com/api/v2/project/github/Synthetixio/releases/pipeline',
		headers: {
			'Content-Type': 'application/json',
			'Circle-Token': process.env.CIRCLECI_TOKEN,
		},
		data: {
			parameters: {
				branch,
				release,
				version,
				layer,
			},
		},
	});
};

module.exports = {
	release,
	cmd: program =>
		program
			.command('release')
			.description('Initiate a new release')
			.requiredOption(
				'-b, --branch <value>',
				'The branch of synthetix to release from (e.g. master, staging or develop)'
			)
			.addOption(
				new program.Option('-l, --layer <value>', `The layer to release`)
					.choices(['base', 'ovm', 'both'])
					.makeOptionMandatory()
			)
			.requiredOption('-r, --release <value>', `The name of this release (e.g. Hadar)`)
			.requiredOption('-v, --version <value>', `The version number (e.g. "2.21.13-alpha")`)
			.option('-y, --yes', "Don't prompt, just reply yes.")
			.action(release),
};
