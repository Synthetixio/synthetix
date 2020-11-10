const fs = require('fs');
const path = require('path');
const { artifacts } = require('@nomiclabs/buidler');
const { wrap } = require('../../..');

async function connectContract({ network, deploymentPath, contractName, abiName = contractName }) {
	const { getTarget } = wrap({ network, fs, path });
	const { address } = getTarget({ network, deploymentPath, contract: contractName });

	const Contract = artifacts.require(abiName);

	return Contract.at(address);
}

async function connectContracts({ network, deploymentPath, requests }) {
	const contracts = {};

	await Promise.all(
		requests.map(async ({ contractName, abiName = contractName, alias = contractName }) => {
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
