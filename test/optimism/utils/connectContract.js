const fs = require('fs');
const path = require('path');
const ethers = require('ethers');
const { getSource, getTarget } = require('../../..');

function connectContract({ contract, source = contract, provider, useOvm = false }) {
	const params = {
		path,
		fs,
		network: 'local',
		useOvm,
	};

	return new ethers.Contract(
		getTarget({ ...params, contract }).address,
		getSource({ ...params, contract: source }).abi,
		provider
	);
}

module.exports = {
	connectContract,
};
