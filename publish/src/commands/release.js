'use strict';

const { gray, yellow } = require('chalk');
const axios = require('axios').default; // use .default for ts typings

const { confirmAction } = require('../util');

const release = async ({ branch, release, version, yes }) => {
	if (!branch) {
		throw Error('Branch is missing');
	} else if (!version) {
		throw Error('Version is missing');
	} else if (!release) {
		throw Error('Release is missing');
	} else if (!process.env.CIRCLECI_TOKEN) {
		throw Error('Missing CIRCLECI_TOKEN - required to trigger the release');
	}

	if (!yes) {
		try {
			await confirmAction(
				`\nWARNING: This will initiate a release of ${yellow(version)} from branch ${yellow(
					branch
				)} named ${yellow(release)}\n` +
					gray('-'.repeat(50)) +
					'\nDo you want to continue? (y/n) '
			);
		} catch (err) {
			console.log(gray('Operation cancelled'));
		}
	}

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
			.option(
				'-b, --branch <value>',
				'The branch of synthetix to release from (e.g. master, staging or develop)'
			)
			.option('-r, --release <value>', `The name of this release (e.g. Hadar)`)
			.option('-v, --version <value>', `The version number (e.g. "2.21.13-alpha")`)
			.option('-y, --yes', 'Dont prompt, just reply yes.')
			.action(release),
};
