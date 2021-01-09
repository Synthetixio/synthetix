const fs = require('fs');
const path = require('path');
const axios = require('axios');
const BN = require('bn.js');
const Web3 = require('web3');
const uniq = require('lodash.uniq');
const { toBN, fromWei, toWei } = require('web3-utils');
const {
	wrap,
	toBytes32,
	constants: { CONFIG_FILENAME, SYNTHS_FILENAME, DEPLOYMENT_FILENAME },
} = require('../../..');
const { red, gray, yellow } = require('chalk');

const {
	ensureNetwork,
	ensureDeploymentPath,
	getDeploymentPathForNetwork,
	loadConnections,
} = require('../util');

const DEFAULTS = {
	network: 'kovan',
	gasLimit: 3e6,
	gasPrice: '1',
	batchSize: 15,
};

async function extractStakingBalances({ network = DEFAULTS.network, deploymentPath, synth }) {
	ensureNetwork(network);
	deploymentPath = deploymentPath || getDeploymentPathForNetwork({ network });
	ensureDeploymentPath(deploymentPath);

	// We're just using the ERC20 members `balanceOf` and `Transfer`, so any ERC20 contract will do.
	const { getSource, getTarget } = wrap({ network, deploymentPath, fs, path });

	const { abi: snxABI } = getSource({ contract: 'Synthetix' });

	/** *********** Replace Settings Here *********** **/

	// The RPC endpoint that the results will be retrieved from. Preferably this is an archive node.
	const { providerUrl, etherscanUrl } = loadConnections({
		network,
	});

	// The filename the results will be saved to.
	const owedFile = 'owedBalances.csv';

	// The address of the inverse synth that is about to be purged.
	// Note that this must be the PROXY address, where Transfer events are emitted from.
	const iSynthContract = getTarget({ contract: `Proxy${synth === 'sUSD' ? 'ERC20sUSD' : synth}` });

	if (!iSynthContract) {
		throw new Error(`Cannot find synth contract for synth: "${synth}"`);
	}

	const iSynthAddress = iSynthContract.address;
	console.log(gray(`Using Proxy${synth} address of`), yellow(iSynthAddress));

	// Address of the staking contract, which we will retrieve staked balances from.
	const stakingAddress = getTarget({ contract: `StakingRewards${synth}` }).address;
	console.log(gray(`Using StakingRewards${synth} address of`), yellow(stakingAddress));

	const result = await axios.get(etherscanUrl, {
		params: {
			module: 'account',
			action: 'txlist',
			address: stakingAddress,
			apikey: process.env.ETHERSCAN_KEY,
		},
	});

	// The block that the staking contract was deployed, for filtering transfers into it.
	const deploymentBlock = +result.data.result[0].blockNumber;

	console.log(`Loading rewards for synth ${synth} on network ${network}`);

	console.log(
		gray(`Staking rewards StakingRewards${synth} deployed at block`),
		yellow(deploymentBlock)
	);

	const web3 = new Web3(new Web3.providers.HttpProvider(providerUrl));

	const ExchangeRates = new web3.eth.Contract(
		getSource({ contract: 'ExchangeRates' }).abi,
		getTarget({ contract: 'ExchangeRates' }).address
	);

	// The price at which the inverse synth was frozen, to compute how much users are owed after purging
	const frozenPrice = await ExchangeRates.methods.rateForCurrency(toBytes32(synth)).call();

	console.log(`${synth} current price is `, yellow(web3.utils.fromWei(frozenPrice)));

	const isFrozen = await ExchangeRates.methods.rateIsFrozen(toBytes32(synth)).call();

	if (!isFrozen) {
		throw new Error(`Error: ${synth} not frozen`);
	}

	const SystemSettings = new web3.eth.Contract(
		getSource({ contract: 'SystemSettings' }).abi,
		getTarget({ contract: 'SystemSettings' }).address
	);

	// The exchange fee incurred when users are purged into sUSD
	const exchangeFee = await SystemSettings.methods.exchangeFeeRate(toBytes32(synth)).call();

	console.log(gray(`Exchange fee of ${synth} is`), yellow(web3.utils.fromWei(exchangeFee)));

	/** *********** --------------------- *********** **/

	// Fixed point multiplication utilities
	function multiplyDecimal(x, y) {
		const xBN = BN.isBN(x) ? x : toBN(x);
		const yBN = BN.isBN(y) ? y : toBN(y);

		const unit = toBN(toWei('1'));
		return xBN.mul(yBN).div(unit);
	}

	// Retrieves a user's staking balance from the staking contract
	async function getStakingBalance(stakingContract, account) {
		return {
			address: account,
			balance: await stakingContract.methods.balanceOf(account).call(),
		};
	}

	function formatDate(timestamp) {
		const date = new Date(timestamp);
		return `${date.getUTCFullYear()}/${date.getUTCMonth()}/${date.getUTCDate()} ${date.getUTCHours()}:${date.getUTCMinutes()}:${date.getUTCSeconds()} UTC`;
	}

	function logProgress(i, total) {
		const fillChar = '█';
		const progress = i / total;
		const length = 50;
		const filled = Math.floor(length * progress);
		const bar = `|${fillChar.repeat(filled)}${'-'.repeat(length - filled)}|`;
		const progressString = `    ${bar} - ${i} / ${total} (${Math.round(100 * progress)}%)`;

		process.stdout.clearLine();
		process.stdout.cursorTo(0);
		process.stdout.write(progressString);
	}

	// Looks for all transfers into the staking contract
	async function fetchStakedBalances() {
		const iSynth = new web3.eth.Contract(snxABI, iSynthAddress);
		const stakingContract = new web3.eth.Contract(snxABI, stakingAddress);

		const currentBlock = await web3.eth.getBlockNumber();
		const deploymentBlockDetails = await web3.eth.getBlock(deploymentBlock);

		console.log(`Querying all transfers into the staking contract to find candidate stakers.\n`);
		console.log(`    Staking Contract: ${stakingAddress}`);
		console.log(`    Synth: ${iSynthAddress}`);
		console.log(
			`    Starting Block: ${deploymentBlock} (${currentBlock -
				deploymentBlock} blocks ago at ${formatDate(deploymentBlockDetails.timestamp * 1000)})\n`
		);

		const transferEvents = await iSynth.getPastEvents('Transfer', {
			filter: {
				to: stakingAddress,
			},
			fromBlock: deploymentBlock - 1,
		});

		const candidates = uniq(transferEvents.map(e => e.returnValues.from));

		const nonzero = [];

		console.log(`${candidates.length} candidate holders found. Querying their balances.\n`);
		let i = 0;

		for (const candidate of candidates) {
			const stakerAndBalance = await getStakingBalance(stakingContract, candidate);
			if (stakerAndBalance.balance.toString() !== '0') {
				nonzero.push(stakerAndBalance);
			}

			i += 1;
			// Log our progress
			logProgress(i, candidates.length);
		}

		console.log(`\n\n${nonzero.length} active stakers found.`);

		return nonzero;
	}

	// Computes the balances owed to each account
	function computeOwedBalances(balances) {
		console.log(`\nComputing owed sUSD balances for accounts using parameters:`);
		console.log(`    Price: ${fromWei(frozenPrice)}`);
		console.log(`    Exchange Fee: ${fromWei(multiplyDecimal(exchangeFee, toWei('100')))}%`);

		const feeMultiplier = toBN(toWei('1')).sub(toBN(exchangeFee));

		const result = balances.map(b => {
			const owed = multiplyDecimal(multiplyDecimal(toBN(b.balance), frozenPrice), feeMultiplier);
			return {
				address: b.address,
				balance: b.balance,
				owed: owed.toString(),
				readableBalance: fromWei(b.balance),
				readableOwed: fromWei(owed),
			};
		});

		const totalStaked = result.reduce((total, curr) => total.add(toBN(curr.balance)), toBN(0));
		const totalOwed = result.reduce((total, curr) => total.add(toBN(curr.owed)), toBN(0));

		console.log(`\n${fromWei(totalStaked)} staked in total.`);
		console.log(`${fromWei(totalOwed)} total sUSD owed.\n`);
		return result;
	}

	function saveOwedBalances(owedSUSDBalances) {
		let csvString = 'Address,Staked Balance,Owed sUSD,Readable Staked Balance,Readable Owed sUSD\n';

		for (const balance of owedSUSDBalances) {
			const line = `${balance.address},${balance.balance},${balance.owed},${balance.readableBalance},${balance.readableOwed}\n`;
			csvString = csvString.concat(line);
		}

		csvString = csvString.concat(`\nPrice,${fromWei(frozenPrice)}\n`);
		csvString = csvString.concat(`Exchange Fee,${fromWei(exchangeFee)}\n`);

		console.log(`Saving results to ${owedFile}...`);
		fs.writeFileSync(owedFile, csvString);
	}

	const nonzeroBalances = await fetchStakedBalances();
	const owedSUSDBalances = computeOwedBalances(nonzeroBalances);

	saveOwedBalances(owedSUSDBalances);
}

module.exports = {
	extractStakingBalances,
	cmd: program =>
		program
			.command('extract-staking-balances')
			.option(
				'-n, --network <value>',
				'The network to run off.',
				x => x.toLowerCase(),
				DEFAULTS.network
			)
			.option(
				'-d, --deployment-path <value>',
				`Path to a folder that has your input configuration file ${CONFIG_FILENAME}, the synth list ${SYNTHS_FILENAME} and where your ${DEPLOYMENT_FILENAME} files will go`
			)
			.option('-s, --synth <value>', 'The synth to extract from')
			.description('Extracts staking reward balances')
			.action(async (...args) => {
				try {
					await extractStakingBalances(...args);
				} catch (err) {
					console.error(red(err));
					console.log(err.stack);
					process.exitCode = 1;
				}
			}),
};
