'use strict';

const { gray } = require('chalk');
const { toBytes32 } = require('../../../..');

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
		SystemSettings,
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
			comment: 'Ensure the CollateralManager has all Collateral contracts added',
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

		await runStep({
			contract: 'CollateralEth',
			target: CollateralEth,
			read: 'issueFeeRate',
			expected: input => input !== '0', // only change if zero
			write: 'setIssueFeeRate',
			writeArg: (await getDeployParameter('COLLATERAL_ETH'))['ISSUE_FEE_RATE'],
			comment: 'Ensure the CollateralEth has its issue fee rate set',
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

		await runStep({
			contract: 'CollateralErc20',
			target: CollateralErc20,
			read: 'issueFeeRate',
			expected: input => input !== '0', // only change if zero
			write: 'setIssueFeeRate',
			writeArg: (await getDeployParameter('COLLATERAL_RENBTC'))['ISSUE_FEE_RATE'],
			comment: 'Ensure the CollateralErc20 contract has its issue fee rate set',
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

		await runStep({
			contract: 'SystemSettings',
			target: SystemSettings,
			// FIXME
			// read: 'interactionDelay',
			// readArg: [CollateralShort.address],
			expected: input => input !== '0', // only change if zero
			write: 'setInteractionDelay',
			writeArg: [
				(await getDeployParameter('COLLATERAL_SHORT'))['INTERACTION_DELAY'],
				CollateralShort.address,
			],
			comment:
				'Ensure the CollateralShort contract has an interaction delay to prevent frontrunning',
		});
		await runStep({
			contract: 'SystemSettings',
			target: SystemSettings,
			// FIXME
			// read: 'issueFeeRate',
			// readArg: [CollateralShort.address],
			expected: input => input !== '0', // only change if zero
			write: 'setIssueFeeRate',
			writeArg: [
				(await getDeployParameter('COLLATERAL_SHORT'))['ISSUE_FEE_RATE'],
				CollateralShort.address,
			],
			comment: 'Ensure the CollateralShort contract has its issue fee rate set',
		});
	}

	await runStep({
		contract: 'CollateralManager',
		target: CollateralManager,
		read: 'maxDebt',
		expected: input => input !== '0', // only change if zero
		write: 'setMaxDebt',
		writeArg: [collateralManagerDefaults['MAX_DEBT']],
		comment: 'Set the max amount of debt in the CollateralManager',
	});

	await runStep({
		contract: 'CollateralManager',
		target: CollateralManager,
		read: 'baseBorrowRate',
		expected: input => input !== '0', // only change if zero
		write: 'setBaseBorrowRate',
		writeArg: [collateralManagerDefaults['BASE_BORROW_RATE']],
		comment: 'Set the base borrow rate in the CollateralManager',
	});

	await runStep({
		contract: 'CollateralManager',
		target: CollateralManager,
		read: 'baseShortRate',
		expected: input => input !== '0', // only change if zero
		write: 'setBaseShortRate',
		writeArg: [collateralManagerDefaults['BASE_SHORT_RATE']],
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
		gasLimit: 2e6,
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
		comment: 'Ensure the CollateralManager contract has all associated short synths added',
	});
};
