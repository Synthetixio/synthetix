const fs = require('fs');
const path = require('path');
const { artifacts } = require('hardhat');
const { wrap } = require('../../..');

async function connectContract({ network, deploymentPath, contractName, abiName }) {
	const { getTarget } = wrap({ network, fs, path });
	const target = getTarget({ network, deploymentPath, contract: contractName });
	if (!target) {
		return undefined;
	}

	const Contract = artifacts.require(abiName || target.source);

	return Contract.at(target.address);
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
