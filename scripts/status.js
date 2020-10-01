require('dotenv').config();

const program = require('commander');
const { green, cyan, red } = require('chalk');
const { formatEther, formatBytes32String } = require('ethers').utils;
const { getSynths } = require('../');
const { getContract, setupProvider } = require('./utils');

async function status({ network, useOvm, providerUrl, addresses }) {
	/* ~~~~~~~~~~~~~~~~~~~ */
	/* ~~~~~~ Input ~~~~~~ */
	/* ~~~~~~~~~~~~~~~~~~~ */

	addresses = addresses ? addresses.split(',') : [];

	providerUrl = providerUrl.replace('network', network);
	if (!providerUrl) throw new Error('Cannot set up a provider.');

	/* ~~~~~~~~~~~~~~~~~~~ */
	/* ~~~~~~ Setup ~~~~~~ */
	/* ~~~~~~~~~~~~~~~~~~~ */

	const { provider } = await setupProvider({ providerUrl });

	/* ~~~~~~~~~~~~~~~~~~~ */
	/* ~~~~ Log utils ~~~~ */
	/* ~~~~~~~~~~~~~~~~~~~ */

	const logSection = sectionName => {
		console.log(green(`\n=== ${sectionName}: ===`));
	};

	const logItem = (itemName, itemValue, indent = 1) => {
		const hasValue = itemValue !== undefined;
		const spaces = '  '.repeat(indent);
		const name = cyan(`* ${itemName}${hasValue ? ':' : ''}`);
		const value = hasValue ? itemValue : '';
		console.log(spaces, name, value);
	};

	/* ~~~~~~~~~~~~~~~~~~~ */
	/* ~~~~~ General ~~~~~ */
	/* ~~~~~~~~~~~~~~~~~~~ */

	logSection('Info');

	logItem('Network', network);
	logItem('Optimism', useOvm);
	logItem('Provider', providerUrl);

	/* ~~~~~~~~~~~~~~~~~~~ */
	/* ~~~~ Synthetix ~~~~ */
	/* ~~~~~~~~~~~~~~~~~~~ */

	logSection('Synthetix');

	const Synthetix = await getContract({
		contract: 'Synthetix',
		network,
		useOvm,
		provider,
	});

	logItem('Synthetix.anySynthOrSNXRateIsInvalid:', await Synthetix.anySynthOrSNXRateIsInvalid());
	logItem('Synthetix.totalSupply', (await Synthetix.totalSupply()).toString() / 1e18);

	/* ~~~~~~~~~~~~~~~~~~~~~~~~ */
	/* ~~~~ SynthetixState ~~~~ */
	/* ~~~~~~~~~~~~~~~~~~~~~~~~ */

	logSection('SynthetixState');

	const SynthetixState = await getContract({
		contract: 'SynthetixState',
		network,
		useOvm,
		provider,
	});

	for (const address of addresses) {
		console.log(green('  Address:'), address);

		const data = await SynthetixState.issuanceData(address);
		logItem(`SynthetixState.issuanceData(address)`, data.toString());
	}

	/* ~~~~~~~~~~~~~~~~~~~~~~~~~ */
	/* ~~~~ SupplySchedule  ~~~~ */
	/* ~~~~~~~~~~~~~~~~~~~~~~~~~ */

	logSection('SupplySchedule');

	const SupplySchedule = await getContract({
		contract: 'SupplySchedule',
		source: useOvm ? 'FixedSupplySchedule' : 'SupplySchedule',
		network,
		useOvm,
		provider,
	});

	const supply = formatEther(await SupplySchedule.mintableSupply());
	logItem('SupplySchedule.mintableSupply', supply);

	if (useOvm) {
		logItem(
			'FixedSupplySchedule.inflationStartDate',
			new Date((await SupplySchedule.inflationStartDate()).toString() * 1000)
		);

		const lastMint = (await SupplySchedule.lastMintEvent()).toNumber();
		logItem('FixedSupplySchedule.lastMintEvent', lastMint);
		const mintPeriod = (await SupplySchedule.mintPeriodDuration()).toNumber();
		logItem('FixedSupplySchedule.mintPeriodDuration', mintPeriod);

		const now = Math.floor(new Date().getTime() / 1000);

		const remainingHours = (lastMint + mintPeriod - now) / (60 * 60);
		logItem('Remaining hours until period ends', remainingHours);

		logItem('FixedSupplySchedule.mintBuffer', (await SupplySchedule.mintBuffer()).toString());
		logItem(
			'FixedSupplySchedule.periodsSinceLastIssuance',
			(await SupplySchedule.periodsSinceLastIssuance()).toString()
		);
	}

	/* ~~~~~~~~~~~~~~~~~ */
	/* ~~~~ FeePool ~~~~ */
	/* ~~~~~~~~~~~~~~~~~ */

	logSection('FeePool');

	const FeePool = await getContract({
		contract: 'FeePool',
		network,
		useOvm,
		provider,
	});

	logItem('FeePool.feePeriodDuration', (await FeePool.feePeriodDuration()).toString());

	async function feePeriodInfo(idx) {
		const feePeriod = await FeePool.recentFeePeriods(idx);
		logItem(`feePeriod ${idx}:`);

		Object.keys(feePeriod).map(key => {
			if (isNaN(key)) {
				logItem(`${key}`, `${feePeriod[key].toString()}`, 2);
			}
		});

		logItem('startTime:', new Date(feePeriod.startTime.toString() * 1000), 2);
	}

	await feePeriodInfo(0);
	await feePeriodInfo(1);

	for (const address of addresses) {
		console.log(green('  Address:'), address);

		const feesByPeriod = await FeePool.feesByPeriod(address);
		logItem(
			`FeePool.feesByPeriod(address)`,
			feesByPeriod.map(period => period.map(fee => fee.toString())),
			2
		);

		const lastFeeWithdrawal = await FeePool.getLastFeeWithdrawal(address);
		logItem(`FeePool.getLastFeeWithdrawal(address)`, lastFeeWithdrawal.toString(), 2);

		const effectiveDebtRatioForPeriod = await FeePool.effectiveDebtRatioForPeriod(address, 1);
		logItem(
			`FeePool.effectiveDebtRatioForPeriod(${address}, 1)`,
			effectiveDebtRatioForPeriod.toString(),
			2
		);
	}

	/* ~~~~~~~~~~~~~~~~~~~~~~ */
	/* ~~~~ FeePoolState ~~~~ */
	/* ~~~~~~~~~~~~~~~~~~~~~~ */

	logSection('FeePoolState');

	const FeePoolState = await getContract({
		contract: 'FeePoolState',
		network,
		useOvm,
		provider,
	});

	for (const address of addresses) {
		console.log(green('  Address:'), address);

		const debtEntry = await FeePoolState.getAccountsDebtEntry(address, 0);
		logItem(
			`FeePoolState.getAccountsDebtEntry(address)`,
			debtEntry.map(item => item.toString())
		);
	}

	/* ~~~~~~~~~~~~~~~~~~~~~~~~~ */
	/* ~~~~ AddressResolver ~~~~ */
	/* ~~~~~~~~~~~~~~~~~~~~~~~~~ */

	logSection('AddressResolver');

	const AddressResolver = await getContract({
		contract: 'AddressResolver',
		network,
		useOvm,
		provider,
	});

	const getAddress = async ({ contract }) => {
		logItem(
			`AddressResolver.getAddress(${contract})`,
			await AddressResolver.getAddress(formatBytes32String(contract))
		);
	};

	await getAddress({ contract: 'RewardsDistribution' });

	/* ~~~~~~~~~~~~~~~~~~~~~~~ */
	/* ~~~~ ExchangeRates ~~~~ */
	/* ~~~~~~~~~~~~~~~~~~~~~~~ */

	logSection('ExchangeRates');

	const ExchangeRates = await getContract({
		contract: 'ExchangeRates',
		network,
		useOvm,
		provider,
	});

	const logRate = async currency => {
		const rate = await ExchangeRates.rateForCurrency(formatBytes32String(currency));
		const updated = (await ExchangeRates.lastRateUpdateTimes(formatBytes32String(currency))) * 1000;
		logItem(`${currency} rate:`, `${formatEther(rate)} (${new Date(updated.toString() * 1000)})`);
	};

	await logRate('SNX');

	const synths = getSynths();
	for (const synth of synths) {
		await logRate(synth.name);
	}
}
program
	.description('Query state of the system on any network')
	.option('-a, --addresses <values...>', 'Addresses to perform particular checks on')
	.option('-n, --network <value>', 'The network to run off', x => x.toLowerCase(), 'mainnet')
	.option(
		'-p, --provider-url <value>',
		'The http provider to use for communicating with the blockchain',
		process.env.PROVIDER_URL
	)
	.option('-z, --use-ovm', 'Use an Optimism chain', false)
	.action(async (...args) => {
		try {
			await status(...args);
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
