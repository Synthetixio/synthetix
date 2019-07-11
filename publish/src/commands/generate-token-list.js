'use strict';

const path = require('path');
const fs = require('fs');

const { CONFIG_FILENAME, DEPLOYMENT_FILENAME } = require('../constants');
const { stringify } = require('../util');

const generateTokenList = async ({ deploymentPath }) => {
	const deployment = JSON.parse(fs.readFileSync(path.join(deploymentPath, DEPLOYMENT_FILENAME)));

	const output = Object.keys(deployment.targets)
		.filter(key => /^Proxy(s[A-Z]{3,4}|Synthetix)$/.test(key))
		.map(key => {
			return {
				symbol: /Synthetix$/.test(key) ? 'SNX' : key.replace(/^Proxy/, ''),
				address: deployment.targets[key].address,
				decimals: 18,
			};
		});

	console.log(stringify(output));
};

module.exports = {
	generateTokenList,
	cmd: program =>
		program
			.command('generate-token-list')
			.description('Generate json output for all of the token proxy addresses')
			.option(
				'-d, --deployment-path <value>',
				`Path to a folder that has your input configuration file (${CONFIG_FILENAME}) and where your ${DEPLOYMENT_FILENAME} files will go`
			)
			.action(generateTokenList),
};
