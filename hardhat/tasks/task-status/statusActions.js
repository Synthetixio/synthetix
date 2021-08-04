const fs = require('fs');
const path = require('path');
const ethers = require('ethers');
const { green, cyan, bgRed } = require('chalk');

const { wrap } = require('../../..');

const ActionNames = {
	getSynthetix: 'Synthetix',
	getDebtCache: 'DebtCache',
	getSynthetixState: 'SynthetixState',
	getSupplySchedule: 'SupplySchedule',
	getFeePool: 'FeePool',
	getFeePoolState: 'FeePoolState',
	getAddressResolver: 'AddressResolver',
	getSystemSettings: 'SystemSettings',
	getExchangeRates: 'ExchangeRates',
};

const logSection = sectionName => {
	console.log(green(`\n=== ${sectionName}: ===`));
};

const logActionError = actionName => {
	logSection(actionName);

	logItem('Action not recognized', actionName, 1, bgRed);
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

const logHeader = ({ statusConf }) => {
	logSection('Info');

	logItem('Network', statusConf.network);
	logItem('Deployment', statusConf.deploymentPath);
	logItem('Optimism', statusConf.useOvm);
	logItem('Block #', statusConf.blockOptions.blockTag);
	logItem('Provider', statusConf.provider.connection.url);
};

const actions = {
	[ActionNames.getSynthetix]: async function({
		useOvm,
		network,
		provider,
		deploymentPath,
		blockOptions,
	}) {
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
	},

	[ActionNames.getDebtCache]: async function({ useOvm, network, provider, deploymentPath }) {
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

		logItem('DebtCache.info.isInvalid', info.isInvalid, 1, info.isInvalid ? bgRed : undefined);

		logItem('DebtCache.info.isStale', info.isStale, 1, info.isStale ? bgRed : undefined);
	},

	[ActionNames.getSynthetixState]: async function({
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

		if (!addresses || addresses.length === 0) {
			console.log(green('  No Addresses defined'));
		}

		for (const address of addresses) {
			console.log(green('  Address:'), address);

			const data = await SynthetixState.issuanceData(address, blockOptions);
			logItem('SynthetixState.issuanceData(address)', data.toString());
		}
	},

	[ActionNames.getSupplySchedule]: async function({
		useOvm,
		network,
		provider,
		deploymentPath,
		blockOptions,
	}) {
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

			const supply = ethers.utils.formatEther(await SupplySchedule.mintableSupply(blockOptions));
			logItem('SupplySchedule.mintableSupply', supply);

			const lastMint = (await SupplySchedule.lastMintEvent(blockOptions)).toNumber();
			logItem('FixedSupplySchedule.lastMintEvent', `${lastMint} ${new Date(+lastMint * 1000)}`);
		}
	},

	[ActionNames.getFeePool]: async function({
		useOvm,
		network,
		provider,
		deploymentPath,
		blockOptions,
		addresses,
	}) {
		logSection('FeePool');

		const FeePool = getContract({
			contract: 'FeePool',
			network,
			useOvm,
			provider,
			deploymentPath,
		});

		logItem(
			'FeePool.feePeriodDuration',
			(await FeePool.feePeriodDuration(blockOptions)).toString()
		);

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
	},

	[ActionNames.getFeePoolState]: async function({
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

		if (!addresses || addresses.length === 0) {
			console.log(green('  No Addresses defined'));
		}

		for (const address of addresses) {
			console.log(green('  Address:'), address);

			const debtEntry = await FeePoolState.getAccountsDebtEntry(address, 0, blockOptions);
			logItem(
				'FeePoolState.getAccountsDebtEntry(address)',
				debtEntry.map(item => item.toString())
			);
		}
	},

	[ActionNames.getAddressResolver]: async function({
		useOvm,
		network,
		provider,
		deploymentPath,
		blockOptions,
	}) {
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
				await AddressResolver.getAddress(ethers.utils.formatBytes32String(contract), blockOptions)
			);
		};

		await getAddress({ contract: 'RewardsDistribution' });
	},

	[ActionNames.getSystemSettings]: async function({ useOvm, network, provider, deploymentPath }) {
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
	},

	[ActionNames.getExchangeRates]: async function({
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
			currencyKeys = listedCurrencies.map(e => ethers.utils.formatBytes32String(e));
		} else {
			currencyKeys = [
				...(await Issuer.availableCurrencyKeys()),
				ethers.utils.formatBytes32String('SNX'),
			];
		}

		const now = Math.floor(new Date().getTime() / 60000);

		const logRate = async currencyKey => {
			const currency = ethers.utils.toUtf8String(currencyKey);
			const rate = await ExchangeRates.rateForCurrency(currencyKey, blockOptions);
			const isInvalid = await ExchangeRates.rateIsInvalid(currencyKey, blockOptions);
			const updated = await ExchangeRates.lastRateUpdateTimes(currencyKey, blockOptions);
			const sinceUpdate = Math.floor(now - +updated.toString() / 60);

			logItem(
				`${currency} rate`,
				`${ethers.utils.formatEther(rate)} (Updated ${sinceUpdate} minutes ago)`,
				1,
				isInvalid ? bgRed : undefined
			);
		};

		for (const currencyKey of currencyKeys) {
			await logRate(currencyKey);
		}
	},
};

function getContract({
	contract,
	network = 'mainnet',
	useOvm = false,
	deploymentPath = undefined,
	provider,
}) {
	const { getSource, getTarget } = wrap({
		network,
		deploymentPath,
		fs,
		path,
	});

	return new ethers.Contract(
		getTarget({ contract, network, useOvm, deploymentPath }).address,
		getSource({ contract, network, useOvm, deploymentPath }).abi,
		provider
	);
}

module.exports = {
	ActionNames,
	actions,
	logHeader,
	logActionError,
};
