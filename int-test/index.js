'use strict';

const fs = require('fs');
const path = require('path');

const { gray } = require('chalk');
require('dotenv').config();

const Web3 = require('web3');
const commands = {
	build: require('../publish/src/commands/build').build,
	deploy: require('../publish/src/commands/deploy').deploy,
	replaceSynths: require('../publish/src/commands/replace-synths').replaceSynths,
};

const snx = require('../index');

const ZERO_ADDRESS = '0x' + '0'.repeat(40);

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
	await commands.build();

	const accounts = {
		deployer: users[0],
		first: users[1],
		second: users[2],
	};

	const deploymentPath = path.join(__dirname, '..', 'publish', 'deployed', 'local');

	// 2. deploy
	await commands.deploy({
		network,
		deploymentPath,
		yes: true,
		privateKey: accounts.deployer.private,
	});

	// 3. interact
	const sources = snx.getSource({ network });
	const targets = snx.getTarget({ network });
	const synths = snx.getSynths({ network }).filter(({ name }) => name !== 'sUSD' && name !== 'XDR');

	const web3 = new Web3(new Web3.providers.HttpProvider('http://127.0.0.1:8545'));
	web3.eth.accounts.wallet.add(accounts.deployer.private);
	const gasLimit = 5000000;
	const gasPrice = web3.utils.toWei('5', 'gwei');
	const Synthetix = new web3.eth.Contract(
		sources['Synthetix'].abi,
		targets['ProxySynthetix'].address
	);

	// transfer SNX to first account
	console.log(gray('Transferring 100k SNX to user1'));
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
	// update rates
	console.log(gray('Updating rates'));
	await ExchangeRates.methods
		.updateRates(
			[SNX].concat(synths.map(({ name }) => web3.utils.asciiToHex(name))),
			[web3.utils.toWei('0.3')].concat(synths.map(() => web3.utils.toWei('1'))),
			timestamp
		)
		.send({
			from: accounts.deployer.public,
			gas: gasLimit,
			gasPrice,
		});
	// issue
	console.log(gray('User1 issueMaxSynths'));
	await Synthetix.methods.issueMaxSynths(sUSD).send({
		from: accounts.first.public,
		gas: gasLimit,
		gasPrice,
	});
	// get balance
	const sUSDContract = new web3.eth.Contract(sources['Synth'].abi, targets['ProxysUSD'].address);
	const balance = await sUSDContract.methods.balanceOf(accounts.first.public).call();
	console.log(gray('User1 sUSD balance', web3.utils.fromWei(balance)));

	// exchange
	console.log(gray('User1 exchange 1000 sUSD for sBTC'));
	await Synthetix.methods.exchange(sUSD, web3.utils.toWei('1000'), sBTC, ZERO_ADDRESS).send({
		from: accounts.first.public,
		gas: gasLimit,
		gasPrice,
	});
	// burn
	console.log(gray('User1 burnSynths 10 sUSD'));
	await Synthetix.methods.burnSynths(sUSD, web3.utils.toWei('10')).send({
		from: accounts.first.public,
		gas: gasLimit,
		gasPrice,
	});

	// 4. replace
	console.log(gray('Replace sBTC with PurgeableSynth'));
	await commands.replaceSynths({
		network,
		deploymentPath,
		yes: true,
		privateKey: accounts.deployer.private,
		subclass: 'PurgeableSynth',
		synthsToReplace: ['sBTC'],
	});

	// 5. purge

	// 6. remove
})();
