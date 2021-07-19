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
	runStep,
	useOvm,
	freshDeploy,
	network,
}) => {
	console.log(gray(`\n------ CONFIGURE FUTURES MARKETS ------\n`));

	if (!useOvm) return;

	const {
		FuturesMarketSettings: futuresMarketSettings,
		ExchangeRates: exchangeRates,
	} = deployer.deployedContracts;

	await runStep({
		contract: 'FuturesMarketSettings',
		target: futuresMarketSettings,
		read: 'futuresMinInitialMargin',
		expected: input => input !== '0', // only change if zero
		write: 'setFuturesMinInitialMargin',
		writeArg: await getDeployParameter('FUTURES_MIN_INITIAL_MARGIN'),
		comment: 'Set the minimum margin to open a futures position (SIP-80)',
	});

	await runStep({
		contract: 'FuturesMarketSettings',
		target: futuresMarketSettings,
		read: 'futuresLiquidationFee',
		expected: input => input !== '0', // only change if zero
		write: 'setFuturesLiquidationFee',
		writeArg: await getDeployParameter('FUTURES_LIQUIDATION_FEE'),
		comment: 'Set the reward for liquidating a futures position (SIP-80)',
	});

	const futuresAssets = await getDeployParameter('FUTURES_ASSETS');
	const currencyKeys = futuresAssets.map(asset => toBytes32(`s${asset}`));

	// Some market parameters invoke a recomputation of the funding rate, and
	// thus require exchange rates to be fresh. We assume production networks
	// have fresh funding rates at the time of deployment.
	if (freshDeploy || network === 'local') {
		const { timestamp } = await deployer.provider.ethers.provider.getBlock();
		const DUMMY_PRICE = parseEther('1').toString();

		console.log(
			gray(
				`Updating ExchangeRates for futures assets: ` +
					futuresAssets.map(asset => `s${asset}`).join(', ')
			)
		);

		for (const key of currencyKeys) {
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

	for (const asset of futuresAssets) {
		console.log(gray(`\n   --- MARKET ${asset} ---\n`));

		const baseAsset = toBytes32(`s${asset}`);

		// TODO: Perform this programmatically per-market
		const settings = {
			takerFee: w3utils.toWei('0.003'),
			makerFee: w3utils.toWei('0.001'),
			maxLeverage: w3utils.toWei('10'),
			maxMarketValue: w3utils.toWei('100000'),
			maxFundingRate: w3utils.toWei('0.1'),
			maxFundingRateSkew: w3utils.toWei('1'),
			maxFundingRateDelta: w3utils.toWei('0.0125'),
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
