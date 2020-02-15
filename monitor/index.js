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
const {
	fastForwardTo,
	currentTime,
	fromUnit,
	takeSnapshot,
	restoreSnapshot,
} = require('../test/utils/testUtils');

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

	const snapshotId = await takeSnapshot(); // take shapshot to undo everything

	local.ExchangeRates = local.getContract({ name: 'ExchangeRates' });
	local.Synthetix = local.getContract({ name: 'Synthetix', proxy: 'ProxySynthetix' });
	local.AddressResolver = local.getContract({ name: 'AddressResolver' });
	local.Exchanger = local.getContract({ name: 'Exchanger' });
	local.ExchangeState = local.getContract({ name: 'ExchangeState' });

	// Note: trying to override the 'Synthetix' address in AddressResolver with the owner doesn't seem to
	// work when trying to allow the owner to issue synths. I suspect this is due to
	// some difference in how the address is passed in the options ({ from: owner }) in web3
	// vs in truffle. (Tried with toChecksumAddress() but still nothing) - JJ
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

	try {
		// from some starting point in time
		const startingDate = new Date(2020, 1, 14, 4, 0, 0);
		const startingPoint = Math.round(startingDate.getTime() / 1000);
		const endingPoint = startingPoint + 3600 * 1; // a few hours later

		// now fetch the SynthExchange events between those timestamps
		const exchanges = await snxData.exchanges.since({
			minTimestamp: startingPoint,
			maxTimestamp: endingPoint,
		});

		// and now fetch all rates 1.5hours before right until the last exchange
		const rates = (
			await snxData.rate.updates({
				minTimestamp: startingPoint - 5400,
				maxTimestamp: endingPoint,
				max: Infinity,
			})
		)
			.reduce((memo, cur) => {
				const lastEntry = memo.slice(-1)[0] || {};
				if (lastEntry.timestamp === cur.timestamp) {
					// don't add any dupes from a single update (these can come from aggregators receiving
					// multiple oracle responses within a block and calculating the mean from them)
					if (lastEntry.synths.indexOf(cur.synth) < 0) {
						lastEntry.rates.push(cur.rate);
						lastEntry.synths.push(cur.synth);
					}
				} else {
					const newEntry = {
						timestamp: cur.timestamp,
						rates: [cur.rate],
						synths: [cur.synth],
						date: new Date(cur.timestamp),
					};
					memo = memo.concat(newEntry);
				}
				return memo;
			}, [])
			.map(entry => {
				const { rates, synths } = entry;
				// now fix inverses to use long prices
				for (const [i, synth] of Object.entries(synths)) {
					if (/^i/.test(synth)) {
						const longRateIndex = synths.indexOf(`s${synth.slice(1)}`);
						if (longRateIndex >= 0) {
							rates[i] = rates[longRateIndex];
						} else {
							console.log(red('Cannot find rate in last update for', synth));
						}
					}
				}
				return entry;
			});

		// now create a combination of events in chronological order
		const events = exchanges.concat(rates).sort((a, b) => (a.timestamp > b.timestamp ? 1 : -1));

		const userCache = {};
		let userCount = 1;

		for (const event of events) {
			const { timestamp } = event;
			console.log('Date:', new Date(timestamp));
			const _currentTime = await currentTime();
			if (_currentTime < Math.round(timestamp / 1000)) {
				await fastForwardTo(new Date(timestamp));
			}

			if (Array.isArray(event.rates)) {
				// Handle a rate update
				const { rates, synths } = event;
				// now update this rate
				console.log(gray('Setting rate of', synths, 'to', rates));
				await local.ExchangeRates.methods
					.updateRates(
						synths.map(toBytes32),
						rates.map(r => toWei(r.toString())),
						Math.round(timestamp / 1000)
					)
					.send({
						from: accounts.deployer.public,
						gas: gasLimit,
						gasPrice,
					});
			} else {
				// handle an exchange
				const {
					fromAddress,
					toAddress,
					fromCurrencyKey,
					fromAmount,
					toCurrencyKey,
					fromAmountInUSD,
				} = event;

				let user = fromAddress;
				// when user is behind a contract, use the contract as the user to track
				if (fromAddress !== toAddress) {
					user = toAddress;
				}

				// TEMP!!!
				if (user !== '0xef6f96b0a9a55ba924d8a6e58c670fa46930fcc7') continue;

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
						user: userCache[user].public,
						amount: fromAmount.toString(),
						synth: local[synthContractName],
					});
				}
				// now we need the rate for both src and dest (last update before timestamp),
				// plus we need historical
				const settlementOwing = await local.Exchanger.methods
					.settlementOwing(userCache[user].public, toBytes32(fromCurrencyKey))
					.call();
				console.log(
					gray(
						'Settlement owing for',
						user,
						'on',
						fromCurrencyKey,
						'is',
						green(fromUnit(settlementOwing.reclaimAmount)),
						red(fromUnit(settlementOwing.rebateAmount))
					)
				);

				// const [roundIdForSrc, roundIdForDest] = await Promise.all([
				// 	local.ExchangeRates.methods.getCurrentRoundId(toBytes32(fromCurrencyKey)).call(),
				// 	local.ExchangeRates.methods.getCurrentRoundId(toBytes32(toCurrencyKey)).call(),
				// ]);
				// console.log(green('src roundId', roundIdForSrc, 'dest roundId', roundIdForDest));
				// const [srcRate, destRate] = (
				// 	await Promise.all([
				// 		local.ExchangeRates.methods.rateForCurrency(toBytes32(fromCurrencyKey)).call(),
				// 		local.ExchangeRates.methods.rateForCurrency(toBytes32(toCurrencyKey)).call(),
				// 	])
				// ).map(fromUnit);

				// const [srcRateUpdated, destRateUpdated] = (
				// 	await Promise.all([
				// 		local.ExchangeRates.methods.lastRateUpdateTimes(toBytes32(fromCurrencyKey)).call(),
				// 		local.ExchangeRates.methods.lastRateUpdateTimes(toBytes32(toCurrencyKey)).call(),
				// 	])
				// ).map(ts => new Date(ts * 1000));

				// console.log(
				// 	green('src rate', srcRate, srcRateUpdated, 'dest rate', destRate, destRateUpdated)
				// );

				// const lengthOfEntries = await local.ExchangeState.methods
				// 	.getLengthOfEntries(userCache[user].public, toBytes32(fromCurrencyKey))
				// 	.call();
				// console.log('length of settlement entries for this user on', lengthOfEntries);

				// if (Number(lengthOfEntries) > 0) {
				// 	const exchangeStateEntry0 = await local.ExchangeState.methods
				// 		.getEntryAt(userCache[user].public, toBytes32(fromCurrencyKey), '0')
				// 		.call();

				// 	console.log(JSON.stringify(exchangeStateEntry0, null, '\t'));
				// }

				// const lastRoundIdBeforeElapsed = await local.ExchangeRates.methods
				// 	.getLastRoundIdBeforeElapsedSecs(
				// 		toBytes32(fromCurrencyKey),
				// 		'0',
				// 		Math.round(timestamp / 1000) - 7 * 60, // from 7 minutes ago
				// 		'180'
				// 	)
				// 	.call();
				// console.log(red('lastRoundId for source', lastRoundIdBeforeElapsed));

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
				try {
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
					// if (txn.events.ExchangeReclaim) {
					// 	console.log(
					// 		green('Reclaim:', JSON.stringify(txn.events.ExchangeReclaim.returnValues, null, '\t'))
					// 	);
					// }
					// if (txn.events.ExchangeRebate) {
					// 	console.log(
					// 		red('REBATE', JSON.stringify(txn.events.ExchangeRebate.returnValues, null, '\t'))
					// 	);
					// }
				} catch (err) {
					if (/Cannot settle during waiting period/.test(err.toString())) {
						console.log(red('Would have failed as it is during the waiting period'));
					}
				}
				// console.log(JSON.stringify(txn, null, '\t'));
			}
		}
	} catch (err) {
		console.error(red(err));
	}

	await restoreSnapshot(snapshotId);
})();
