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
		SystemSettings,
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
	if (CollateralEth && SystemSettings) {
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
			contract: 'SystemSettings',
			target: SystemSettings,
			read: 'issueFeeRate',
			readArg: addressOf(CollateralEth),
			expected: input => input !== '0', // only change if zero,
			write: 'setIssueFeeRate',
			writeArg: [
				CollateralEth.address,
				(await getDeployParameter('COLLATERAL_ETH'))['ISSUE_FEE_RATE'],
			],
			comment: 'Ensure the CollateralEth contract has its issue fee rate set',
		});
	}

	if (CollateralErc20 && SystemSettings) {
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
			contract: 'SystemSettings',
			target: SystemSettings,
			read: 'issueFeeRate',
			readArg: addressOf(CollateralErc20),
			expected: input => input !== '0', // only change if zero
			write: 'setIssueFeeRate',
			writeArg: [
				CollateralErc20.address,
				(await getDeployParameter('COLLATERAL_RENBTC'))['ISSUE_FEE_RATE'],
			],
			comment: 'Ensure the CollateralErc20 contract has its issue fee rate set',
		});
	}

	if (CollateralShort && SystemSettings) {
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
			read: 'interactionDelay',
			readArg: addressOf(CollateralShort),
			expected: input => input === addressOf(CollateralShort),
			write: 'setInteractionDelay',
			writeArg: [
				CollateralShort.address,
				(await getDeployParameter('COLLATERAL_SHORT'))['INTERACTION_DELAY'],
			],
			comment: 'Ensure the CollateralShort contract has an interaction delay of zero on the OVM',
		});

		await runStep({
			contract: 'SystemSettings',
			target: SystemSettings,
			read: 'issueFeeRate',
			readArg: addressOf(CollateralShort),
			expected: input => input === addressOf(CollateralShort),
			write: 'setIssueFeeRate',
			writeArg: [
				CollateralShort.address,
				(await getDeployParameter('COLLATERAL_SHORT'))['ISSUE_FEE_RATE'],
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
			CollateralManagerSynths.map(key => toBytes32(`Synth${key}`)),
			CollateralManagerSynths.map(toBytes32),
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
