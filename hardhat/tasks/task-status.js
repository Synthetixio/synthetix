const { task } = require('hardhat/config');
const { setupProvider } = require('../util/setupProvider');
const { ensureDeploymentPath, getDeploymentPathForNetwork } = require('../../publish/src/util');
const { logHeader, logActionError, actions, ActionNames } = require('../util/statusActions');

const defaultActions = [
	'getSynthetix',
	'getDebtCache',
	'getSynthetixState',
	'getSupplySchedule',
	'getFeePool',
	'getFeePoolState',
	'getAddressResolver',
	'getSystemSettings',
	'getExchangeRates',
];

task('status', 'Query state of the system on any network')
	.addFlag('useOvm', 'Use an Optimism chain')
	.addFlag('useFork', 'Use a local fork')
	.addOptionalParam('targetNetwork', 'The network to run off', 'mainnet')
	.addOptionalParam('addresses', 'Addresses to perform particular checks on')
	.addOptionalParam('currencyKeys', 'Keys to get exchange rate on')
	.addOptionalParam('executeActions', 'Areas to get state')
	.addOptionalParam('block', 'Block number to check again')
	.addOptionalParam('providerUrl', 'The http provider to use for communicating with the blockchain')
	.addOptionalParam('deploymentPath', 'Specify the path to the deployment data directory')
	.setAction(async (taskArguments, hre, runSuper) => {
		_commonInputAndSetup({ hre, taskArguments });
		const statusConf = hre.config.status;
		logHeader({ statusConf });

		const actionNames = Object.values(ActionNames);

		for (const action of statusConf.actions) {
			if (actionNames.includes(action)) {
				await actions[action](statusConf);
			} else {
				logActionError({ actionName: action });
			}
		}
	});

function _commonInputAndSetup({ hre, taskArguments }) {
	if (!hre.config.status) {
		hre.config.status = {};
	}
	const statusConf = hre.config.status;

	statusConf.useOvm = taskArguments.useOvm;
	statusConf.useFork = taskArguments.useFork;
	statusConf.network = taskArguments.targetNetwork.toLowerCase();

	statusConf.addresses = taskArguments.addresses ? taskArguments.addresses.split(',') : [];
	statusConf.listedCurrencies = taskArguments.currencyKeys
		? taskArguments.currencyKeys.split(',')
		: undefined;
	statusConf.actions = taskArguments.executeActions
		? taskArguments.executeActions.split(',')
		: defaultActions;
	statusConf.blockOptions = {
		blockTag: taskArguments.block ? +taskArguments.block : 'latest',
	};
	statusConf.providerUrl = taskArguments.providerUrl;
	statusConf.deploymentPath =
		taskArguments.deploymentPath || getDeploymentPathForNetwork({ network: taskArguments.network });

	statusConf.provider = setupProvider(statusConf);
	ensureDeploymentPath(statusConf.deploymentPath);
}
