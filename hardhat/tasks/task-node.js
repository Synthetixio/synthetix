const { yellow } = require('chalk');
const { subtask, task } = require('hardhat/config');
const { TASK_NODE_SERVER_READY } = require('hardhat/builtin-tasks/task-names');

task('node', 'Run a node')
	.addOptionalParam('unlockedAccounts', 'Accounts to unlock')
	.setAction(async (taskArguments, hre, runSuper) => {
		const unlockedAccounts = (taskArguments.unlockedAccounts || '').split(/,/).filter(x => x);

		subtask(TASK_NODE_SERVER_READY).setAction(async ({ provider }, hre, runSuper) => {
			await runSuper();

			if (taskArguments.fork) {
				console.log(
					yellow('Successful fork of mainnet...')
					// yellow(`Successfully forked ${network} at block ${state.blockchain.forkBlockNumber}`)
				);

				await Promise.all(
					unlockedAccounts.map(address => {
						return provider.request({
							method: 'hardhat_impersonateAccount',
							params: [address],
						});
					})
				);
			}
		});

		await runSuper(taskArguments);
	});
