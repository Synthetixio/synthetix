'use strict';

const fs = require('fs');
const { black, gray, yellow, red, cyan, bgYellow } = require('chalk');
const w3utils = require('web3-utils');
const Web3 = require('web3');

const { CONFIG_FILENAME, DEPLOYMENT_FILENAME } = require('../constants');

const {
	ensureNetwork,
	loadAndCheckRequiredSources,
	loadConnections,
	confirmAction,
	stringify,
} = require('../util');

module.exports = program =>
	program
		.command('owner')
		.description('Owner script - a list of transactions required by the owner.')
		.option(
			'-d, --deployment-path <value>',
			`Path to a folder that has your input configuration file ${CONFIG_FILENAME} and where your ${DEPLOYMENT_FILENAME} files will go`
		)
		.option('-o, --new-owner <value>', 'The address of you as owner (please include the 0x prefix)')
		.option('-n, --network <value>', 'The network to run off.', x => x.toLowerCase(), 'kovan')
		.action(async ({ network, newOwner, deploymentPath }) => {
			ensureNetwork(network);

			if (!newOwner || !w3utils.isAddress(newOwner)) {
				console.error(red('Invalid new owner to nominate. Please check the option and try again.'));
				process.exit(1);
			} else {
				newOwner = newOwner.toLowerCase();
			}
			// ensure all nominated owners are accepted
			const { config, deployment, ownerActions, ownerActionsFile } = loadAndCheckRequiredSources({
				deploymentPath,
				network,
			});

			const { providerUrl, etherscanLinkPrefix } = loadConnections({ network });
			const web3 = new Web3(new Web3.providers.HttpProvider(providerUrl));

			const confirmOrEnd = async message => {
				try {
					await confirmAction(
						message +
							cyan(
								'\nPlease type "y" when transaction completed, or enter "n" to cancel and resume this later? (y/n) '
							)
					);
				} catch (err) {
					console.log(gray('Operation cancelled'));
					process.exit();
				}
			};

			console.log(
				gray('Running through operations during deployment that couldnt complete as not owner.')
			);

			for (const [key, entry] of Object.entries(ownerActions)) {
				const { action, link, complete } = entry;
				if (complete) continue;

				await confirmOrEnd(
					yellow('YOUR TASK: ') + `Invoke ${bgYellow(black(action))} (${key}) via ${cyan(link)}`
				);

				entry.complete = true;
				fs.writeFileSync(ownerActionsFile, stringify(ownerActions));
			}

			console.log(gray('Looking for contracts whose ownership we should accept'));

			for (const contract of Object.keys(config)) {
				const { address, source } = deployment.targets[contract];
				const { abi } = deployment.sources[source];
				const deployedContract = new web3.eth.Contract(abi, address);

				// ignore contracts that don't support Owned
				if (!deployedContract.methods.owner) {
					continue;
				}
				const currentOwner = (await deployedContract.methods.owner().call()).toLowerCase();
				const nominatedOwner = (await deployedContract.methods
					.nominatedOwner()
					.call()).toLowerCase();

				if (currentOwner === newOwner) {
					console.log(gray(`${newOwner} is already the owner of ${contract}`));
				} else if (nominatedOwner === newOwner) {
					await confirmOrEnd(
						yellow(
							`YOUR TASK: Invoke ${contract}.acceptOwnership() via ${etherscanLinkPrefix}/address/${address}#writeContract`
						)
					);
				} else {
					console.log(
						cyan(
							`Cannot acceptOwnership on ${contract} as nominatedOwner: ${nominatedOwner} isn't the newOwner ${newOwner} you specified. Have you run the nominate command yet?`
						)
					);
				}
			}
		});
