'use strict';

const fs = require('fs');
const path = require('path');

require('dotenv').config();

const Web3 = require('web3');
const commands = {
	build: require('../publish/src/commands/build').build,
	deploy: require('../publish/src/commands/deploy').deploy,
};

const snx = require('../index');

// load accounts used by local ganache in keys.json
const users = Object.entries(
	JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'keys.json'))).private_keys
).map(([pub, pri]) => ({
	public: pub,
	private: `0x${pri}`,
}));

(async () => {
	const network = 'local';

	// 1. build
	// await commands.build();

	const accounts = {
		deployer: users[0],
		first: users[1],
		second: users[2],
	};

	// 2. deploy
	// await commands.deploy({
	// 	network,
	// 	deploymentPath: path.join(__dirname, '..', 'publish', 'deployed', 'local'),
	// 	yes: true,
	// 	privateKey: accounts.deployer.private,
	// });

	// 3. interact
	const sources = snx.getSource({ network });
	const targets = snx.getTarget({ network });

	const web3 = new Web3(new Web3.providers.HttpProvider('http://127.0.0.1:8545'));
	web3.eth.accounts.wallet.add(accounts.deployer.private);
	const gasLimit = 250000;
	const gasPrice = web3.utils.toWei('5', 'gwei');
	const Synthetix = new web3.eth.Contract(
		sources['Synthetix'].abi,
		targets['ProxySynthetix'].address
	);

	// transfer SNX to first account
	await Synthetix.methods.transfer(accounts.first.public, web3.utils.toWei('100000')).send({
		from: accounts.deployer.public,
		gas: gasLimit,
		gasPrice,
	});
	const { timestamp } = await web3.eth.getBlock('latest');

	const [SNX, sUSD, sBTC] = ['SNX', 'sUSD', 'sBTC'].map(web3.utils.asciiToHex);
	// make sure exchange rates has a price
	const ExchangeRates = new web3.eth.Contract(
		sources['ExchangeRates'].abi,
		targets['ExchangeRates'].address
	);
	// TODO: need to update all rates....
	await ExchangeRates.methods.updateRates([SNX], [web3.utils.toWei('0.3')], timestamp).send({
		from: accounts.deployer.public,
		gas: gasLimit,
		gasPrice,
	});
	// issue
	await Synthetix.methods.issueMaxSynths(sUSD).send({
		from: accounts.deployer.public,
		gas: gasLimit,
		gasPrice,
	});
	// exchange
	// burn

	// 4. replace

	// 5. purge

	// 6. remove
})();
