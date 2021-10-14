'use strict';

const { contract, artifacts } = require('hardhat');

const { assert, addSnapshotBeforeRestoreAfterEach } = require('./common');

const { setupAllContracts, setupContract, mockToken } = require('./setup');

const { currentTime, toUnit, fastForward, multiplyDecimalRound } = require('../utils')();

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
	const [sUSD, sAUD, sEUR, SNX, sETH, ETH, iETH] = [
		'sUSD',
		'sAUD',
		'sEUR',
		'SNX',
		'sETH',
		'ETH',
		'iETH',
	].map(toBytes32);
	const synthKeys = [sUSD, sAUD, sEUR, sETH, SNX];

	const [deployerAccount, owner, oracle, account1, account2] = accounts;

	const oneETH = toUnit('1.0');
	const twoETH = toUnit('2.0');

	let synthetix,
		systemStatus,
		systemSettings,
		exchangeRates,
		feePool,
		sUSDContract,
		sETHContract,
		sEURContract,
		sAUDContract,
		timestamp,
		debtCache,
		issuer,
		synths,
		addressResolver,
		exchanger,
		// MultiCollateral tests.
		ceth,
		// Short tests.
		short;

	const deployCollateral = async ({ owner, manager, resolver, collatKey, minColat, minSize }) => {
		return setupContract({
			accounts,
			contract: 'CollateralEth',
			args: [owner, manager, resolver, collatKey, minColat, minSize],
		});
	};

	const setupMultiCollateral = async () => {
		const CollateralManager = artifacts.require(`CollateralManager`);
		const CollateralManagerState = artifacts.require('CollateralManagerState');

		synths = ['sUSD', 'sETH', 'sAUD'];

		// Deploy CollateralManagerState.
		const managerState = await CollateralManagerState.new(owner, ZERO_ADDRESS, {
			from: deployerAccount,
		});

		const maxDebt = toUnit(10000000);

		// Deploy CollateralManager.
		const manager = await CollateralManager.new(
			managerState.address,
			owner,
			addressResolver.address,
			maxDebt,
			0,
			0,
			0,
			{
				from: deployerAccount,
			}
		);

		await managerState.setAssociatedContract(manager.address, { from: owner });

		// Deploy ETH Collateral.
		ceth = await deployCollateral({
			owner: owner,
			manager: manager.address,
			resolver: addressResolver.address,
			collatKey: sETH,
			minColat: toUnit('1.3'),
			minSize: toUnit('2'),
		});

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

		// Set fees to 0.
		await ceth.setIssueFeeRate(toUnit('0'), { from: owner });
		await systemSettings.setExchangeFeeRateForSynths(
			synths.map(toBytes32),
			synths.map(s => toUnit('0')),
			{ from: owner }
		);
	};

	const deployShort = async ({ owner, manager, resolver, collatKey, minColat, minSize }) => {
		return setupContract({
			accounts,
			contract: 'CollateralShort',
			args: [owner, manager, resolver, collatKey, minColat, minSize],
		});
	};

	const setupShort = async () => {
		const CollateralManager = artifacts.require(`CollateralManager`);
		const CollateralManagerState = artifacts.require('CollateralManagerState');

		const managerState = await CollateralManagerState.new(owner, ZERO_ADDRESS, {
			from: deployerAccount,
		});

		const maxDebt = toUnit(10000000);

		const manager = await CollateralManager.new(
			managerState.address,
			owner,
			addressResolver.address,
			maxDebt,
			0,
			// 5% / 31536000 (seconds in common year)
			1585489599,
			0,
			{
				from: deployerAccount,
			}
		);

		await managerState.setAssociatedContract(manager.address, { from: owner });

		short = await deployShort({
			owner: owner,
			manager: manager.address,
			resolver: addressResolver.address,
			collatKey: sUSD,
			minColat: toUnit(1.2),
			minSize: toUnit(0.1),
		});

		await addressResolver.importAddresses(
			[toBytes32('CollateralShort'), toBytes32('CollateralManager')],
			[short.address, manager.address],
			{
				from: owner,
			}
		);

		await feePool.rebuildCache();
		await manager.rebuildCache();
		await issuer.rebuildCache();
		await debtCache.rebuildCache();

		await manager.addCollaterals([short.address], { from: owner });

		await short.addSynths(['SynthsETH'].map(toBytes32), ['sETH'].map(toBytes32), { from: owner });

		await manager.addShortableSynths(['SynthsETH'].map(toBytes32), [sETH], {
			from: owner,
		});

		await sUSDContract.approve(short.address, toUnit(100000), { from: account1 });
	};

	// run this once before all tests to prepare our environment, snapshots on beforeEach will take
	// care of resetting to this state
	before(async () => {
		synths = ['sUSD', 'sAUD', 'sEUR', 'sETH', 'iETH'];
		({
			Synthetix: synthetix,
			SystemStatus: systemStatus,
			SystemSettings: systemSettings,
			ExchangeRates: exchangeRates,
			SynthsUSD: sUSDContract,
			SynthsETH: sETHContract,
			SynthsAUD: sAUDContract,
			SynthsEUR: sEURContract,
			FeePool: feePool,
			DebtCache: debtCache,
			Issuer: issuer,
			AddressResolver: addressResolver,
			Exchanger: exchanger,
		} = await setupAllContracts({
			accounts,
			synths,
			contracts: [
				'Synthetix',
				'ExchangeRates',
				'FeePool',
				'FeePoolEternalStorage',
				'AddressResolver',
				'RewardEscrow',
				'SynthetixEscrow',
				'SystemSettings',
				'Issuer',
				'DebtCache',
				'Exchanger', // necessary for burnSynths to check settlement of sUSD
				'DelegateApprovals', // necessary for *OnBehalf functions
				'FlexibleStorage',
				'CollateralManager',
				'RewardEscrowV2', // necessary for issuer._collateral()
				'CollateralUtil',
			],
		}));
	});

	addSnapshotBeforeRestoreAfterEach();

	beforeEach(async () => {
		timestamp = await currentTime();

		await exchangeRates.updateRates(
			[sAUD, sEUR, SNX, sETH, ETH, iETH],
			['0.5', '1.25', '10', '200', '200', '200'].map(toUnit),
			timestamp,
			{ from: oracle }
		);

		// set a 0.3% default exchange fee rate
		const exchangeFeeRate = toUnit('0.003');
		await setExchangeFeeRateForSynths({
			owner,
			systemSettings,
			synthKeys,
			exchangeFeeRates: synthKeys.map(() => exchangeFeeRate),
		});
		await debtCache.takeDebtSnapshot();
	});

	it('ensure only known functions are mutative', () => {
		ensureOnlyExpectedMutativeFunctions({
			abi: debtCache.abi,
			ignoreParents: ['Owned', 'MixinResolver'],
			expected: [
				'takeDebtSnapshot',
				'purgeCachedSynthDebt',
				'updateCachedSynthDebts',
				'updateCachedSynthDebtWithRate',
				'updateCachedSynthDebtsWithRates',
				'updateDebtCacheValidity',
				'updateCachedsUSDDebt',
			],
		});
	});

	it('debt snapshot stale time is correctly configured as a default', async () => {
		assert.bnEqual(await debtCache.debtSnapshotStaleTime(), DEBT_SNAPSHOT_STALE_TIME);
	});

	describe('protected methods', () => {
		it('updateCachedSynthDebtWithRate() can only be invoked by the issuer', async () => {
			await onlyGivenAddressCanInvoke({
				fnc: debtCache.updateCachedSynthDebtWithRate,
				args: [sAUD, toUnit('1')],
				accounts,
				reason: 'Sender is not Issuer',
			});
		});

		it('updateCachedSynthDebtsWithRates() can only be invoked by the issuer or exchanger', async () => {
			await onlyGivenAddressCanInvoke({
				fnc: debtCache.updateCachedSynthDebtsWithRates,
				args: [
					[sAUD, sEUR],
					[toUnit('1'), toUnit('2')],
				],
				accounts,
				reason: 'Sender is not Issuer or Exchanger',
			});
		});

		it('updateDebtCacheValidity() can only be invoked by the issuer', async () => {
			await onlyGivenAddressCanInvoke({
				fnc: debtCache.updateDebtCacheValidity,
				args: [true],
				accounts,
				reason: 'Sender is not Issuer',
			});
		});

		it('purgeCachedSynthDebt() can only be invoked by the owner', async () => {
			await onlyGivenAddressCanInvoke({
				fnc: debtCache.purgeCachedSynthDebt,
				accounts,
				args: [sAUD],
				address: owner,
				skipPassCheck: true,
				reason: 'Only the contract owner may perform this action',
			});
		});

		it('updateCachedsUSDDebt() can only be invoked by the issuer', async () => {
			await onlyGivenAddressCanInvoke({
				fnc: debtCache.updateCachedsUSDDebt,
				args: [toUnit('1')],
				accounts,
				reason: 'Sender is not Issuer',
			});
		});
	});

	describe('After issuing synths', () => {
		beforeEach(async () => {
			// set minimumStakeTime on issue and burning to 0
			await systemSettings.setMinimumStakeTime(0, { from: owner });
			// set default issuance ratio of 0.2
			await systemSettings.setIssuanceRatio(toUnit('0.2'), { from: owner });
			// set up initial prices
			await exchangeRates.updateRates(
				[sAUD, sEUR, sETH],
				['0.5', '2', '100'].map(toUnit),
				await currentTime(),
				{ from: oracle }
			);
			await debtCache.takeDebtSnapshot();

			// Issue 1000 sUSD worth of tokens to a user
			await sUSDContract.issue(account1, toUnit(100));
			await sAUDContract.issue(account1, toUnit(100));
			await sEURContract.issue(account1, toUnit(100));
			await sETHContract.issue(account1, toUnit(2));
		});

		describe('Current issued debt', () => {
			it('Live debt is reported accurately', async () => {
				// The synth debt has not yet been cached.
				assert.bnEqual((await debtCache.cacheInfo()).debt, toUnit(0));

				const result = await debtCache.currentDebt();
				assert.bnEqual(result[0], toUnit(550));
				assert.isFalse(result[1]);
			});

			it('Live debt is reported accurately for individual currencies', async () => {
				const result = await debtCache.currentSynthDebts([sUSD, sEUR, sAUD, sETH]);
				const debts = result[0];

				assert.bnEqual(debts[0], toUnit(100));
				assert.bnEqual(debts[1], toUnit(200));
				assert.bnEqual(debts[2], toUnit(50));
				assert.bnEqual(debts[3], toUnit(200));

				assert.isFalse(result[2]);
			});
		});

		describe('takeDebtSnapshot()', () => {
			let preTimestamp;
			let tx;
			let time;

			beforeEach(async () => {
				preTimestamp = (await debtCache.cacheInfo()).timestamp;
				await fastForward(5);
				tx = await debtCache.takeDebtSnapshot();
				time = await currentTime();
			});

			it('accurately resynchronises the debt after prices have changed', async () => {
				assert.bnEqual((await debtCache.cacheInfo()).debt, toUnit(550));
				let result = await debtCache.currentDebt();
				assert.bnEqual(result[0], toUnit(550));
				assert.isFalse(result[1]);

				await exchangeRates.updateRates([sAUD, sEUR], ['1', '3'].map(toUnit), await currentTime(), {
					from: oracle,
				});
				await debtCache.takeDebtSnapshot();
				assert.bnEqual((await debtCache.cacheInfo()).debt, toUnit(700));
				result = await debtCache.currentDebt();
				assert.bnEqual(result[0], toUnit(700));
				assert.isFalse(result[1]);
			});

			it('updates the debt snapshot timestamp', async () => {
				const timestamp = (await debtCache.cacheInfo()).timestamp;
				assert.bnNotEqual(timestamp, preTimestamp);
				assert.isTrue(time - timestamp < 15);
			});

			it('properly emits debt cache updated and synchronised events', async () => {
				assert.eventEqual(tx.logs[0], 'DebtCacheUpdated', [toUnit(550)]);
				assert.eventEqual(tx.logs[1], 'DebtCacheSnapshotTaken', [
					(await debtCache.cacheInfo()).timestamp,
				]);
			});

			it('updates the cached values for all individual synths', async () => {
				await exchangeRates.updateRates(
					[sAUD, sEUR, sETH],
					['1', '3', '200'].map(toUnit),
					await currentTime(),
					{
						from: oracle,
					}
				);
				await debtCache.takeDebtSnapshot();
				let debts = await debtCache.currentSynthDebts([sUSD, sEUR, sAUD, sETH]);
				assert.bnEqual(debts[0][0], toUnit(100));
				assert.bnEqual(debts[0][1], toUnit(300));
				assert.bnEqual(debts[0][2], toUnit(100));
				assert.bnEqual(debts[0][3], toUnit(400));

				debts = await debtCache.cachedSynthDebts([sUSD, sEUR, sAUD, sETH]);
				assert.bnEqual(debts[0], toUnit(100));
				assert.bnEqual(debts[1], toUnit(300));
				assert.bnEqual(debts[2], toUnit(100));
				assert.bnEqual(debts[3], toUnit(400));
			});

			it('is able to invalidate and revalidate the debt cache when required.', async () => {
				// Wait until the exchange rates are stale in order to invalidate the cache.
				const rateStalePeriod = await systemSettings.rateStalePeriod();
				await fastForward(rateStalePeriod + 1000);

				assert.isFalse((await debtCache.cacheInfo()).isInvalid);

				// stale rates invalidate the cache
				const tx1 = await debtCache.takeDebtSnapshot();
				assert.isTrue((await debtCache.cacheInfo()).isInvalid);

				// Revalidate the cache once rates are no longer stale
				await exchangeRates.updateRates(
					[sAUD, sEUR, SNX, sETH, ETH, iETH],
					['0.5', '2', '100', '200', '200', '200'].map(toUnit),
					await currentTime(),
					{ from: oracle }
				);
				const tx2 = await debtCache.takeDebtSnapshot();
				assert.isFalse((await debtCache.cacheInfo()).isInvalid);

				assert.eventEqual(tx1.logs[2], 'DebtCacheValidityChanged', [true]);
				assert.eventEqual(tx2.logs[2], 'DebtCacheValidityChanged', [false]);
			});

			it('Rates are reported as invalid when snapshot is stale.', async () => {
				assert.isFalse((await debtCache.cacheInfo()).isStale);
				assert.isFalse(await debtCache.cacheStale());
				assert.isFalse((await issuer.collateralisationRatioAndAnyRatesInvalid(account1))[1]);
				const snapshotStaleTime = await systemSettings.debtSnapshotStaleTime();
				await fastForward(snapshotStaleTime + 10);

				// ensure no actual rates are stale.
				await exchangeRates.updateRates(
					[sAUD, sEUR, sETH, SNX],
					['0.5', '2', '100', '1'].map(toUnit),
					await currentTime(),
					{ from: oracle }
				);

				const info = await debtCache.cacheInfo();
				assert.isFalse(info.isInvalid);
				assert.isTrue(info.isStale);
				assert.isTrue(await debtCache.cacheStale());
				assert.isTrue((await issuer.collateralisationRatioAndAnyRatesInvalid(account1))[1]);

				await systemSettings.setDebtSnapshotStaleTime(snapshotStaleTime + 10000, {
					from: owner,
				});

				assert.isFalse(await debtCache.cacheStale());
				assert.isFalse((await debtCache.cacheInfo()).isStale);
				assert.isFalse((await issuer.collateralisationRatioAndAnyRatesInvalid(account1))[1]);
			});

			it('Rates are reported as invalid when the debt snapshot is uninitisalised', async () => {
				const debtCacheName = toBytes32('DebtCache');

				// Set the stale time to a huge value so that the snapshot will not be stale.
				await systemSettings.setDebtSnapshotStaleTime(toUnit('100'), {
					from: owner,
				});

				const newDebtCache = await setupContract({
					contract: 'DebtCache',
					accounts,
					skipPostDeploy: true,
					args: [owner, addressResolver.address],
				});

				await addressResolver.importAddresses([debtCacheName], [newDebtCache.address], {
					from: owner,
				});
				await newDebtCache.rebuildCache();

				assert.bnEqual(await newDebtCache.cachedDebt(), toUnit('0'));
				assert.bnEqual(await newDebtCache.cachedSynthDebt(sUSD), toUnit('0'));
				assert.bnEqual(await newDebtCache.cacheTimestamp(), toUnit('0'));
				assert.isTrue(await newDebtCache.cacheInvalid());

				const info = await newDebtCache.cacheInfo();
				assert.bnEqual(info.debt, toUnit('0'));
				assert.bnEqual(info.timestamp, toUnit('0'));
				assert.isTrue(info.isInvalid);
				assert.isTrue(info.isStale);
				assert.isTrue(await newDebtCache.cacheStale());

				await issuer.rebuildCache();
				assert.isTrue((await issuer.collateralisationRatioAndAnyRatesInvalid(account1))[1]);
			});

			it('When the debt snapshot is invalid, cannot issue, burn, exchange, claim, or transfer when holding debt.', async () => {
				// Ensure the account has some synths to attempt to burn later.
				await synthetix.transfer(account1, toUnit('1000'), { from: owner });
				await synthetix.transfer(account2, toUnit('1000'), { from: owner });
				await synthetix.issueSynths(toUnit('10'), { from: account1 });

				// Stale the debt snapshot
				const snapshotStaleTime = await systemSettings.debtSnapshotStaleTime();
				await fastForward(snapshotStaleTime + 10);
				// ensure no actual rates are stale.
				await exchangeRates.updateRates(
					[sAUD, sEUR, sETH, SNX],
					['0.5', '2', '100', '1'].map(toUnit),
					await currentTime(),
					{ from: oracle }
				);

				await assert.revert(
					synthetix.issueSynths(toUnit('10'), { from: account1 }),
					'A synth or SNX rate is invalid'
				);

				await assert.revert(
					synthetix.burnSynths(toUnit('1'), { from: account1 }),
					'A synth or SNX rate is invalid'
				);

				await assert.revert(feePool.claimFees(), 'A synth or SNX rate is invalid');

				// Can't transfer SNX if issued debt
				await assert.revert(
					synthetix.transfer(owner, toUnit('1'), { from: account1 }),
					'A synth or SNX rate is invalid'
				);

				// But can transfer if not
				await synthetix.transfer(owner, toUnit('1'), { from: account2 });
			});

			it('will not operate if the system is paused except by the owner', async () => {
				await setStatus({ owner, systemStatus, section: 'System', suspend: true });
				await assert.revert(
					debtCache.takeDebtSnapshot({ from: account1 }),
					'Synthetix is suspended'
				);
				await debtCache.takeDebtSnapshot({ from: owner });
			});
		});

		describe('updateCachedSynthDebts()', () => {
			it('allows resynchronisation of subsets of synths', async () => {
				await debtCache.takeDebtSnapshot();

				await exchangeRates.updateRates(
					[sAUD, sEUR, sETH],
					['1', '3', '200'].map(toUnit),
					await currentTime(),
					{
						from: oracle,
					}
				);

				// First try a single currency, ensuring that the others have not been altered.
				const expectedDebts = (await debtCache.currentSynthDebts([sAUD, sEUR, sETH]))[0];

				await debtCache.updateCachedSynthDebts([sAUD]);
				assert.bnEqual(await issuer.totalIssuedSynths(sUSD, true), toUnit(600));
				let debts = await debtCache.cachedSynthDebts([sAUD, sEUR, sETH]);

				assert.bnEqual(debts[0], expectedDebts[0]);
				assert.bnEqual(debts[1], toUnit(200));
				assert.bnEqual(debts[2], toUnit(200));

				// Then a subset
				await debtCache.updateCachedSynthDebts([sEUR, sETH]);
				assert.bnEqual(await issuer.totalIssuedSynths(sUSD, true), toUnit(900));
				debts = await debtCache.cachedSynthDebts([sEUR, sETH]);
				assert.bnEqual(debts[0], expectedDebts[1]);
				assert.bnEqual(debts[1], expectedDebts[2]);
			});

			it('can invalidate the debt cache for individual currencies with invalid rates', async () => {
				// Wait until the exchange rates are stale in order to invalidate the cache.
				const rateStalePeriod = await systemSettings.rateStalePeriod();
				await fastForward(rateStalePeriod + 1000);

				assert.isFalse((await debtCache.cacheInfo()).isInvalid);

				// individual stale rates invalidate the cache
				const tx1 = await debtCache.updateCachedSynthDebts([sAUD]);
				assert.isTrue((await debtCache.cacheInfo()).isInvalid);

				// But even if we update all rates, we can't revalidate the cache using the partial update function
				await exchangeRates.updateRates(
					[sAUD, sEUR, sETH],
					['0.5', '2', '100'].map(toUnit),
					await currentTime(),
					{ from: oracle }
				);
				const tx2 = await debtCache.updateCachedSynthDebts([sAUD, sEUR, sETH]);
				assert.isTrue((await debtCache.cacheInfo()).isInvalid);
				assert.eventEqual(tx1.logs[1], 'DebtCacheValidityChanged', [true]);
				assert.isTrue(tx2.logs.find(log => log.event === 'DebtCacheValidityChanged') === undefined);
			});

			it('properly emits events', async () => {
				await debtCache.takeDebtSnapshot();

				await exchangeRates.updateRates(
					[sAUD, sEUR, sETH],
					['1', '3', '200'].map(toUnit),
					await currentTime(),
					{
						from: oracle,
					}
				);

				const tx = await debtCache.updateCachedSynthDebts([sAUD]);
				assert.eventEqual(tx.logs[0], 'DebtCacheUpdated', [toUnit(600)]);
			});

			it('reverts when attempting to synchronise non-existent synths or SNX', async () => {
				await assert.revert(debtCache.updateCachedSynthDebts([SNX]));
				const fakeSynth = toBytes32('FAKE');
				await assert.revert(debtCache.updateCachedSynthDebts([fakeSynth]));
				await assert.revert(debtCache.updateCachedSynthDebts([sUSD, fakeSynth]));
			});

			it('will not operate if the system is paused except for the owner', async () => {
				await setStatus({ owner, systemStatus, section: 'System', suspend: true });
				await assert.revert(
					debtCache.updateCachedSynthDebts([sAUD, sEUR], { from: account1 }),
					'Synthetix is suspended'
				);
				await debtCache.updateCachedSynthDebts([sAUD, sEUR], { from: owner });
			});
		});

		describe('Issuance, burning, exchange, settlement', () => {
			it('issuing sUSD updates the debt total', async () => {
				await debtCache.takeDebtSnapshot();
				const issued = (await debtCache.cacheInfo())[0];

				const synthsToIssue = toUnit('10');
				await synthetix.transfer(account1, toUnit('1000'), { from: owner });
				const tx = await synthetix.issueSynths(synthsToIssue, { from: account1 });
				assert.bnEqual((await debtCache.cacheInfo())[0], issued.add(synthsToIssue));

				const logs = await getDecodedLogs({
					hash: tx.tx,
					contracts: [debtCache],
				});

				decodedEventEqual({
					event: 'DebtCacheUpdated',
					emittedFrom: debtCache.address,
					args: [issued.add(synthsToIssue)],
					log: logs.find(({ name } = {}) => name === 'DebtCacheUpdated'),
				});
			});

			it('burning sUSD updates the debt total', async () => {
				await debtCache.takeDebtSnapshot();
				const synthsToIssue = toUnit('10');
				await synthetix.transfer(account1, toUnit('1000'), { from: owner });
				await synthetix.issueSynths(synthsToIssue, { from: account1 });
				const issued = (await debtCache.cacheInfo())[0];

				const synthsToBurn = toUnit('5');

				const tx = await synthetix.burnSynths(synthsToBurn, { from: account1 });
				assert.bnEqual((await debtCache.cacheInfo())[0], issued.sub(synthsToBurn));

				const logs = await getDecodedLogs({
					hash: tx.tx,
					contracts: [debtCache],
				});

				decodedEventEqual({
					event: 'DebtCacheUpdated',
					emittedFrom: debtCache.address,
					args: [issued.sub(synthsToBurn)],
					log: logs.find(({ name } = {}) => name === 'DebtCacheUpdated'),
				});
			});

			it('issuing sUSD updates the total debt cached and sUSD cache', async () => {
				await debtCache.takeDebtSnapshot();
				const issued = (await debtCache.cacheInfo())[0];

				const synthsToIssue = toUnit('1000');
				const cachedSynths = (await debtCache.cachedSynthDebts([sUSD]))[0];

				await synthetix.transfer(account1, toUnit('10000'), { from: owner });

				const tx = await synthetix.issueSynths(synthsToIssue, { from: account1 });

				const logs = await getDecodedLogs({
					hash: tx.tx,
					contracts: [debtCache],
				});

				decodedEventEqual({
					event: 'DebtCacheUpdated',
					emittedFrom: debtCache.address,
					args: [issued.add(synthsToIssue)],
					log: logs.find(({ name } = {}) => name === 'DebtCacheUpdated'),
				});

				// cached sUSD increased by synth issued
				assert.bnEqual(await debtCache.cachedSynthDebts([sUSD]), cachedSynths.add(synthsToIssue));
				assert.bnEqual((await debtCache.cacheInfo())[0], issued.add(synthsToIssue));
			});

			it('burning sUSD reduces the total debt and sUSD cache', async () => {
				await debtCache.takeDebtSnapshot();

				const synthsToIssue = toUnit('1000');
				await synthetix.transfer(account1, toUnit('10000'), { from: owner });
				await synthetix.issueSynths(synthsToIssue, { from: account1 });

				const cachedSynths = (await debtCache.cachedSynthDebts([sUSD]))[0];
				const issued = (await debtCache.cacheInfo())[0];
				const synthsToBurn = toUnit('500');

				const tx = await synthetix.burnSynths(synthsToBurn, { from: account1 });

				const logs = await getDecodedLogs({
					hash: tx.tx,
					contracts: [debtCache],
				});

				decodedEventEqual({
					event: 'DebtCacheUpdated',
					emittedFrom: debtCache.address,
					args: [issued.sub(synthsToBurn)],
					log: logs.find(({ name } = {}) => name === 'DebtCacheUpdated'),
				});

				// cached sUSD decreased by synth burned
				assert.bnEqual(await debtCache.cachedSynthDebts([sUSD]), cachedSynths.sub(synthsToBurn));
				assert.bnEqual((await debtCache.cacheInfo())[0], issued.sub(synthsToBurn));
			});

			it('exchanging between synths updates the debt totals for those synths', async () => {
				// Zero exchange fees so that we can neglect them.
				await systemSettings.setExchangeFeeRateForSynths([sAUD, sUSD], [toUnit(0), toUnit(0)], {
					from: owner,
				});

				await debtCache.takeDebtSnapshot();
				await synthetix.transfer(account1, toUnit('1000'), { from: owner });
				await synthetix.issueSynths(toUnit('10'), { from: account1 });
				const issued = (await debtCache.cacheInfo())[0];
				const debts = await debtCache.cachedSynthDebts([sUSD, sAUD]);
				const tx = await synthetix.exchange(sUSD, toUnit('5'), sAUD, { from: account1 });
				const postDebts = await debtCache.cachedSynthDebts([sUSD, sAUD]);
				assert.bnEqual((await debtCache.cacheInfo())[0], issued);
				assert.bnEqual(postDebts[0], debts[0].sub(toUnit(5)));
				assert.bnEqual(postDebts[1], debts[1].add(toUnit(5)));

				// As the total debt did not change, no DebtCacheUpdated event was emitted.
				const logs = await getDecodedLogs({
					hash: tx.tx,
					contracts: [debtCache],
				});

				assert.isUndefined(logs.find(({ name } = {}) => name === 'DebtCacheUpdated'));
			});

			it('exchanging between synths updates sUSD debt total due to fees', async () => {
				await systemSettings.setExchangeFeeRateForSynths(
					[sAUD, sUSD, sEUR],
					[toUnit(0.1), toUnit(0.1), toUnit(0.1)],
					{ from: owner }
				);

				await sEURContract.issue(account1, toUnit(20));
				await debtCache.takeDebtSnapshot();
				const issued = (await debtCache.cacheInfo())[0];

				const debts = await debtCache.cachedSynthDebts([sUSD, sAUD, sEUR]);

				await synthetix.exchange(sEUR, toUnit(10), sAUD, { from: account1 });
				const postDebts = await debtCache.cachedSynthDebts([sUSD, sAUD, sEUR]);

				assert.bnEqual((await debtCache.cacheInfo())[0], issued);
				assert.bnEqual(postDebts[0], debts[0].add(toUnit(2)));
				assert.bnEqual(postDebts[1], debts[1].add(toUnit(18)));
				assert.bnEqual(postDebts[2], debts[2].sub(toUnit(20)));
			});

			it('exchanging between synths updates debt properly when prices have changed', async () => {
				await systemSettings.setExchangeFeeRateForSynths([sAUD, sUSD], [toUnit(0), toUnit(0)], {
					from: owner,
				});

				await sEURContract.issue(account1, toUnit(20));
				await debtCache.takeDebtSnapshot();
				const issued = (await debtCache.cacheInfo())[0];

				const debts = await debtCache.cachedSynthDebts([sAUD, sEUR]);

				await exchangeRates.updateRates([sAUD, sEUR], ['1', '1'].map(toUnit), await currentTime(), {
					from: oracle,
				});

				await synthetix.exchange(sEUR, toUnit(10), sAUD, { from: account1 });
				const postDebts = await debtCache.cachedSynthDebts([sAUD, sEUR]);

				// 120 eur @ $2 = $240 and 100 aud @ $0.50 = $50 becomes:
				// 110 eur @ $1 = $110 (-$130) and 110 aud @ $1 = $110 (+$60)
				// Total debt is reduced by $130 - $60 = $70
				assert.bnEqual((await debtCache.cacheInfo())[0], issued.sub(toUnit(70)));
				assert.bnEqual(postDebts[0], debts[0].add(toUnit(60)));
				assert.bnEqual(postDebts[1], debts[1].sub(toUnit(130)));
			});

			it('settlement updates debt totals', async () => {
				await systemSettings.setExchangeFeeRateForSynths([sAUD, sEUR], [toUnit(0), toUnit(0)], {
					from: owner,
				});
				await sAUDContract.issue(account1, toUnit(100));

				await debtCache.takeDebtSnapshot();

				const cachedDebt = await debtCache.cachedDebt();

				await synthetix.exchange(sAUD, toUnit(50), sEUR, { from: account1 });
				// so there's now 100 - 25 sUSD left (25 of it was exchanged)
				// and now there's 100 + (25 / 2 ) of sEUR = 112.5

				await systemSettings.setWaitingPeriodSecs(60, { from: owner });
				// set a high price deviation threshold factor to be sure it doesn't trigger here
				await systemSettings.setPriceDeviationThresholdFactor(toUnit('99'), { from: owner });

				await exchangeRates.updateRates([sAUD, sEUR], ['2', '1'].map(toUnit), await currentTime(), {
					from: oracle,
				});

				await fastForward(100);

				const tx = await exchanger.settle(account1, sEUR);
				const logs = await getDecodedLogs({
					hash: tx.tx,
					contracts: [debtCache],
				});

				// The A$75 does not change as we settled sEUR
				// But the EUR changes from 112.5 + 87.5 rebate = 200
				const results = await debtCache.cachedSynthDebts([sAUD, sEUR]);
				assert.bnEqual(results[0], toUnit(75));
				assert.bnEqual(results[1], toUnit(200));

				decodedEventEqual({
					event: 'DebtCacheUpdated',
					emittedFrom: debtCache.address,
					args: [cachedDebt.sub(toUnit('25'))], // deduct the 25 units of sAUD
					log: logs.find(({ name } = {}) => name === 'DebtCacheUpdated'),
				});
			});
		});

		describe('Synth removal and addition', () => {
			it('Removing synths zeroes out the debt snapshot for that currency', async () => {
				await debtCache.takeDebtSnapshot();
				const issued = (await debtCache.cacheInfo())[0];
				const sEURValue = (await debtCache.cachedSynthDebts([sEUR]))[0];
				await sEURContract.setTotalSupply(toUnit(0));
				const tx = await issuer.removeSynth(sEUR, { from: owner });
				const result = (await debtCache.cachedSynthDebts([sEUR]))[0];
				const newIssued = (await debtCache.cacheInfo())[0];
				assert.bnEqual(newIssued, issued.sub(sEURValue));
				assert.bnEqual(result, toUnit(0));

				const logs = await getDecodedLogs({
					hash: tx.tx,
					contracts: [debtCache],
				});

				decodedEventEqual({
					event: 'DebtCacheUpdated',
					emittedFrom: debtCache.address,
					args: [newIssued],
					log: logs.find(({ name } = {}) => name === 'DebtCacheUpdated'),
				});
			});

			it('Synth snapshots cannot be purged while the synth exists', async () => {
				await assert.revert(debtCache.purgeCachedSynthDebt(sAUD, { from: owner }), 'Synth exists');
			});

			it('Synth snapshots can be purged without updating the snapshot', async () => {
				const debtCacheName = toBytes32('DebtCache');
				const newDebtCache = await setupContract({
					contract: 'TestableDebtCache',
					accounts,
					skipPostDeploy: true,
					args: [owner, addressResolver.address],
				});
				await addressResolver.importAddresses([debtCacheName], [newDebtCache.address], {
					from: owner,
				});
				await newDebtCache.rebuildCache();
				await newDebtCache.takeDebtSnapshot();
				const issued = (await newDebtCache.cacheInfo())[0];

				const fakeTokenKey = toBytes32('FAKE');

				// Set a cached snapshot value
				await newDebtCache.setCachedSynthDebt(fakeTokenKey, toUnit('1'));

				// Purging deletes the value
				assert.bnEqual(await newDebtCache.cachedSynthDebt(fakeTokenKey), toUnit(1));
				await newDebtCache.purgeCachedSynthDebt(fakeTokenKey, { from: owner });
				assert.bnEqual(await newDebtCache.cachedSynthDebt(fakeTokenKey), toUnit(0));

				// Without affecting the snapshot.
				assert.bnEqual((await newDebtCache.cacheInfo())[0], issued);
			});

			it('Removing a synth invalidates the debt cache', async () => {
				await sEURContract.setTotalSupply(toUnit('0'));
				assert.isFalse((await debtCache.cacheInfo())[2]);
				const tx = await issuer.removeSynth(sEUR, { from: owner });
				assert.isTrue((await debtCache.cacheInfo())[2]);

				const logs = await getDecodedLogs({
					hash: tx.tx,
					contracts: [debtCache],
				});

				decodedEventEqual({
					event: 'DebtCacheValidityChanged',
					emittedFrom: debtCache.address,
					args: [true],
					log: logs.find(({ name } = {}) => name === 'DebtCacheValidityChanged'),
				});
			});

			it('Adding a synth invalidates the debt cache', async () => {
				const { token: synth } = await mockToken({
					accounts,
					synth: 'sXYZ',
					skipInitialAllocation: true,
					supply: 0,
					name: 'XYZ',
					symbol: 'XYZ',
				});

				assert.isFalse((await debtCache.cacheInfo())[2]);
				const tx = await issuer.addSynth(synth.address, { from: owner });
				assert.isTrue((await debtCache.cacheInfo())[2]);

				const logs = await getDecodedLogs({
					hash: tx.tx,
					contracts: [debtCache],
				});

				decodedEventEqual({
					event: 'DebtCacheValidityChanged',
					emittedFrom: debtCache.address,
					args: [true],
					log: logs.find(({ name } = {}) => name === 'DebtCacheValidityChanged'),
				});
			});

			it('Adding multiple synths invalidates the debt cache', async () => {
				const { token: synth1 } = await mockToken({
					accounts,
					synth: 'sXYZ',
					skipInitialAllocation: true,
					supply: 0,
					name: 'XYZ',
					symbol: 'XYZ',
				});
				const { token: synth2 } = await mockToken({
					accounts,
					synth: 'sABC',
					skipInitialAllocation: true,
					supply: 0,
					name: 'ABC',
					symbol: 'ABC',
				});

				assert.isFalse((await debtCache.cacheInfo())[2]);
				const tx = await issuer.addSynths([synth1.address, synth2.address], { from: owner });
				assert.isTrue((await debtCache.cacheInfo())[2]);

				const logs = await getDecodedLogs({
					hash: tx.tx,
					contracts: [debtCache],
				});

				decodedEventEqual({
					event: 'DebtCacheValidityChanged',
					emittedFrom: debtCache.address,
					args: [true],
					log: logs.find(({ name } = {}) => name === 'DebtCacheValidityChanged'),
				});
			});

			it('Removing multiple synths invalidates the debt cache', async () => {
				await sAUDContract.setTotalSupply(toUnit('0'));
				await sEURContract.setTotalSupply(toUnit('0'));

				assert.isFalse((await debtCache.cacheInfo())[2]);
				const tx = await issuer.removeSynths([sEUR, sAUD], { from: owner });
				assert.isTrue((await debtCache.cacheInfo())[2]);

				const logs = await getDecodedLogs({
					hash: tx.tx,
					contracts: [debtCache],
				});

				decodedEventEqual({
					event: 'DebtCacheValidityChanged',
					emittedFrom: debtCache.address,
					args: [true],
					log: logs.find(({ name } = {}) => name === 'DebtCacheValidityChanged'),
				});
			});

			it('Removing multiple synths zeroes the debt cache for those currencies', async () => {
				await debtCache.takeDebtSnapshot();
				const issued = (await debtCache.cacheInfo())[0];
				const sEURValue = (await debtCache.cachedSynthDebts([sEUR]))[0];
				const sAUDValue = (await debtCache.cachedSynthDebts([sAUD]))[0];
				await sEURContract.setTotalSupply(toUnit(0));
				await sAUDContract.setTotalSupply(toUnit(0));
				const tx = await issuer.removeSynths([sEUR, sAUD], { from: owner });
				const result = await debtCache.cachedSynthDebts([sEUR, sAUD]);
				const newIssued = (await debtCache.cacheInfo())[0];
				assert.bnEqual(newIssued, issued.sub(sEURValue.add(sAUDValue)));
				assert.bnEqual(result[0], toUnit(0));
				assert.bnEqual(result[1], toUnit(0));

				const logs = await getDecodedLogs({
					hash: tx.tx,
					contracts: [debtCache],
				});

				decodedEventEqual({
					event: 'DebtCacheUpdated',
					emittedFrom: debtCache.address,
					args: [newIssued],
					log: logs.find(({ name } = {}) => name === 'DebtCacheUpdated'),
				});
			});
		});

		describe('updateDebtCacheValidity()', () => {
			beforeEach(async () => {
				// Ensure the cache is valid.
				await debtCache.takeDebtSnapshot();

				// Change the calling address in the addressResolver so that the calls don't fail.
				const issuerName = toBytes32('Issuer');
				await addressResolver.importAddresses([issuerName], [account1], {
					from: owner,
				});
				await debtCache.rebuildCache();
			});

			describe('when the debt cache is valid', () => {
				it('invalidates the cache', async () => {
					assert.isFalse((await debtCache.cacheInfo()).isInvalid);
					const tx = await debtCache.updateDebtCacheValidity(true, { from: account1 });
					assert.isTrue((await debtCache.cacheInfo()).isInvalid);

					const logs = await getDecodedLogs({
						hash: tx.tx,
						contracts: [debtCache],
					});

					decodedEventEqual({
						event: 'DebtCacheValidityChanged',
						emittedFrom: debtCache.address,
						args: [true],
						log: logs.find(({ name } = {}) => name === 'DebtCacheValidityChanged'),
					});
				});

				it('does nothing if attempting to re-validate the cache', async () => {
					assert.isFalse((await debtCache.cacheInfo()).isInvalid);
					const tx = await debtCache.updateDebtCacheValidity(false, { from: account1 });
					assert.isFalse((await debtCache.cacheInfo()).isInvalid);

					const logs = await getDecodedLogs({
						hash: tx.tx,
						contracts: [debtCache],
					});

					assert.isUndefined(logs.find(({ name } = {}) => name === 'DebtCacheValidityChanged'));
				});
			});

			describe('when the debt cache is invalid', () => {
				beforeEach(async () => {
					// Invalidate the cache first.
					await debtCache.updateDebtCacheValidity(true, { from: account1 });
				});

				it('re-validates the cache', async () => {
					assert.isTrue((await debtCache.cacheInfo()).isInvalid);
					const tx = await debtCache.updateDebtCacheValidity(false, { from: account1 });
					assert.isFalse((await debtCache.cacheInfo()).isInvalid);

					const logs = await getDecodedLogs({
						hash: tx.tx,
						contracts: [debtCache],
					});

					decodedEventEqual({
						event: 'DebtCacheValidityChanged',
						emittedFrom: debtCache.address,
						args: [false],
						log: logs.find(({ name } = {}) => name === 'DebtCacheValidityChanged'),
					});
				});

				it('does nothing if attempting to invalidate the cache', async () => {
					assert.isTrue((await debtCache.cacheInfo()).isInvalid);
					const tx = await debtCache.updateDebtCacheValidity(true, { from: account1 });
					assert.isTrue((await debtCache.cacheInfo()).isInvalid);

					const logs = await getDecodedLogs({
						hash: tx.tx,
						contracts: [debtCache],
					});

					assert.isUndefined(logs.find(({ name } = {}) => name === 'DebtCacheValidityChanged'));
				});
			});
		});
	});

	describe('totalNonSnxBackedDebt', async () => {
		let totalNonSnxBackedDebt;
		let currentDebt;

		const getTotalNonSnxBackedDebt = async () => {
			const { excludedDebt } = await debtCache.totalNonSnxBackedDebt();
			return excludedDebt;
		};

		beforeEach(async () => {
			// Issue some debt to avoid a division-by-zero in `getBorrowRate` where
			// we compute the utilisation.
			await synthetix.transfer(account1, toUnit('1000'), { from: owner });
			await synthetix.issueSynths(toUnit('10'), { from: account1 });

			totalNonSnxBackedDebt = await getTotalNonSnxBackedDebt();
			currentDebt = await debtCache.currentDebt();
		});

		describe('when MultiCollateral loans are opened', async () => {
			let rate;

			beforeEach(async () => {
				await setupMultiCollateral();

				({ rate } = await exchangeRates.rateAndInvalid(sETH));

				await ceth.open(oneETH, sETH, {
					value: twoETH,
					from: account1,
				});
			});

			it('increases non-SNX debt', async () => {
				assert.bnEqual(
					totalNonSnxBackedDebt.add(multiplyDecimalRound(oneETH, rate)),
					await getTotalNonSnxBackedDebt()
				);
			});
			it('is excluded from currentDebt', async () => {
				assert.bnEqual(currentDebt, await debtCache.currentDebt());
			});

			describe('after the synths are exchanged into other synths', async () => {
				let tx;
				beforeEach(async () => {
					// Swap some sETH into synthetic dollarydoos.
					tx = await synthetix.exchange(sETH, '5', sAUD, { from: account1 });
				});

				it('non-SNX debt is unchanged', async () => {
					assert.bnEqual(
						totalNonSnxBackedDebt.add(multiplyDecimalRound(oneETH, rate)),
						await getTotalNonSnxBackedDebt()
					);
				});
				it('currentDebt is unchanged', async () => {
					assert.bnEqual(currentDebt, await debtCache.currentDebt());
				});

				it('cached debt is properly updated', async () => {
					const logs = await getDecodedLogs({
						hash: tx.tx,
						contracts: [debtCache],
					});

					const cachedDebt = (await debtCache.cacheInfo())[0];
					decodedEventEqual({
						event: 'DebtCacheUpdated',
						emittedFrom: debtCache.address,
						args: [cachedDebt],
						log: logs.find(({ name } = {}) => name === 'DebtCacheUpdated'),
					});
				});
			});

			it('is properly reflected in a snapshot', async () => {
				const currentDebt = (await debtCache.currentDebt())[0];
				const cachedDebt = (await debtCache.cacheInfo())[0];
				assert.bnEqual(currentDebt, cachedDebt);
				const tx = await debtCache.takeDebtSnapshot();
				const logs = await getDecodedLogs({
					hash: tx.tx,
					contracts: [debtCache],
				});

				decodedEventEqual({
					event: 'DebtCacheUpdated',
					emittedFrom: debtCache.address,
					args: [cachedDebt],
					log: logs.find(({ name } = {}) => name === 'DebtCacheUpdated'),
				});
			});
		});

		describe('when shorts are opened', async () => {
			let rate;
			let amount;

			beforeEach(async () => {
				({ rate } = await exchangeRates.rateAndInvalid(sETH));

				// Take out a short position on sETH.
				// sUSD collateral = 1.5 * rate_eth
				amount = multiplyDecimalRound(rate, toUnit('1.5'));
				await sUSDContract.issue(account1, amount, { from: owner });
				// Again, avoid a divide-by-zero in computing the short rate,
				// by ensuring sETH.totalSupply() > 0.
				await sETHContract.issue(account1, amount, { from: owner });

				await setupShort();
				await systemSettings.setMinCratio(short.address, toUnit(1.5), { from: owner });
				await short.setIssueFeeRate(toUnit('0'), { from: owner });
				await short.open(amount, oneETH, sETH, { from: account1 });
			});

			it('increases non-SNX debt', async () => {
				assert.bnEqual(totalNonSnxBackedDebt.add(rate), await getTotalNonSnxBackedDebt());
			});
			it('is excluded from currentDebt', async () => {
				assert.bnEqual(currentDebt, await debtCache.currentDebt());
			});
		});
	});
});
