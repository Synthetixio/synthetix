const synthetix = require('../..');
const ethers = require('ethers');

const { gray } = require('chalk');

async function getContract({
	contract,
	source = contract,
	network = 'mainnet',
	useOvm = false,
	wallet,
	provider,
}) {
	const target = synthetix.getTarget({ contract, network, useOvm });
	console.log(
		gray(
			`  > getContract '${contract}${contract !== source ? `(${source})` : ''}' => ${
				target.address
			}`
		)
	);
	const sourceData = synthetix.getSource({ contract: source, network, useOvm });

	return new ethers.Contract(target.address, sourceData.abi, wallet || provider);
}

module.exports = {
	getContract,
};
