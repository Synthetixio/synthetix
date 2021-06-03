'use strict';

const { gray } = require('chalk');
const { toBytes32 } = require('../../../..');

module.exports = async ({
	addressOf,
	collateralManagerDefaults,
	deployer,
	getDeployParameter,
	runStep,
	useEmptyCollateralManager,
}) => {
	console.log(gray(`\n------ CONFIGURING MULTI COLLATERAL ------\n`));

	const {
		CollateralErc20,
		CollateralEth,
		CollateralShort,
		CollateralManager,
		CollateralManagerState,
		CollateralStateErc20,
		CollateralStateEth,
		CollateralStateShort,
	} = deployer.deployedContracts;

	if (CollateralStateShort && CollateralShort) {
		await runStep({
			contract: 'CollateralStateShort',
			target: CollateralStateShort,
			read: 'associatedContract',
			expected: input => input === CollateralShort.options.address,
			write: 'setAssociatedContract',
			writeArg: CollateralShort.options.address,
		});
	}

	if (CollateralStateErc20 && CollateralErc20) {
		await runStep({
			contract: 'CollateralStateErc20',
			target: CollateralStateErc20,
			read: 'associatedContract',
			expected: input => input === addressOf(CollateralErc20),
			write: 'setAssociatedContract',
			writeArg: addressOf(CollateralErc20),
		});
	}

	if (CollateralStateEth && CollateralEth) {
		await runStep({
			contract: 'CollateralStateEth',
			target: CollateralStateEth,
			read: 'associatedContract',
			expected: input => input === addressOf(CollateralEth),
			write: 'setAssociatedContract',
			writeArg: addressOf(CollateralEth),
		});
	}
	if (CollateralManagerState && CollateralManager) {
		await runStep({
			contract: 'CollateralManagerState',
			target: CollateralManagerState,
			read: 'associatedContract',
			expected: input => input === addressOf(CollateralManager),
			write: 'setAssociatedContract',
			writeArg: addressOf(CollateralManager),
		});
	}

	console.log(gray(`\n------ INITIALISING MULTI COLLATERAL ------\n`));

	if (CollateralEth && CollateralErc20 && CollateralShort) {
		const CollateralsArg = [CollateralEth, CollateralErc20, CollateralShort].map(addressOf);
		await runStep({
			contract: 'CollateralManager',
			target: CollateralManager,
			read: 'hasAllCollaterals',
			readArg: [CollateralsArg],
			expected: input => input,
			write: 'addCollaterals',
			writeArg: [CollateralsArg],
		});
	}
	if (CollateralEth) {
		await runStep({
			contract: 'CollateralEth',
			target: CollateralEth,
			read: 'manager',
			expected: input => input === addressOf(CollateralManager),
			write: 'setManager',
			writeArg: addressOf(CollateralManager),
		});
		const CollateralEthSynths = (await getDeployParameter('COLLATERAL_ETH'))['SYNTHS']; // COLLATERAL_ETH synths - ['sUSD', 'sETH']
		await runStep({
			contract: 'CollateralEth',
			gasLimit: 1e6,
			target: CollateralEth,
			read: 'areSynthsAndCurrenciesSet',
			readArg: [
				CollateralEthSynths.map(key => toBytes32(`Synth${key}`)),
				CollateralEthSynths.map(toBytes32),
			],
			expected: input => input,
			write: 'addSynths',
			writeArg: [
				CollateralEthSynths.map(key => toBytes32(`Synth${key}`)),
				CollateralEthSynths.map(toBytes32),
			],
		});

		await runStep({
			contract: 'CollateralEth',
			target: CollateralEth,
			read: 'issueFeeRate',
			expected: input => input !== '0', // only change if zero
			write: 'setIssueFeeRate',
			writeArg: (await getDeployParameter('COLLATERAL_ETH'))['ISSUE_FEE_RATE'],
		});
	}

	if (CollateralErc20) {
		await runStep({
			contract: 'CollateralErc20',
			target: CollateralErc20,
			read: 'manager',
			expected: input => input === addressOf(CollateralManager),
			write: 'setManager',
			writeArg: addressOf(CollateralManager),
		});
		const CollateralErc20Synths = (await getDeployParameter('COLLATERAL_RENBTC'))['SYNTHS']; // COLLATERAL_RENBTC synths - ['sUSD', 'sBTC']
		await runStep({
			contract: 'CollateralErc20',
			gasLimit: 1e6,
			target: CollateralErc20,
			read: 'areSynthsAndCurrenciesSet',
			readArg: [
				CollateralErc20Synths.map(key => toBytes32(`Synth${key}`)),
				CollateralErc20Synths.map(toBytes32),
			],
			expected: input => input,
			write: 'addSynths',
			writeArg: [
				CollateralErc20Synths.map(key => toBytes32(`Synth${key}`)),
				CollateralErc20Synths.map(toBytes32),
			],
		});

		await runStep({
			contract: 'CollateralErc20',
			target: CollateralErc20,
			read: 'issueFeeRate',
			expected: input => input !== '0', // only change if zero
			write: 'setIssueFeeRate',
			writeArg: (await getDeployParameter('COLLATERAL_RENBTC'))['ISSUE_FEE_RATE'],
		});
	}

	if (CollateralShort) {
		await runStep({
			contract: 'CollateralShort',
			target: CollateralShort,
			read: 'manager',
			expected: input => input === addressOf(CollateralManager),
			write: 'setManager',
			writeArg: addressOf(CollateralManager),
		});

		const CollateralShortSynths = (await getDeployParameter('COLLATERAL_SHORT'))['SYNTHS']; // COLLATERAL_SHORT synths - ['sBTC', 'sETH']
		await runStep({
			contract: 'CollateralShort',
			gasLimit: 1e6,
			target: CollateralShort,
			read: 'areSynthsAndCurrenciesSet',
			readArg: [
				CollateralShortSynths.map(key => toBytes32(`Synth${key}`)),
				CollateralShortSynths.map(toBytes32),
			],
			expected: input => input,
			write: 'addSynths',
			writeArg: [
				CollateralShortSynths.map(key => toBytes32(`Synth${key}`)),
				CollateralShortSynths.map(toBytes32),
			],
		});

		const CollateralShortInteractionDelay = (await getDeployParameter('COLLATERAL_SHORT'))[
			'INTERACTION_DELAY'
		];

		await runStep({
			contract: 'CollateralShort',
			target: CollateralShort,
			read: 'interactionDelay',
			expected: input => input !== '0', // only change if zero
			write: 'setInteractionDelay',
			writeArg: CollateralShortInteractionDelay,
		});
		await runStep({
			contract: 'CollateralShort',
			target: CollateralShort,
			read: 'issueFeeRate',
			expected: input => input !== '0', // only change if zero
			write: 'setIssueFeeRate',
			writeArg: (await getDeployParameter('COLLATERAL_SHORT'))['ISSUE_FEE_RATE'],
		});
	}

	if (!useEmptyCollateralManager) {
		await runStep({
			contract: 'CollateralManager',
			target: CollateralManager,
			read: 'maxDebt',
			expected: input => input !== '0', // only change if zero
			write: 'setMaxDebt',
			writeArg: [collateralManagerDefaults['MAX_DEBT']],
		});

		await runStep({
			contract: 'CollateralManager',
			target: CollateralManager,
			read: 'baseBorrowRate',
			expected: input => input !== '0', // only change if zero
			write: 'setBaseBorrowRate',
			writeArg: [collateralManagerDefaults['BASE_BORROW_RATE']],
		});

		await runStep({
			contract: 'CollateralManager',
			target: CollateralManager,
			read: 'baseShortRate',
			expected: input => input !== '0', // only change if zero
			write: 'setBaseShortRate',
			writeArg: [collateralManagerDefaults['BASE_SHORT_RATE']],
		});

		// add to the manager.
		const CollateralManagerSynths = collateralManagerDefaults['SYNTHS'];
		await runStep({
			gasLimit: 1e6,
			contract: 'CollateralManager',
			target: CollateralManager,
			read: 'areSynthsAndCurrenciesSet',
			readArg: [
				CollateralManagerSynths.map(key => toBytes32(`Synth${key}`)),
				CollateralManagerSynths.map(toBytes32),
			],
			expected: input => input,
			write: 'addSynths',
			writeArg: [
				CollateralManagerSynths.map(key => toBytes32(`Synth${key}`)),
				CollateralManagerSynths.map(toBytes32),
			],
		});

		const CollateralManagerShorts = collateralManagerDefaults['SHORTS'];
		await runStep({
			gasLimit: 1e6,
			contract: 'CollateralManager',
			target: CollateralManager,
			read: 'areShortableSynthsSet',
			readArg: [
				CollateralManagerShorts.map(({ long }) => toBytes32(`Synth${long}`)),
				CollateralManagerShorts.map(({ long }) => toBytes32(long)),
			],
			expected: input => input,
			write: 'addShortableSynths',
			writeArg: [
				CollateralManagerShorts.map(({ long, short }) =>
					[`Synth${long}`, `Synth${short}`].map(toBytes32)
				),
				CollateralManagerShorts.map(({ long }) => toBytes32(long)),
			],
		});
	}
};
