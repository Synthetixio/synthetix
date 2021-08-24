'use strict';

const { contract, web3 } = require('hardhat');

const { assert, addSnapshotBeforeRestoreAfterEach } = require('./common');

const BN = require('bn.js');

const { fastForward, getEthBalance, toUnit, fromUnit, currentTime } = require('../utils')();

const { setupAllContracts } = require('./setup');

const { ensureOnlyExpectedMutativeFunctions, setStatus } = require('./helpers');

const { toBytes32 } = require('../..');

contract('CollateralEth', async accounts => {
	const YEAR = 31556926;
	const INTERACTION_DELAY = 300;

	const sUSD = toBytes32('sUSD');
	const sETH = toBytes32('sETH');

	const oneETH = toUnit(1);
	const twoETH = toUnit(2);
	const fiveETH = toUnit(5);
	const tenETH = toUnit(10);
	const twentyETH = toUnit(20);

	const onesUSD = toUnit(1);
	const tensUSD = toUnit(10);
	const oneHundredsUSD = toUnit(100);
	const fiveHundredsUSD = toUnit(500);

	let tx;
	let loan;
	let id;

	const [, owner, oracle, , account1, account2] = accounts;

	let ceth,
		managerState,
		manager,
		issuer,
		synths,
		feePool,
		exchangeRates,
		addressResolver,
		sUSDSynth,
		sETHSynth,
		systemSettings,
		systemStatus,
		debtCache,
		FEE_ADDRESS;

	const getid = tx => {
		const event = tx.logs.find(log => log.event === 'LoanCreated');
		return event.args.id;
	};

	const issuesUSDToAccount = async (issueAmount, receiver) => {
		// Set up the depositor with an amount of synths to deposit.
		await sUSDSynth.issue(receiver, issueAmount, {
			from: owner,
		});
	};

	const issuesETHToAccount = async (issueAmount, receiver) => {
		await sETHSynth.issue(receiver, issueAmount, { from: owner });
	};

	const setupMultiCollateral = async () => {
		synths = ['sUSD', 'sETH'];
		({
			SystemSettings: systemSettings,
			SystemStatus: systemStatus,
			ExchangeRates: exchangeRates,
			SynthsUSD: sUSDSynth,
			SynthsETH: sETHSynth,
			FeePool: feePool,
			AddressResolver: addressResolver,
			Issuer: issuer,
			DebtCache: debtCache,
			CollateralEth: ceth,
			CollateralManager: manager,
			CollateralManagerState: managerState,
		} = await setupAllContracts({
			accounts,
			synths,
			contracts: [
				'Synthetix',
				'FeePool',
				'AddressResolver',
				'ExchangeRates',
				'Exchanger',
				'SystemStatus',
				'SystemSettings',
				'Issuer',
				'CollateralEth',
				'CollateralUtil',
				'CollateralManager',
				'CollateralManagerState',
				'DebtCache',
			],
		}));

		await managerState.setAssociatedContract(manager.address, { from: owner });

		FEE_ADDRESS = await feePool.FEE_ADDRESS();

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

		await systemSettings.setIssueFeeRate(ceth.address, toUnit('0.001'), { from: owner });
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

	before(async () => {
		await setupMultiCollateral();
	});

	addSnapshotBeforeRestoreAfterEach();

	beforeEach(async () => {
		await updateRatesWithDefaults();

		await issuesUSDToAccount(toUnit(1000), owner);
		await issuesETHToAccount(toUnit(10), owner);

		await debtCache.takeDebtSnapshot();
	});

	it('should set constructor params on deployment', async () => {
		// assert.equal(await ceth.proxy(), account1);
		assert.equal(await ceth.owner(), owner);
		assert.equal(await ceth.resolver(), addressResolver.address);
		assert.equal(await ceth.collateralKey(), sETH);
		assert.equal(await ceth.synths(0), toBytes32('SynthsUSD'));
		assert.equal(await ceth.synths(1), toBytes32('SynthsETH'));
		assert.bnEqual(await ceth.minCratio(), toUnit('1.3'));
		assert.bnEqual(await ceth.minCollateral(), toUnit('2'));
	});

	it('should ensure only expected functions are mutative', async () => {
		ensureOnlyExpectedMutativeFunctions({
			abi: ceth.abi,
			ignoreParents: ['Owned', 'Pausable', 'MixinResolver', 'Proxy', 'Collateral'],
			expected: ['open', 'close', 'deposit', 'repay', 'withdraw', 'liquidate', 'claim', 'draw'],
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

	// PUBLIC VIEW TESTS

	describe('cratio test', async () => {
		describe('sUSD loans', async () => {
			beforeEach(async () => {
				tx = await ceth.open(oneHundredsUSD, sUSD, {
					value: twoETH,
					from: account1,
				});

				id = getid(tx);
			});

			it('when we issue at 200%, our c ratio is 200%', async () => {
				const ratio = await ceth.collateralRatio(id);
				assert.bnEqual(ratio, toUnit(2));
			});

			it('when the price falls by 25% our c ratio is 150%', async () => {
				await exchangeRates.updateRates([sETH], ['75'].map(toUnit), await currentTime(), {
					from: oracle,
				});

				const ratio = await ceth.collateralRatio(id);
				assert.bnEqual(ratio, toUnit(1.5));
			});

			it('when the price increases by 100% our c ratio is 400%', async () => {
				await exchangeRates.updateRates([sETH], ['200'].map(toUnit), await currentTime(), {
					from: oracle,
				});

				const ratio = await ceth.collateralRatio(id);
				assert.bnEqual(ratio, toUnit(4));
			});

			it('when the price falls by 50% our cratio is 100%', async () => {
				await exchangeRates.updateRates([sETH], ['50'].map(toUnit), await currentTime(), {
					from: oracle,
				});

				const ratio = await ceth.collateralRatio(id);
				assert.bnEqual(ratio, toUnit(1));
			});
		});
		describe('sETH loans', async () => {
			beforeEach(async () => {
				tx = await ceth.open(oneETH, sETH, {
					value: twoETH,
					from: account1,
				});

				id = getid(tx);
			});

			it('when we issue at 200%, our c ratio is 200%', async () => {
				const ratio = await ceth.collateralRatio(id);
				assert.bnEqual(ratio, toUnit(2));
			});

			it('price changes should not change the cratio', async () => {
				await exchangeRates.updateRates([sETH], ['75'].map(toUnit), await currentTime(), {
					from: oracle,
				});

				const ratio = await ceth.collateralRatio(id);
				assert.bnEqual(ratio, toUnit(2));
			});
		});
	});

	describe('max loan test', async () => {
		it('should convert correctly', async () => {
			// $260 worth of eth should allow 200 sUSD to be issued.
			const sUSDAmount = await ceth.maxLoan(toUnit('2.6'), sUSD);

			assert.bnClose(sUSDAmount, toUnit('200'), '100');

			// $260 worth of eth should allow $200 (0.02) of sBTC to be issued.
			const sBTCAmount = await ceth.maxLoan(toUnit('2.6'), toBytes32('sBTC'));

			assert.bnEqual(sBTCAmount, toUnit('0.02'));
		});
	});

	// END PUBLIC VIEW TESTS

	// LOAN INTERACTIONS

	describe('opening', async () => {
		describe('potential blocking conditions', async () => {
			['System', 'Issuance'].forEach(section => {
				describe(`when ${section} is suspended`, () => {
					beforeEach(async () => {
						await setStatus({ owner, systemStatus, section, suspend: true });
					});
					it('then calling openLoan() reverts', async () => {
						await assert.revert(
							ceth.open(onesUSD, sUSD, { value: twoETH, from: account1 }),
							'Operation prohibited'
						);
					});
					describe(`when ${section} is resumed`, () => {
						beforeEach(async () => {
							await setStatus({ owner, systemStatus, section, suspend: false });
						});
						it('then calling openLoan() succeeds', async () => {
							await ceth.open(onesUSD, sUSD, {
								value: twoETH,
								from: account1,
							});
						});
					});
				});
			});
			describe('when rates have gone stale', () => {
				beforeEach(async () => {
					await fastForward((await exchangeRates.rateStalePeriod()).add(web3.utils.toBN('300')));
				});
				it('then calling openLoan() reverts', async () => {
					await assert.revert(
						ceth.open(onesUSD, sUSD, { value: twoETH, from: account1 }),
						'Invalid rate'
					);
				});
				describe('when ETH gets a rate', () => {
					beforeEach(async () => {
						await updateRatesWithDefaults();
					});
					it('then calling openLoan() succeeds', async () => {
						await ceth.open(onesUSD, sUSD, { value: twoETH, from: account1 });
					});
				});
			});
		});

		describe('revert conditions', async () => {
			it('should revert if they request a currency that is not supported', async () => {
				await assert.revert(
					ceth.open(onesUSD, toBytes32('sJPY'), { value: twoETH, from: account1 }),
					'Not allowed to issue'
				);
			});

			it('should revert if they send 0 collateral', async () => {
				await assert.revert(
					ceth.open(onesUSD, sUSD, { value: oneETH, from: account1 }),
					'Not enough collateral'
				);
			});

			it('should revert if the requested loan exceeds borrowing power', async () => {
				await assert.revert(
					ceth.open(fiveHundredsUSD, sUSD, { value: twoETH, from: account1 }),
					'Exceed max borrow power'
				);
			});
		});
		describe('should open an eth loan denominated in sUSD', async () => {
			beforeEach(async () => {
				tx = await ceth.open(fiveHundredsUSD, sUSD, {
					value: tenETH,
					from: account1,
				});

				id = getid(tx);

				loan = await ceth.loans(id);
			});

			it('should set the loan correctly', async () => {
				assert.equal(loan.account, account1);
				assert.equal(loan.collateral, tenETH.toString());
				assert.equal(loan.currency, sUSD);
				assert.equal(loan.amount, fiveHundredsUSD.toString());
				assert.bnEqual(loan.accruedInterest, toUnit(0));
			});

			it('should issue the correct amount to the borrower', async () => {
				// 0.001% issue fee rate.
				const expectedBal = toUnit('499.5');

				assert.bnEqual(await sUSDSynth.balanceOf(account1), expectedBal);
			});

			it('should issue the minting fee to the fee pool', async () => {
				const feePoolBalance = await sUSDSynth.balanceOf(FEE_ADDRESS);

				assert.bnEqual(toUnit('0.5'), feePoolBalance);
			});

			it('should emit the event properly', async () => {
				assert.eventEqual(tx, 'LoanCreated', {
					account: account1,
					id: id,
					amount: fiveHundredsUSD,
					collateral: tenETH,
					currency: sUSD,
				});
			});
		});

		describe('should open an eth loan denominated in sETH', async () => {
			beforeEach(async () => {
				tx = await ceth.open(fiveETH, sETH, {
					value: tenETH,
					from: account1,
				});

				id = getid(tx);

				loan = await ceth.loans(id);
			});

			it('should set the loan correctly', async () => {
				assert.equal(loan.account, account1);
				assert.equal(loan.collateral, tenETH.toString());
				assert.equal(loan.currency, sETH);
				assert.equal(loan.amount, fiveETH.toString());
				assert.bnEqual(loan.accruedInterest, toUnit(0));
			});

			it('should issue the correct amount to the borrower', async () => {
				// 0.001% issue fee rate.
				const expectedBal = toUnit('4.995');

				assert.bnEqual(await sETHSynth.balanceOf(account1), expectedBal);
			});

			it('should issue the minting fee to the fee pool', async () => {
				const feePoolBalance = await sUSDSynth.balanceOf(FEE_ADDRESS);
				// usd equivalent of 0.005 ETH @ $100 per ETH.
				assert.bnEqual(toUnit('0.5'), feePoolBalance);
			});

			it('should emit the event properly', async () => {
				assert.eventEqual(tx, 'LoanCreated', {
					account: account1,
					id: id,
					amount: fiveETH,
					collateral: tenETH,
					currency: sETH,
				});
			});
		});
	});

	describe('deposits', async () => {
		beforeEach(async () => {
			tx = await ceth.open(100, sUSD, {
				value: tenETH,
				from: account1,
			});

			id = getid(tx);

			await fastForwardAndUpdateRates(INTERACTION_DELAY);
		});

		describe('potential blocking conditions', async () => {
			['System', 'Issuance'].forEach(section => {
				describe(`when ${section} is suspended`, () => {
					beforeEach(async () => {
						await setStatus({ owner, systemStatus, section, suspend: true });
					});
					it('then calling deposit() reverts', async () => {
						await assert.revert(
							ceth.deposit(account1, id, { value: tenETH, from: account1 }),
							'Operation prohibited'
						);
					});
					describe(`when ${section} is resumed`, () => {
						beforeEach(async () => {
							await setStatus({ owner, systemStatus, section, suspend: false });
						});
						it('then calling deposit() succeeds', async () => {
							await ceth.deposit(account1, id, { value: tenETH, from: account1 });
						});
					});
				});
			});
		});

		describe('revert conditions', async () => {
			it('should revert if they do not send any eth', async () => {
				await assert.revert(
					ceth.deposit(account1, id, { value: 0, from: account1 }),
					'Deposit must be above 0'
				);
			});
		});

		describe('should allow deposits', async () => {
			beforeEach(async () => {
				await ceth.deposit(account1, id, { value: tenETH, from: account1 });
			});

			it('should increase the total collateral of the loan', async () => {
				loan = await ceth.loans(id);

				assert.bnEqual(loan.collateral, twentyETH);
			});
		});
	});

	describe('withdraws', async () => {
		beforeEach(async () => {
			loan = await ceth.open(oneHundredsUSD, sUSD, {
				value: tenETH,
				from: account1,
			});

			id = getid(loan);

			await fastForwardAndUpdateRates(INTERACTION_DELAY);
		});

		describe('potential blocking conditions', async () => {
			['System', 'Issuance'].forEach(section => {
				describe(`when ${section} is suspended`, () => {
					beforeEach(async () => {
						await setStatus({ owner, systemStatus, section, suspend: true });
					});
					it('then calling withdraw() reverts', async () => {
						await assert.revert(
							ceth.withdraw(id, oneETH, { from: account1 }),
							'Operation prohibited'
						);
					});
					describe(`when ${section} is resumed`, () => {
						beforeEach(async () => {
							await setStatus({ owner, systemStatus, section, suspend: false });
						});
						it('then calling withdraw() succeeds', async () => {
							await ceth.withdraw(id, oneETH, { from: account1 });
						});
					});
				});
			});
		});

		describe('revert conditions', async () => {
			it('should revert if the withdraw would put them under minimum collateralisation', async () => {
				const nineETH = toUnit(9);
				await assert.revert(ceth.withdraw(id, nineETH, { from: account1 }), 'Cratio too low');
			});

			it('should revert if they try to withdraw all the collateral', async () => {
				await assert.revert(ceth.withdraw(id, tenETH, { from: account1 }), 'Cratio too low');
			});

			it('should revert if the sender is not borrower', async () => {
				await assert.revert(ceth.withdraw(id, tenETH, { from: account2 }));
			});
		});

		describe('should allow withdraws', async () => {
			beforeEach(async () => {
				await ceth.withdraw(id, oneETH, {
					from: account1,
				});
			});

			it('should decrease the total collateral of the loan', async () => {
				loan = await ceth.loans(id);

				const expectedCollateral = tenETH.sub(oneETH);

				assert.bnEqual(loan.collateral, expectedCollateral);
			});

			it('should create a pending withdraw entry', async () => {
				const withdraw = await ceth.pendingWithdrawals(account1);

				assert.bnEqual(withdraw, oneETH);
			});

			it('should allow the withdrawer to withdraw', async () => {
				const bal = new BN(await getEthBalance(account1));

				await ceth.claim(oneETH, { from: account1 });

				const balAfter = new BN(await getEthBalance(account1));

				assert.bnGt(balAfter, bal);
			});
		});
	});

	describe('repayments', async () => {
		beforeEach(async () => {
			// make a loan here so we have a valid ID to pass to the blockers and reverts.
			tx = await ceth.open(oneHundredsUSD, sUSD, {
				value: tenETH,
				from: account1,
			});

			// to get past fee reclamation and settlement owing.
			await fastForwardAndUpdateRates(INTERACTION_DELAY);

			id = getid(tx);
		});

		describe('potential blocking conditions', async () => {
			['System', 'Issuance'].forEach(section => {
				describe(`when ${section} is suspended`, () => {
					beforeEach(async () => {
						await setStatus({ owner, systemStatus, section, suspend: true });
					});
					it('then calling repay() reverts', async () => {
						await assert.revert(
							ceth.repay(account1, id, onesUSD, { from: account1 }),
							'Operation prohibited'
						);
					});
					describe(`when ${section} is resumed`, () => {
						beforeEach(async () => {
							await setStatus({ owner, systemStatus, section, suspend: false });
						});
						it('then calling repay() succeeds', async () => {
							await ceth.repay(account1, id, onesUSD, { from: account1 });
						});
					});
				});
			});
		});

		describe('revert conditions', async () => {
			it('should revert if they try to repay 0', async () => {
				await assert.revert(
					ceth.repay(account1, id, 0, { from: account1 }),
					'Payment must be above 0'
				);
			});

			// account 2 had no sUSD
			it('should revert if they have no sUSD', async () => {
				await assert.revert(
					ceth.repay(account1, id, tensUSD, { from: account2 }),
					'Not enough balance'
				);
			});

			it('should revert if they try to pay more than the amount owing', async () => {
				await issuesUSDToAccount(toUnit(1000), account1);
				await assert.revert(
					ceth.repay(account1, id, toUnit(1000), { from: account1 }),
					"VM Exception while processing transaction: reverted with reason string 'SafeMath: subtraction overflow'"
				);
			});
		});

		describe('should allow repayments on an sUSD loan', async () => {
			// I'm not testing interest here, just that payment reduces the amounts.
			const expectedString = '90000';

			beforeEach(async () => {
				await issuesUSDToAccount(oneHundredsUSD, account2);
				tx = await ceth.repay(account1, id, tensUSD, { from: account2 });
				loan = await ceth.loans(id);
			});

			it('should work reduce the repayers balance', async () => {
				const expectedBalance = toUnit(90);
				assert.bnEqual(await sUSDSynth.balanceOf(account2), expectedBalance);
			});

			it('should update the loan', async () => {
				assert.equal(loan.amount.toString().substring(0, 5), expectedString);
			});

			it('should emit the event properly', async () => {
				assert.eventEqual(tx, 'LoanRepaymentMade', {
					account: account1,
					repayer: account2,
					id: id,
					amountRepaid: tensUSD,
					amountAfter: loan.amount,
				});
			});
		});

		describe('it should allow repayments on an sETH loan', async () => {
			// I don't want to test interest here. I just want to test repayment.
			const expectedString = '40000';

			beforeEach(async () => {
				tx = await ceth.open(fiveETH, sETH, {
					value: tenETH,
					from: account1,
				});

				await fastForwardAndUpdateRates(INTERACTION_DELAY);

				id = getid(tx);

				await issuesETHToAccount(twoETH, account2);

				tx = await ceth.repay(account1, id, oneETH, { from: account2 });

				loan = await ceth.loans(id);
			});

			it('should work reduce the repayers balance', async () => {
				const expectedBalance = oneETH;

				assert.bnEqual(await sETHSynth.balanceOf(account2), expectedBalance);
			});

			it('should update the loan', async () => {
				assert.equal(loan.amount.toString().substring(0, 5), expectedString);
			});

			it('should emit the event properly', async () => {
				assert.eventEqual(tx, 'LoanRepaymentMade', {
					account: account1,
					repayer: account2,
					id: id,
					amountRepaid: oneETH,
					amountAfter: loan.amount,
				});
			});
		});
	});

	describe('liquidations', async () => {
		let liquidatorEthBalBefore;

		beforeEach(async () => {
			// make a loan here so we have a valid ID to pass to the blockers and reverts.
			loan = await ceth.open(toUnit('200'), sUSD, {
				value: toUnit('2.6'),
				from: account1,
			});

			await fastForwardAndUpdateRates(INTERACTION_DELAY);

			id = getid(loan);
		});

		describe('potential blocking conditions', async () => {
			['System', 'Issuance'].forEach(section => {
				describe(`when ${section} is suspended`, () => {
					beforeEach(async () => {
						await setStatus({ owner, systemStatus, section, suspend: true });
					});
					it('then calling repay() reverts', async () => {
						await assert.revert(
							ceth.liquidate(account1, id, onesUSD, { from: account1 }),
							'Operation prohibited'
						);
					});
					describe(`when ${section} is resumed`, () => {
						beforeEach(async () => {
							await setStatus({ owner, systemStatus, section, suspend: false });
						});
						it('then calling liquidate() succeeds', async () => {
							// fast forward a long time to make sure the loan is underwater.
							await fastForwardAndUpdateRates(10 * YEAR);
							await ceth.liquidate(account1, id, oneETH, { from: account1 });
						});
					});
				});
			});
		});

		describe('revert conditions', async () => {
			it('should revert if they have no sUSD', async () => {
				await assert.revert(
					ceth.liquidate(account1, id, onesUSD, { from: account2 }),
					'Not enough balance'
				);
			});

			it('should revert if they are not under collateralised', async () => {
				await issuesUSDToAccount(toUnit(100), account2);
				await ceth.deposit(account1, id, { value: oneETH, from: account1 });
				await fastForwardAndUpdateRates(INTERACTION_DELAY);

				await assert.revert(
					ceth.liquidate(account1, id, onesUSD, { from: account2 }),
					'Cratio above liq ratio'
				);
			});
		});

		describe('should allow liquidations on an undercollateralised sUSD loan', async () => {
			const liquidatedCollateral = new BN('1588888888888888880');
			let liquidationAmount;

			beforeEach(async () => {
				const timestamp = await currentTime();
				await exchangeRates.updateRates([sETH], ['90'].map(toUnit), timestamp, {
					from: oracle,
				});

				await issuesUSDToAccount(toUnit(1000), account2);

				liquidatorEthBalBefore = new BN(await getEthBalance(account2));

				liquidationAmount = await ceth.liquidationAmount(id);

				tx = await ceth.liquidate(account1, id, liquidationAmount, {
					from: account2,
				});
			});

			it('should emit a liquidation event', async () => {
				assert.eventEqual(tx, 'LoanPartiallyLiquidated', {
					account: account1,
					id: id,
					liquidator: account2,
					amountLiquidated: liquidationAmount,
					collateralLiquidated: liquidatedCollateral,
				});
			});

			it('should reduce the liquidators synth amount', async () => {
				const liquidatorBalance = await sUSDSynth.balanceOf(account2);
				const expectedBalance = toUnit('1000').sub(toUnit('130'));

				assert.bnClose(liquidatorBalance, expectedBalance, '100000000000');
			});

			it('should create a pending withdrawl entry', async () => {
				const withdaw = await ceth.pendingWithdrawals(account2);

				assert.bnEqual(withdaw, liquidatedCollateral);
			});

			it('should pay the interest to the fee pool', async () => {
				const balance = await sUSDSynth.balanceOf(FEE_ADDRESS);

				assert.bnGt(balance, toUnit(0));
			});

			it('should fix the collateralisation ratio of the loan', async () => {
				const ratio = await ceth.collateralRatio(id);

				// the loan is very close 150%, we are in 10^18 land.
				assert.bnClose(ratio, toUnit('1.3'), '10000000000000');
			});

			it('should allow the liquidator to call claim', async () => {
				tx = await ceth.claim(liquidatedCollateral, { from: account2 });

				const bal = new BN(await getEthBalance(account2));

				assert.bnGt(bal, liquidatorEthBalBefore);
			});
		});

		describe('when a loan needs to be completely liquidated', async () => {
			let liquidatorEthBalBefore;

			beforeEach(async () => {
				const timestamp = await currentTime();
				await exchangeRates.updateRates([sETH], ['50'].map(toUnit), timestamp, {
					from: oracle,
				});

				loan = await ceth.loans(id);

				await issuesUSDToAccount(toUnit(1000), account2);

				liquidatorEthBalBefore = new BN(await getEthBalance(account2));

				tx = await ceth.liquidate(account1, id, toUnit(1000), {
					from: account2,
				});
			});

			it('should emit the event', async () => {
				assert.eventEqual(tx, 'LoanClosedByLiquidation', {
					account: account1,
					id: id,
					liquidator: account2,
					amountLiquidated: loan.amount,
					collateralLiquidated: toUnit('2.6'),
				});
			});

			it('should close the loan correctly', async () => {
				loan = await ceth.loans(id);

				assert.equal(loan.amount, 0);
				assert.equal(loan.collateral, 0);
				assert.equal(loan.interestIndex, 0);
			});

			it('should reduce the liquidators synth amount', async () => {
				const liquidatorBalance = await sUSDSynth.balanceOf(account2);
				const expectedBalance = toUnit(1000).sub(toUnit('200'));

				assert.bnClose(liquidatorBalance, expectedBalance, '1000000000000000');
			});

			it('should create a pending withdrawl entry', async () => {
				const withdaw = await ceth.pendingWithdrawals(account2);

				assert.bnEqual(withdaw, toUnit('2.6'));
			});

			it('should reduce the liquidators synth balance', async () => {
				tx = await ceth.claim(twoETH, { from: account2 });

				const bal = new BN(await getEthBalance(account2));

				assert.bnGt(bal, liquidatorEthBalBefore);
			});
		});
	});

	describe('closing', async () => {
		beforeEach(async () => {
			// make a loan here so we have a valid ID to pass to the blockers and reverts.
			loan = await ceth.open(oneHundredsUSD, sUSD, {
				value: twoETH,
				from: account1,
			});
			id = getid(loan);

			await fastForwardAndUpdateRates(INTERACTION_DELAY);
		});

		describe('potential blocking conditions', async () => {
			['System', 'Issuance'].forEach(section => {
				describe(`when ${section} is suspended`, () => {
					beforeEach(async () => {
						await setStatus({ owner, systemStatus, section, suspend: true });
					});
					it('then calling close() reverts', async () => {
						await assert.revert(ceth.close(id, { from: account1 }), 'Operation prohibited');
					});
					describe(`when ${section} is resumed`, () => {
						beforeEach(async () => {
							await setStatus({ owner, systemStatus, section, suspend: false });
						});
						it('then calling close() succeeds', async () => {
							// Give them some more sUSD to make up for the fees.
							await issuesUSDToAccount(tensUSD, account1);
							await ceth.close(id, { from: account1 });
						});
					});
				});
			});
		});

		describe('revert conditions', async () => {
			it('should revert if they have no sUSD', async () => {
				await assert.revert(ceth.close(id, { from: account1 }), 'Not enough balance');
			});

			it('should revert if they are not the borrower', async () => {
				await assert.revert(ceth.close(id, { from: account2 }), 'Must be borrower');
			});
		});

		describe('when it works', async () => {
			beforeEach(async () => {
				// Give them some more sUSD to make up for the fees.
				await issuesUSDToAccount(tensUSD, account1);

				tx = await ceth.close(id, { from: account1 });
			});

			it('should record the loan as closed', async () => {
				loan = await ceth.loans(id);

				assert.equal(loan.amount, 0);
				assert.equal(loan.collateral, 0);
				assert.equal(loan.accruedInterest, 0);
				assert.equal(loan.interestIndex, 0);
			});

			it('should pay the fee pool', async () => {
				const balance = await sUSDSynth.balanceOf(FEE_ADDRESS);

				assert.bnGt(balance, toUnit(0));
			});

			it('should add a pending withdrawl entry', async () => {
				assert.bnEqual(await ceth.pendingWithdrawals(account1), twoETH);
			});

			it('should allow the closer to withdraw', async () => {
				const bal = new BN(await getEthBalance(account1));

				await ceth.claim(oneETH, { from: account1 });

				const balAfter = new BN(await getEthBalance(account1));

				assert.bnGt(balAfter, bal);
			});

			it('should emit the event', async () => {
				assert.eventEqual(tx, 'LoanClosed', {
					account: account1,
					id: id,
				});
			});
		});
	});

	describe('drawing', async () => {
		beforeEach(async () => {
			// make a loan here so we have a valid ID to pass to the blockers and reverts.
			tx = await ceth.open(oneHundredsUSD, sUSD, {
				value: twoETH,
				from: account1,
			});

			id = getid(tx);

			await fastForwardAndUpdateRates(INTERACTION_DELAY);
		});

		describe('potential blocking conditions', async () => {
			['System', 'Issuance'].forEach(section => {
				describe(`when ${section} is suspended`, () => {
					beforeEach(async () => {
						await setStatus({ owner, systemStatus, section, suspend: true });
					});
					it('then calling draw() reverts', async () => {
						await assert.revert(ceth.draw(id, onesUSD, { from: account1 }), 'Operation prohibited');
					});
					describe(`when ${section} is resumed`, () => {
						beforeEach(async () => {
							await setStatus({ owner, systemStatus, section, suspend: false });
						});
						it('then calling draw() succeeds', async () => {
							await ceth.draw(id, onesUSD, {
								from: account1,
							});
						});
					});
				});
			});
			describe('when rates have gone stale', () => {
				beforeEach(async () => {
					await fastForward((await exchangeRates.rateStalePeriod()).add(web3.utils.toBN('300')));
				});
				it('then calling draw() reverts', async () => {
					await assert.revert(ceth.draw(id, onesUSD, { from: account1 }), 'Invalid rate');
				});
				describe('when ETH gets a rate', () => {
					beforeEach(async () => {
						await updateRatesWithDefaults();
					});
					it('then calling draw() succeeds', async () => {
						await ceth.draw(id, onesUSD, { from: account1 });
					});
				});
			});
		});

		describe('revert conditions', async () => {
			it('should revert if the draw would under collateralise the loan', async () => {
				await assert.revert(ceth.draw(id, oneHundredsUSD, { from: account1 }), 'Cratio too low');
			});
		});

		describe('should draw the loan down', async () => {
			beforeEach(async () => {
				tx = await ceth.draw(id, toUnit(30), { from: account1 });

				loan = await ceth.loans(id);
			});

			it('should update the amount on the loan', async () => {
				assert.equal(loan.amount, toUnit(130).toString());
			});
		});
	});

	describe('Accrue Interest', async () => {
		beforeEach(async () => {
			// 0.005% / 31556926 (seconds in common year)
			await manager.setBaseBorrowRate(158443823, { from: owner });
		});

		it('should correctly determine the interest on loans', async () => {
			tx = await ceth.open(oneHundredsUSD, sUSD, {
				value: twoETH,
				from: account1,
			});

			id = getid(tx);

			// after a year we should have accrued about 0.005% + (100/2100) = 0.05261904762

			await fastForwardAndUpdateRates(YEAR);

			// deposit some eth to trigger the interest accrual.

			tx = await ceth.deposit(account1, id, { from: account1, value: oneETH });

			loan = await ceth.loans(id);

			let interest = Math.round(parseFloat(fromUnit(loan.accruedInterest)) * 10000) / 10000;

			assert.equal(interest, 5.2619);

			tx = await ceth.open(oneHundredsUSD, sUSD, {
				value: twoETH,
				from: account1,
			});

			const id2 = getid(tx);

			// after a year we should have accrued about 0.005% + (200/2200) = 0.09590909091

			await fastForwardAndUpdateRates(YEAR);

			tx = await ceth.deposit(account1, id2, { from: account1, value: oneETH });

			loan = await ceth.loans(id2);

			interest = Math.round(parseFloat(fromUnit(loan.accruedInterest)) * 10000) / 10000;

			assert.equal(interest, 9.5909);

			// after two years we should have accrued (this math is rough)
			// 0.005% + (100/2100) = 0.05261904762 +
			// 0.005% + (200/2200) = 0.09590909091 +
			//                     = 0.1485281385

			tx = await ceth.deposit(account1, id, { from: account1, value: oneETH });

			loan = await ceth.loans(id);

			interest = Math.round(parseFloat(fromUnit(loan.accruedInterest)) * 10000) / 10000;

			assert.equal(interest, 14.8528);
		});
	});
});
