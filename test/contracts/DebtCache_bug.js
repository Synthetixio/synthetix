'use strict';

const { contract } = require('hardhat');

const { assert, addSnapshotBeforeRestoreAfterEach } = require('./common');

const { setupAllContracts, setupContract, mockToken } = require('./setup');

const { currentTime, toUnit, fastForward } = require('../utils')();

const {
	setExchangeFeeRateForSynths,
	getDecodedLogs,
	decodedEventEqual,
	onlyGivenAddressCanInvoke,
	ensureOnlyExpectedMutativeFunctions,
	setStatus,
} = require('./helpers');

const {
	toBytes32,
	defaults: { DEBT_SNAPSHOT_STALE_TIME },
	constants: { ZERO_ADDRESS },
} = require('../..');

contract('DebtCache', async accounts => {
	const [sUSD, sAUD, sEUR, SNX, sETH] = ['sUSD', 'sAUD', 'sEUR', 'SNX', 'sETH'].map(toBytes32);
	const synthKeys = [sUSD, sAUD, sEUR, sETH, SNX];

	const [deployerAccount, owner, oracle, account1, account2] = accounts;

	describe('_issuedSynthValues bug', async () => {
		let ceth,
			state,
			managerState,
			synthetix,
			systemSettings,
			manager,
			issuer,
			synths,
			feePool,
			exchangeRates,
			addressResolver,
			sUSDSynth,
			sETHSynth,
			systemStatus,
			debtCache,
			FEE_ADDRESS;

		let CollateralManager;
		let CollateralState;
		let CollateralManagerState;
		const sBTC = toBytes32('sBTC');

		const oneETH = toUnit('1.0');
		const twoETH = toUnit('2.0');

		beforeEach(async () => {
			// // set minimumStakeTime on issue and burning to 0
			// await systemSettings.setMinimumStakeTime(0, { from: owner });
			// // set default issuance ratio of 0.2
			// await systemSettings.setIssuanceRatio(toUnit('0.2'), { from: owner });
			// // set up initial prices
			// await exchangeRates.updateRates(
			// 	[sAUD, sEUR, sETH],
			// 	['0.5', '2', '100'].map(toUnit),
			// 	await currentTime(),
			// 	{ from: oracle }
			// );
			// await debtCache.takeDebtSnapshot();
			// // Issue 1000 sUSD worth of tokens to a user
			// await sUSDContract.issue(account1, toUnit(100));
			// await sAUDContract.issue(account1, toUnit(100));
			// await sEURContract.issue(account1, toUnit(100));
			// await sETHContract.issue(account1, toUnit(2));
		});

		const deployCollateral = async ({
			state,
			owner,
			manager,
			resolver,
			collatKey,
			minColat,
			minSize,
		}) => {
			return setupContract({
				accounts,
				contract: 'CollateralEth',
				args: [state, owner, manager, resolver, collatKey, minColat, minSize],
			});
		};

		const setupMultiCollateral = async () => {
			CollateralManager = artifacts.require(`CollateralManager`);
			CollateralState = artifacts.require(`CollateralState`);
			CollateralManagerState = artifacts.require('CollateralManagerState');

			synths = ['sUSD', 'sETH', 'sAUD'];
			({
				Synthetix: synthetix,
				SystemSettings: systemSettings,
				SystemStatus: systemStatus,
				ExchangeRates: exchangeRates,
				SynthsUSD: sUSDSynth,
				SynthsETH: sETHSynth,
				FeePool: feePool,
				AddressResolver: addressResolver,
				Issuer: issuer,
				DebtCache: debtCache,
			} = await setupAllContracts({
				accounts,
				synths,
				contracts: [
					'BaseSynthetix',
					'SystemSettings',
					'FeePool',
					'AddressResolver',
					'ExchangeRates',
					'Exchanger',
					'SystemStatus',
					'Issuer',
					'DebtCache',
					'RewardEscrowV2', // required for collateral check in issuer
				],
			}));

			managerState = await CollateralManagerState.new(owner, ZERO_ADDRESS, {
				from: deployerAccount,
			});

			const maxDebt = toUnit(10000000);

			manager = await CollateralManager.new(
				managerState.address,
				owner,
				addressResolver.address,
				maxDebt,
				0,
				0,
				{
					from: deployerAccount,
				}
			);

			await managerState.setAssociatedContract(manager.address, { from: owner });

			FEE_ADDRESS = await feePool.FEE_ADDRESS();

			state = await CollateralState.new(owner, ZERO_ADDRESS, { from: deployerAccount });

			ceth = await deployCollateral({
				state: state.address,
				owner: owner,
				manager: manager.address,
				resolver: addressResolver.address,
				collatKey: sETH,
				minColat: toUnit('1.3'),
				minSize: toUnit('2'),
			});

			await state.setAssociatedContract(ceth.address, { from: owner });

			await addressResolver.importAddresses(
				[toBytes32('CollateralEth'), toBytes32('CollateralManager')],
				[ceth.address, manager.address],
				{
					from: owner,
				}
			);

			await ceth.rebuildCache();
			await manager.rebuildCache();
			await debtCache.rebuildCache();
			await feePool.rebuildCache();
			await issuer.rebuildCache();

			await manager.addCollaterals([ceth.address], { from: owner });

			await ceth.addSynths(
				['SynthsUSD', 'SynthsETH'].map(toBytes32),
				['sUSD', 'sETH'].map(toBytes32),
				{ from: owner }
			);

			await manager.addSynths(
				['SynthsUSD', 'SynthsETH'].map(toBytes32),
				['sUSD', 'sETH'].map(toBytes32),
				{ from: owner }
			);
			// rebuild the cache to add the synths we need.
			await manager.rebuildCache();

			await ceth.setIssueFeeRate(toUnit('0'), { from: owner });
			await systemSettings.setExchangeFeeRateForSynths(
				synths.map(toBytes32),
				synths.map(s => toUnit('0')),
				{ from: owner }
			);
		};

		const updateRatesWithDefaults = async () => {
			const timestamp = await currentTime();

			await exchangeRates.updateRates([sETH], ['100'].map(toUnit), timestamp, {
				from: oracle,
			});

			await exchangeRates.updateRates([sBTC], ['10000'].map(toUnit), timestamp, {
				from: oracle,
			});

			const sAUD = toBytes32('sAUD');
			await exchangeRates.updateRates([sAUD], ['0.9'].map(toUnit), timestamp, {
				from: oracle,
			});
		};

		const fastForwardAndUpdateRates = async seconds => {
			await fastForward(seconds);
			await updateRatesWithDefaults();
			await debtCache.takeDebtSnapshot();
		};

		beforeEach(async () => {
			await setupMultiCollateral();
			const INTERACTION_DELAY = 300;
			await fastForwardAndUpdateRates(INTERACTION_DELAY);
		});

		async function logInfo() {
			const synths = ['sUSD', 'sETH', 'sAUD'];
			const { debtValues, anyRateInvalid } = await debtCache.currentSynthDebts(
				synths.map(toBytes32)
			);
			console.log(
				synths.map((synth, i) => `${synth} debt = ${debtValues[i].toString()}`).join('\n')
			);
			const { debt, _ } = await debtCache.currentDebt();
			console.log(`currentDebt: ${debt.toString()}`);
			console.log('');
		}

		describe('after minting sETH issued by non-SNX collateral, and the full supply of sETH is exchanged for another synth', async () => {
			it('debt should remain constant after the exchange', async () => {
				// Steps to repro:
				// 1. Mint sUSD via SNX.
				await synthetix.transfer(account1, toUnit('1000'), { from: owner });
				await synthetix.issueSynths(toUnit('10'), { from: account1 });

				// 1a. Check currentSynthDebts and currentDebt.
				await logInfo();

				// 2. Mint sETH via ETH.
				const tx = await ceth.open(oneETH, sETH, {
					value: twoETH,
					from: account1,
				});
				const debtCall1 = await debtCache.currentDebt();

				// 2a. Check currentSynthDebts and currentDebt.
				await logInfo();

				// 3. Swap sETH into sAUD.
				const sETHBalance = await sETHSynth.balanceOf(account1);
				console.log(`seth balance - `, sETHBalance.toString())
				await synthetix.exchange(sETH, '5', sAUD, { from: account1 });

				// 3a. Check currentSynthDebts and currentDebt.
				await logInfo();

				// 4.
				// collateralIssued for sETH > sETH supply, so supply is set to 0.
				// the debt should be increased from (2a).
				const debtCall2 = await debtCache.currentDebt();

				assert.bnEqual(debtCall1.debt, debtCall2.debt);
			});
		});
	});
});
