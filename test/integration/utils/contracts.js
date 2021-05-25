const fs = require('fs');
const path = require('path');
const ethers = require('ethers');
const { getSource, getTarget } = require('../../..');

function connectContracts({ ctx }) {
	const { useOvm } = ctx;
	const network = 'local';

	const allTargets = getTarget({ fs, path, network, useOvm });

	ctx.contracts = {};
	Object.entries(allTargets).map(([name, target]) => {
		ctx.contracts[name] = new ethers.Contract(
			getTarget({ fs, path, network, useOvm, contract: name }).address,
			getSource({ fs, path, network, useOvm, contract: target.source }).abi,
			ctx.provider
		);
	});
}

module.exports = {
	connectContracts,
};
