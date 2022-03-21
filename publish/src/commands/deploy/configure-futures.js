'use strict';

const { gray } = require('chalk');
const { toBytes32 } = require('../../../..');
const w3utils = require('web3-utils');

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

	const { FuturesMarketSettings: futuresMarketSettings } = deployer.deployedContracts;

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
		read: 'liquidationFeeRatio',
		expected: input => input !== '0', // only change if zero
		write: 'setLiquidationFeeRatio',
		writeArg: await getDeployParameter('FUTURES_LIQUIDATION_FEE_RATIO'),
		comment: 'Set the reward for liquidating a futures position (SIP-80)',
	});

	await runStep({
		contract: 'FuturesMarketSettings',
		target: futuresMarketSettings,
		read: 'liquidationBufferRatio',
		expected: input => input !== '0', // only change if zero
		write: 'setLiquidationBufferRatio',
		writeArg: await getDeployParameter('FUTURES_LIQUIDATION_BUFFER_RATIO'),
		comment: 'Set the reward for liquidating a futures position (SIP-80)',
	});

	await runStep({
		contract: 'FuturesMarketSettings',
		target: futuresMarketSettings,
		read: 'minKeeperFee',
		expected: input => input !== '0', // only change if zero
		write: 'setMinKeeperFee',
		writeArg: await getDeployParameter('FUTURES_MIN_KEEPER_FEE'),
		comment: 'Set the minimum reward for liquidating a futures position (SIP-80)',
	});

	//
	// Configure parameters for each market.
	//

	for (const market of Object.values(futuresMarkets)) {
		const {
			asset,
			marketKey,
			takerFee,
			makerFee,
			takerFeeNextPrice,
			makerFeeNextPrice,
			nextPriceConfirmWindow,
			maxLeverage,
			maxMarketValueUSD,
			maxFundingRate,
			skewScaleUSD,
		} = market;

		console.log(gray(`\n   --- MARKET ${asset} ---\n`));

		const marketKeyBytes = toBytes32(marketKey);

		const settings = {
			takerFee: w3utils.toWei(takerFee),
			makerFee: w3utils.toWei(makerFee),
			takerFeeNextPrice: w3utils.toWei(takerFeeNextPrice),
			makerFeeNextPrice: w3utils.toWei(makerFeeNextPrice),
			nextPriceConfirmWindow: nextPriceConfirmWindow,
			maxLeverage: w3utils.toWei(maxLeverage),
			maxMarketValueUSD: w3utils.toWei(maxMarketValueUSD),
			maxFundingRate: w3utils.toWei(maxFundingRate),
			skewScaleUSD: w3utils.toWei(skewScaleUSD),
		};

		for (const setting in settings) {
			const capSetting = setting.charAt(0).toUpperCase() + setting.slice(1);
			const value = settings[setting];

			await runStep({
				contract: 'FuturesMarketSettings',
				target: futuresMarketSettings,
				read: setting,
				readArg: [marketKeyBytes],
				expected: input => input === value,
				write: `set${capSetting}`,
				writeArg: [marketKeyBytes, value],
			});
		}
	}
};
