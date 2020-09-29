require('dotenv').config();

const fs = require('fs');

const program = require('commander');
const { cyan, yellow, red } = require('chalk');
const { parseEther, formatEther } = require('ethers').utils;

const { getContract, setupProvider, runTx, wait } = require('./utils');

async function airdrop({ filePath, network, useOvm, providerUrl, privateKey, gasPrice, gasLimit }) {
	/* ~~~~~~~~~~~~~~~~~~~ */
	/* ~~~~~~ Input ~~~~~~ */
	/* ~~~~~~~~~~~~~~~~~~~ */

	if (!filePath) throw new Error('Please specify a path to a JSON file.');
	if (!fs.existsSync(filePath)) throw new Error(`No file at ${filePath}.`);

	providerUrl = providerUrl.replace('network', network);
	if (!providerUrl) throw new Error('Cannot set up a provider.');

	if (!privateKey) throw new Error('No private key available.');

	/* ~~~~~~~~~~~~~~~~~~~ */
	/* ~~~~~~ Setup ~~~~~~ */
	/* ~~~~~~~~~~~~~~~~~~~ */

	const { wallet, provider } = await setupProvider({ providerUrl, privateKey });
	console.log(cyan('Wallet:'), wallet.address);

	const Synthetix = await getContract({ contract: 'Synthetix', wallet, network, useOvm });
	const SystemStatus = await getContract({ contract: 'SystemStatus', provider, network, useOvm });

	const data = JSON.parse(fs.readFileSync(filePath));

	/* ~~~~~~~~~~~~~~~~~~~ */
	/* ~~~ Verification ~~ */
	/* ~~~~~~~~~~~~~~~~~~~ */

	const totalToTransfer = data.reduce((acum, staker) => acum + staker.collateral, 0);
	console.log(cyan('Total to transfer:'), totalToTransfer);

	const walletBalance = formatEther(await Synthetix.balanceOf(wallet.address));
	console.log(cyan('Wallet balance'), walletBalance);

	if (walletBalance < totalToTransfer) {
		const delta = totalToTransfer - walletBalance;
		console.warn(
			yellow(
				`WARNING: Wallet is short by ${delta} SNX, it will run out of funds before the script completes.`
			)
		);
		await wait(3);
	}

	const status = await SystemStatus.systemSuspension();
	if (!status.suspended) {
		throw new Error('System must be suspended before airdrop.');
	}

	/* ~~~~~~~~~~~~~~~~~~~ */
	/* ~ Sweep addresses ~ */
	/* ~~~~~~~~~~~~~~~~~~~ */

	let doneContenders = 0;
	let missedContenders = 0;

	const overrides = {
		gasPrice,
		gasLimit,
	};

	for (const staker of data) {
		const address = staker.address;

		const collateral = parseEther(`${staker.collateral}`);

		const l2Balance = await Synthetix.balanceOf(address);

		const remaining = collateral.sub(l2Balance);
		console.log(`${address}, remaining: ${remaining.toString()}`);

		if (remaining > 0) {
			const success = await runTx(await Synthetix.transfer(address, remaining, overrides));
			if (!success) missedContenders++;
		}

		doneContenders++;
		console.log(`${doneContenders} / ${data.length} (missed ${missedContenders})`);
	}
}

program
	.description('Transfer SNX to a set of addresses specified in a JSON file')
	.option('-f, --file-path <value>', 'The path to the JSON file containing the target addresses')
	.option('-g, --gas-price <value>', 'Gas price to set when performing transfers', 1)
	.option(
		'-k, --private-key <value>',
		'The private key of the address that will be used to transfer tokens from'
	)
	.option('-l, --gas-limit <value>', 'Max gas to use when signing transactions', 8000000)
	.option('-n, --network <value>', 'The network to run off.', x => x.toLowerCase(), 'mainnet')
	.option(
		'-p, --provider-url <value>',
		'The http provider to use for communicating with the blockchain',
		process.env.PROVIDER_URL
	)
	.option('-z, --use-ovm', 'Use an Optimism chain', false)
	.action(async (...args) => {
		try {
			await airdrop(...args);
		} catch (err) {
			console.error(red(err));
			console.log(err.stack);

			process.exitCode = 1;
		}
	});

if (require.main === module) {
	require('pretty-error').start();

	program.parse(process.argv);
}
