'use strict';

const { gray } = require('chalk');
const { toBytes32 } = require('../../../..');
const w3utils = require('web3-utils');
const {
	utils: { parseEther },
} = require('ethers');

module.exports = async ({
	deployer,
	getDeployParameter,
	loadAndCheckRequiredSources,
	runStep,
	useOvm,
	freshDeploy,
	deploymentPath,
	network,
}) => {
	console.log(gray(`\n------ CONFIGURE FUTURES MARKETS ------\n`));

	if (!useOvm) return;

	const {
		FuturesMarketSettings: futuresMarketSettings,
		ExchangeRates: exchangeRates,
	} = deployer.deployedContracts;

	const { futuresMarkets } = loadAndCheckRequiredSources({
		deploymentPath,
		network,
	});

	await runStep({
		contract: 'FuturesMarketSettings',
		target: futuresMarketSettings,
		read: 'minInitialMargin',
		expected: input => input !== '0', // only change if zero
		write: 'setMinInitialMargin',
		writeArg: await getDeployParameter('FUTURES_MIN_INITIAL_MARGIN'),
		comment: 'Set the minimum margin to open a futures position (SIP-80)',
	});

	await runStep({
		contract: 'FuturesMarketSettings',
		target: futuresMarketSettings,
		read: 'liquidationFee',
		expected: input => input !== '0', // only change if zero
		write: 'setLiquidationFee',
		writeArg: await getDeployParameter('FUTURES_LIQUIDATION_FEE'),
		comment: 'Set the reward for liquidating a futures position (SIP-80)',
	});

	const futuresAssets = futuresMarkets.map(x => x.asset);

	// Some market parameters invoke a recomputation of the funding rate, and
	// thus require exchange rates to be fresh. We assume production networks
	// have fresh funding rates at the time of deployment.
	if (freshDeploy || network === 'local') {
		const { timestamp } = await deployer.provider.ethers.provider.getBlock();
		const DUMMY_PRICE = parseEther('1').toString();

		console.log(gray(`Updating ExchangeRates for futures assets: ` + futuresAssets.join(', ')));

		for (const key of futuresAssets.map(toBytes32)) {
			await runStep({
				contract: 'ExchangeRates',
				target: exchangeRates,
				write: `updateRates`,
				writeArg: [[key], [DUMMY_PRICE], timestamp],
			});
		}
	}

	//
	// Configure parameters for each market.
	//

	for (const market of Object.values(futuresMarkets)) {
		const {
			asset,
			takerFee,
			makerFee,
			closureFee,
			maxLeverage,
			maxMarketValue,
			maxFundingRate,
			maxFundingRateSkew,
			maxFundingRateDelta,
		} = market;

		console.log(gray(`\n   --- MARKET ${asset} ---\n`));

		const baseAsset = toBytes32(asset);

		const settings = {
			takerFee: w3utils.toWei(takerFee),
			makerFee: w3utils.toWei(makerFee),
			closureFee: w3utils.toWei(closureFee),
			maxLeverage: w3utils.toWei(maxLeverage),
			maxMarketValue: w3utils.toWei(maxMarketValue),
			maxFundingRate: w3utils.toWei(maxFundingRate),
			maxFundingRateSkew: w3utils.toWei(maxFundingRateSkew),
			maxFundingRateDelta: w3utils.toWei(maxFundingRateDelta),
		};

		for (const setting in settings) {
			const capSetting = setting.charAt(0).toUpperCase() + setting.slice(1);
			const value = settings[setting];

			await runStep({
				contract: 'FuturesMarketSettings',
				target: futuresMarketSettings,
				read: setting,
				readArg: [baseAsset],
				expected: input => input === value,
				write: `set${capSetting}`,
				writeArg: [baseAsset, value],
			});
		}
	}
};
