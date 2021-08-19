'use strict';

const { contract } = require('hardhat');

const { assert, addSnapshotBeforeRestoreAfterEach } = require('./common');

const { toUnit, currentTime, fastForward } = require('../utils')();

const { setupAllContracts, setupContract, mockToken } = require('./setup');

const { ensureOnlyExpectedMutativeFunctions } = require('./helpers');

const {
	toBytes32,
	constants: { ZERO_ADDRESS },
} = require('../..');

contract('CollateralManager', async accounts => {
	const [, owner, oracle, , account1] = accounts;

	const sETH = toBytes32('sETH');
	const sUSD = toBytes32('sUSD');
	const sBTC = toBytes32('sBTC');

	const name = 'Some name';
	const symbol = 'TOKEN';

	const INTERACTION_DELAY = 300;

	const oneRenBTC = 100000000;

	let ceth,
		cerc20,
		renBTC,
		manager,
		managerState,
		addressResolver,
		issuer,
		exchangeRates,
		feePool,
		sUSDSynth,
		sETHSynth,
		sBTCSynth,
		synths,
		maxDebt,
		short,
		debtCache,
		tx,
		id;

	const getid = tx => {
		const event = tx.logs.find(log => log.event === 'LoanCreated');
		return event.args.id;
	};

	const issue = async (synth, issueAmount, receiver) => {
		await synth.issue(receiver, issueAmount, { from: owner });
	};

	const updateRatesWithDefaults = async () => {
		const timestamp = await currentTime();

		await exchangeRates.updateRates([sETH], ['100'].map(toUnit), timestamp, {
			from: oracle,
		});

		const sBTC = toBytes32('sBTC');

		await exchangeRates.updateRates([sBTC], ['10000'].map(toUnit), timestamp, {
			from: oracle,
		});
	};

	const fastForwardAndUpdateRates = async seconds => {
		await fastForward(seconds);
		await updateRatesWithDefaults();
	};

	const deployCollateral = async ({
		owner,
		manager,
		resolver,
		collatKey,
		minColat,
		minSize,
		underCon,
		decimals,
	}) => {
		return setupContract({
			accounts,
			contract: 'CollateralErc20',
			args: [owner, manager, resolver, collatKey, minColat, minSize, underCon, decimals],
		});
	};

	const setupManager = async () => {
		synths = ['sUSD', 'sBTC', 'sETH', 'iBTC', 'iETH'];
		({
			ExchangeRates: exchangeRates,
			SynthsUSD: sUSDSynth,
			SynthsETH: sETHSynth,
			SynthsBTC: sBTCSynth,
			FeePool: feePool,
			AddressResolver: addressResolver,
			Issuer: issuer,
			DebtCache: debtCache,
			CollateralManager: manager,
			CollateralManagerState: managerState,
			CollateralEth: ceth,
			CollateralShort: short,
		} = await setupAllContracts({
			accounts,
			synths,
			contracts: [
				'Synthetix',
				'FeePool',
				'AddressResolver',
				'ExchangeRates',
				'SystemStatus',
				'Issuer',
				'DebtCache',
				'Exchanger',
				'CollateralManager',
				'CollateralManagerState',
				'CollateralEth',
				'CollateralShort',
			],
		}));

		maxDebt = toUnit(50000000);

		await managerState.setAssociatedContract(manager.address, { from: owner });

		({ token: renBTC } = await mockToken({
			accounts,
			name,
			symbol,
			supply: 1e6,
		}));

		cerc20 = await deployCollateral({
			owner: owner,
			manager: manager.address,
			resolver: addressResolver.address,
			collatKey: sBTC,
			minColat: toUnit(1.5),
			minSize: toUnit(0.1),
			underCon: renBTC.address,
			decimals: 8,
		});

		// Issue ren and set allowance
		await renBTC.transfer(account1, toUnit(100), { from: owner });

		await addressResolver.importAddresses(
			[
				toBytes32('CollateralEth'),
				toBytes32('CollateralErc20'),
				toBytes32('CollateralManager'),
				toBytes32('CollateralShort'),
			],
			[ceth.address, cerc20.address, manager.address, short.address],
			{
				from: owner,
			}
		);

		await issuer.rebuildCache();
		await ceth.rebuildCache();
		await cerc20.rebuildCache();
		await debtCache.rebuildCache();
		await feePool.rebuildCache();
		await manager.rebuildCache();
		await short.rebuildCache();

		await manager.addCollaterals([ceth.address, cerc20.address, short.address], { from: owner });

		await ceth.addSynths(
			['SynthsUSD', 'SynthsETH'].map(toBytes32),
			['sUSD', 'sETH'].map(toBytes32),
			{ from: owner }
		);
		await cerc20.addSynths(
			['SynthsUSD', 'SynthsBTC'].map(toBytes32),
			['sUSD', 'sBTC'].map(toBytes32),
			{ from: owner }
		);
		await short.addSynths(
			['SynthsBTC', 'SynthsETH'].map(toBytes32),
			['sBTC', 'sETH'].map(toBytes32),
			{ from: owner }
		);

		await manager.addSynths(
			[toBytes32('SynthsUSD'), toBytes32('SynthsBTC'), toBytes32('SynthsETH')],
			[toBytes32('sUSD'), toBytes32('sBTC'), toBytes32('sETH')],
			{
				from: owner,
			}
		);

		await manager.addShortableSynths(
			[toBytes32('SynthsETH'), toBytes32('SynthsBTC')],
			[sETH, sBTC],
			{
				from: owner,
			}
		);

		// check synths are set and currencyKeys set
		assert.isTrue(
			await manager.areSynthsAndCurrenciesSet(
				['SynthsUSD', 'SynthsBTC', 'SynthsETH'].map(toBytes32),
				['sUSD', 'sBTC', 'sETH'].map(toBytes32)
			)
		);

		await renBTC.approve(cerc20.address, toUnit(100), { from: account1 });
		await sUSDSynth.approve(short.address, toUnit(100000), { from: account1 });
	};

	before(async () => {
		await setupManager();
	});

	addSnapshotBeforeRestoreAfterEach();

	beforeEach(async () => {
		await updateRatesWithDefaults();

		await issue(sUSDSynth, toUnit(1000), owner);
		await issue(sETHSynth, toUnit(10), owner);
		await issue(sBTCSynth, toUnit(0.1), owner);
		await debtCache.takeDebtSnapshot();
	});

	it('should set constructor params on deployment', async () => {
		assert.equal(await manager.state(), managerState.address);
		assert.equal(await manager.owner(), owner);
		assert.equal(await manager.resolver(), addressResolver.address);
		assert.bnEqual(await manager.maxDebt(), maxDebt);
	});

	it('should ensure only expected functions are mutative', async () => {
		ensureOnlyExpectedMutativeFunctions({
			abi: manager.abi,
			ignoreParents: ['Owned', 'Pausable', 'MixinResolver', 'Proxy'],
			expected: [
				'setUtilisationMultiplier',
				'setMaxDebt',
				'setBaseBorrowRate',
				'setBaseShortRate',
				'getNewLoanId',
				'addCollaterals',
				'removeCollaterals',
				'addSynths',
				'removeSynths',
				'accrueInterest',
				'addShortableSynths',
				'removeShortableSynths',
				'updateBorrowRatesCollateral',
				'updateShortRatesCollateral',
				'incrementLongs',
				'decrementLongs',
				'incrementShorts',
				'decrementShorts',
			],
		});
	});

	it('should access its dependencies via the address resolver', async () => {
		assert.equal(await addressResolver.getAddress(toBytes32('SynthsUSD')), sUSDSynth.address);
		assert.equal(await addressResolver.getAddress(toBytes32('FeePool')), feePool.address);
		assert.equal(
			await addressResolver.getAddress(toBytes32('ExchangeRates')),
			exchangeRates.address
		);
	});

	describe('getting collaterals', async () => {
		it('should add the collaterals during construction', async () => {
			assert.isTrue(await manager.hasCollateral(ceth.address));
			assert.isTrue(await manager.hasCollateral(cerc20.address));
		});
	});

	describe('default values for totalLong and totalShort', async () => {
		it('totalLong should be 0', async () => {
			const long = await manager.totalLong();
			assert.bnEqual(long.susdValue, toUnit('0'));
		});
		it('totalShort should be 0', async () => {
			const short = await manager.totalShort();
			assert.bnEqual(short.susdValue, toUnit('0'));
		});
	});

	describe('should only allow opening positions up to the debt limiit', async () => {
		beforeEach(async () => {
			await issue(sUSDSynth, toUnit(15000000), account1);
			await sUSDSynth.approve(short.address, toUnit(15000000), { from: account1 });
		});

		it('should not allow opening a position that would surpass the debt limit', async () => {
			await assert.revert(
				short.open(toUnit(15000000), toUnit(6000000), sETH, { from: account1 }),
				'Debt limit or invalid rate'
			);
		});
	});

	describe('tracking synth balances across collaterals', async () => {
		beforeEach(async () => {
			tx = await ceth.open(toUnit(100), sUSD, { value: toUnit(2), from: account1 });
			await ceth.open(toUnit(1), sETH, { value: toUnit(2), from: account1 });
			await cerc20.open(oneRenBTC, toUnit(100), sUSD, { from: account1 });
			await cerc20.open(oneRenBTC, toUnit(0.01), sBTC, { from: account1 });
			await short.open(toUnit(200), toUnit(1), sETH, { from: account1 });

			id = getid(tx);
		});

		it('should correctly get the total sUSD balance', async () => {
			assert.bnEqual(await manager.long(sUSD), toUnit(200));
		});

		it('should correctly get the total sETH balance', async () => {
			assert.bnEqual(await manager.long(sETH), toUnit(1));
		});

		it('should correctly get the total sBTC balance', async () => {
			assert.bnEqual(await manager.long(sBTC), toUnit(0.01));
		});

		it('should correctly get the total short ETTH balance', async () => {
			assert.bnEqual(await manager.short(sETH), toUnit(1));
		});

		it('should get the total long balance in sUSD correctly', async () => {
			const total = await manager.totalLong();
			const debt = total.susdValue;

			assert.bnEqual(debt, toUnit(400));
		});

		it('should get the total short balance in sUSD correctly', async () => {
			const total = await manager.totalShort();
			const debt = total.susdValue;

			assert.bnEqual(debt, toUnit(100));
		});

		it('should report if a rate is invalid', async () => {
			await fastForward(await exchangeRates.rateStalePeriod());

			const long = await manager.totalLong();
			const debt = long.susdValue;
			const invalid = long.anyRateIsInvalid;

			const short = await manager.totalShort();
			const shortDebt = short.susdValue;
			const shortInvalid = short.anyRateIsInvalid;

			assert.bnEqual(debt, toUnit(400));
			assert.bnEqual(shortDebt, toUnit(100));
			assert.isTrue(invalid);
			assert.isTrue(shortInvalid);
		});

		it('should reduce the sUSD balance when a loan is closed', async () => {
			issue(sUSDSynth, toUnit(10), account1);
			await fastForwardAndUpdateRates(INTERACTION_DELAY);
			await ceth.close(id, { from: account1 });

			assert.bnEqual(await manager.long(sUSD), toUnit(100));
		});

		it('should reduce the total balance in sUSD when a loan is closed', async () => {
			issue(sUSDSynth, toUnit(10), account1);
			await fastForwardAndUpdateRates(INTERACTION_DELAY);
			await ceth.close(id, { from: account1 });

			const total = await manager.totalLong();
			const debt = total.susdValue;

			assert.bnEqual(debt, toUnit(300));
		});
	});

	describe('tracking synth balances across collaterals', async () => {
		let systemDebtBefore;

		beforeEach(async () => {
			systemDebtBefore = (await debtCache.currentDebt()).debt;

			tx = await ceth.open(toUnit(100), sUSD, { value: toUnit(2), from: account1 });

			id = getid(tx);
		});

		it('should not change the system debt.', async () => {
			assert.bnEqual((await debtCache.currentDebt()).debt, systemDebtBefore);
		});
	});

	describe('setting variables', async () => {
		describe('setUtilisationMultiplier', async () => {
			describe('revert condtions', async () => {
				it('should fail if not called by the owner', async () => {
					await assert.revert(
						manager.setUtilisationMultiplier(toUnit(1), { from: account1 }),
						'Only the contract owner may perform this action'
					);
				});
				it('should fail if the minimum is 0', async () => {
					await assert.revert(
						manager.setUtilisationMultiplier(toUnit(0), { from: owner }),
						'Must be greater than 0'
					);
				});
			});
			describe('when it succeeds', async () => {
				beforeEach(async () => {
					await manager.setUtilisationMultiplier(toUnit(2), { from: owner });
				});
				it('should update the utilisation multiplier', async () => {
					assert.bnEqual(await manager.utilisationMultiplier(), toUnit(2));
				});
			});
		});

		describe('setBaseBorrowRate', async () => {
			describe('revert condtions', async () => {
				it('should fail if not called by the owner', async () => {
					await assert.revert(
						manager.setBaseBorrowRate(toUnit(1), { from: account1 }),
						'Only the contract owner may perform this action'
					);
				});
			});
			describe('when it succeeds', async () => {
				beforeEach(async () => {
					await manager.setBaseBorrowRate(toUnit(2), { from: owner });
				});
				it('should update the base interest rate', async () => {
					assert.bnEqual(await manager.baseBorrowRate(), toUnit(2));
				});
				it('should allow the base interest rate to be  0', async () => {
					await manager.setBaseBorrowRate(toUnit(0), { from: owner });
					assert.bnEqual(await manager.baseBorrowRate(), toUnit(0));
				});
			});
		});
	});

	describe('adding collateral', async () => {
		describe('revert conditions', async () => {
			it('should revert if the caller is not the owner', async () => {
				await assert.revert(
					manager.addCollaterals([ZERO_ADDRESS], { from: account1 }),
					'Only the contract owner may perform this action'
				);
			});
		});

		describe('when a new collateral is added', async () => {
			beforeEach(async () => {
				await manager.addCollaterals([ZERO_ADDRESS], { from: owner });
			});

			it('should add the collateral', async () => {
				assert.isTrue(await manager.hasCollateral(ZERO_ADDRESS));
			});
		});

		describe('retreiving collateral by address', async () => {
			it('if a collateral is in the manager, it should return true', async () => {
				assert.isTrue(await manager.hasCollateral(ceth.address));
			});

			it('if a collateral is not in the manager, it should return false', async () => {
				assert.isFalse(await manager.hasCollateral(ZERO_ADDRESS));
			});
		});
	});

	describe('removing collateral', async () => {
		describe('revert conditions', async () => {
			it('should revert if the caller is not the owner', async () => {
				await assert.revert(
					manager.removeCollaterals([sBTCSynth.address], { from: account1 }),
					'Only the contract owner may perform this action'
				);
			});
		});

		describe('when a collateral is removed', async () => {
			beforeEach(async () => {
				await manager.removeCollaterals([sBTCSynth.address], { from: owner });
			});

			it('should not have the collateral', async () => {
				assert.isFalse(await manager.hasCollateral(sBTCSynth.address));
			});
		});
	});

	describe('removing synths', async () => {
		describe('revert conditions', async () => {
			it('should revert if the caller is not the owner', async () => {
				await assert.revert(
					manager.removeSynths([toBytes32('SynthsBTC')], [toBytes32('sBTC')], { from: account1 }),
					'Only the contract owner may perform this action'
				);
			});
		});

		describe('it should remove a synth', async () => {
			beforeEach(async () => {
				await manager.removeSynths([toBytes32('SynthsBTC')], [toBytes32('sBTC')], { from: owner });
			});
		});
	});

	describe('removing shortable synths', async () => {
		describe('revert conditions', async () => {
			it('should revert if the caller is not the owner', async () => {
				await assert.revert(
					manager.removeShortableSynths([toBytes32('SynthsBTC')], { from: account1 }),
					'Only the contract owner may perform this action'
				);
			});
		});

		describe('when a shortable synth is removed', async () => {
			it('should emit the ShortableSynthRemoved event', async () => {
				const txn = await manager.removeShortableSynths([toBytes32('SynthsBTC')], { from: owner });

				assert.eventEqual(txn, 'ShortableSynthRemoved', {
					synth: toBytes32('SynthsBTC'),
				});
			});
		});
	});
});
