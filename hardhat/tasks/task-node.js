const fs = require('fs');
const path = require('path');
const { knownAccounts, wrap } = require('../..');
const { red, gray, yellow } = require('chalk');
const { subtask, task } = require('hardhat/config');
const { TASK_NODE_SERVER_READY } = require('hardhat/builtin-tasks/task-names');

task('node', 'Run a node')
	.addOptionalParam('targetNetwork', 'Target network to simulate, i.e. mainnet or local', 'local')
	.setAction(async (taskArguments, hre, runSuper) => {
		// Enable forking if necessary
		if (taskArguments.fork) {
			throw new Error(
				red(
					'Forking is automatically managed in Synthetix. Please use `--target-network mainnet` instead.'
				)
			);
		}
		if (taskArguments.targetNetwork === 'mainnet') {
			taskArguments.fork =
				process.env.PROVIDER_URL_MAINNET || process.env.PROVIDER_URL.replace('network', 'mainnet');

			console.log(yellow('Forking Mainnet...'));
		}

		subtask(TASK_NODE_SERVER_READY).setAction(async ({ provider }, hre, runSuper) => {
			await runSuper();

			const network = taskArguments.targetNetwork;
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
