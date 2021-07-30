const { task } = require('hardhat/config');
const { green, cyan, bgRed } = require('chalk');
const { getContract } = require('../util/getContract');
const { setupProvider } = require('../util/setupProvider');
const { ensureDeploymentPath, getDeploymentPathForNetwork } = require('../../publish/src/util');
const { formatEther, formatBytes32String, toUtf8String } = require('ethers').utils;

task('status', 'Query state of the system on any network')
	.addFlag('useOvm', 'Use an Optimism chain')
	.addFlag('useFork', 'Use a local fork')
	.addOptionalParam('targetNetwork', 'The network to run off', 'mainnet')
	.addOptionalParam('addresses', 'Addresses to perform particular checks on')
	.addOptionalParam('currencyKeys', 'Keys to get exchange rate on')
	.addOptionalParam('block', 'Block number to check again')
	.addOptionalParam('providerUrl', 'The http provider to use for communicating with the blockchain')
	.addOptionalParam('deploymentPath', 'Specify the path to the deployment data directory')
	.setAction(async (taskArguments, hre, runSuper) => {
		_commonInputAndSetup({ hre, taskArguments });
		const statusConf = hre.config.status;
		_logHeader({ statusConf });
		await _getSynthetix(statusConf);
		await _getDebtCache(statusConf);
		await _getSynthetixState(statusConf);
		await _getSupplySchedule(statusConf);
		await _getFeePool(statusConf);
		await _getFeePoolState(statusConf);
		await _getAddressResolver(statusConf);
		await _getSystemSettings(statusConf);
		await _getExchangeRates(statusConf);
	});

function _commonInputAndSetup({ hre, taskArguments }) {
	if (!hre.config.status) {
		hre.config.status = {};
	}
	const statusConf = hre.config.status;

	statusConf.useOvm = taskArguments.useOvm;
	statusConf.useFork = taskArguments.useFork;
	statusConf.network = taskArguments.targetNetwork.toLowerCase();

	statusConf.addresses = taskArguments.addresses ? taskArguments.addresses.split(',') : [];
	statusConf.listedCurrencies = taskArguments.currencyKeys
		? taskArguments.currencyKeys.split(',')
		: undefined;
	statusConf.blockOptions = {
		blockTag: taskArguments.block ? +taskArguments.block : 'latest',
	};
	statusConf.providerUrl = taskArguments.providerUrl;
	statusConf.deploymentPath =
		taskArguments.deploymentPath || getDeploymentPathForNetwork({ network: taskArguments.network });

	statusConf.provider = setupProvider(statusConf);
	ensureDeploymentPath(statusConf.deploymentPath);
}

function _logHeader({ statusConf }) {
	logSection('Info');

	logItem('Network', statusConf.network);
	logItem('Deployment', statusConf.deploymentPath);
	logItem('Optimism', statusConf.useOvm);
	logItem('Block #', statusConf.blockOptions.blockTag);
	logItem('Provider', statusConf.provider.connection.url);
}

async function _getSynthetix({ useOvm, network, provider, deploymentPath, blockOptions }) {
	logSection('Synthetix');

	const Synthetix = getContract({
		contract: 'Synthetix',
		source: useOvm ? 'MintableSynthetix' : 'Synthetix',
		network,
		useOvm,
		provider,
		deploymentPath,
	});

	const anySynthOrSNXRateIsInvalid = await Synthetix.anySynthOrSNXRateIsInvalid(blockOptions);
	logItem(
		'Synthetix.anySynthOrSNXRateIsInvalid',
		anySynthOrSNXRateIsInvalid,
		1,
		anySynthOrSNXRateIsInvalid ? bgRed : undefined
	);

	logItem('Synthetix.totalSupply', (await Synthetix.totalSupply(blockOptions)).toString() / 1e18);
}

async function _getDebtCache({ useOvm, network, provider, deploymentPath }) {
	logSection('DebtCache');

	const DebtCache = getContract({
		contract: 'DebtCache',
		source: useOvm ? 'RealtimeDebtCache' : 'DebtCache',
		network,
		useOvm,
		provider,
		deploymentPath,
	});

	const info = await DebtCache.cacheInfo();

	logItem('DebgCache.info.isInvalid', info.isInvalid, 1, info.isInvalid ? bgRed : undefined);

	logItem('DebgCache.info.isStale', info.isStale, 1, info.isStale ? bgRed : undefined);
}

async function _getSynthetixState({
	useOvm,
	network,
	provider,
	deploymentPath,
	blockOptions,
	addresses,
}) {
	logSection('SynthetixState');

	const SynthetixState = getContract({
		contract: 'SynthetixState',
		network,
		useOvm,
		provider,
		deploymentPath,
	});

	for (const address of addresses) {
		console.log(green('  Address:'), address);

		const data = await SynthetixState.issuanceData(address, blockOptions);
		logItem('SynthetixState.issuanceData(address)', data.toString());
	}
}

async function _getSupplySchedule({ useOvm, network, provider, deploymentPath, blockOptions }) {
	if (!useOvm) {
		logSection('SupplySchedule');

		const SupplySchedule = getContract({
			contract: 'SupplySchedule',
			source: useOvm ? 'FixedSupplySchedule' : 'SupplySchedule',
			network,
			useOvm,
			provider,
			deploymentPath,
		});

		const supply = formatEther(await SupplySchedule.mintableSupply(blockOptions));
		logItem('SupplySchedule.mintableSupply', supply);

		const lastMint = (await SupplySchedule.lastMintEvent(blockOptions)).toNumber();
		logItem('FixedSupplySchedule.lastMintEvent', `${lastMint} ${new Date(+lastMint * 1000)}`);
	}
}

