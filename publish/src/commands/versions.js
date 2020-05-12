'use strict';

const { CONFIG_FILENAME, DEPLOYMENT_FILENAME } = require('../constants');

const { ensureNetwork, ensureDeploymentPath, loadAndCheckRequiredSources } = require('../util');

const versions = async ({ network, deploymentPath }) => {
	ensureNetwork(network);
	ensureDeploymentPath(deploymentPath);

	// replace console.log so all output is simply the CSV contents
	const oldLogger = console.log.bind(console);
	console.log = () => {};

	const { versions } = loadAndCheckRequiredSources({
		deploymentPath,
		network,
	});

	const entries = [];
	for (const { tag, date, commit, contracts } of Object.values(versions)) {
		const base = { tag, date, commit };
		for (const [contract, { address, status, replaced_in: replacedIn }] of Object.entries(
			contracts
		)) {
			entries.push(
				Object.assign(
					{
						contract,
						address,
						status,
						replacedIn,
					},
					base
				)
			);
		}
	}
	const fields = ['tag', 'date', 'commit', 'contract', 'address', 'status', 'replacedIn'];

	let content = fields.join(','); // headers
	content += '\n' + entries.map(entry => fields.map(field => entry[field]).join(',')).join('\n');
	console.log = oldLogger;
	console.log(content);
};

module.exports = {
	versions,
	cmd: program =>
		program
			.command('versions')
			.description('Output version history of a network in a CSV format')
			.option('-n, --network <value>', 'The network to run off.', x => x.toLowerCase(), 'kovan')
			.option(
				'-d, --deployment-path <value>',
				`Path to a folder that has your input configuration file ${CONFIG_FILENAME} and where your ${DEPLOYMENT_FILENAME} files will go`
			)
			.action(versions),
};
