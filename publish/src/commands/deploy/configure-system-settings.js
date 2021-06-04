'use strict';

const { gray } = require('chalk');
const {
	utils: { parseUnits, formatUnits },
} = require('ethers');
const {
	toBytes32,
	constants: { ZERO_ADDRESS },
} = require('../../../..');

module.exports = async ({
	deployer,
	methodCallGasLimit,
	useOvm,
	getDeployParameter,
	network,
	runStep,
	synths,
}) => {
	const { SystemSettings } = deployer.deployedContracts;

	// then ensure the defaults of SystemSetting
	// are set (requires FlexibleStorage to have been correctly configured)
	if (SystemSettings) {
		console.log(gray(`\n------ CONFIGURE SYSTEM SETTINGS ------\n`));

		// Now ensure all the fee rates are set for various synths (this must be done after the AddressResolver
		// has populated all references).
		// Note: this populates rates for new synths regardless of the addNewSynths flag
		const synthRates = await Promise.all(
			synths.map(({ name }) => SystemSettings.methods.exchangeFeeRate(toBytes32(name)).call())
		);

		const exchangeFeeRates = await getDeployParameter('EXCHANGE_FEE_RATES');

		// override individual currencyKey / synths exchange rates
		const synthExchangeRateOverride = {
			sETH: parseUnits('0.0025').toString(),
			iETH: parseUnits('0.004').toString(),
			sBTC: parseUnits('0.003').toString(),
			iBTC: parseUnits('0.003').toString(),
			iBNB: parseUnits('0.021').toString(),
			sXTZ: parseUnits('0.0085').toString(),
			iXTZ: parseUnits('0.0085').toString(),
			sEOS: parseUnits('0.0085').toString(),
			iEOS: parseUnits('0.009').toString(),
			sETC: parseUnits('0.0085').toString(),
			sLINK: parseUnits('0.0085').toString(),
			sDASH: parseUnits('0.009').toString(),
			iDASH: parseUnits('0.009').toString(),
			sXRP: parseUnits('0.009').toString(),
		};

		const synthsRatesToUpdate = synths
			.map((synth, i) =>
				Object.assign(
					{
						currentRate: parseUnits(synthRates[i] || '0').toString(),
						targetRate:
							synth.name in synthExchangeRateOverride
								? synthExchangeRateOverride[synth.name]
								: exchangeFeeRates[synth.category],
					},
					synth
				)
			)
			.filter(({ currentRate }) => currentRate === '0');

		console.log(gray(`Found ${synthsRatesToUpdate.length} synths needs exchange rate pricing`));

		if (synthsRatesToUpdate.length) {
			console.log(
				gray(
					'Setting the following:',
					synthsRatesToUpdate
						.map(
							({ name, targetRate, currentRate }) =>
								`\t${name} from ${currentRate * 100}% to ${formatUnits(targetRate) * 100}%`
						)
						.join('\n')
				)
			);

			await runStep({
				gasLimit: Math.max(methodCallGasLimit, 150e3 * synthsRatesToUpdate.length), // higher gas required, 150k per synth is sufficient (in OVM)
				contract: 'SystemSettings',
				target: SystemSettings,
				write: 'setExchangeFeeRateForSynths',
				writeArg: [
					synthsRatesToUpdate.map(({ name }) => toBytes32(name)),
					synthsRatesToUpdate.map(({ targetRate }) => targetRate),
				],
			});
		}

		// setup initial values if they are unset

		const waitingPeriodSecs = await getDeployParameter('WAITING_PERIOD_SECS');
		await runStep({
			contract: 'SystemSettings',
			target: SystemSettings,
			read: 'waitingPeriodSecs',
			expected: input => (waitingPeriodSecs === '0' ? true : input !== '0'),
			write: 'setWaitingPeriodSecs',
			writeArg: waitingPeriodSecs,
		});

		await runStep({
			contract: 'SystemSettings',
			target: SystemSettings,
			read: 'priceDeviationThresholdFactor',
			expected: input => input !== '0', // only change if zero
			write: 'setPriceDeviationThresholdFactor',
			writeArg: await getDeployParameter('PRICE_DEVIATION_THRESHOLD_FACTOR'),
		});

		const tradingRewardsEnabled = await getDeployParameter('TRADING_REWARDS_ENABLED');
		await runStep({
			contract: 'SystemSettings',
			target: SystemSettings,
			read: 'tradingRewardsEnabled',
			expected: input => input === tradingRewardsEnabled, // only change if non-default
			write: 'setTradingRewardsEnabled',
			writeArg: tradingRewardsEnabled,
		});

		await runStep({
			contract: 'SystemSettings',
			target: SystemSettings,
			read: 'issuanceRatio',
			expected: input => input !== '0', // only change if zero
			write: 'setIssuanceRatio',
			writeArg: await getDeployParameter('ISSUANCE_RATIO'),
		});

		await runStep({
			contract: 'SystemSettings',
			target: SystemSettings,
			read: 'feePeriodDuration',
			expected: input => input !== '0', // only change if zero
			write: 'setFeePeriodDuration',
			writeArg: await getDeployParameter('FEE_PERIOD_DURATION'),
		});

		await runStep({
			contract: 'SystemSettings',
			target: SystemSettings,
			read: 'targetThreshold',
			expected: input => input !== '0', // only change if zero
			write: 'setTargetThreshold',
			writeArg: await getDeployParameter('TARGET_THRESHOLD'),
		});

		await runStep({
			contract: 'SystemSettings',
			target: SystemSettings,
			read: 'liquidationDelay',
			expected: input => input !== '0', // only change if zero
			write: 'setLiquidationDelay',
			writeArg: await getDeployParameter('LIQUIDATION_DELAY'),
		});

		await runStep({
			contract: 'SystemSettings',
			target: SystemSettings,
			read: 'liquidationRatio',
			expected: input => input !== '0', // only change if zero
			write: 'setLiquidationRatio',
			writeArg: await getDeployParameter('LIQUIDATION_RATIO'),
		});

		await runStep({
			contract: 'SystemSettings',
			target: SystemSettings,
			read: 'liquidationPenalty',
			expected: input => input !== '0', // only change if zero
			write: 'setLiquidationPenalty',
			writeArg: await getDeployParameter('LIQUIDATION_PENALTY'),
		});

		await runStep({
			contract: 'SystemSettings',
			target: SystemSettings,
			read: 'rateStalePeriod',
			expected: input => input !== '0', // only change if zero
			write: 'setRateStalePeriod',
			writeArg: await getDeployParameter('RATE_STALE_PERIOD'),
		});

		await runStep({
			contract: 'SystemSettings',
			target: SystemSettings,
			read: 'minimumStakeTime',
			expected: input => input !== '0', // only change if zero
			write: 'setMinimumStakeTime',
			writeArg: await getDeployParameter('MINIMUM_STAKE_TIME'),
		});

		await runStep({
			contract: 'SystemSettings',
			target: SystemSettings,
			read: 'debtSnapshotStaleTime',
			expected: input => input !== '0', // only change if zero
			write: 'setDebtSnapshotStaleTime',
			writeArg: await getDeployParameter('DEBT_SNAPSHOT_STALE_TIME'),
		});

		await runStep({
			contract: 'SystemSettings',
			target: SystemSettings,
			read: 'crossDomainMessageGasLimit',
			readArg: 0,
			expected: input => input !== '0', // only change if zero
			write: 'setCrossDomainMessageGasLimit',
			writeArg: [0, await getDeployParameter('CROSS_DOMAIN_DEPOSIT_GAS_LIMIT')],
		});

		await runStep({
			contract: 'SystemSettings',
			target: SystemSettings,
			read: 'crossDomainMessageGasLimit',
			readArg: 1,
			expected: input => input !== '0', // only change if zero
			write: 'setCrossDomainMessageGasLimit',
			writeArg: [1, await getDeployParameter('CROSS_DOMAIN_ESCROW_GAS_LIMIT')],
		});

		await runStep({
			contract: 'SystemSettings',
			target: SystemSettings,
			read: 'crossDomainMessageGasLimit',
			readArg: 2,
			expected: input => input !== '0', // only change if zero
			write: 'setCrossDomainMessageGasLimit',
			writeArg: [2, await getDeployParameter('CROSS_DOMAIN_REWARD_GAS_LIMIT')],
		});
		await runStep({
			contract: 'SystemSettings',
			target: SystemSettings,
			read: 'crossDomainMessageGasLimit',
			readArg: 3,
			expected: input => input !== '0', // only change if zero
			write: 'setCrossDomainMessageGasLimit',
			writeArg: [3, await getDeployParameter('CROSS_DOMAIN_WITHDRAWAL_GAS_LIMIT')],
		});

		const aggregatorWarningFlags = (await getDeployParameter('AGGREGATOR_WARNING_FLAGS'))[network];
		// If deploying to OVM avoid ivoking setAggregatorWarningFlags for now.
		if (aggregatorWarningFlags && !useOvm) {
			await runStep({
				contract: 'SystemSettings',
				target: SystemSettings,
				read: 'aggregatorWarningFlags',
				expected: input => input !== ZERO_ADDRESS, // only change if zero
				write: 'setAggregatorWarningFlags',
				writeArg: aggregatorWarningFlags,
			});
		}

		await runStep({
			contract: 'SystemSettings',
			target: SystemSettings,
			read: 'etherWrapperMaxETH',
			expected: input => input !== '0', // only change if zero
			write: 'setEtherWrapperMaxETH',
			writeArg: await getDeployParameter('ETHER_WRAPPER_MAX_ETH'),
		});
		await runStep({
			contract: 'SystemSettings',
			target: SystemSettings,
			read: 'etherWrapperMintFeeRate',
			expected: input => input !== '0', // only change if zero
			write: 'setEtherWrapperMintFeeRate',
			writeArg: await getDeployParameter('ETHER_WRAPPER_MINT_FEE_RATE'),
		});
		await runStep({
			contract: 'SystemSettings',
			target: SystemSettings,
			read: 'etherWrapperBurnFeeRate',
			expected: input => input !== '0', // only change if zero
			write: 'setEtherWrapperBurnFeeRate',
			writeArg: await getDeployParameter('ETHER_WRAPPER_BURN_FEE_RATE'),
		});
	}

	if (!useOvm) {
		// TODO: finish configuring new atomic exchange system settings
		await runStep({
			contract: 'SystemSettings',
			target: SystemSettings,
			read: 'atomicMaxVolumePerBlock',
			expected: input => input !== '0', // only change if zero
			write: 'setAtomicMaxVolumePerBlock',
			writeArg: await getDeployParameter('ATOMIC_MAX_VOLUME_PER_BLOCK'),
		});
		await runStep({
			contract: 'SystemSettings',
			target: SystemSettings,
			read: 'atomicTwapPriceWindow',
			expected: input => input !== '0', // only change if zero
			write: 'setAtomicTwapPriceWindow',
			writeArg: await getDeployParameter('ATOMIC_TWAP_PRICE_WINDOW'),
		});
	}
};
