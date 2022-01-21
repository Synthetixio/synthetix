'use strict';

const { gray } = require('chalk');
const { toBytes32 } = require('../../../..');
const { allowZeroOrUpdateIfNonZero } = require('../../util.js');

module.exports = async ({
	addressOf,
	collateralManagerDefaults,
	deployer,
	getDeployParameter,
	runStep,
}) => {
	console.log(gray(`\n------ CONFIGURING MULTI COLLATERAL ------\n`));

	const {
		CollateralErc20,
		CollateralEth,
		CollateralShort,
		CollateralManager,
		CollateralManagerState,
	} = deployer.deployedContracts;

	if (CollateralManagerState && CollateralManager) {
		await runStep({
			contract: 'CollateralManagerState',
			target: CollateralManagerState,
			read: 'associatedContract',
			expected: input => input === addressOf(CollateralManager),
			write: 'setAssociatedContract',
			writeArg: addressOf(CollateralManager),
			comment: 'Ensure the CollateralManager contract can write to its state',
		});
	}

	console.log(gray(`\n------ INITIALISING MULTI COLLATERAL ------\n`));

	if (CollateralManager) {
		const CollateralsArg = [CollateralShort, CollateralEth, CollateralErc20]
			.filter(contract => !!contract)
			.map(addressOf);

		await runStep({
			contract: 'CollateralManager',
			target: CollateralManager,
			read: 'hasAllCollaterals',
			readArg: [CollateralsArg],
			expected: input => input,
			write: 'addCollaterals',
			writeArg: [CollateralsArg],
			comment: 'Ensure the CollateralManager has all Collateral contracts added',
		});
	}
	if (CollateralEth && CollateralManager) {
		await runStep({
			contract: 'CollateralEth',
			target: CollateralEth,
			read: 'manager',
			expected: input => input === addressOf(CollateralManager),
			write: 'setManager',
			writeArg: addressOf(CollateralManager),
			comment: 'Ensure the CollateralEth is connected to the CollateralManager',
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
			comment: 'Ensure the CollateralEth contract has all associated synths added',
		});

		const issueFeeRate = (await getDeployParameter('COLLATERAL_ETH'))['ISSUE_FEE_RATE'];
		await runStep({
			contract: 'CollateralEth',
			target: CollateralEth,
			read: 'issueFeeRate',
			expected: allowZeroOrUpdateIfNonZero(issueFeeRate),
			write: 'setIssueFeeRate',
			writeArg: [issueFeeRate],
			comment: 'Ensure the CollateralEth contract has its issue fee rate set',
		});
	}

	if (CollateralErc20 && CollateralManager) {
		await runStep({
			contract: 'CollateralErc20',
			target: CollateralErc20,
			read: 'manager',
			expected: input => input === addressOf(CollateralManager),
			write: 'setManager',
			writeArg: addressOf(CollateralManager),
			comment: 'Ensure the CollateralErc20 contract is connected to the CollateralManager',
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
			comment: 'Ensure the CollateralErc20 contract has all associated synths added',
		});

		const issueFeeRate = (await getDeployParameter('COLLATERAL_RENBTC'))['ISSUE_FEE_RATE'];
		await runStep({
			contract: 'CollateralErc20',
			target: CollateralErc20,
			read: 'issueFeeRate',
			expected: allowZeroOrUpdateIfNonZero(issueFeeRate),
			write: 'setIssueFeeRate',
			writeArg: [issueFeeRate],
			comment: 'Ensure the CollateralErc20 contract has its issue fee rate set',
		});
	}

	if (CollateralShort && CollateralManager) {
		await runStep({
			contract: 'CollateralShort',
			target: CollateralShort,
			read: 'manager',
			expected: input => input === addressOf(CollateralManager),
			write: 'setManager',
			writeArg: addressOf(CollateralManager),
			comment: 'Ensure the CollateralShort contract is connected to the CollateralManager',
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
			comment: 'Ensure the CollateralShort contract has all associated synths added',
		});

		const issueFeeRate = (await getDeployParameter('COLLATERAL_SHORT'))['ISSUE_FEE_RATE'];
		await runStep({
			contract: 'CollateralShort',
			target: CollateralShort,
			read: 'issueFeeRate',
			expected: allowZeroOrUpdateIfNonZero(issueFeeRate),
			write: 'setIssueFeeRate',
			writeArg: [issueFeeRate],
			comment: 'Ensure the CollateralShort contract has its issue fee rate set',
		});

		if (CollateralShort.interactionDelay) {
			const interactionDelay = (await getDeployParameter('COLLATERAL_SHORT'))['INTERACTION_DELAY'];
			await runStep({
				contract: 'CollateralShort',
				target: CollateralShort,
				read: 'interactionDelay',
				expected: allowZeroOrUpdateIfNonZero(interactionDelay),
				write: 'setInteractionDelay',
				writeArg: [interactionDelay],
				comment:
					'Ensure the CollateralShort contract has an interaction delay to prevent frontrunning',
			});
		}
	}

	const maxDebt = collateralManagerDefaults['MAX_DEBT'];
	await runStep({
		contract: 'CollateralManager',
		target: CollateralManager,
		read: 'maxDebt',
		expected: allowZeroOrUpdateIfNonZero(maxDebt),
		write: 'setMaxDebt',
		writeArg: [maxDebt],
		comment: 'Set the max amount of debt in the CollateralManager',
	});

	if (CollateralManager.maxSkewRate) {
		const maxSkewRate = collateralManagerDefaults['MAX_SKEW_RATE'];
		await runStep({
			contract: 'CollateralManager',
			target: CollateralManager,
			read: 'maxSkewRate',
			expected: allowZeroOrUpdateIfNonZero(maxSkewRate),
			write: 'setMaxSkewRate',
			writeArg: [maxSkewRate],
			comment: 'Set the max skew rate in the CollateralManager',
		});
	}

	const baseBorrowRate = collateralManagerDefaults['BASE_BORROW_RATE'];
	await runStep({
		contract: 'CollateralManager',
		target: CollateralManager,
		read: 'baseBorrowRate',
		expected: allowZeroOrUpdateIfNonZero(baseBorrowRate),
		write: 'setBaseBorrowRate',
		writeArg: [baseBorrowRate],
		comment: 'Set the base borrow rate in the CollateralManager',
	});

	const baseShortRate = collateralManagerDefaults['BASE_SHORT_RATE'];
	await runStep({
		contract: 'CollateralManager',
		target: CollateralManager,
		read: 'baseShortRate',
		expected: allowZeroOrUpdateIfNonZero(baseShortRate),
		write: 'setBaseShortRate',
		writeArg: [baseShortRate],
		comment: 'Set the base short rate in the CollateralManager',
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
		comment: 'Ensure the CollateralManager contract has all associated synths added',
	});

	const CollateralManagerShorts = collateralManagerDefaults['SHORTS'];
	await runStep({
		gasLimit: 1e6,
		contract: 'CollateralManager',
		target: CollateralManager,
		read: 'areShortableSynthsSet',
		readArg: [
			CollateralManagerShorts.map(key => toBytes32(`Synth${key}`)),
			CollateralManagerShorts.map(toBytes32),
		],
		expected: input => input,
		write: 'addShortableSynths',
		writeArg: [
			CollateralManagerShorts.map(key => toBytes32(`Synth${key}`)),
			CollateralManagerShorts.map(toBytes32),
		],
		comment: 'Ensure the CollateralManager contract has all associated short synths added',
	});
};
