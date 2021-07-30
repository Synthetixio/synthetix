const fs = require('fs');
const path = require('path');

const ethers = require('ethers');
const { wrap } = require('../..');

function getContract({
	contract,
	network = 'mainnet',
	useOvm = false,
	deploymentPath = undefined,
	provider,
}) {
	const { getSource, getTarget } = wrap({
		network,
		deploymentPath,
		fs,
		path,
	});

	return new ethers.Contract(
		getTarget({ contract, network, useOvm, deploymentPath }).address,
		getSource({ contract, network, useOvm, deploymentPath }).abi,
		provider
	);
}

module.exports = {
	getContract,
};
