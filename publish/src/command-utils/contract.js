const fs = require('fs');
const path = require('path');

const ethers = require('ethers');

const { getSource, getTarget } = require('../../..');

const getContract = ({
	contract,
	source = contract,
	network = 'mainnet',
	useOvm = false,
	deploymentPath = undefined,
	wallet,
	provider,
}) => {
	const target = getTarget({ path, fs, contract, network, useOvm, deploymentPath });
	const sourceData = getSource({
		path,
		fs,
		contract: source,
		network,
		useOvm,
		deploymentPath,
	});

	return new ethers.Contract(target.address, sourceData.abi, wallet || provider);
};

module.exports = {
	getContract,
};
