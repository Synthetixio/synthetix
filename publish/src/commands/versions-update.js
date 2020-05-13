'use strict';

const path = require('path');
const { gray, green, red } = require('chalk');

const { DEPLOYMENT_FILENAME, VERSIONS_FILENAME } = require('../constants');

const { ensureDeploymentPath, stringify, loadAndCheckRequiredSources } = require('../util');

const { networks, getPathToNetwork } = require('../../..');

const versionsUpdate = async ({ versionTag }) => {
	console.log(gray('Checking deployments for version:', versionTag));

	// given $version from releases
	for (const network of networks.filter(n => n !== 'local')) {
		const { deployment, deploymentFile, versions, versionsFile } = loadAndCheckRequiredSources({
			network,
			deploymentPath: getPathToNetwork({ network }),
		});

		for (const { name, address } of Object.values(deployment.targets)) {
			// console.log(network, name, address);
			//    for each contract in deployment.targets
			//       if address is in versions file, no change
			if (new RegExp(`"${address}"`).test(JSON.stringify(versions))) {
				continue;
			} else {
				console.log(name, address);
			}
			//       else
			//          - create new entry for $version if none yet (need to shell to get git commit hash)
			//          - add contract as "current"
			//          - if contract is in there prior, update it as "replaced", update replaced_in to $version
			//    for each contract in version
			//        if not in target, then status is "deleted"
			//
			//
		}
	}
};

module.exports = {
	versionsUpdate,
	cmd: program =>
		program
			.command('versions-update')
			.description('Update all version.json files for each deployment')
			.option('-v, --version-tag <value>', `The current version being updated`)
			.action(versionsUpdate),
};
