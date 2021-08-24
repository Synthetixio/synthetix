'use strict';

const { contract } = require('hardhat');

const { assert, addSnapshotBeforeRestoreAfterEach } = require('./common');

const { fastForward, toUnit, fromUnit, currentTime } = require('../utils')();

const { setupAllContracts } = require('./setup');

const { ensureOnlyExpectedMutativeFunctions, setExchangeFeeRateForSynths } = require('./helpers');

const { toBytes32 } = require('../..');

contract('CollateralShort', async accounts => {
	const YEAR = 31556926;

	const sUSD = toBytes32('sUSD');
	const sETH = toBytes32('sETH');
	const sBTC = toBytes32('sBTC');

	const [, owner, oracle, , account1, account2] = accounts;

	let short,
		managerState,
		feePool,
		exchanger,
		exchangeRates,
		addressResolver,
		sUSDSynth,
		sBTCSynth,
		sETHSynth,
		synths,
		manager,
		issuer,
		debtCache,
		systemSettings,
		FEE_ADDRESS;

	let tx, loan, id;

	const getid = tx => {
		const event = tx.logs.find(log => log.event === 'LoanCreated');
		return event.args.id;
	};

	const fastForwardAndUpdateRates = async seconds => {
		await fastForward(seconds);
		await updateRatesWithDefaults();
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

	const setupShort = async () => {
		synths = ['sUSD', 'sBTC', 'sETH'];
		({
			ExchangeRates: exchangeRates,
			Exchanger: exchanger,
			SynthsUSD: sUSDSynth,
			SynthsBTC: sBTCSynth,
			SynthsETH: sETHSynth,
			FeePool: feePool,
			AddressResolver: addressResolver,
			Issuer: issuer,
			DebtCache: debtCache,
			CollateralShort: short,
			SystemSettings: systemSettings,
			CollateralManager: manager,
			CollateralManagerState: managerState,
		} = await setupAllContracts({
			accounts,
			synths,
			contracts: [
				'Synthetix',
				'FeePool',
				'AddressResolver',
				'Exchanger',
				'ExchangeRates',
				'SystemStatus',
				'Issuer',
				'DebtCache',
				'SystemSettings',
				'CollateralUtil',
				'CollateralShort',
				'CollateralManager',
				'CollateralManagerState',
			],
		}));

		await managerState.setAssociatedContract(manager.address, { from: owner });

		FEE_ADDRESS = await feePool.FEE_ADDRESS();

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
			['SynthsBTC', 'SynthsETH'].map(toBytes32),
			['sBTC', 'sETH'].map(toBytes32),
			{ from: owner }
		);

		// check synths are set and currencyKeys set
		assert.isTrue(
			await manager.areSynthsAndCurrenciesSet(
				['SynthsUSD', 'SynthsBTC', 'SynthsETH'].map(toBytes32),
				['sUSD', 'sBTC', 'sETH'].map(toBytes32)
			)
		);

		await sUSDSynth.approve(short.address, toUnit(100000), { from: account1 });
	};

	before(async () => {
		await setupShort();
	});

	addSnapshotBeforeRestoreAfterEach();

	beforeEach(async () => {
		await updateRatesWithDefaults();

		// set a 0.3% default exchange fee rate                                                                                 │        { contract: 'ExchangeState' },
		const exchangeFeeRate = toUnit('0.003');
		const synthKeys = [sETH, sUSD];
		await setExchangeFeeRateForSynths({
			owner,
			systemSettings,
			synthKeys,
			exchangeFeeRates: synthKeys.map(() => exchangeFeeRate),
		});

		await issue(sUSDSynth, toUnit(100000), owner);
		await issue(sBTCSynth, toUnit(1), owner);
		await issue(sETHSynth, toUnit(1), owner);

		// The market is balanced between long and short.

		await debtCache.takeDebtSnapshot();
	});

	it('should set constructor params on deployment', async () => {
		assert.equal(await short.owner(), owner);
		assert.equal(await short.resolver(), addressResolver.address);
		assert.equal(await short.collateralKey(), sUSD);
		assert.equal(await short.synths(0), toBytes32('SynthsBTC'));
		assert.equal(await short.synths(1), toBytes32('SynthsETH'));
		assert.bnEqual(await short.minCratio(), toUnit(1.2));
	});

	it('should ensure only expected functions are mutative', async () => {
		ensureOnlyExpectedMutativeFunctions({
			abi: short.abi,
			ignoreParents: ['Owned', 'Pausable', 'MixinResolver', 'Proxy', 'Collateral'],
			expected: [
				'open',
				'close',
				'deposit',
				'repay',
				'repayWithCollateral',
				'withdraw',
				'liquidate',
				'draw',
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

	describe('opening shorts', async () => {
		describe('should open a btc short', async () => {
			const oneBTC = toUnit(1);
			const susdCollateral = toUnit(15000);

			beforeEach(async () => {
				await issue(sUSDSynth, susdCollateral, account1);

				tx = await short.open(susdCollateral, oneBTC, sBTC, { from: account1 });

				id = getid(tx);
				loan = await short.loans(id);
			});

			it('should emit the event properly', async () => {
				assert.eventEqual(tx, 'LoanCreated', {
					account: account1,
					id: id,
					amount: oneBTC,
					collateral: susdCollateral,
					currency: sBTC,
				});
			});

			it('should create the short correctly', async () => {
				assert.equal(loan.account, account1);
				assert.equal(loan.collateral, susdCollateral.toString());
				assert.equal(loan.currency, sBTC);
				assert.equal(loan.short, true);
				assert.equal(loan.amount, oneBTC.toString());
				assert.bnEqual(loan.accruedInterest, toUnit(0));
			});

			it('should correclty issue the right balance to the shorter', async () => {
				const sUSDProceeds = toUnit(10000);

				assert.bnEqual(await sUSDSynth.balanceOf(account1), sUSDProceeds);
			});

			it('should tell the manager about the short', async () => {
				assert.bnEqual(await manager.short(sBTC), oneBTC);
			});

			it('should transfer the sUSD to the contract', async () => {
				assert.bnEqual(await sUSDSynth.balanceOf(short.address), susdCollateral);
			});
		});

		describe('should open an eth short', async () => {
			const oneETH = toUnit(1);
			const susdCollateral = toUnit(1000);

			beforeEach(async () => {
				await issue(sUSDSynth, susdCollateral, account1);

				tx = await short.open(susdCollateral, oneETH, sETH, { from: account1 });

				id = getid(tx);

				loan = await short.loans(id);
			});

			it('should emit the event properly', async () => {
				assert.eventEqual(tx, 'LoanCreated', {
					account: account1,
					id: id,
					amount: oneETH,
					collateral: susdCollateral,
					currency: sETH,
				});
			});

			it('should create the short correctly', async () => {
				assert.equal(loan.account, account1);
				assert.equal(loan.collateral, susdCollateral.toString());
				assert.equal(loan.currency, sETH);
				assert.equal(loan.short, true);
				assert.equal(loan.amount, oneETH.toString());
				assert.bnEqual(loan.accruedInterest, toUnit(0));
			});

			it('should correclty issue the right balance to the shorter', async () => {
				const sUSDProceeds = toUnit(100);

				assert.bnEqual(await sUSDSynth.balanceOf(account1), sUSDProceeds);
			});

			it('should tell the manager about the short', async () => {
				assert.bnEqual(await manager.short(sETH), oneETH);
			});
		});
	});

	describe('Repaying shorts', async () => {
		const oneETH = toUnit(1);
		const susdCollateral = toUnit(1000);
		const tolerance = toUnit(0.15);
		const payInterest = true;

		let beforeFeePoolBalance, beforeInteractionTime;

		beforeEach(async () => {
			await issue(sUSDSynth, susdCollateral, account1);

			tx = await short.open(susdCollateral, oneETH, sETH, { from: account1 });

			id = getid(tx);

			loan = await short.loans(id);

			beforeInteractionTime = loan.lastInteraction;
			beforeFeePoolBalance = await sUSDSynth.balanceOf(FEE_ADDRESS);

			await fastForwardAndUpdateRates(3600);
		});

		it('should repay with collateral and update the loan', async () => {
			tx = await short.repayWithCollateral(account1, id, toUnit(0.5), !payInterest, {
				from: account1,
			});

			loan = await short.loans(id);

			assert.eventEqual(tx, 'LoanRepaymentMade', {
				account: account1,
				repayer: account1,
				id: id,
				amountRepaid: toUnit(0.5),
				amountAfter: loan.amount,
			});

			const { fee } = await exchanger.getAmountsForExchange(toUnit(0.5), sETH, sUSD);

			assert.bnClose(
				await sUSDSynth.balanceOf(FEE_ADDRESS),
				beforeFeePoolBalance.add(fee),
				tolerance
			);

			assert.isAbove(parseInt(loan.lastInteraction), parseInt(beforeInteractionTime));

			assert.bnClose(loan.amount, toUnit(0.5).toString(), tolerance);
			assert.bnClose(loan.collateral, toUnit(950).toString(), tolerance);
		});

		it('should repay accrued interest', async () => {
			tx = await short.repayWithCollateral(account1, id, toUnit(1), payInterest, {
				from: account1,
			});

			loan = await short.loans(id);

			assert.isAbove(parseInt(loan.lastInteraction), parseInt(beforeInteractionTime));

			assert.equal(loan.amount, toUnit(0).toString());
			assert.bnClose(loan.collateral, toUnit(900).toString(), toUnit(0.3));
		});

		it('should only let the borrower repay with collateral', async () => {
			await assert.revert(
				short.repayWithCollateral(account1, id, toUnit(0.1), payInterest, { from: account2 }),
				'Must be borrower'
			);
		});

		it('should not let them repay too much', async () => {
			await assert.revert(
				short.repayWithCollateral(account1, id, toUnit(2000), payInterest, { from: account1 }),
				'Payment too high'
			);
		});
	});

	describe('Drawing shorts', async () => {
		const oneETH = toUnit(1);
		const susdCollateral = toUnit(1000);

		beforeEach(async () => {
			await issue(sUSDSynth, susdCollateral, account1);

			tx = await short.open(susdCollateral, oneETH, sETH, { from: account1 });

			id = getid(tx);

			await fastForwardAndUpdateRates(3600);

			await short.draw(id, toUnit(5), { from: account1 });
		});

		it('should update the loan', async () => {
			loan = await short.loans(id);
			assert.equal(loan.amount, toUnit(6).toString());
		});

		it('should transfer the proceeds to the user', async () => {
			assert.bnEqual(await sUSDSynth.balanceOf(account1), toUnit(600));
		});

		it('should not let them draw too much', async () => {
			await fastForwardAndUpdateRates(3600);
			await assert.revert(short.draw(id, toUnit(8), { from: account1 }), 'Cratio too low');
		});
	});

	describe('Closing shorts', async () => {
		const oneETH = toUnit(1);
		const susdCollateral = toUnit(1000);

		it('if the eth price goes down, the shorter makes profit', async () => {
			await issue(sUSDSynth, susdCollateral, account1);

			tx = await short.open(toUnit(500), oneETH, sETH, { from: account1 });

			id = getid(tx);

			await fastForwardAndUpdateRates(3600);

			const timestamp = await currentTime();
			await exchangeRates.updateRates([sETH], ['50'].map(toUnit), timestamp, {
				from: oracle,
			});

			// simulate buying sETH for 50 susd.
			await sUSDSynth.transfer(owner, toUnit(50), { from: account1 });
			await issue(sETHSynth, oneETH, account1);

			// now close the short
			await short.close(id, { from: account1 });

			// shorter has made 50 sUSD profit
			assert.bnEqual(await sUSDSynth.balanceOf(account1), toUnit(1050));
		});

		it('if the eth price goes up, the shorter makes a loss', async () => {
			await issue(sUSDSynth, susdCollateral, account1);

			tx = await short.open(toUnit(500), oneETH, sETH, { from: account1 });

			id = getid(tx);

			await fastForwardAndUpdateRates(3600);

			const timestamp = await currentTime();
			await exchangeRates.updateRates([sETH], ['150'].map(toUnit), timestamp, {
				from: oracle,
			});

			// simulate buying sETH for 150 susd.
			await sUSDSynth.transfer(owner, toUnit(150), { from: account1 });
			await issue(sETHSynth, oneETH, account1);

			// now close the short
			await short.close(id, { from: account1 });

			// shorter has made 50 sUSD loss
			assert.bnEqual(await sUSDSynth.balanceOf(account1), toUnit(950));
		});
	});

	describe('Liquidating shorts', async () => {
		const oneETH = toUnit(1);
		const susdCollateral = toUnit('130');
		const expectedCollateralRemaining = toUnit('108.000000000000000143');
		const expectedCollateralLiquidated = toUnit('21.999999999999999857');
		const expectedLiquidationAmount = toUnit('0.181818181818181817');
		const expectedLoanRemaining = toUnit('0.818181818181818183');

		beforeEach(async () => {
			await issue(sUSDSynth, susdCollateral, account1);

			tx = await short.open(susdCollateral, oneETH, sETH, { from: account1 });

			id = getid(tx);
			await fastForwardAndUpdateRates(3600);
		});

		it('liquidation should be capped to only fix the c ratio', async () => {
			const timestamp = await currentTime();
			await exchangeRates.updateRates([sETH], ['110'].map(toUnit), timestamp, {
				from: oracle,
			});

			// When the ETH price increases 10% to $110, the short
			// which started at 130% should allow 0.18 ETH
			// to be liquidated to restore its c ratio and no more.

			await issue(sETHSynth, oneETH, account2);

			tx = await short.liquidate(account1, id, oneETH, { from: account2 });

			assert.eventEqual(tx, 'LoanPartiallyLiquidated', {
				account: account1,
				id: id,
				liquidator: account2,
				amountLiquidated: expectedLiquidationAmount,
				collateralLiquidated: expectedCollateralLiquidated,
			});

			loan = await short.loans(id);

			assert.bnEqual(loan.amount, expectedLoanRemaining);
			assert.bnEqual(loan.collateral, expectedCollateralRemaining);

			const ratio = await short.collateralRatio(loan);

			assert.bnClose(ratio, await short.minCratio(), '100');
		});
	});

	describe('System debt', async () => {
		const oneETH = toUnit(1);
		const twoETH = toUnit(2);
		const susdCollateral = toUnit(1000);

		it('If there is 1 ETH and 1 short ETH, then the system debt is constant before and after a price change', async () => {
			await issue(sUSDSynth, susdCollateral, account1);

			await debtCache.takeDebtSnapshot();
			let result = await debtCache.cachedDebt();
			assert.bnEqual(result, toUnit(111100));

			tx = await short.open(toUnit(500), oneETH, sETH, { from: account1 });

			id = getid(tx);

			await debtCache.takeDebtSnapshot();
			result = await debtCache.cachedDebt();
			assert.bnEqual(result, toUnit(111100));

			await fastForwardAndUpdateRates(3600);

			const timestamp = await currentTime();
			await exchangeRates.updateRates([sETH], ['150'].map(toUnit), timestamp, {
				from: oracle,
			});

			await debtCache.takeDebtSnapshot();
			result = await debtCache.cachedDebt();
			assert.bnEqual(result, toUnit(111100));

			// simulate buying sETH for 150 susd.
			await sUSDSynth.burn(account1, toUnit(150));
			await issue(sETHSynth, oneETH, account1);

			await debtCache.takeDebtSnapshot();
			result = await debtCache.cachedDebt();
			assert.bnEqual(result, toUnit(111100));

			// now close the short
			await short.close(id, { from: account1 });

			await debtCache.takeDebtSnapshot();
			result = await debtCache.cachedDebt();
			assert.bnEqual(result, toUnit(111100));

			// shorter has made 50 sUSD loss
			assert.bnEqual(await sUSDSynth.balanceOf(account1), toUnit(950));
		});

		it('If there is 1 ETH and 2 short ETH, then the system debt decreases if the price goes up', async () => {
			await issue(sUSDSynth, susdCollateral, account1);

			await debtCache.takeDebtSnapshot();
			let result = await debtCache.cachedDebt();
			assert.bnEqual(result, toUnit(111100));

			tx = await short.open(toUnit(500), twoETH, sETH, { from: account1 });

			id = getid(tx);

			await debtCache.takeDebtSnapshot();
			result = await debtCache.cachedDebt();
			assert.bnEqual(result, toUnit(111100));

			await fastForwardAndUpdateRates(3600);

			const timestamp = await currentTime();
			await exchangeRates.updateRates([sETH], ['150'].map(toUnit), timestamp, {
				from: oracle,
			});

			// 111100 + 50 - (2 * 50) = 111,050

			await debtCache.takeDebtSnapshot();
			result = await debtCache.cachedDebt();
			assert.bnEqual(result, toUnit(111050));

			// simulate buying 2 sETH for 300 susd.
			await sUSDSynth.burn(account1, toUnit(300));
			await issue(sETHSynth, twoETH, account1);

			await debtCache.takeDebtSnapshot();
			result = await debtCache.cachedDebt();
			assert.bnEqual(result, toUnit(111050));

			// now close the short
			await short.close(id, { from: account1 });

			await debtCache.takeDebtSnapshot();
			result = await debtCache.cachedDebt();
			assert.bnEqual(result, toUnit(111050));

			// shorter has made 50 sUSD loss
			assert.bnEqual(await sUSDSynth.balanceOf(account1), toUnit(900));
		});

		it('If there is 1 ETH and 2 short ETH, then the system debt increases if the price goes down', async () => {
			await issue(sUSDSynth, susdCollateral, account1);

			await debtCache.takeDebtSnapshot();
			let result = await debtCache.cachedDebt();
			assert.bnEqual(result, toUnit(111100));

			tx = await short.open(toUnit(500), twoETH, sETH, { from: account1 });

			id = getid(tx);

			await debtCache.takeDebtSnapshot();
			result = await debtCache.cachedDebt();
			assert.bnEqual(result, toUnit(111100));

			await fastForwardAndUpdateRates(3600);

			const timestamp = await currentTime();
			await exchangeRates.updateRates([sETH], ['50'].map(toUnit), timestamp, {
				from: oracle,
			});

			// 111100 - 50 + (2 * 50) = 111,150

			await debtCache.takeDebtSnapshot();
			result = await debtCache.cachedDebt();
			assert.bnEqual(result, toUnit(111150));

			// simulate buying 2 sETH for 100 susd.
			await sUSDSynth.burn(account1, toUnit(100));
			await issue(sETHSynth, twoETH, account1);

			await debtCache.takeDebtSnapshot();
			result = await debtCache.cachedDebt();
			assert.bnEqual(result, toUnit(111150));

			// now close the short
			await short.close(id, { from: account1 });

			await debtCache.takeDebtSnapshot();
			result = await debtCache.cachedDebt();
			assert.bnEqual(result, toUnit(111150));

			// shorter has made 100 sUSD profit
			assert.bnEqual(await sUSDSynth.balanceOf(account1), toUnit(1100));
		});
	});

	describe('Determining the skew and interest rate', async () => {
		it('should correctly determine the interest on a short', async () => {
			const oneBTC = toUnit(1);
			const susdCollateral = toUnit(15000);

			await issue(sUSDSynth, susdCollateral, account1);

			tx = await short.open(susdCollateral, oneBTC, sBTC, { from: account1 });
			id = getid(tx);

			// after a year we should have accrued 33%.

			await fastForwardAndUpdateRates(YEAR);

			// deposit some collateral to trigger the interest accrual.

			tx = await short.deposit(account1, id, toUnit(1), { from: account1 });

			loan = await short.loans(id);

			let interest = Math.round(parseFloat(fromUnit(loan.accruedInterest)) * 10000) / 10000;

			assert.equal(interest, 0.3333);

			await fastForwardAndUpdateRates(3600);

			tx = await short.deposit(account1, id, toUnit(1), { from: account1 });

			// after two years we should have accrued about 66%, give or take the 5 minutes we skipped.

			await fastForwardAndUpdateRates(YEAR);

			// deposit some collateral to trigger the interest accrual.

			tx = await short.deposit(account1, id, toUnit(1), { from: account1 });

			loan = await short.loans(id);

			interest = Math.round(parseFloat(fromUnit(loan.accruedInterest)) * 10000) / 10000;

			assert.equal(interest, 0.6667);
		});
	});
});
