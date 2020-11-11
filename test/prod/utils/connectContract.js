const fs = require('fs');
const path = require('path');
const { artifacts } = require('@nomiclabs/buidler');
const { wrap } = require('../../..');

async function connectContract({ network, deploymentPath, contractName, abiName }) {
	const { getTarget } = wrap({ network, fs, path });
	const { address, source } = getTarget({ network, deploymentPath, contract: contractName });

	const Contract = artifacts.require(abiName || source);

	return Contract.at(address);
}

async function connectContracts({ network, deploymentPath, requests }) {
	const contracts = {};

	await Promise.all(
		requests.map(async ({ contractName, abiName, alias = contractName }) => {
			contracts[alias] = await connectContract({
				network,
				deploymentPath,
				contractName,
				abiName,
			});
		})
	);

	return contracts;
}

module.exports = {
	connectContract,
	connectContracts,
};
