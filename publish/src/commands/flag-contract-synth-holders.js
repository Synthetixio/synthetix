'use strict';

const fs = require('fs');

const { gray, green, red } = require('chalk');
const thegraph = require('../thegraph');
const pageResults = require('graph-results-pager');
const ethers = require('ethers');

const sumBy = require('lodash.sumby');

const {
	constants: { CONFIG_FILENAME, DEPLOYMENT_FILENAME },
} = require('../../..');

const {
	ensureNetwork,
	ensureDeploymentPath,
	getDeploymentPathForNetwork,
	loadAndCheckRequiredSources,
	loadConnections,
} = require('../util');

const DEFAULTS = {
	network: 'kovan',
	gasLimit: 3e6,
	gasPrice: '1',
	batchSize: 15,
};

const flagContractSynthHolders = async ({
	network = DEFAULTS.network,
	deploymentPath,
	synth,
	outFile,
}) => {
	ensureNetwork(network);
	deploymentPath = deploymentPath || getDeploymentPathForNetwork({ network });
	ensureDeploymentPath(deploymentPath);

	const { synths } = loadAndCheckRequiredSources({
		deploymentPath,
		network,
	});

	if (synths.filter(({ name }) => name === synth).length < 1) {
		console.error(red(`Synth ${synth} not found!`));
		process.exitCode = 1;
		return;
	}

	if (!thegraph.issuance[network]) {
		console.error(red(`Issuance subgraph not available for network ${network}`));
		process.exitCode = 1;
		return;
	}

	const outFilePath = outFile || `${synth}Holders.json`;

	const { providerUrl } = loadConnections({
		network,
		useFork: false,
	});

	console.log(gray(`Provider url: ${providerUrl}`));
	console.log(gray(`Subgraph url: ${thegraph.issuance[network]}`));

	const provider = new ethers.providers.JsonRpcProvider(providerUrl);

	const synthHolders = await pageResults({
		api: thegraph.issuance[network],
		query: {
			entity: 'synthHolders',
			selection: {
				where: {
					synth: `\\"${synth}\\"`,
					balanceOf_gte: 1e8,
				},
				orderBy: 'balanceOf',
				orderDirection: 'desc',
			},
			properties: ['id', 'balanceOf'],
		},
		max: 5000,
		timeout: 10000,
	});

	console.log(`Received ${synthHolders.length} synth holders for synth ${synth}`);

	const totalBalance = sumBy(synthHolders, h => Number(h.balanceOf));

	for (const holder of synthHolders) {
		holder.address = holder.id.split('-')[0];

		const code = await provider.getCode(holder.address);

		holder.balance = holder.balanceOf;
		holder.share = (100 * Number(holder.balanceOf)) / totalBalance;
		holder.isContract = !!code.substr(2);

		delete holder.id;
		delete holder.balanceOf;

		console.log('holder address', holder.address, holder.share, holder.isContract);
	}

	fs.writeFileSync(outFilePath, JSON.stringify(synthHolders, undefined, 4));

	console.log(green(`Finished writing file to ${outFilePath}`));
};

module.exports = {
	flagContractSynthHolders,
	cmd: program =>
		program
			.command('flag-contract-synth-holders')
			.description('Record holders for a given synth which are contracts (not user address)')
			.option(
				'-d, --deployment-path <value>',
				`Path to a folder that has your input configuration file ${CONFIG_FILENAME} and where your ${DEPLOYMENT_FILENAME} files will go`
			)
			.option(
				'-n, --network [value]',
				'The network to run off.',
				x => x.toLowerCase(),
				DEFAULTS.network
			)
			.option('-s --synth [value]', 'The synth to check holders')
			.option('-o --outFile [value]', 'Name of the output file (default: <synth name>Holders.json')
			.action(flagContractSynthHolders),
};