async function _getFeePool({ useOvm, network, provider, deploymentPath, blockOptions, addresses }) {
	logSection('FeePool');

	const FeePool = getContract({
		contract: 'FeePool',
		network,
		useOvm,
		provider,
		deploymentPath,
	});

	logItem('FeePool.feePeriodDuration', (await FeePool.feePeriodDuration(blockOptions)).toString());

	async function feePeriodInfo(idx) {
		const feePeriod = await FeePool.recentFeePeriods(idx, blockOptions);
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

		const feesByPeriod = await FeePool.feesByPeriod(address, blockOptions);
		logItem(
			'FeePool.feesByPeriod(address)',
			feesByPeriod.map(period => period.map(fee => fee.toString())),
			2
		);

		const lastFeeWithdrawal = await FeePool.getLastFeeWithdrawal(address, blockOptions);
		logItem('FeePool.getLastFeeWithdrawal(address)', lastFeeWithdrawal.toString(), 2);

		const effectiveDebtRatioForPeriod = await FeePool.effectiveDebtRatioForPeriod(
			address,
			1,
			blockOptions
		);
		logItem(
			`FeePool.effectiveDebtRatioForPeriod(${address}, 1)`,
			effectiveDebtRatioForPeriod.toString(),
			2
		);
	}
}

async function _getFeePoolState({
	useOvm,
	network,
	provider,
	deploymentPath,
	blockOptions,
	addresses,
}) {
	logSection('FeePoolState');

	const FeePoolState = getContract({
		contract: 'FeePoolState',
		network,
		useOvm,
		provider,
		deploymentPath,
	});

	for (const address of addresses) {
		console.log(green('  Address:'), address);

		const debtEntry = await FeePoolState.getAccountsDebtEntry(address, 0, blockOptions);
		logItem(
			'FeePoolState.getAccountsDebtEntry(address)',
			debtEntry.map(item => item.toString())
		);
	}
}

async function _getAddressResolver({ useOvm, network, provider, deploymentPath, blockOptions }) {
	logSection('AddressResolver');

	const AddressResolver = getContract({
		contract: 'AddressResolver',
		network,
		useOvm,
		provider,
		deploymentPath,
	});

	const getAddress = async ({ contract }) => {
		logItem(
			`AddressResolver.getAddress(${contract})`,
			await AddressResolver.getAddress(formatBytes32String(contract), blockOptions)
		);
	};

	await getAddress({ contract: 'RewardsDistribution' });
}

async function _getSystemSettings({ useOvm, network, provider, deploymentPath }) {
	logSection('SystemSettings');

	const SystemSettings = getContract({
		contract: 'SystemSettings',
		network,
		useOvm,
		provider,
		deploymentPath,
	});

	const rateStalePeriod = await SystemSettings.rateStalePeriod();

	logItem('rateStalePeriod', rateStalePeriod.toString());
}

async function _getExchangeRates({
	useOvm,
	network,
	provider,
	deploymentPath,
	blockOptions,
	listedCurrencies,
}) {
	logSection('ExchangeRates');

	const ExchangeRates = getContract({
		contract: 'ExchangeRates',
		source: useOvm ? 'ExchangeRatesWithoutInvPricing' : 'ExchangeRates',
		network,
		useOvm,
		provider,
		deploymentPath,
	});

	const Issuer = getContract({
		contract: 'Issuer',
		source: useOvm ? 'IssuerWithoutLiquidations' : 'Issuer',
		network,
		useOvm,
		provider,
		deploymentPath,
	});

	let currencyKeys;
	if (listedCurrencies) {
		currencyKeys = listedCurrencies.map(e => formatBytes32String(e));
	} else {
		currencyKeys = [...(await Issuer.availableCurrencyKeys()), formatBytes32String('SNX')];
	}

	const now = Math.floor(new Date().getTime() / 60000);

	const logRate = async currencyKey => {
		const currency = toUtf8String(currencyKey);
		const rate = await ExchangeRates.rateForCurrency(currencyKey, blockOptions);
		const isInvalid = await ExchangeRates.rateIsInvalid(currencyKey, blockOptions);
		const updated = await ExchangeRates.lastRateUpdateTimes(currencyKey, blockOptions);
		const sinceUpdate = Math.floor(now - +updated.toString() / 60);

		logItem(
			`${currency} rate`,
			`${formatEther(rate)} (Updated ${sinceUpdate} minutes ago)`,
			1,
			isInvalid ? bgRed : undefined
		);
	};

	for (const currencyKey of currencyKeys) {
		await logRate(currencyKey);
	}
}

const logSection = sectionName => {
	console.log(green(`\n=== ${sectionName}: ===`));
};

const logItem = (itemName, itemValue, indent = 1, color = undefined) => {
	const hasValue = itemValue !== undefined;
	const spaces = '  '.repeat(indent);
	const name = cyan(`* ${itemName}${hasValue ? ':' : ''}`);
	const value = hasValue ? itemValue : '';

	if (color) {
		console.log(color(spaces, name, value));
	} else {
		console.log(spaces, name, value);
	}
};
