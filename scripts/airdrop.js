require('dotenv').config();

const fs = require('fs');
const path = require('path');
const program = require('commander');
const { gray, cyan, yellow, red } = require('chalk');
const { parseEther, formatEther, parseUnits } = require('ethers').utils;
const { wrap } = require('..');

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
	useFork,
	startIndex,
	endIndex,
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

	let publicKey;
	if (useFork) {
		providerUrl = 'http://localhost:8545';

		const { getUsers } = wrap({ network, useOvm, fs, path });
		publicKey = getUsers({ user: 'owner' }).address;

		console.log(gray(`  > Using fork - Signer address: ${publicKey}`));
	}

	if (!useFork && !privateKey) throw new Error('No private key available.');

	async function warn(msg) {
		console.warn(yellow(msg));
		await wait(5);
	}

	/* ~~~~~~~~~~~~~~~~~~~ */
	/* ~~~~~~ Setup ~~~~~~ */
	/* ~~~~~~~~~~~~~~~~~~~ */

	const { wallet, provider } = await setupProvider({ providerUrl, privateKey, publicKey });

	const Synthetix = await getContract({
		contract: 'ProxyERC20',
		source: 'Synthetix',
		wallet,
		network,
		useOvm,
	});

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

	const totalTransferred = outData.reduce((acum, staker) => acum + staker.transferred, 0);
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

	/* ~~~~~~~~~~~~~~~~~~~ */
	/* ~ Sweep addresses ~ */
	/* ~~~~~~~~~~~~~~~~~~~ */

	let doneContenders = 0;
	let missedContenders = 0;
	endIndex = endIndex === -1 ? inData.length - 1 : endIndex;
	const numContenders = endIndex - startIndex;

	const overrides = {
		gasPrice: parseUnits(gasPrice, 'gwei'),
		gasLimit,
	};

	async function transfer(staker, records) {
		const stakerBalance = formatEther(await Synthetix.balanceOf(staker.address));
		if (stakerBalance >= staker.collateral) {
			console.log(gray(`  > Staker ${staker.address} already has ${stakerBalance} SNX...`));

			return {
				transferred: staker.collateral,
				receipt: { msg: 'Staker already has the expected balance.' },
			};
		}

		const remaining = staker.collateral - records.transferred;

		let receipt;
		if (remaining > 0) {
			console.log(gray(`  > Transferring ${remaining} SNX to ${staker.address}...`));

			const result = await runTx({
				txPromise: Synthetix.transfer(staker.address, parseEther(`${remaining}`), overrides),
				provider,
			});

			if (!result.success) missedContenders++;
			receipt = result.receipt;
		}

		return {
			transferred: receipt ? remaining : 0,
			receipt,
		};
	}

	console.log(gray(`  > Sweeping staker data from indexes ${startIndex} to ${endIndex}`));
	for (let i = startIndex; i <= endIndex; i++) {
		const staker = inData[i];

		// Restore staker record of already transferred tokens
		let record = outData.find(record => !record.address && record.address === staker.address);

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
		fs.writeFileSync(outFilePath, JSON.stringify(outData, null, 2));

		doneContenders++;
		console.log(`Transferred to ${doneContenders} / ${numContenders} (missed ${missedContenders})`);
	}
}

program
	.description('Transfer SNX to a set of addresses specified in a JSON file')
	.option('-e, --end-index <value>', 'Stop at staker at index (ignored if -1)', -1)
	.option('-f, --use-fork', 'Use a local fork', false)
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
	.option('-s, --start-index <value>', 'Start from staker at index', 0)
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
