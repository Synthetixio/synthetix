'use strict';

const fs = require('fs');
const path = require('path');
const execFile = require('util').promisify(require('child_process').execFile);
const { gray, yellow, green, red } = require('chalk');
const semver = require('semver');

const { stringify, loadAndCheckRequiredSources } = require('../util');

const { networks, getPathToNetwork } = require('../../..');

const versionsUpdate = async ({ versionTag, release, useOvm }) => {
	console.log(gray('Checking deployments for version:', versionTag));

	// prefix a "v" to the tag
	versionTag = /^v/.test(versionTag) ? versionTag : 'v' + versionTag;

	for (const network of networks.filter(n => n !== 'local')) {
		const deploymentPath = getPathToNetwork({ network, path, useOvm });
		if (!fs.existsSync(deploymentPath)) {
			continue;
		}

		const { deployment, deploymentFile, versions, versionsFile } = loadAndCheckRequiredSources({
			network,
			deploymentPath,
		});

		for (const tag of Object.keys(versions)) {
			if (tag === versionTag) {
				throw Error(`Version: ${versionTag} already used in network: ${network}`);
			} else if (semver.lt(versionTag, semver.coerce(tag)) && !/-ovm$/.test(versionTag)) {
				throw Error(
					`Version: ${versionTag} is less than existing version ${tag} in network: ${network}`
				);
			}
		}

		// Get commit and date of last commit to the deployment file
		const { stdout } = await execFile('git', [
			'log',
			'-n 1',
			'--pretty=format:"%H %aI"',
			'--',
			deploymentFile,
		]);
		const [commit, date] = stdout.replace(/\n|"/g, '').split(/\s/);

		const entry = {
			tag: versionTag,
			fulltag: versionTag,
			release,
			network,
			date,
			commit,
			contracts: {},
		};

		for (const { name, address, source } of Object.values(deployment.targets)) {
			// if the address is already in the version file, skip it
			if (new RegExp(`"${address}"`).test(JSON.stringify(versions))) {
				continue;
			} else {
				console.log(
					gray(
						'Found new contract address',
						green(address),
						'for contract',
						green(name),
						'adding it as current'
					)
				);
				entry.contracts[name] = {
					address,
					status: 'current',
					keccak256: (deployment.sources[source].source || {}).keccak256,
				};

				// look for that same name with status of current and update it
				for (const { contracts } of Object.values(versions)) {
					if (name in contracts && contracts[name].status === 'current') {
						console.log(
							gray(
								'Found existing contract',
								yellow(name),
								'with address',
								yellow(contracts[name].address),
								'in versions, updated it as replaced'
							)
						);
						contracts[name].status = 'replaced';
						contracts[name].replaced_in = versionTag;
					}
				}
			}
		}

		// now for each contract in versions, if it's marked "current" and not in deployments, then consider it deleted
		for (const { contracts } of Object.values(versions)) {
			for (const [name, entry] of Object.entries(contracts)) {
				// do not mark these contracts as deleted for now
				if (['ArbRewarder', 'Unipool'].includes(name)) {
					continue;
				}
				if (entry.status === 'current' && !(name in deployment.targets)) {
					console.log(
						'Could not find',
						red(name),
						'with address',
						red(entry.address),
						'in current deployment. Marking as deleted'
					);
					entry.status = 'deleted';
				}
			}
		}

		if (Object.keys(entry.contracts).length > 0) {
			versions[versionTag] = entry;
		}

		// now write the versions file
		fs.writeFileSync(versionsFile, stringify(versions));
	}
};

module.exports = {
	versionsUpdate,
	cmd: program =>
		program
			.command('versions-update')
			.description('Update all version.json files for each deployment')
			.option('-v, --version-tag <value>', `The current version being updated`)
			.option('-r, --release <value>', `The name of the release`)
			.option('-z, --use-ovm', 'Target deployment for the OVM (Optimism).')
			.action(versionsUpdate),
};
