'use strict';

const { gray } = require('chalk');

module.exports = async ({ account, addressOf, deployer, readProxyForResolver }) => {
	console.log(gray(`\n------ DEPLOY DAPP UTILITIES ------\n`));

	await deployer.deployContract({
		name: 'SynthUtil',
		deps: ['ReadProxyAddressResolver'],
		args: [addressOf(readProxyForResolver)],
	});

	await deployer.deployContract({
		name: 'DappMaintenance',
		args: [account],
	});

	await deployer.deployContract({
		name: 'BinaryOptionMarketData',
	});
};
