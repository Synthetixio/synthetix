'use strict';

const { gray, yellow } = require('chalk');
const { confirmAction } = require('../../util');
const { toBytes32 } = require('../../../..');
const w3utils = require('web3-utils');

module.exports = async ({
	deployer,
	getDeployParameter,
	loadAndCheckRequiredSources,
	runStep,
	useOvm,
	deploymentPath,
	network,
	generateSolidity,
	yes,
}) => {
	console.log(gray(`\n------ CONFIGURE PERPS V2 MARKETS ------\n`));

	if (!useOvm) return;

	const { PerpsV2MarketSettings: futuresMarketSettings, SystemStatus } = deployer.deployedContracts;

	const { perpsv2Markets } = loadAndCheckRequiredSources({
		deploymentPath,
		network,
	});

	const FUTURES_MIN_INITIAL_MARGIN = await getDeployParameter('FUTURES_MIN_INITIAL_MARGIN');
	await runStep({
		contract: 'PerpsV2MarketSettings',
		target: futuresMarketSettings,
		read: 'minInitialMargin',
		expected: input => input === FUTURES_MIN_INITIAL_MARGIN,
		write: 'setMinInitialMargin',
		writeArg: FUTURES_MIN_INITIAL_MARGIN,
		comment: 'Set the minimum margin to open a futures position (SIP-80)',
	});

	const FUTURES_LIQUIDATION_FEE_RATIO = await getDeployParameter('FUTURES_LIQUIDATION_FEE_RATIO');
	await runStep({
		contract: 'PerpsV2MarketSettings',
		target: futuresMarketSettings,
		read: 'liquidationFeeRatio',
		expected: input => input === FUTURES_LIQUIDATION_FEE_RATIO,
		write: 'setLiquidationFeeRatio',
		writeArg: FUTURES_LIQUIDATION_FEE_RATIO,
		comment: 'Set the reward for liquidating a futures position (SIP-80)',
	});

	const FUTURES_LIQUIDATION_BUFFER_RATIO = await getDeployParameter(
		'FUTURES_LIQUIDATION_BUFFER_RATIO'
	);
	await runStep({
		contract: 'PerpsV2MarketSettings',
		target: futuresMarketSettings,
		read: 'liquidationBufferRatio',
		expected: input => input === FUTURES_LIQUIDATION_BUFFER_RATIO,
		write: 'setLiquidationBufferRatio',
		writeArg: FUTURES_LIQUIDATION_BUFFER_RATIO,
		comment: 'Set the reward for liquidating a futures position (SIP-80)',
	});

	const FUTURES_MIN_KEEPER_FEE = await getDeployParameter('FUTURES_MIN_KEEPER_FEE');
	await runStep({
		contract: 'PerpsV2MarketSettings',
		target: futuresMarketSettings,
		read: 'minKeeperFee',
		expected: input => input === FUTURES_MIN_KEEPER_FEE,
		write: 'setMinKeeperFee',
		writeArg: FUTURES_MIN_KEEPER_FEE,
		comment: 'Set the minimum reward for liquidating a futures position (SIP-80)',
	});

	//
	// Configure parameters for each market.
	//

	for (const market of Object.values(perpsv2Markets)) {
		const {
			asset,
			marketKey,
			takerFee,
			makerFee,
			takerFeeDelayedOrder,
			makerFeeDelayedOrder,
			takerFeeOffchainDelayedOrder,
			makerFeeOffchainDelayedOrder,
			nextPriceConfirmWindow,
			delayedOrderConfirmWindow,
			minDelayTimeDelta,
			maxDelayTimeDelta,
			offchainDelayedOrderMinAge,
			offchainDelayedOrderMaxAge,
			maxLeverage,
			maxMarketValue,
			maxFundingVelocity,
			skewScale,
			offchainMarketKey,
			offchainPriceDivergence,
			paused,
			offchainPaused,
		} = market;

		console.log(gray(`\n   --- MARKET ${asset} / ${marketKey} ---\n`));

		const marketKeyBytes = toBytes32(marketKey);
		const offchainMarketKeyBytes = toBytes32(offchainMarketKey);

		const settings = {
			takerFee: w3utils.toWei(takerFee),
			makerFee: w3utils.toWei(makerFee),
			takerFeeDelayedOrder: w3utils.toWei(takerFeeDelayedOrder),
			makerFeeDelayedOrder: w3utils.toWei(makerFeeDelayedOrder),
			takerFeeOffchainDelayedOrder: w3utils.toWei(takerFeeOffchainDelayedOrder),
			makerFeeOffchainDelayedOrder: w3utils.toWei(makerFeeOffchainDelayedOrder),
			nextPriceConfirmWindow: nextPriceConfirmWindow,
			delayedOrderConfirmWindow: delayedOrderConfirmWindow,
			minDelayTimeDelta: minDelayTimeDelta,
			maxDelayTimeDelta: maxDelayTimeDelta,
			offchainDelayedOrderMinAge: offchainDelayedOrderMinAge,
			offchainDelayedOrderMaxAge: offchainDelayedOrderMaxAge,
			maxLeverage: w3utils.toWei(maxLeverage),
			maxMarketValue: w3utils.toWei(maxMarketValue),
			maxFundingVelocity: w3utils.toWei(maxFundingVelocity),
			skewScale: w3utils.toWei(skewScale),
			offchainMarketKey: offchainMarketKeyBytes,
			offchainPriceDivergence: w3utils.toWei(offchainPriceDivergence),
		};

		for (const setting in settings) {
			const capSetting = setting.charAt(0).toUpperCase() + setting.slice(1);
			const value = settings[setting];

			await runStep({
				contract: 'PerpsV2MarketSettings',
				target: futuresMarketSettings,
				read: setting,
				readArg: [marketKeyBytes],
				expected: input => input === value,
				write: `set${capSetting}`,
				writeArg: [marketKeyBytes, value],
			});
		}

		// pause or resume market according to config
		await setPausedMode(paused, marketKeyBytes, marketKey);

		// pause or resume offchain market according to config
		await setPausedMode(offchainPaused, offchainMarketKeyBytes, offchainMarketKey);
	}

	async function setPausedMode(paused, marketKeyBytes, marketKey) {
		const shouldPause = paused; // config value
		const isPaused = (await SystemStatus.futuresMarketSuspension(marketKeyBytes)).suspended;

		if (shouldPause & !isPaused) {
			await runStep({
				contract: 'SystemStatus',
				target: SystemStatus,
				write: 'suspendFuturesMarket',
				writeArg: [marketKeyBytes, 80],
				comment: 'Ensure futures market is paused according to config',
			});
			if (generateSolidity) {
				migrationContractNoACLWarning(`pause ${marketKey} futures market`);
			}
		} else if (isPaused & !shouldPause) {
			let resume;

			if (!yes) {
				// in case we're trying to resume something that doesn't need to be resumed
				console.log(
					yellow(
						`⚠⚠⚠ WARNING: The market ${marketKey} is paused,`,
						`but according to config should be resumed. Confirm that this market should`,
						`be resumed in this release and it's not a misconfiguration issue.`
					)
				);
				try {
					await confirmAction(gray('Unpause the market? (y/n) '));
					resume = true;
				} catch (err) {
					console.log(gray('Market will remain paused'));
					resume = false;
				}
			} else {
				// yes mode (e.g. tests)
				resume = true;
			}

			if (resume) {
				await runStep({
					contract: 'SystemStatus',
					target: SystemStatus,
					write: 'resumeFuturesMarket',
					writeArg: [marketKeyBytes],
					comment: 'Ensure futures market is un-paused according to config',
				});
				if (generateSolidity) {
					migrationContractNoACLWarning(`unpause ${marketKey} futures market`);
				}
			}
		}
	}
};

function migrationContractNoACLWarning(actionMessage) {
	console.log(
		yellow(
			`⚠⚠⚠ WARNING: the step is trying to ${actionMessage}, but 'generateSolidity' is true. `,
			`The migration contract will not have the SystemStatus ACL permissions to perform this step, `,
			`so it should be EDITED OUT of the migration contract and performed separately (by rerunning `,
			`the deploy script).`
		)
	);
}
