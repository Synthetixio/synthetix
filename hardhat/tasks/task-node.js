const fs = require('fs');
const path = require('path');
const { knownAccounts, wrap } = require('../..');
const { red, gray, yellow } = require('chalk');
const { subtask, task } = require('hardhat/config');
const { TASK_NODE_SERVER_READY } = require('hardhat/builtin-tasks/task-names');

task('node', 'Run a node')
	.addOptionalParam('targetNetwork', 'Target network to simulate, i.e. mainnet or local', 'local')
	.addOptionalParam('hardfork', 'Target network hardfork, i.e. berlin or london', 'berlin')
	.setAction(async (taskArguments, hre, runSuper) => {
		// Enable forking if necessary
		if (taskArguments.fork) {
			throw new Error(
				red(
					'Forking is automatically managed in Synthetix. Please use `--target-network mainnet` instead.'
				)
			);
		}
		const network = taskArguments.targetNetwork;
		if (network !== 'local') {
			if (network === 'mainnet') {
				taskArguments.fork = process.env.PROVIDER_URL_MAINNET;
			}
			taskArguments.fork =
				taskArguments.fork || process.env.PROVIDER_URL.replace('network', network);

			console.log(yellow(`Forking ${network}...`));
		}

		// // Set hh 2.5.0 config to use london. See reference here: https://github.com/nomiclabs/hardhat/releases/tag/hardhat-core-v2.5.0
		// // That should be removed if we move to hh >2.6.0 since london is hardfork's default since that version
		// if (taskArguments.hardfork === 'london') {
		// 	hre.config.networks.hardhat.hardfork = 'london';
		// 	hre.config.networks.hardhat.gasPrice = 'auto';
		// }

		subtask(TASK_NODE_SERVER_READY).setAction(async ({ provider }, hre, runSuper) => {
			await runSuper();

			console.log(
				yellow(`Targeting Synthetix in ${network}${taskArguments.fork ? ' (forked)' : ''}`)
			);

			// Unlock any specified accounts, plus those
			// known as protocol users of the target network.
			const { getUsers } = wrap({ network, fs, path });
			const accounts = getUsers({ network })
				.filter(account => account.name !== 'fee')
				.filter(account => account.name !== 'zero')
				.concat(knownAccounts[network] || []);
			await Promise.all(
				accounts.map(account => {
					console.log(gray(`  > Unlocking ${account.name}: ${account.address}`));

					return provider.request({
						method: 'hardhat_impersonateAccount',
						params: [account.address],
					});
				})
			);
		});

		await runSuper(taskArguments);
	});
