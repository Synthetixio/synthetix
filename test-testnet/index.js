'use strict';

const fs = require('fs');
const path = require('path');

const Web3 = require('web3');

const { gray, yellow, green, red } = require('chalk');

const commander = require('commander');
const program = new commander.Command();

require('dotenv').config();

const snx = require('../index');

const { loadConnections } = require('../publish/src/util');

program
	.option('-n, --network <value>', 'The network to run off.', x => x.toLowerCase(), 'kovan')
	.action(async ({ network }) => {
		console.log(`Running tests on ${network}`);

		const sources = snx.getSource({ network });
		const targets = snx.getTarget({ network });

		const { providerUrl, privateKey, etherscanLinkPrefix } = loadConnections({ network });
		const web3 = new Web3(new Web3.providers.HttpProvider(providerUrl));
		try {
			const gas = 5e6; // 5M
			const gasPrice = web3.utils.toWei('5', 'gwei');

			const owner = web3.eth.accounts.wallet.add(privateKey);

			// We are using the testnet deployer account, so presume they have some testnet ETH
			const user1 = web3.eth.accounts.create();
			web3.eth.accounts.wallet.add(user1);
			console.log(gray(`Created test account ${user1.address}`));

			// store keys in local file in case error and need to recover account
			fs.appendFileSync(
				path.join(__dirname, 'test_keys.txt'),
				`${new Date().toString()}\t\t${network}\t\t${user1.address}\t\t${user1.privateKey}\n`
			);

			// Send the account some test ether
			console.log(gray(`Transferring 0.1 test ETH to ${user1.address}`));
			const { transactionHash: txn0Hash } = await web3.eth.sendTransaction({
				from: owner.address,
				to: user1.address,
				value: web3.utils.toWei('0.1'), // 0.1 test ETH
				gas,
				gasPrice,
			});
			console.log(yellow(`Success. ${etherscanLinkPrefix}/tx/${txn0Hash}`));

			const Synthetix = new web3.eth.Contract(
				sources['Synthetix'].abi,
				targets['ProxySynthetix'].address
			);

			console.log(gray(`Transferring 1 SNX to user1 (${user1.address}`));
			const { transactionHash: txn1Hash } = await Synthetix.methods
				.transfer(user1.address, web3.utils.toWei('1'))
				.send({
					from: owner.address,
					gas,
					gasPrice,
				});
			console.log(yellow(`Success. ${etherscanLinkPrefix}/tx/${txn1Hash}`));

			console.log(gray(`Transferring 1 SNX back to owner (${user1.address}`));
			const { transactionHash: txn2Hash } = await Synthetix.methods
				.transfer(user1.address, web3.utils.toWei('1'))
				.send({
					from: user1.address,
					gas,
					gasPrice,
				});
			console.log(yellow(`Success. ${etherscanLinkPrefix}/tx/${txn2Hash}`));

			// finally, send back all test ETH to the owner
			const testEthBalanceRemaining = await web3.eth.getBalance(user1.address);
			const gasLimitForTransfer = 21000;
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
			const { transactionHash: txn3Hash } = await web3.eth.sendTransaction({
				from: user1.address,
				to: owner.address,
				value: testETHBalanceMinusTxnCost,
				gas: gasLimitForTransfer,
				gasPrice,
			});
			console.log(yellow(`Success. ${etherscanLinkPrefix}/tx/${txn3Hash}`));

			console.log();
			console.log(green(`Integration test on ${network.toUpperCase()} completed successfully.`));
		} catch (err) {
			if (/Transaction has been reverted/.test(err)) {
				const txnHash = err.message.match(/(?:"transactionHash":\s")(\w+)(")/)[1];
				console.error(red(`Failure: EVM reverted ${etherscanLinkPrefix}/tx/${txnHash}`));
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
