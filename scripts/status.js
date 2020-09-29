require('dotenv').config();

const program = require('commander');
const { green, cyan, red } = require('chalk');
const { formatEther, formatBytes32String } = require('ethers').utils;

const { getContract, setupProvider } = require('./utils');

async function status({ network, useOvm, providerUrl }) {
	/* ~~~~~~~~~~~~~~~~~~~ */
	/* ~~~~~~ Input ~~~~~~ */
	/* ~~~~~~~~~~~~~~~~~~~ */

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
		const spaces = ' '.repeat(indent);
		const name = cyan(`* ${itemName}${itemValue ? ':' : ''}`);
		const value = itemValue !== undefined ? itemValue : '';
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

	/* ~~~~~~~~~~~~~~~~~~~~~~~~~ */
	/* ~~~~ SupplySchedule  ~~~~ */
	/* ~~~~~~~~~~~~~~~~~~~~~~~~~ */

	logSection('SupplySchedule');

	const SupplySchedule = await getContract({
		contract: 'SupplySchedule',
		abi: useOvm ? 'FixedSupplySchedule' : 'SupplySchedule',
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

	const feePeriod0 = await FeePool.recentFeePeriods('0');
	logItem('feePeriod0');
	Object.keys(feePeriod0).map(key => {
		if (isNaN(key)) {
			logItem(`${key}`, `${feePeriod0[key].toString()}`, 2);
		}
	});

	logItem(
		'feePeriod0.recentFeePeriods(0).startTime',
		new Date(feePeriod0.startTime.toString() * 1000),
		2
	);

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
		const rate = await ExchangeRates.rateForCurrency(formatBytes32String('SNX'));
		const updated = (await ExchangeRates.lastRateUpdateTimes(formatBytes32String('SNX'))) * 1000;
		logItem(`${currency} rate:`, `${rate} (updated ${updated})`);
	};

	await logRate('SNX');
}
program
	.description('Query state of the system on any network')
	.option('-n, --network <value>', 'The network to run off.', x => x.toLowerCase(), 'mainnet')
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
