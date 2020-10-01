require('dotenv').config();

const fs = require('fs');

const program = require('commander');
const { cyan, yellow, red } = require('chalk');
const { parseEther, formatEther } = require('ethers').utils;

const { getContract, setupProvider, runTx, wait } = require('./utils');

async function airdrop({
	inFilePath,
	outFilePath,
	network,
	useOvm,
	providerUrl,
	privateKey,
	gasPrice,
	gasLimit,
	reset,
}) {
	/* ~~~~~~~~~~~~~~~~~~~ */
	/* ~~~~~~ Input ~~~~~~ */
	/* ~~~~~~~~~~~~~~~~~~~ */

	if (!inFilePath) throw new Error('Please specify a path to an input JSON file.');
	if (!fs.existsSync(inFilePath)) throw new Error(`No file at ${inFilePath}.`);

	if (!outFilePath) throw new Error('Please specify a path to an output JSON file.');
	if (!fs.existsSync(outFilePath)) throw new Error(`No file at ${outFilePath}.`);

	providerUrl = providerUrl.replace('network', network);
	if (!providerUrl) throw new Error('Cannot set up a provider.');

	if (!privateKey) throw new Error('No private key available.');

	async function warn(msg) {
		console.warn(yellow(msg));
		await wait(5);
	}

	/* ~~~~~~~~~~~~~~~~~~~ */
	/* ~~~~~~ Setup ~~~~~~ */
	/* ~~~~~~~~~~~~~~~~~~~ */

	const { wallet, provider } = await setupProvider({ providerUrl, privateKey });
	console.log(cyan('Wallet:'), wallet.address);

	const Synthetix = await getContract({ contract: 'Synthetix', wallet, network, useOvm });
	const SystemStatus = await getContract({ contract: 'SystemStatus', provider, network, useOvm });

	const inData = JSON.parse(fs.readFileSync(inFilePath));
	let outData = JSON.parse(fs.readFileSync(outFilePath));

	if (reset) {
		await warn('Resetting output data!');
		outData = [];
	} else if (outData.length > 0) {
		await warn('Output file already contains entries, resuming airdrop...');
	}

	/* ~~~~~~~~~~~~~~~~~~~ */
	/* ~~~ Verification ~~ */
	/* ~~~~~~~~~~~~~~~~~~~ */

	const totalToTransfer = inData.reduce((acum, staker) => acum + staker.collateral, 0);
	console.log(cyan('Total to transfer:'), totalToTransfer);

	const totalTransferred = outData.reduce((acum, staker) => acum + staker.collateral, 0);
	console.log(cyan('Total transferred:'), totalTransferred);

	const remainingToTransfer = totalToTransfer - totalTransferred;

	const walletBalance = formatEther(await Synthetix.balanceOf(wallet.address));
	console.log(cyan('Wallet balance:'), walletBalance);

	if (walletBalance < remainingToTransfer) {
		const delta = remainingToTransfer - walletBalance;
		await warn(
			`WARNING: Wallet is short by ${delta} SNX, it will run out of funds before the script completes.`
		);
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

	async function transfer(staker, records) {
		const remaining = staker.collateral - records.transferred;

		let receipt;
		if (remaining > 0) {
			receipt = await runTx(
				await Synthetix.transfer(staker.address, parseEther(`${remaining}`), overrides)
			);

			if (!receipt) missedContenders++;
		}

		return {
			transferred: receipt ? remaining : 0,
			receipt,
		};
	}

	for (const staker of inData) {
		// Restore staker record of already transferred tokens
		let record = outData.find(record => record.address === staker.address);

		// Create a new record if one doesn't exist
		if (!record) {
			record = {
				address: staker.address,
				totalToTransfer: staker.collateral,
				transferred: 0,
				receipts: [],
			};

			outData.push(record);
		}

		// Transfer
		const { transferred, receipt } = await transfer(staker, record);

		// Record transfer
		if (transferred > 0) {
			record.transferred += transferred;
			record.receipts.push(receipt);
		}
		console.log(outData);
		fs.writeFileSync(outFilePath, JSON.stringify(outData, null, 2));

		doneContenders++;
		console.log(`${doneContenders} / ${inData.length} (missed ${missedContenders})`);
	}
}

program
	.description('Transfer SNX to a set of addresses specified in a JSON file')
	.option('-g, --gas-price <value>', 'Gas price to set when performing transfers', 1)
	.option('-i, --in-file-path <value>', 'The path to the JSON file containing the target addresses')
	.option(
		'-k, --private-key <value>',
		'The private key of the address that will be used to transfer tokens from'
	)
	.option('-l, --gas-limit <value>', 'Max gas to use when signing transactions', 8000000)
	.option('-n, --network <value>', 'The network to run off.', x => x.toLowerCase(), 'mainnet')
	.option('-r, --reset', 'Clear all data in output file', false)
	.option(
		'-o, --out-file-path <value>',
		'The path to the JSON file containing the transfered balances'
	)
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
