'use strict';

const fs = require('fs');
const path = require('path');
const { confirmAction } = require('../util');
const { gray, yellow } = require('chalk');

const pinataSDK = require('@pinata/sdk');
const pinata = pinataSDK('f2239d6e0ac0e5d3dc74', 'a9597796e21dd77fd7b40678043d85ec71300ebbcf30ae1503ca21357eae43e5');

const {
	constants: { CONFIG_FILENAME, DEPLOYMENT_FILENAME },
} = require('../../..');

const pathToLocal = name => path.join(__dirname, `${name}.json`);

const uploadFileToIPFS = async ({ body }) => {
    const result = await pinata.pinJSONToIPFS(body);
	return result.IpfsHash;
};

const generateSynthsJson = async ({ deploymentPath }) => {
	// create and generate Synth JSON file based on tokenlist.json template

    // testing pinning tokenlist example
	const body = JSON.parse(fs.readFileSync(pathToLocal(`tokenlist`)));

	const hash = await uploadFileToIPFS({ body });

	console.log(`Uploaded Synths JSON to IPFS: https://gateway.ipfs.io/ipfs/${hash}`);
};

module.exports = {
	generateSynthsJson,
	cmd: program =>
		program
			.command('generate-synths-json')
			.description('Generate json output for all of the Synths tokens')
			.option(
				'-d, --deployment-path <value>',
				`Path to a folder that has your input configuration file (${CONFIG_FILENAME}) and where your ${DEPLOYMENT_FILENAME} files will go`
			)
			.action(generateSynthsJson),
};
