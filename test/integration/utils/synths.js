const hre = require('hardhat');

const { connectContracts } = require('./contracts');
const { prepareDeploy, deployInstance } = require('./deploy');
const { updateExchangeRatesIfNeeded } = require('./rates');

function addSynths({ ctx, synths, useOvm }) {
	before(`add synths "${synths}" used for testing to system`, async () => {
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

		connectContracts({ ctx });

		await updateExchangeRatesIfNeeded({ ctx });
	});
}

module.exports = {
	addSynths,
};
