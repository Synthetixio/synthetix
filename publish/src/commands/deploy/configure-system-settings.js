'use strict';

const { gray } = require('chalk');
const {
	utils: { parseUnits, formatUnits },
} = require('ethers');
const {
	toBytes32,
	constants: { ZERO_ADDRESS },
} = require('../../../..');

const { catchMissingResolverWhenGeneratingSolidity } = require('../../util');

module.exports = async ({
	deployer,
	methodCallGasLimit,
	useOvm,
	generateSolidity,
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

		let synthRates = [];
		try {
			// Now ensure all the fee rates are set for various synths (this must be done after the AddressResolver
			// has populated all references).
			// Note: this populates rates for new synths regardless of the addNewSynths flag
			synthRates = await Promise.all(
				synths.map(({ name }) => SystemSettings.methods.exchangeFeeRate(toBytes32(name)).call())
			);
		} catch (err) {
			// weird edge case: if a new SystemSettings is deployed and generate-solidity is on then
			// this fails cause the resolver is not cached, so imitate this empty response to keep
			// generating solidity code
			catchMissingResolverWhenGeneratingSolidity({
				contract: 'SystemSettings',
				err,
				generateSolidity,
			});
		}
		const exchangeFeeRates = await getDeployParameter('EXCHANGE_FEE_RATES');

		// update all synths with 0 current rate
		const synthsRatesToUpdate = synths
			.map((synth, i) =>
				Object.assign(
					{
						currentRate: parseUnits(synthRates[i] || '0').toString(),
						targetRate: exchangeFeeRates[synth.category],
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
				comment: 'Set the exchange rates for various synths',
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
			comment: 'Set the fee reclamation (SIP-37) waiting period',
		});

		await runStep({
			contract: 'SystemSettings',
			target: SystemSettings,
			read: 'priceDeviationThresholdFactor',
			expected: input => input !== '0', // only change if zero
			write: 'setPriceDeviationThresholdFactor',
			writeArg: await getDeployParameter('PRICE_DEVIATION_THRESHOLD_FACTOR'),
			comment: 'Set the threshold for the circuit breaker (SIP-65)',
		});

		const tradingRewardsEnabled = await getDeployParameter('TRADING_REWARDS_ENABLED');
		await runStep({
			contract: 'SystemSettings',
			target: SystemSettings,
			read: 'tradingRewardsEnabled',
			expected: input => input === tradingRewardsEnabled, // only change if non-default
			write: 'setTradingRewardsEnabled',
			writeArg: tradingRewardsEnabled,
			comment: 'Set the flag for trading rewards (SIP-63)',
		});

		await runStep({
			contract: 'SystemSettings',
			target: SystemSettings,
			read: 'issuanceRatio',
			expected: input => input !== '0', // only change if zero
			write: 'setIssuanceRatio',
			writeArg: await getDeployParameter('ISSUANCE_RATIO'),
			comment: 'Set the issuance ratio - the c-ratio stored as an inverted decimal',
		});

		await runStep({
			contract: 'SystemSettings',
			target: SystemSettings,
			read: 'feePeriodDuration',
			expected: input => input !== '0', // only change if zero
			write: 'setFeePeriodDuration',
			writeArg: await getDeployParameter('FEE_PERIOD_DURATION'),
			comment: 'Set the fee period duration',
		});

		await runStep({
			contract: 'SystemSettings',
			target: SystemSettings,
			read: 'targetThreshold',
			expected: input => input !== '0', // only change if zero
			write: 'setTargetThreshold',
			writeArg: await getDeployParameter('TARGET_THRESHOLD'),
			comment:
				'Set the target threshold - the threshold beyond the c-ratio that allows fees to be claimed',
		});

		await runStep({
			contract: 'SystemSettings',
			target: SystemSettings,
			read: 'liquidationDelay',
			expected: input => input !== '0', // only change if zero
			write: 'setLiquidationDelay',
			writeArg: await getDeployParameter('LIQUIDATION_DELAY'),
			comment: 'Set the delay from when an account is flagged till when it can be liquidated',
		});

		await runStep({
			contract: 'SystemSettings',
			target: SystemSettings,
			read: 'liquidationRatio',
			expected: input => input !== '0', // only change if zero
			write: 'setLiquidationRatio',
			writeArg: await getDeployParameter('LIQUIDATION_RATIO'),
			comment: 'Set the ratio below which an account can be flagged for liquidation',
		});

		await runStep({
			contract: 'SystemSettings',
			target: SystemSettings,
			read: 'liquidationPenalty',
			expected: input => input !== '0', // only change if zero
			write: 'setLiquidationPenalty',
			writeArg: await getDeployParameter('LIQUIDATION_PENALTY'),
			comment: 'Set the penalty amount a liquidator receives from a liquidated account',
		});

		await runStep({
			contract: 'SystemSettings',
			target: SystemSettings,
			read: 'rateStalePeriod',
			expected: input => input !== '0', // only change if zero
			write: 'setRateStalePeriod',
			writeArg: await getDeployParameter('RATE_STALE_PERIOD'),
			comment: 'Set the maximum amount of time (in secs) that a rate can be used for',
		});

		await runStep({
			contract: 'SystemSettings',
			target: SystemSettings,
			read: 'minimumStakeTime',
			expected: input => input !== '0', // only change if zero
			write: 'setMinimumStakeTime',
			writeArg: await getDeployParameter('MINIMUM_STAKE_TIME'),
			comment: 'Set the minimum amount of time SNX can be issued before any is burned (SIP-40)',
		});

		await runStep({
			contract: 'SystemSettings',
			target: SystemSettings,
			read: 'debtSnapshotStaleTime',
			expected: input => input !== '0', // only change if zero
			write: 'setDebtSnapshotStaleTime',
			writeArg: await getDeployParameter('DEBT_SNAPSHOT_STALE_TIME'),
			comment: 'Set the length of time after which the DebtCache snapshot becomes stale (SIP-91)',
		});

		await runStep({
			contract: 'SystemSettings',
			target: SystemSettings,
			read: 'crossDomainMessageGasLimit',
			readArg: 0,
			expected: input => input !== '0', // only change if zero
			write: 'setCrossDomainMessageGasLimit',
			writeArg: [0, await getDeployParameter('CROSS_DOMAIN_DEPOSIT_GAS_LIMIT')],
			comment: 'Set the gas limit for depositing onto L2',
		});

		await runStep({
			contract: 'SystemSettings',
			target: SystemSettings,
			read: 'crossDomainMessageGasLimit',
			readArg: 1,
			expected: input => input !== '0', // only change if zero
			write: 'setCrossDomainMessageGasLimit',
			writeArg: [1, await getDeployParameter('CROSS_DOMAIN_ESCROW_GAS_LIMIT')],
			comment: 'Set the gas limit for migrating escrowed SNX to L2',
		});

		await runStep({
			contract: 'SystemSettings',
			target: SystemSettings,
			read: 'crossDomainMessageGasLimit',
			readArg: 2,
			expected: input => input !== '0', // only change if zero
			write: 'setCrossDomainMessageGasLimit',
			writeArg: [2, await getDeployParameter('CROSS_DOMAIN_REWARD_GAS_LIMIT')],
			comment: 'Set the gas limit for depositing rewards to L2',
		});

		await runStep({
			contract: 'SystemSettings',
			target: SystemSettings,
			read: 'crossDomainMessageGasLimit',
			readArg: 3,
			expected: input => input !== '0', // only change if zero
			write: 'setCrossDomainMessageGasLimit',
			writeArg: [3, await getDeployParameter('CROSS_DOMAIN_WITHDRAWAL_GAS_LIMIT')],
			comment: 'Set the gas limit for withdrawing from L2',
		});

		await runStep({
			contract: 'SystemSettings',
			target: SystemSettings,
			read: 'crossDomainMessageGasLimit',
			readArg: 4,
			expected: input => input !== '0', // only change if zero
			write: 'setCrossDomainMessageGasLimit',
			writeArg: [4, await getDeployParameter('CROSS_DOMAIN_RELAY_GAS_LIMIT')],
			comment: 'Set the gas limit for relaying owner actions to L2',
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
				comment: 'Set the aggregator warning address (SIP-76)',
			});
		}

		await runStep({
			contract: 'SystemSettings',
			target: SystemSettings,
			read: 'etherWrapperMaxETH',
			expected: input => input !== '0', // only change if zero
			write: 'setEtherWrapperMaxETH',
			writeArg: await getDeployParameter('ETHER_WRAPPER_MAX_ETH'),
			comment: 'Set the max amount of Ether allowed in the EtherWrapper (SIP-112)',
		});
		await runStep({
			contract: 'SystemSettings',
			target: SystemSettings,
			read: 'etherWrapperMintFeeRate',
			expected: input => input !== '0', // only change if zero
			write: 'setEtherWrapperMintFeeRate',
			writeArg: await getDeployParameter('ETHER_WRAPPER_MINT_FEE_RATE'),
			comment: 'Set the fee rate for minting sETH from ETH in the EtherWrapper (SIP-112)',
		});
		await runStep({
			contract: 'SystemSettings',
			target: SystemSettings,
			read: 'etherWrapperBurnFeeRate',
			expected: input => input !== '0', // only change if zero
			write: 'setEtherWrapperBurnFeeRate',
			writeArg: await getDeployParameter('ETHER_WRAPPER_BURN_FEE_RATE'),
			comment: 'Set the fee rate for burning sETH for ETH in the EtherWrapper (SIP-112)',
		});
	}
};
