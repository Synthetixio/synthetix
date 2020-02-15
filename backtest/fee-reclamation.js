'use strict';

const program = require('commander');
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
const snx = require('..');
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

program
	.description('Backtest fee reclamation')
	.option('-s, --starting-datetime <value>', 'The starting datetime', '2020-02-14 03:30')
	.option('-r, --hours <value>', 'How many hours of data from the start to analyze', 6)
	.option('-w, --waiting-period <value>', 'Seconds in waiting period', 180)
	.action(async ({ startingDatetime, waitingPeriod, hours }) => {
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
			return new web3.eth.Contract(
				sources[targets[name].source].abi,
				targets[proxy || name].address
			);
		}

		const local = {
			network: 'local',
			sources: snx.getSource({ network: 'local' }),
			targets: snx.getTarget({ network: 'local' }),
			web3: new Web3(new Web3.providers.HttpProvider('http://127.0.0.1:8545')),
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

		const currentWaitingPeriod = await local.Exchanger.methods.waitingPeriodSecs().call();

		if (Number(currentWaitingPeriod) !== waitingPeriod) {
			console.log(gray(`Updating the waiting period to ${waitingPeriod}s`));
			await local.Exchanger.methods
				.setWaitingPeriodSecs(waitingPeriod.toString())
				.send({ from: accounts.deployer.public, gas: gasLimit, gasPrice });
		}

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
			await synth.methods.issue(user, amount < 1e-6 ? amount * 1e18 : toWei(amount)).send({
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
			const startingDate = new Date(startingDatetime);
			const startingPoint = Math.round(startingDate.getTime() / 1000);
			const endingPoint = startingPoint + 3600 * hours;

			console.log(
				gray(
					`Looking for all exchanges between ${startingDate} and ${new Date(endingPoint * 1000)}`
				)
			);
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
			const totals = {
				reclaim: 0,
				rebate: 0,
				waitingPeriod: 0,
			};

			for (const event of events) {
				const { timestamp } = event;
				console.log('Date:', new Date(timestamp).toString());
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

					// no user yet
					if (!userCache[user]) {
						userCache[user] = users[userCount++];
						local.web3.eth.accounts.wallet.add(userCache[user].private);
						console.log(gray(`New user on exchange ${user}, associating locally`));
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

						if (txn.events.ExchangeReclaim) {
							const amount = await local.ExchangeRates.methods
								.effectiveValue(
									toBytes32(fromCurrencyKey),
									txn.events.ExchangeReclaim.returnValues.amount,
									toBytes32('sUSD')
								)
								.call();
							totals.reclaim += Number(fromUnit(amount));
							console.log(green('Reclaim:', fromUnit(amount), 'USD'));
						}
						if (txn.events.ExchangeRebate) {
							const amount = await local.ExchangeRates.methods
								.effectiveValue(
									toBytes32(fromCurrencyKey),
									txn.events.ExchangeRebate.returnValues.amount,
									toBytes32('sUSD')
								)
								.call();
							totals.rebate += Number(fromUnit(amount));
							console.log(red('Rebate:', fromUnit(amount), 'USD'));
						}
					} catch (err) {
						if (/Cannot settle during waiting period/.test(err.toString())) {
							totals.waitingPeriod++;
							console.log(
								red('Exchange failure: Would have failed as it is during the waiting period')
							);
						} else {
							console.error(red('Exchange failure:', err));
						}
					}
				}
			}

			console.log();
			console.log(green(`Total reclaim in USD (thousands): ${Math.round(totals.reclaim / 1000)}k`));
			console.log(red(`Total rebate in USD (thousands): ${Math.round(totals.rebate / 1000)}k`));
			console.log(
				gray(`Number of times a user would have hit the waiting period:`),
				red(totals.waitingPeriod)
			);
		} catch (err) {
			console.error(red(err));
		}

		await restoreSnapshot(snapshotId);
	});

program.parse(process.argv);
