'use strict';

const fs = require('fs');
const path = require('path');
const w3utils = require('web3-utils');

/**
 * Converts a string into a hex representation of bytes32, with right padding
 */
const toBytes32 = key => w3utils.rightPad(w3utils.asciiToHex(key), 64);

const loadDeploymentFile = ({ network }) => {
	const pathToDeployment = path.join(__dirname, 'publish', 'deployed', network, 'deployment.json');
	if (!fs.existsSync(pathToDeployment)) {
		throw Error(`Cannot find deployment for network: ${network}.`);
	}
	return JSON.parse(fs.readFileSync(pathToDeployment));
};

const getTarget = ({ network = 'mainnet', contract } = {}) => {
	const deployment = loadDeploymentFile({ network });
	if (contract) return deployment.targets[contract];
	else return deployment.targets;
};

const getSource = ({ network = 'mainnet', contract } = {}) => {
	const deployment = loadDeploymentFile({ network });
	if (contract) return deployment.sources[contract];
	else return deployment.sources;
};

const getSynths = ({ network = 'mainnet' } = {}) => {
	const pathToSynthList = path.join(__dirname, 'publish', 'deployed', network, 'synths.json');
	if (!fs.existsSync(pathToSynthList)) {
		throw Error(`Cannot find synth list.`);
	}
	return JSON.parse(fs.readFileSync(pathToSynthList));
};

module.exports = { getTarget, getSource, getSynths, toBytes32 };
