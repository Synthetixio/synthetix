require('dotenv').config();

const fs = require('fs');
const program = require('commander');
const { gray, green, cyan, yellow, red } = require('chalk');
const { formatEther } = require('ethers').utils;
const { getContract, setupProvider } = require('./utils');

async function airdrop({ inFilePath, network, useOvm, providerUrl, useFork }) {
	/* ~~~~~~~~~~~~~~~~~~~ */
	/* ~~~~~~ Input ~~~~~~ */
	/* ~~~~~~~~~~~~~~~~~~~ */

	if (!inFilePath) throw new Error('Please specify a path to an input JSON file.');
	if (!fs.existsSync(inFilePath)) throw new Error(`No file at ${inFilePath}.`);

	providerUrl = providerUrl.replace('network', network);
	if (!providerUrl) throw new Error('Cannot set up a provider.');

	if (useFork) {
		providerUrl = 'http://localhost:8545';
	}

	/* ~~~~~~~~~~~~~~~~~~~ */
	/* ~~~~~~ Setup ~~~~~~ */
	/* ~~~~~~~~~~~~~~~~~~~ */

	const { provider } = await setupProvider({ providerUrl });

	const Synthetix = getContract({
		contract: 'ProxyERC20',
		source: 'Synthetix',
		provider,
		network,
		useOvm,
	});

	const inData = JSON.parse(fs.readFileSync(inFilePath));
	const dataLen = inData.length;

	/* ~~~~~~~~~~~~~~~~~~~ */
	/* ~ Sweep addresses ~ */
	/* ~~~~~~~~~~~~~~~~~~~ */

	let totalCollateral = 0;
	let placedCollateral = 0;
	let totalMismatch = 0;
	let completed = 0;
	const mismatchers = [];

	async function checkStaker(staker) {
		const balance = formatEther(await Synthetix.balanceOf(staker.address));
		const delta = Math.abs(staker.collateral - balance);

		console.log(gray(`  Address: ${staker.address}`));
		console.log(gray(`  Collateral: ${staker.collateral}`));
		console.log(gray(`  Goerl1 L1 balance: ${balance}`));
		console.log(gray(`  Delta: ${delta}`));

		if (delta > 0) {
			console.log(red(`  Funds mismatch: ${delta}`));
		} else {
			console.log(green(`  Ok ✅`));
		}

		return { delta };
	}

	for (let i = 0; i < dataLen; i++) {
		console.log(`Staker ${i}/${dataLen}:`);

		const staker = inData[i];
		totalCollateral += staker.collateral;

		const { delta } = await checkStaker(staker);
		totalMismatch += delta;

		if (delta > 0) {
			mismatchers.push(staker);
		} else {
			placedCollateral += staker.collateral;
			completed++;
		}
	}

	/* ~~~~~~~~~~~~~~~~~~~ */
	/* ~  Present data   ~ */
	/* ~~~~~~~~~~~~~~~~~~~ */

	console.log('\n');
	console.log(cyan(`Results:`));
	console.log(`Total stakers: ${dataLen}`);
	console.log(`Stakers with expected balance: ${completed}`);
	console.log(`Total collateral to airdrop: ${totalCollateral}`);
	console.log(`Total collateral correctly placed: ${placedCollateral}`);
	console.log(`Total mismatched SNX: ${totalMismatch}`);
	console.log('\n');

	if (mismatchers.length > 0) {
		console.log(yellow(`${mismatchers.length} accounts mismatch:`));
		mismatchers.map(async mismatcher => {
			await checkStaker(mismatcher);
		});
	}
}

program
	.description('Transfer SNX to a set of addresses specified in a JSON file')
	.option('-f, --use-fork', 'Use a local fork', false)
	.option('-i, --in-file-path <value>', 'The path to the JSON file containing the target addresses')
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
