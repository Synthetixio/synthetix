'use strict';

const { gray } = require('chalk');
const {
	utils: { parseUnits, formatUnits },
} = require('ethers');
const {
	toBytes32,
	constants: { ZERO_ADDRESS },
} = require('../../../..');
const { allowZeroOrUpdateIfNonZero } = require('../../util.js');

module.exports = async ({
	addressOf,
	deployer,
	methodCallGasLimit,
	useOvm,
	generateSolidity,
	getDeployParameter,
	network,
	runStep,
	synths,
}) => {
	const { CollateralShort, SystemSettings, ExchangeRates } = deployer.deployedContracts;

	// then ensure the defaults of SystemSetting
	// are set (requires FlexibleStorage to have been correctly configured)
	if (!SystemSettings) {
		return;
	}

	console.log(gray(`\n------ CONFIGURE SYSTEM SETTINGS ------\n`));

	let previousSystemSettings = deployer.getExistingContract({ contract: 'SystemSettings' });

	// when there is no new system settings, or when not doing generateSolidity, than just read from ourself
	if (SystemSettings.address === previousSystemSettings.address || !generateSolidity) {
		previousSystemSettings = undefined;
	} else {
		// otherwise when there's a new system setting, we want to be reading from the old
		// this is useful when generatingSolidity so we can understand what needs to be added in solidity
		// when upgrading SystemSettings
		console.log(
			gray(
				`New SystemSettings detected. Using the existing one at ${previousSystemSettings.address} to read from`
			)
		);
	}

	let synthRates = [];
	// Now ensure all the fee rates are set for various synths (this must be done after the AddressResolver
	// has populated all references).
	// Note: this populates rates for new synths regardless of the addNewSynths flag
	synthRates = await Promise.all(
		synths.map(({ name }) =>
			(previousSystemSettings || SystemSettings).exchangeFeeRate(toBytes32(name))
		)
	);

	const exchangeFeeRates = await getDeployParameter('EXCHANGE_FEE_RATES');

	// update all synths with 0 current rate
	const synthsRatesToUpdate = synths
		.map((synth, i) =>
			Object.assign(
				{
					currentRate: parseUnits((synthRates[i] || '').toString() || '0').toString(),
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
			readTarget: previousSystemSettings,
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
		readTarget: previousSystemSettings,
		expected: allowZeroOrUpdateIfNonZero(waitingPeriodSecs),
		write: 'setWaitingPeriodSecs',
		writeArg: waitingPeriodSecs,
		comment: 'Set the fee reclamation (SIP-37) waiting period',
	});

	const priceDeviationThresholdFactor = await getDeployParameter(
		'PRICE_DEVIATION_THRESHOLD_FACTOR'
	);
	await runStep({
		contract: 'SystemSettings',
		target: SystemSettings,
		read: 'priceDeviationThresholdFactor',
		readTarget: previousSystemSettings,
		expected: allowZeroOrUpdateIfNonZero(priceDeviationThresholdFactor),
		write: 'setPriceDeviationThresholdFactor',
		writeArg: priceDeviationThresholdFactor,
		comment: 'Set the threshold for the circuit breaker (SIP-65)',
	});

	const tradingRewardsEnabled = await getDeployParameter('TRADING_REWARDS_ENABLED');
	await runStep({
		contract: 'SystemSettings',
		target: SystemSettings,
		read: 'tradingRewardsEnabled',
		readTarget: previousSystemSettings,
		expected: input => input === tradingRewardsEnabled, // only change if non-default
		write: 'setTradingRewardsEnabled',
		writeArg: tradingRewardsEnabled,
		comment: 'Set the flag for trading rewards (SIP-63)',
	});

	const issuanceRatio = await getDeployParameter('ISSUANCE_RATIO');
	await runStep({
		contract: 'SystemSettings',
		target: SystemSettings,
		read: 'issuanceRatio',
		readTarget: previousSystemSettings,
		expected: allowZeroOrUpdateIfNonZero(issuanceRatio),
		write: 'setIssuanceRatio',
		writeArg: issuanceRatio,
		comment: 'Set the issuance ratio - the c-ratio stored as an inverted decimal',
	});

	const feePeriodDuration = await getDeployParameter('FEE_PERIOD_DURATION');
	await runStep({
		contract: 'SystemSettings',
		target: SystemSettings,
		read: 'feePeriodDuration',
		readTarget: previousSystemSettings,
		expected: allowZeroOrUpdateIfNonZero(feePeriodDuration),
		write: 'setFeePeriodDuration',
		writeArg: feePeriodDuration,
		comment: 'Set the fee period duration',
	});

	const targetThreshold = await getDeployParameter('TARGET_THRESHOLD');
	await runStep({
		contract: 'SystemSettings',
		target: SystemSettings,
		read: 'targetThreshold',
		readTarget: previousSystemSettings,
		expected: allowZeroOrUpdateIfNonZero(targetThreshold),
		write: 'setTargetThreshold',
		writeArg: targetThreshold,
		comment:
			'Set the target threshold - the threshold beyond the c-ratio that allows fees to be claimed',
	});

	const liquidationDelay = await getDeployParameter('LIQUIDATION_DELAY');
	await runStep({
		contract: 'SystemSettings',
		target: SystemSettings,
		read: 'liquidationDelay',
		readTarget: previousSystemSettings,
		expected: allowZeroOrUpdateIfNonZero(liquidationDelay),
		write: 'setLiquidationDelay',
		writeArg: liquidationDelay,
		comment: 'Set the delay from when an account is flagged till when it can be liquidated',
	});

	const liquidationRatio = await getDeployParameter('LIQUIDATION_RATIO');
	await runStep({
		contract: 'SystemSettings',
		target: SystemSettings,
		read: 'liquidationRatio',
		readTarget: previousSystemSettings,
		expected: allowZeroOrUpdateIfNonZero(liquidationRatio),
		write: 'setLiquidationRatio',
		writeArg: liquidationRatio,
		comment: 'Set the ratio below which an account can be flagged for liquidation',
	});

	const liquidationPenalty = await getDeployParameter('LIQUIDATION_PENALTY');
	await runStep({
		contract: 'SystemSettings',
		target: SystemSettings,
		read: 'liquidationPenalty',
		readTarget: previousSystemSettings,
		expected: allowZeroOrUpdateIfNonZero(liquidationPenalty),
		write: 'setLiquidationPenalty',
		writeArg: liquidationPenalty,
		comment: 'Set the penalty amount a liquidator receives from a liquidated account',
	});

	const rateStalePeriod = await getDeployParameter('RATE_STALE_PERIOD');
	await runStep({
		contract: 'SystemSettings',
		target: SystemSettings,
		read: 'rateStalePeriod',
		readTarget: previousSystemSettings,
		expected: allowZeroOrUpdateIfNonZero(rateStalePeriod),
		write: 'setRateStalePeriod',
		writeArg: rateStalePeriod,
		comment: 'Set the maximum amount of time (in secs) that a rate can be used for',
	});

	const minimumStakeTime = await getDeployParameter('MINIMUM_STAKE_TIME');
	await runStep({
		contract: 'SystemSettings',
		target: SystemSettings,
		read: 'minimumStakeTime',
		readTarget: previousSystemSettings,
		expected: allowZeroOrUpdateIfNonZero(minimumStakeTime),
		write: 'setMinimumStakeTime',
		writeArg: minimumStakeTime,
		comment: 'Set the minimum amount of time SNX can be issued before any is burned (SIP-40)',
	});

	const debtSnapshotStaleTime = await getDeployParameter('DEBT_SNAPSHOT_STALE_TIME');
	await runStep({
		contract: 'SystemSettings',
		target: SystemSettings,
		read: 'debtSnapshotStaleTime',
		readTarget: previousSystemSettings,
		expected: allowZeroOrUpdateIfNonZero(debtSnapshotStaleTime),
		write: 'setDebtSnapshotStaleTime',
		writeArg: debtSnapshotStaleTime,
		comment: 'Set the length of time after which the DebtCache snapshot becomes stale (SIP-91)',
	});

	const crossDomainDepositGasLimit = await getDeployParameter('CROSS_DOMAIN_DEPOSIT_GAS_LIMIT');
	await runStep({
		contract: 'SystemSettings',
		target: SystemSettings,
		read: 'crossDomainMessageGasLimit',
		readArg: 0,
		readTarget: previousSystemSettings,
		expected: allowZeroOrUpdateIfNonZero(crossDomainDepositGasLimit),
		write: 'setCrossDomainMessageGasLimit',
		writeArg: [0, crossDomainDepositGasLimit],
		comment: 'Set the gas limit for depositing onto L2',
	});

	const crossDomainEscrowGasLimit = await getDeployParameter('CROSS_DOMAIN_ESCROW_GAS_LIMIT');
	await runStep({
		contract: 'SystemSettings',
		target: SystemSettings,
		read: 'crossDomainMessageGasLimit',
		readArg: 1,
		readTarget: previousSystemSettings,
		expected: allowZeroOrUpdateIfNonZero(crossDomainEscrowGasLimit),
		write: 'setCrossDomainMessageGasLimit',
		writeArg: [1, crossDomainEscrowGasLimit],
		comment: 'Set the gas limit for migrating escrowed SNX to L2',
	});

	const crossDomainRewardGasLimit = await getDeployParameter('CROSS_DOMAIN_REWARD_GAS_LIMIT');
	await runStep({
		contract: 'SystemSettings',
		target: SystemSettings,
		read: 'crossDomainMessageGasLimit',
		readArg: 2,
		readTarget: previousSystemSettings,
		expected: allowZeroOrUpdateIfNonZero(crossDomainRewardGasLimit),
		write: 'setCrossDomainMessageGasLimit',
		writeArg: [2, crossDomainRewardGasLimit],
		comment: 'Set the gas limit for depositing rewards to L2',
	});

	const crossDomainWithdrawalGasLimit = await getDeployParameter(
		'CROSS_DOMAIN_WITHDRAWAL_GAS_LIMIT'
	);
	await runStep({
		contract: 'SystemSettings',
		target: SystemSettings,
		read: 'crossDomainMessageGasLimit',
		readArg: 3,
		readTarget: previousSystemSettings,
		expected: allowZeroOrUpdateIfNonZero(crossDomainWithdrawalGasLimit),
		write: 'setCrossDomainMessageGasLimit',
		writeArg: [3, crossDomainWithdrawalGasLimit],
		comment: 'Set the gas limit for withdrawing from L2',
	});

	const crossDomainRelayGasLimit = await getDeployParameter('CROSS_DOMAIN_RELAY_GAS_LIMIT');
	await runStep({
		contract: 'SystemSettings',
		target: SystemSettings,
		read: 'crossDomainMessageGasLimit',
		readArg: 4,
		readTarget: previousSystemSettings,
		expected: allowZeroOrUpdateIfNonZero(crossDomainRelayGasLimit),
		write: 'setCrossDomainMessageGasLimit',
		writeArg: [4, crossDomainRelayGasLimit],
		comment: 'Set the gas limit for relaying owner actions to L2',
	});

	const aggregatorWarningFlags = (await getDeployParameter('AGGREGATOR_WARNING_FLAGS'))[network];
	// If deploying to OVM avoid ivoking setAggregatorWarningFlags for now.
	if (aggregatorWarningFlags && !useOvm) {
		await runStep({
			contract: 'SystemSettings',
			target: SystemSettings,
			read: 'aggregatorWarningFlags',
			readTarget: previousSystemSettings,
			expected: input => input !== ZERO_ADDRESS, // only change if zero
			write: 'setAggregatorWarningFlags',
			writeArg: aggregatorWarningFlags,
			comment: 'Set the aggregator warning address (SIP-76)',
		});
	}

	const etherWrapperMaxETH = await getDeployParameter('ETHER_WRAPPER_MAX_ETH');
	await runStep({
		contract: 'SystemSettings',
		target: SystemSettings,
		read: 'etherWrapperMaxETH',
		readTarget: previousSystemSettings,
		expected: allowZeroOrUpdateIfNonZero(etherWrapperMaxETH),
		write: 'setEtherWrapperMaxETH',
		writeArg: etherWrapperMaxETH,
		comment: 'Set the max amount of Ether allowed in the EtherWrapper (SIP-112)',
	});

	const etherWrapperMintFeeRate = await getDeployParameter('ETHER_WRAPPER_MINT_FEE_RATE');
	await runStep({
		contract: 'SystemSettings',
		target: SystemSettings,
		read: 'etherWrapperMintFeeRate',
		readTarget: previousSystemSettings,
		expected: allowZeroOrUpdateIfNonZero(etherWrapperMintFeeRate),
		write: 'setEtherWrapperMintFeeRate',
		writeArg: etherWrapperMintFeeRate,
		comment: 'Set the fee rate for minting sETH from ETH in the EtherWrapper (SIP-112)',
	});

	// Disable checking this as now the current value is set to 0
	const etherWrapperBurnFeeRate = await getDeployParameter('ETHER_WRAPPER_BURN_FEE_RATE');
	await runStep({
		contract: 'SystemSettings',
		target: SystemSettings,
		read: 'etherWrapperBurnFeeRate',
		readTarget: previousSystemSettings,
		expected: allowZeroOrUpdateIfNonZero(etherWrapperBurnFeeRate),
		write: 'setEtherWrapperBurnFeeRate',
		writeArg: etherWrapperBurnFeeRate,
		comment: 'Set the fee rate for burning sETH for ETH in the EtherWrapper (SIP-112)',
	});

	// SIP-184 Exchange Dynamic Fee Rate
	const exchangeDynamicFeeThreshold = await getDeployParameter('EXCHANGE_DYNAMIC_FEE_THRESHOLD');
	await runStep({
		contract: 'SystemSettings',
		target: SystemSettings,
		read: 'exchangeDynamicFeeThreshold',
		readTarget: previousSystemSettings,
		expected: allowZeroOrUpdateIfNonZero(exchangeDynamicFeeThreshold),
		write: 'setExchangeDynamicFeeThreshold',
		writeArg: exchangeDynamicFeeThreshold,
		comment: 'Set exchange dynamic fee threshold (SIP-184)',
	});
	const exchangeDynamicFeeWeightDecay = await getDeployParameter(
		'EXCHANGE_DYNAMIC_FEE_WEIGHT_DECAY'
	);
	await runStep({
		contract: 'SystemSettings',
		target: SystemSettings,
		read: 'exchangeDynamicFeeWeightDecay',
		readTarget: previousSystemSettings,
		expected: allowZeroOrUpdateIfNonZero(exchangeDynamicFeeWeightDecay),
		write: 'setExchangeDynamicFeeWeightDecay',
		writeArg: exchangeDynamicFeeWeightDecay,
		comment: 'Set exchange dynamic fee weight decay (SIP-184)',
	});
	const exchangeDynamicFeeRounds = await getDeployParameter('EXCHANGE_DYNAMIC_FEE_ROUNDS');
	await runStep({
		contract: 'SystemSettings',
		target: SystemSettings,
		read: 'exchangeDynamicFeeRounds',
		readTarget: previousSystemSettings,
		expected: allowZeroOrUpdateIfNonZero(exchangeDynamicFeeRounds),
		write: 'setExchangeDynamicFeeRounds',
		writeArg: exchangeDynamicFeeRounds,
		comment: 'Set exchange dynamic fee rounds (SIP-184)',
	});
	const exchangeMaxDynamicFee = await getDeployParameter('EXCHANGE_MAX_DYNAMIC_FEE');
	await runStep({
		contract: 'SystemSettings',
		target: SystemSettings,
		read: 'exchangeMaxDynamicFee',
		readTarget: previousSystemSettings,
		expected: allowZeroOrUpdateIfNonZero(exchangeMaxDynamicFee),
		write: 'setExchangeMaxDynamicFee',
		writeArg: exchangeMaxDynamicFee,
		comment: 'Set exchange max dynamic fee (SIP-184)',
	});

	// SIP-120 Atomic swap settings
	if (SystemSettings.atomicMaxVolumePerBlock) {
		// TODO (SIP-120): finish configuring new atomic exchange system settings
		const atomicMaxVolumePerBlock = await getDeployParameter('ATOMIC_MAX_VOLUME_PER_BLOCK');
		await runStep({
			contract: 'SystemSettings',
			target: SystemSettings,
			read: 'atomicMaxVolumePerBlock',
			readTarget: previousSystemSettings,
			expected: allowZeroOrUpdateIfNonZero(atomicMaxVolumePerBlock),
			write: 'setAtomicMaxVolumePerBlock',
			writeArg: atomicMaxVolumePerBlock,
			comment: 'SIP-120 Set max atomic volume per block (in USD amounts)',
		});
	}

	if (SystemSettings.atomicTwapWindow) {
		const atomicTwapWindow = await getDeployParameter('ATOMIC_TWAP_WINDOW');
		await runStep({
			contract: 'SystemSettings',
			target: SystemSettings,
			read: 'atomicTwapWindow',
			readTarget: previousSystemSettings,
			expected: allowZeroOrUpdateIfNonZero(atomicTwapWindow),
			write: 'setAtomicTwapWindow',
			writeArg: atomicTwapWindow,
			comment: 'SIP-120 Set the TWAP window for atomic swaps',
		});
	}

	const dexEquivalents = await getDeployParameter('ATOMIC_EQUIVALENTS_ON_DEX');
	if (SystemSettings.atomicEquivalentForDexPricing && dexEquivalents) {
		for (const { currencyKey, equivalent } of Object.values(dexEquivalents)) {
			await runStep({
				contract: 'SystemSettings',
				target: SystemSettings,
				read: 'atomicEquivalentForDexPricing',
				readArg: toBytes32(currencyKey),
				readTarget: previousSystemSettings,
				expected: input => input !== ZERO_ADDRESS, // only change if zero
				write: 'setAtomicEquivalentForDexPricing',
				writeArg: [toBytes32(currencyKey), equivalent],
				comment:
					'SIP-120 Set the equivalent token - used in uniswap pools - corresponding to this synth',
			});
		}
	}

	const atomicExchangeFeeRate = await getDeployParameter('ATOMIC_EXCHANGE_FEE_RATES');
	if (SystemSettings.atomicExchangeFeeRate && atomicExchangeFeeRate) {
		for (const [currencyKey, rate] of Object.entries(atomicExchangeFeeRate)) {
			await runStep({
				contract: 'SystemSettings',
				target: SystemSettings,
				read: 'atomicExchangeFeeRate',
				readArg: toBytes32(currencyKey),
				readTarget: previousSystemSettings,
				expected: input => input !== 0, // only change if zero
				write: 'setAtomicExchangeFeeRate',
				writeArg: [toBytes32(currencyKey), rate],
				comment: 'SIP-120 Set the exchange fee rate for swapping atomically into this synth',
			});
		}
	}

	const atomicPriceBuffer = await getDeployParameter('ATOMIC_PRICE_BUFFER');
	if (SystemSettings.atomicPriceBuffer && atomicPriceBuffer) {
		for (const [currencyKey, buffer] of Object.entries(atomicPriceBuffer)) {
			await runStep({
				contract: 'SystemSettings',
				target: SystemSettings,
				read: 'atomicPriceBuffer',
				readArg: toBytes32(currencyKey),
				readTarget: previousSystemSettings,
				expected: input => input !== 0, // only change if zero
				write: 'setAtomicPriceBuffer',
				writeArg: [toBytes32(currencyKey), buffer],
				comment:
					'SIP-120 Set the price buffer applied to the base chainlink rate when comparing atomically',
			});
		}
	}

	const atomicVolatilityConsiderationWindow = await getDeployParameter(
		'ATOMIC_VOLATILITY_CONSIDERATION_WINDOW'
	);
	if (SystemSettings.atomicVolatilityConsiderationWindow && atomicVolatilityConsiderationWindow) {
		for (const [currencyKey, seconds] of Object.entries(atomicVolatilityConsiderationWindow)) {
			await runStep({
				contract: 'SystemSettings',
				target: SystemSettings,
				read: 'atomicVolatilityConsiderationWindow',
				readArg: toBytes32(currencyKey),
				readTarget: previousSystemSettings,
				expected: input => input !== 0, // only change if zero
				write: 'setAtomicVolatilityConsiderationWindow',
				writeArg: [toBytes32(currencyKey), seconds],
				comment: 'SIP-120 Set the atomic volatility window for this synth (in seconds)',
			});
		}
	}

	const atomicVolatilityUpdateThreshold = await getDeployParameter(
		'ATOMIC_VOLATILITY_UPDATE_THRESHOLD'
	);
	if (SystemSettings.atomicVolatilityUpdateThreshold && atomicVolatilityUpdateThreshold) {
		for (const [currencyKey, threshold] of Object.entries(atomicVolatilityUpdateThreshold)) {
			await runStep({
				contract: 'SystemSettings',
				target: SystemSettings,
				read: 'atomicVolatilityUpdateThreshold',
				readArg: toBytes32(currencyKey),
				readTarget: previousSystemSettings,
				expected: input => input !== 0, // only change if zero
				write: 'setAtomicVolatilityUpdateThreshold',
				writeArg: [toBytes32(currencyKey), threshold],
				comment:
					'SIP-120 Set the atomic volatility count for this synth during the volatility window',
			});
		}
	}

	const dexPriceAggregator = await getDeployParameter('DEX_PRICE_AGGREGATOR');
	if (ExchangeRates.dexPriceAggregator && dexPriceAggregator) {
		// set up DEX price oracle for exchange rates
		await runStep({
			contract: `ExchangeRates`,
			target: ExchangeRates,
			read: 'dexPriceAggregator',
			expected: input => input === dexPriceAggregator,
			write: 'setDexPriceAggregator',
			writeArg: dexPriceAggregator,
			comment: 'SIP-120 Set the DEX price aggregator (uniswap TWAP oracle reader)',
		});
	}

	// SIP-135 Shorting settings

	if (SystemSettings.interactionDelay) {
		const interactionDelay = (await getDeployParameter('COLLATERAL_SHORT'))['INTERACTION_DELAY'];
		await runStep({
			contract: 'SystemSettings',
			target: SystemSettings,
			read: 'interactionDelay',
			readArg: addressOf(CollateralShort),
			readTarget: previousSystemSettings,
			expected: allowZeroOrUpdateIfNonZero(interactionDelay),
			write: 'setInteractionDelay',
			writeArg: [CollateralShort.address, interactionDelay],
			comment: 'Ensure the CollateralShort contract has an interaction delay of zero on the OVM',
		});
	}

	if (SystemSettings.collapseFeeRate) {
		const collapseFeeRate = (await getDeployParameter('COLLATERAL_SHORT'))['COLLAPSE_FEE_RATE'];
		await runStep({
			contract: 'SystemSettings',
			target: SystemSettings,
			read: 'collapseFeeRate',
			readArg: addressOf(CollateralShort),
			readTarget: previousSystemSettings,
			expected: allowZeroOrUpdateIfNonZero(collapseFeeRate),
			write: 'setCollapseFeeRate',
			writeArg: [CollateralShort.address, collapseFeeRate],
			comment:
				'Ensure the CollateralShort contract has its service fee set for collapsing loans (SIP-135)',
		});
	}
};
