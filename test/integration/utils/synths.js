const hre = require('hardhat');

const { prepareDeploy, deployInstance } = require('./deploy');

function addSynths({ ctx, synths, useOvm }) {
	before('add synths used for testing to system', async () => {
		const network = hre.config.fork ? 'mainnet' : 'local';

		const { providerUrl, providerPort } = hre.config;

		await prepareDeploy({
			network,
			useOvm,
			synthsToAdd: synths.map(name => ({ name, asset: 'USD' })),
		});

		await deployInstance({
			addNewSynths: true,
			freshDeploy: false,
			network,
			providerPort,
			providerUrl,
			useFork: hre.config.fork,
			useOvm,
		});
	});
}

module.exports = {
	addSynths,
};
