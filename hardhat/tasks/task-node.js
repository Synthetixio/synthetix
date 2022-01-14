const fs = require('fs');
const path = require('path');
const { knownAccounts, wrap } = require('../..');
const { red, gray, yellow } = require('chalk');
const { subtask, task } = require('hardhat/config');
const { TASK_NODE_SERVER_READY } = require('hardhat/builtin-tasks/task-names');

task('node', 'Run a node')
	.addOptionalParam('targetNetwork', 'Target network to simulate, i.e. mainnet or local', 'local')
	.addFlag('useOvm', 'Use OVM', false)
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
		const useOvm = taskArguments.useOvm;
		if (network !== 'local') {
			if (network === 'mainnet') {
				taskArguments.fork = process.env.PROVIDER_URL_MAINNET;
			}
			taskArguments.fork =
				taskArguments.fork || process.env.PROVIDER_URL.replace('network', network);

			console.log(yellow(`Forking ${network}...`));
		}

		subtask(TASK_NODE_SERVER_READY).setAction(async ({ provider }, hre, runSuper) => {
			await runSuper();

			console.log(
				yellow(`Targeting Synthetix in ${network}${taskArguments.fork ? ' (forked)' : ''}`)
			);

			// Unlock any specified accounts, plus those
			// known as protocol users of the target network.
			const { getUsers } = wrap({ network, fs, path });
			const accounts = getUsers({ network, useOvm })
				.filter(account => account.name !== 'fee')
				.filter(account => account.name !== 'zero')
				.concat(knownAccounts[network] || []);
			await Promise.all(
				accounts.map(async account => {
					console.log(gray(`  > Unlocking & Funding ${account.name}: ${account.address}`));

					// owner might not have eth when we impersonate them

					await provider.request({
						method: 'hardhat_setBalance',
						params: [account.address, '0x10000000000000000000000'],
					});

					return provider.request({
						method: 'hardhat_impersonateAccount',
						params: [account.address],
					});
				})
			);
		});

		await runSuper(taskArguments);
	});
