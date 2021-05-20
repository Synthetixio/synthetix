const fs = require('fs');
const path = require('path');
const { wrap } = require('../..');
const { contract, config } = require('hardhat');
const { assert } = require('../contracts/common');
const { toUnit, fastForward } = require('../utils')();
const {
	implementShorts,
} = require('./utils');
const { toBytes32 } = require('../..');

contract('ExchangeRates (prod tests)', accounts => {
    const [, user] = accounts;

	let owner;

	let network, deploymentPath;

	let CollateralShort;

    before('prepare', async () => {
		network = config.targetNetwork;
		const { getUsers, getPathToNetwork } = wrap({ network, fs, path });
		owner = getUsers({ network, user: 'owner' }).address;
		deploymentPath = config.deploymentPath || getPathToNetwork(network);

        // Some check
		if () {
			await implementShorts({ network, deploymentPath });
			await mockOptimismBridge({ network, deploymentPath });
		}

		({
			CollateralShort,
		} = await connectContracts({
			network,
			deploymentPath,
			requests: [
				{ contractName: 'CollateralShort' },
			],
		}));

		// TODO open a short close draw repay etc.
	});
}