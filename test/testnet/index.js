'use strict';

const fs = require('fs');
const path = require('path');

const Web3 = require('web3');

const { yellow, gray, red, green } = require('chalk');

const commander = require('commander');
const program = new commander.Command();

require('dotenv').config();

const snx = require('../..');
const { toBytes32 } = snx;

const { loadConnections, confirmAction } = require('../../publish/src/util');

const logExchangeRates = (currencyKeys, rates, times) => {
	const results = [];
	const now = Math.round(Date.now() / 1000);
	for (let i = 0; i < rates.length; i++) {
		const rate = Web3.utils.fromWei(rates[i]);
		results.push({
			key: currencyKeys[i].name,
			price: rate,
			date: new Date(times[i] * 1000),
			ago: now - times[i],
		});
	}
	for (const rate of results) {
		console.log(
			gray('currencyKey:'),
			yellow(rate.key),
			gray('price:'),
			yellow(rate.price),
			gray('when:'),
			yellow(Math.round(rate.ago / 60), gray('mins ago'))
		);
	}
};

program
	.option('-n, --network <value>', 'The network to run off.', x => x.toLowerCase(), 'kovan')
	.option('-g, --gas-price <value>', 'Gas price in GWEI', '5')
	.option('-y, --yes', 'Dont prompt, just reply yes.')
	.action(async ({ network, yes, gasPrice: gasPriceInGwei }) => {
		if (!/^(kovan|rinkeby|ropsten|mainnet)$/.test(network)) {
			throw Error('Unsupported environment', network);
		}
		let esLinkPrefix;
		try {
			console.log(`Running tests on ${network}`);

			const sources = snx.getSource({ network });
			const targets = snx.getTarget({ network });

			const synths = snx.getSynths({ network });

			const cryptoSynths = synths
				.filter(({ asset }) => asset !== 'USD')
				.filter(
					({ category }) => category === 'crypto' || category === 'internal' || category === 'index'
				);

			const forexSynths = synths
				.filter(({ asset }) => asset !== 'USD')
				.filter(({ category }) => category === 'forex' || category === 'commodity');

			const { providerUrl, privateKey, etherscanLinkPrefix } = loadConnections({ network });
			esLinkPrefix = etherscanLinkPrefix;

			const web3 = new Web3(new Web3.providers.HttpProvider(providerUrl));
			const gas = 4e6; // 4M
			const gasPrice = web3.utils.toWei(gasPriceInGwei, 'gwei');
			const [sUSD, sETH] = ['sUSD', 'sETH'].map(toBytes32);

			const owner = web3.eth.accounts.wallet.add(privateKey);

			// We are using the testnet deployer account, so presume they have some testnet ETH
			const user1 = web3.eth.accounts.create();
			web3.eth.accounts.wallet.add(user1);
			console.log(gray(`Created test account ${user1.address}`));
			console.log(gray(`Owner account ${owner.address}`));

			// store keys in local file in case error and need to recover account
			fs.appendFileSync(
				path.join(__dirname, 'test_keys.txt'),
				`${new Date().toString()}\t\t${network}\t\t${user1.address}\t\t${user1.privateKey}\n`
			);
			console.log(gray(`Test privkeys: ${user1.privateKey}`));

			/** VIEWS OF SYNTHETIX STATUS **/

			const exchangeRates = new web3.eth.Contract(
				sources['ExchangeRates'].abi,
				targets['ExchangeRates'].address
			);
			const currencyKeys = [{ name: 'SNX' }].concat(cryptoSynths).concat(forexSynths);
			const currencyKeysBytes = currencyKeys.map(key => toBytes32(key.name));

			// View all current ExchangeRates
			const rates = await exchangeRates.methods.ratesForCurrencies(currencyKeysBytes).call();

			const times = await exchangeRates.methods
				.lastRateUpdateTimesForCurrencies(currencyKeysBytes)
				.call();

			logExchangeRates(currencyKeys, rates, times);

			const ratesAreStale = await exchangeRates.methods.anyRateIsStale(currencyKeysBytes).call();

			console.log(green(`RatesAreStale - ${ratesAreStale}`));
			if (ratesAreStale) {
				throw Error('Rates are stale');
			}

			// Synthetix contract
			const Synthetix = new web3.eth.Contract(
				sources['Synthetix'].abi,
				targets['ProxySynthetix'].address
			);

			const SynthetixState = new web3.eth.Contract(
				sources['SynthetixState'].abi,
				targets['SynthetixState'].address
			);

			// Check totalIssuedSynths and debtLedger matches
			const totalIssuedSynths = await Synthetix.methods.totalIssuedSynths(sUSD).call();
			const debtLedgerLength = await SynthetixState.methods.debtLedgerLength().call();

			console.log(
				green(
					`TotalIssuedSynths in sUSD: ${totalIssuedSynths} - debtLedgerLenght: ${debtLedgerLength}`
				)
			);

			if (debtLedgerLength > 0 && totalIssuedSynths === 0) {
				throw Error('DebtLedger has debt but totalIssuedSynths is 0');
			}

			console.log(gray(`Using gas price of ${gasPriceInGwei} gwei.`));

			if (!yes) {
				try {
					await confirmAction(yellow(`Do you want to continue? (y/n) `));
				} catch (err) {
					console.log(gray(`Operation terminated`));
					return;
				}
			}

			// #1 - Send the account some test ether
			console.log(gray(`Transferring 0.05 test ETH to ${user1.address}`));
			const { transactionHash: txn0Hash } = await web3.eth.sendTransaction({
				from: owner.address,
				to: user1.address,
				value: web3.utils.toWei('0.05'),
				gas,
				gasPrice,
			});
			console.log(green(`Success. ${etherscanLinkPrefix}/tx/${txn0Hash}`));

			// Note: we are using numbers in WEI to 1e-13 not ether (i.e. not with 18 decimals),
			// so that if a test fails we only lose minor amounts of SNX and sUSD (i.e. dust). - JJ

			console.log(gray(`Transferring 0.000000000002 SNX to user1 (${user1.address})`));
			const { transactionHash: txn1Hash } = await Synthetix.methods
				.transfer(user1.address, web3.utils.toWei('0.000000000002'))
				.send({
					from: owner.address,
					gas,
					gasPrice,
				});
			console.log(green(`Success. ${etherscanLinkPrefix}/tx/${txn1Hash}`));

			// #2 - Mint some sUSD from test account
			console.log(gray(`Issuing 0.0000000000001 sUSD from (${user1.address}`));
			const amountToIssue = web3.utils.toWei('0.0000000000001');
			const { transactionHash: txn2Hash } = await Synthetix.methods
				.issueSynths(amountToIssue)
				.send({
					from: user1.address,
					gas,
					gasPrice,
				});
			console.log(green(`Success. ${etherscanLinkPrefix}/tx/${txn2Hash}`));

			// #3 - Deposit 60 sUSD to Depot
			// const Depot = new web3.eth.Contract(sources['Depot'].abi, targets['Depot'].address);
			const SynthsUSD = new web3.eth.Contract(sources['Synth'].abi, targets['ProxysUSD'].address);

			// get balance
			const balance = await SynthsUSD.methods.balanceOf(user1.address).call();
			console.log(gray(`User1 has sUSD balanceOf - ${balance}`));

			// deposit to Depot
			// console.log(gray(`Deposit 0.00000000000006 sUSD to depot from (${user1.address})`));
			// const amountToDeposit = web3.utils.toWei('0.00000000000006');
			// const { transactionHash: txn3Hash } = await SynthsUSD.methods
			// 	.transfer(Depot.options.address, amountToDeposit)
			// 	.send({
			// 		from: user1.address,
			// 		gas,
			// 		gasPrice,
			// 	});
			// console.log(green(`Success. ${etherscanLinkPrefix}/tx/${txn3Hash}`));

			// // #4 withdraw deposited synths from Depot
			// console.log(gray(`Withdraw 0.00000000000006 sUSD from Depot for (${user1.address})`));
			// const { transactionHash: txn4Hash } = await Depot.methods.withdrawMyDepositedSynths().send({
			// 	from: user1.address,
			// 	gas,
			// 	gasPrice,
			// });
			// console.log(green(`Success. ${etherscanLinkPrefix}/tx/${txn4Hash}`));

			// check balance
			const balanceAfter = await SynthsUSD.methods.balanceOf(user1.address).call();
			console.log(gray(`User1 has sUSD balanceOf - ${balanceAfter}`));

			// #5 Exchange sUSD to sETH
			const gasPriceLimit = await Synthetix.methods.gasPriceLimit().call();
			const gasForExchange = Math.min(gasPrice, gasPriceLimit);
			console.log(
				gray(
					`On chain gas limit is ${web3.utils.fromWei(
						gasPriceLimit.toString(),
						'gwei'
					)} gwei. Using ${web3.utils.fromWei(gasForExchange.toString(), 'gwei')} gwei to exchange.`
				)
			);

			console.log(gray(`Exchange sUSD --> sETH for user - (${user1.address})`));
			const amountToExchange = web3.utils.toWei('0.0000000000001');
			const { transactionHash: txn5Hash } = await Synthetix.methods
				.exchange(sUSD, amountToExchange, sETH)
				.send({
					from: user1.address,
					gas,
					gasPrice: gasForExchange,
				});
			console.log(green(`Success. ${etherscanLinkPrefix}/tx/${txn5Hash}`));

			// check sETH balance after exchange
			const SynthsETH = new web3.eth.Contract(sources['Synth'].abi, targets['ProxysETH'].address);
			const sETHBalance = await SynthsETH.methods.balanceOf(user1.address).call();
			console.log(gray(`User1 has sETH balanceOf - ${sETHBalance}`));

			// #6 Exchange balance of sETH back to sUSD
			console.log(gray(`Exchange sETH --> sUSD for user - (${user1.address})`));
			const { transactionHash: txn6Hash } = await Synthetix.methods
				.exchange(sETH, sETHBalance, sUSD)
				.send({
					from: user1.address,
					gas,
					gasPrice: gasForExchange,
				});
			console.log(green(`Success. ${etherscanLinkPrefix}/tx/${txn6Hash}`));

			// #7 Burn all remaining sUSD to unlock SNX
			const remainingSynthsUSD = await SynthsUSD.methods.balanceOf(user1.address).call();
			console.log(gray(`Burn all remaining synths for user - (${user1.address})`));
			const { transactionHash: txn7Hash } = await Synthetix.methods
				.burnSynths(remainingSynthsUSD)
				.send({
					from: user1.address,
					gas,
					gasPrice,
				});
			console.log(green(`Success. ${etherscanLinkPrefix}/tx/${txn7Hash}`));

			// check transferable SNX after burning
			const transferableSNX = await Synthetix.methods.transferableSynthetix(user1.address).call();
			console.log(gray(`Transferable SNX of ${transferableSNX} for user (${user1.address}`));

			// #8 Transfer SNX back to owner
			console.log(gray(`Transferring SNX back to owner (${user1.address}`));
			const { transactionHash: txn8Hash } = await Synthetix.methods
				.transfer(user1.address, transferableSNX)
				.send({
					from: user1.address,
					gas,
					gasPrice,
				});
			console.log(green(`Success. ${etherscanLinkPrefix}/tx/${txn8Hash}`));

			// if fees available claim, check feePeriod closable, close if it can be closed and claim fees.

			// finally, send back all test ETH to the owner
			const testEthBalanceRemaining = await web3.eth.getBalance(user1.address);
			const gasLimitForTransfer = 21010; // a little over 21k to prevent occassional out of gas errors
			const testETHBalanceMinusTxnCost = (
				testEthBalanceRemaining -
				gasLimitForTransfer * gasPrice
			).toString();

			console.log(
				gray(
					`Transferring remaining test ETH back to owner (${web3.utils.fromWei(
						testETHBalanceMinusTxnCost
					)})`
				)
			);
			const { transactionHash: txn9Hash } = await web3.eth.sendTransaction({
				from: user1.address,
				to: owner.address,
				value: testETHBalanceMinusTxnCost,
				gas: gasLimitForTransfer,
				gasPrice,
			});
			console.log(green(`Success. ${etherscanLinkPrefix}/tx/${txn9Hash}`));

			console.log();
			console.log(gray(`Integration test on ${network.toUpperCase()} completed successfully.`));
		} catch (err) {
			if (/Transaction has been reverted/.test(err)) {
				const txnHash = err.message.match(/(?:"transactionHash":\s")(\w+)(")/)[1];
				console.error(red(`Failure: EVM reverted ${esLinkPrefix}/tx/${txnHash}`));
			} else {
				console.error(err);
			}
			process.exitCode = 1;
		}
	});

// perform as CLI tool if not run as module
if (require.main === module) {
	require('pretty-error').start();

	program.parse(process.argv);
}
