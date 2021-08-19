'use strict';

const ethers = require('ethers');
const { red } = require('chalk');

const getContract = ({ deployment, signer, contract }) => {
	if (!deployment.targets[contract]) {
		console.error(red(`Contract ${contract} not found in deployment targets!`));
		process.exit(1);
	}

	const { address, source } = deployment.targets[contract];
	const { abi } = deployment.sources[source];
	return new ethers.Contract(address, abi, signer);
};

module.exports = {
	getContract,
};
