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

/**
 * Retrieve the list of targets for the network - returning the name, address, source file and link to etherscan
 */
const getTarget = ({ network = 'mainnet', contract } = {}) => {
	const deployment = loadDeploymentFile({ network });
	if (contract) return deployment.targets[contract];
	else return deployment.targets;
};

/**
 * Retrieve the list of solidity sources for the network - returning the abi and bytecode
 */
const getSource = ({ network = 'mainnet', contract } = {}) => {
	const deployment = loadDeploymentFile({ network });
	if (contract) return deployment.sources[contract];
	else return deployment.sources;
};

/**
 * Retrieve ths list of synths for the network - returning their names, assets underlying, category, sign, description, and
 * optional index and inverse properties
 */
const getSynths = ({ network = 'mainnet' } = {}) => {
	const pathToSynthList = path.join(__dirname, 'publish', 'deployed', network, 'synths.json');
	if (!fs.existsSync(pathToSynthList)) {
		throw Error(`Cannot find synth list.`);
	}
	const synths = JSON.parse(fs.readFileSync(pathToSynthList));

	// copy all necessary index parameters from the longs to the corresponding shorts
	return synths.map(synth => {
		if (typeof synth.index === 'string') {
			const { index } = synths.find(({ name }) => name === synth.index) || {};
			if (!index) {
				throw Error(
					`While processing ${synth.name}, it's index mapping "${synth.index}" cannot be found - this is an error in the deployment config and should be fixed`
				);
			}
			return Object.assign({}, synth, { index });
		} else {
			return synth;
		}
	});
};

/**
 * Retrieve the list of system user addresses
 */
const getUsers = ({ network = 'mainnet', user } = {}) => {
	const testnetOwner = '0xB64fF7a4a33Acdf48d97dab0D764afD0F6176882';
	const base = {
		owner: testnetOwner,
		deployer: testnetOwner,
		marketClosure: testnetOwner,
		oracle: '0xac1e8B385230970319906C03A1d8567e3996d1d5',
		fee: '0xfeEFEEfeefEeFeefEEFEEfEeFeefEEFeeFEEFEeF',
		zero: '0x' + '0'.repeat(40),
	};

	const map = {
		mainnet: Object.assign({}, base, {
			owner: '0xEb3107117FEAd7de89Cd14D463D340A2E6917769',
			deployer: '0xDe910777C787903F78C89e7a0bf7F4C435cBB1Fe',
			marketClosure: '0xC105Ea57Eb434Fbe44690d7Dec2702e4a2FBFCf7',
			oracle: '0xaC1ED4Fabbd5204E02950D68b6FC8c446AC95362',
		}),
		kovan: Object.assign({}, base),
		rinkeby: Object.assign({}, base),
		ropsten: Object.assign({}, base),
	};

	const users = Object.entries(map[network]).map(([key, value]) => ({ name: key, address: value }));

	return user ? users.find(({ name }) => name === user) : users;
};

const getSuspensionReasons = ({ code = undefined }) => {
	const suspensionReasonMap = {
		1: 'System Upgrade',
		2: 'Market Closure',
		3: 'Circuit breaker',
		99: 'Emergency',
	};

	return code ? suspensionReasonMap[code] : suspensionReasonMap;
};

module.exports = {
	getTarget,
	getSource,
	getSynths,
	toBytes32,
	getUsers,
	getSuspensionReasons,
	constants: {
		inflationStartTimestampInSecs: 1551830400, // 2019-03-06T00:00:00Z
	},
};
