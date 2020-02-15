'use strict';

const path = require('path');
const Web3 = require('web3');
const { gray, green, yellow, red } = require('chalk');
const { toWei, fromWei, toChecksumAddress } = require('web3-utils');
require('dotenv').config();

const { loadCompiledFiles, getLatestSolTimestamp } = require('../publish/src/solidity');

const deployCmd = require('../publish/src/commands/deploy');
const { buildPath } = deployCmd.DEFAULTS;
const commands = {
	build: require('../publish/src/commands/build').build,
	deploy: deployCmd.deploy,
	replaceSynths: require('../publish/src/commands/replace-synths').replaceSynths,
	purgeSynths: require('../publish/src/commands/purge-synths').purgeSynths,
	removeSynths: require('../publish/src/commands/remove-synths').removeSynths,
	importFeePeriods: require('../publish/src/commands/import-fee-periods').importFeePeriods,
};
const snx = require('../');
const { CONTRACTS_FOLDER } = require('../publish/src/constants');
const { toBytes32 } = snx;
const snxData = require('synthetix-data');
const { fetchGanacheUsers } = require('../test/utils/localDeployUtils');
const { currentTime, fromUnit } = require('../test/utils/testUtils');

(async function() {
	// load accounts used by local ganache in keys.json
	const users = fetchGanacheUsers();

	const accounts = {
		deployer: users[0],
		first: users[1],
		second: users[2],
	};

	// get last modified sol file
	const latestSolTimestamp = getLatestSolTimestamp(CONTRACTS_FOLDER);

	// get last build
	const { earliestCompiledTimestamp } = loadCompiledFiles({ buildPath });

	if (latestSolTimestamp > earliestCompiledTimestamp) {
		console.log('Found source file modified after build. Rebuilding...');
		await commands.build({ showContractSize: true });
	} else {
		console.log('Skipping build as everything up to date');
	}

	function getContract({ name, proxy }) {
		const sources = snx.getSource({ network: this.network });
		const targets = snx.getTarget({ network: this.network });
		const { web3 } = this;
		return new web3.eth.Contract(sources[targets[name].source].abi, targets[proxy || name].address);
	}

	const local = {
		network: 'local',
		sources: snx.getSource({ network: 'local' }),
		targets: snx.getTarget({ network: 'local' }),
		web3: new Web3(new Web3.providers.HttpProvider('http://127.0.0.1:8545')),
		getContract,
	};

	const mainnet = {
		network: 'mainnet',
		web3: new Web3(
			new Web3.providers.HttpProvider(`https://infura.io/v3/${process.env.INFURA_PROJECT_ID}`)
		),
		synths: snx
			.getSynths({ network: 'mainnet' })
			.filter(({ name }) => ['sUSD', 'XDR'].indexOf(name) < 0),
		getContract,
	};

	const gasLimit = 5e6;
	const gasPrice = toWei('5', 'gwei');

	local.web3.eth.accounts.wallet.add(accounts.deployer.private);

	// determine if we need a deploy
	const codeForSynthetix = await local.web3.eth.getCode(local.targets['Synthetix'].address);

	if (codeForSynthetix === '0x') {
		await commands.deploy({
			network: 'local',
			deploymentPath: path.join(__dirname, '..', 'publish', 'deployed', 'local'),
			yes: true,
			privateKey: accounts.deployer.private,
			addNewSynths: true,
		});
	}

	// get all rate updates in the last hour
	const aboutAnHourAgo = Math.round(Date.now() / 1000 - 5000);
	let rates = await snxData.rate.updates({ minTimestamp: aboutAnHourAgo });

	// remove older rates (it's sorted in newest to oldest)
	const rateCache = {};
	rates = rates.filter(({ synth, rate }, i) =>
		rateCache[synth] ? false : (rateCache[synth] = true)
	);

	// now update all inverse synths to use the regular price (as the inverse is calculated on-chain)
	rates = rates
		.map(entry => {
			if (/^i/.test(entry.synth)) {
				const longRate = rates.find(candidate => candidate.synth === `s${entry.synth.slice(1)}`);
				if (longRate) {
					entry.rate = longRate.rate;
				} else {
					console.log(red('Cannot find rate in last update for', entry.synth));
					return undefined;
				}
			}
			return entry;
		})
		.filter(e => !!e); // o

	// now populate local with these rates
	local.ExchangeRates = local.getContract({ name: 'ExchangeRates' });

	const timestamp = await currentTime();
	await local.ExchangeRates.methods
		.updateRates(
			rates.map(({ synth }) => toBytes32(synth)),
			rates.map(({ rate }) => toWei(rate.toString())),
			timestamp
		)
		.send({
			from: accounts.deployer.public,
			gas: gasLimit,
			gasPrice,
		});

	// when a price is detected on mainnet, persist it locally
	snxData.rate.observe().subscribe({
		next({ synth, rate, timestamp }) {
			const keysToUpdate = [toBytes32(synth)];
			const ratesToUpdate = [rate];
			// skip inverse synths, they will be done by their pair
			if (/^i/.test(synth)) {
				return;
				// if this synth has an inverse pair
			} else if (
				mainnet.synths.find(
					candidate => candidate.inverted && candidate.name.slice(1) === synth.slice(1)
				)
			) {
				keysToUpdate.push(toBytes32(`i${synth.slice(1)}`));
				ratesToUpdate.push(rate);
				console.log(
					gray('Rate Update: Adding', synth, 'at', rate / 1e18, 'as well as its inverse')
				);
			} else {
				console.log(gray('Rate Update: Adding', synth, 'at', rate / 1e18));
			}

			local.ExchangeRates.methods.updateRates(keysToUpdate, ratesToUpdate, timestamp);
		},
	});

	local.Synthetix = local.getContract({ name: 'Synthetix', proxy: 'ProxySynthetix' });
	local.AddressResolver = local.getContract({ name: 'AddressResolver' });
	local.Exchanger = local.getContract({ name: 'Exchanger' });

	const issueSynthsToUser = async ({ user, amount, synth }) => {
		// await local.AddressResolver.methods
		// 	.importAddresses([toBytes32('Synthetix')], [toChecksumAddress(accounts.deployer.public)])
		// 	.send({
		// 		from: accounts.deployer.public,
		// 		gas: gasLimit,
		// 		gasPrice,
		// 	});

		// console.log('deployer:', accounts.deployer.public);
		// console.log('owner', await synth.methods.owner().call());
		// console.log('actual Synthetix', local.targets['Synthetix'].address);

		// console.log('Now issue', user, amount);
		await synth.methods.issue(user, toWei(amount)).send({
			from: toChecksumAddress(accounts.deployer.public),
			gas: gasLimit,
			gasPrice,
		});

		// console.log('Now done, revert addressResolver');

		// now undo the step that allowed us to issue directly
		// await local.AddressResolver.methods
		// 	.importAddresses([toBytes32('Synthetix')], [local.targets['Synthetix'].address])
		// 	.send({
		// 		from: accounts.deployer.public,
		// 		gas: gasLimit,
		// 		gasPrice,
		// 	});
	};

	const userCache = {};
	let userCount = 1;
	snxData.exchanges.observe().subscribe({
		async next(exchange) {
			const {
				fromAddress,
				toAddress,
				fromCurrencyKey,
				fromAmount,
				toCurrencyKey,
				fromAmountInUSD,
			} = exchange;
			let user = fromAddress;
			// when user is behind a contract, use the contract as the user to track
			if (fromAddress !== toAddress) {
				user = toAddress;
			}
			// no user yet
			if (!userCache[user]) {
				userCache[user] = users[userCount++];
				local.web3.eth.accounts.wallet.add(userCache[user].private);
				console.log(green(`New user on exchange ${user}, associating locally`));
			} else {
				console.log(gray('Existing user on exchange:', user));
			}

			// does the user have sufficient balance?

			// first ensure we have the synth contract
			const synthContractName = 'Synth' + fromCurrencyKey;
			if (!local[synthContractName]) {
				local[synthContractName] = local.getContract({
					name: synthContractName,
					proxy: 'Proxy' + fromCurrencyKey,
				});
			}

			// now check balance
			const localSynthBalance = await local[synthContractName].methods.balanceOf(user).call();

			// and if insufficient, we need to issue them synths
			if (Number(fromWei(localSynthBalance)) < Number(fromAmount)) {
				console.log(gray('Issuing', user, ' ', fromAmount, 'of', fromCurrencyKey));
				await issueSynthsToUser({
					user,
					amount: fromAmount.toString(),
					synth: local[synthContractName],
				});
			}

			const settlementOwing = await local.Exchanger.methods
				.settlementOwing(user, toBytes32(fromCurrencyKey))
				.call();

			console.log(
				gray(
					'Settlement owing for',
					user,
					'is',
					fromUnit(settlementOwing.reclaimAmount),
					fromUnit(settlementOwing.rebateAmount)
				)
			);

			console.log(
				yellow(
					'Now trying exchange for',
					user,
					fromCurrencyKey,
					fromAmount,
					toCurrencyKey,
					`(${fromAmountInUSD} USD)`
				)
			);
			// now simulate the mainnet trade locally
			const txn = await local.Synthetix.methods
				.exchange(
					toBytes32(fromCurrencyKey),
					toWei(fromAmount.toString()),
					toBytes32(toCurrencyKey)
				)
				.send({
					from: userCache[user].public,
					gas: gasLimit,
					gasPrice,
				});

			if (txn.events.ExchangeReclaim) {
				console.log(
					green('Reclaim:', JSON.stringify(txn.events.ExchangeReclaim.returnValues, null, '\t'))
				);
			}
			if (txn.events.ExchangeRebate) {
				console.log(
					red('REBATE', JSON.stringify(txn.events.ExchangeRebate.returnValues, null, '\t'))
				);
			}
			// console.log(JSON.stringify(txn, null, '\t'));
		},
	});
	// And listen for SynthExchange event
	//    If user does not exist locally,
	//       then assign from the users list
	//    If they don't have the balance for the exchange (Synth.at(currencyKey).balanceOf(user))
	//       then issue them enough to maje the trade
	//    Perform the trade
	//      If it fails, log the reason (could be waiting period)
	//      If Reclaim or Rebate event, log it, if neither, log that as well
	//        Track in a counter.
	//
})();
