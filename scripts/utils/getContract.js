const fs = require('fs');
const path = require('path');
const synthetix = require('../..');
const ethers = require('ethers');

const { gray } = require('chalk');

function getContract({
	contract,
	source = contract,
	network = 'mainnet',
	useOvm = false,
	deploymentPath = undefined,
	wallet,
	provider,
}) {
	const target = synthetix.getTarget({ path, fs, contract, network, useOvm, deploymentPath });
	console.log(
		gray(
			`  > getContract '${contract}${contract !== source ? `(${source})` : ''}' => ${
				target.address
			}`
		)
	);
	const sourceData = synthetix.getSource({
		path,
		fs,
		contract: source,
		network,
		useOvm,
		deploymentPath,
	});

	return new ethers.Contract(target.address, sourceData.abi, wallet || provider);
}

module.exports = {
	getContract,
};
