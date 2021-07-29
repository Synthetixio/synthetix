const { task } = require('hardhat/config');
const { green, cyan } = require('chalk');

task('status', 'Query state of the system on any network')
	.addFlag('useOvm', 'Use an Optimism chain')
	.addFlag('useFork', 'Use a local fork')
	.addOptionalParam('network', 'The network to run off', 'mainnet')
	.addOptionalParam('addresses', 'Addresses to perform particular checks on')
	.addOptionalParam('block', 'Block number to check again')
	.addOptionalParam('providerUrl', 'The http provider to use for communicating with the blockchain')
	.addOptionalParam('deploymentPath', 'Specify the path to the deployment data directory')
	.setAction(async (taskArguments, hre, runSuper) => {
		_commonInputAndSetup({ hre, taskArguments });
		_logGeneral({ hre });
	});

task('status:synthetix', 'Query state of the system on any network - only Synthetix')
	.addFlag('useOvm', 'Use an Optimism chain')
	.addFlag('useFork', 'Use a local fork')
	.addOptionalParam('network', 'The network to run off', 'mainnet')
	.addOptionalParam('addresses', 'Addresses to perform particular checks on')
	.addOptionalParam('block', 'Block number to check again')
	.addOptionalParam('providerUrl', 'The http provider to use for communicating with the blockchain')
	.addOptionalParam('deploymentPath', 'Specify the path to the deployment data directory')
	.setAction(async (taskArguments, hre, runSuper) => {
		_commonInputAndSetup({ hre, taskArguments });
		_logGeneral({ hre });
	});

task('status:debtcache', 'Query state of the system on any network - only Debt Cache')
	.addFlag('useOvm', 'Use an Optimism chain')
	.addFlag('useFork', 'Use a local fork')
	.addOptionalParam('network', 'The network to run off', 'mainnet')
	.addOptionalParam('addresses', 'Addresses to perform particular checks on')
	.addOptionalParam('block', 'Block number to check again')
	.addOptionalParam('providerUrl', 'The http provider to use for communicating with the blockchain')
	.addOptionalParam('deploymentPath', 'Specify the path to the deployment data directory')
	.setAction(async (taskArguments, hre, runSuper) => {
		_commonInputAndSetup({ hre, taskArguments });
		_logGeneral({ hre });
	});

task('status:feepool', 'Query state of the system on any network - only Fee Pool')
	.addFlag('useOvm', 'Use an Optimism chain')
	.addFlag('useFork', 'Use a local fork')
	.addOptionalParam('network', 'The network to run off', 'mainnet')
	.addOptionalParam('addresses', 'Addresses to perform particular checks on')
	.addOptionalParam('block', 'Block number to check again')
	.addOptionalParam('providerUrl', 'The http provider to use for communicating with the blockchain')
	.addOptionalParam('deploymentPath', 'Specify the path to the deployment data directory')
	.setAction(async (taskArguments, hre, runSuper) => {
		_commonInputAndSetup({ hre, taskArguments });
		_logGeneral({ hre });
	});

task('status:exchangerates', 'Query state of the system on any network - only ExchangeRates')
	.addFlag('useOvm', 'Use an Optimism chain')
	.addFlag('useFork', 'Use a local fork')
	.addOptionalParam('network', 'The network to run off', 'mainnet')
	.addOptionalParam('addresses', 'Addresses to perform particular checks on')
	.addOptionalParam('block', 'Block number to check again')
	.addOptionalParam('providerUrl', 'The http provider to use for communicating with the blockchain')
	.addOptionalParam('deploymentPath', 'Specify the path to the deployment data directory')
	.setAction(async (taskArguments, hre, runSuper) => {
		_commonInputAndSetup({ hre, taskArguments });
		_logGeneral({ hre });
	});

function _commonInputAndSetup({ hre, taskArguments }) {}

function _logGeneral({ hre }) {
	logSection('Info');

	logItem('Network', hre.config.status.network);
	logItem('Deployment', hre.config.status.deploymentPath);
	logItem('Optimism', hre.config.status.useOvm);
	logItem('Block #', hre.config.status.blockOptions.blockTag);
	logItem('Provider', hre.config.status.providerUrl);
}

const logSection = sectionName => {
	console.log(green(`\n=== ${sectionName}: ===`));
};

const logItem = (itemName, itemValue, indent = 1, color = undefined) => {
	const hasValue = itemValue !== undefined;
	const spaces = '  '.repeat(indent);
	const name = cyan(`* ${itemName}${hasValue ? ':' : ''}`);
	const value = hasValue ? itemValue : '';

	if (color) {
		console.log(color(spaces, name, value));
	} else {
		console.log(spaces, name, value);
	}
};
