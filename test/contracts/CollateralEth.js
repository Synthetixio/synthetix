'use strict';

const { artifacts, contract, web3 } = require('@nomiclabs/buidler');

const { assert, addSnapshotBeforeRestoreAfterEach } = require('./common');

const BN = require('bn.js');

const {
	fastForward,
	getEthBalance,
	toUnit,
	fromUnit,
	toUnitFromBN,
	multiplyDecimal,
	currentTime,
} = require('../utils')();

const { mockGenericContractFnc, mockToken, setupAllContracts, setupContract } = require('./setup');

const {
	issueSynthsToUser,
	ensureOnlyExpectedMutativeFunctions,
	onlyGivenAddressCanInvoke,
	setStatus,
} = require('./helpers');

const {
	toBytes32,
	constants: { ZERO_ADDRESS },
} = require('../..');

const CollateralManager = artifacts.require(`CollateralManager`);
const CollateralState = artifacts.require(`CollateralState`);
const CollateralManagerState = artifacts.require('CollateralManagerState');

contract('CollateralEth', async accounts => {
	const MINUTE = 60;
	const DAY = 86400;
	const WEEK = 604800;
	const MONTH = 2629743;
	const YEAR = 31556926; // 31556926

	const sUSD = toBytes32('sUSD');
	const sETH = toBytes32('sETH');
	const sBTC = toBytes32('sBTC');

	const [ETH] = ['sETH'].map(toBytes32);

	const oneETH = toUnit(1);
	const twoETH = toUnit(2);
	const fiveETH = toUnit(5);
	const tenETH = toUnit(10);
	const twentyETH = toUnit(20);

	const onesUSD = toUnit(1);
	const twosUSD = toUnit(2);
	const fivesUSD = toUnit(5);
	const tensUSD = toUnit(10);
	const oneHundredsUSD = toUnit(100);

	let tx;
	let loan;
	let id;

	const [deployerAccount, owner, oracle, , account1, account2] = accounts;

	let ceth,
		state,
		managerState,
		manager,
		issuer,
		synths,
		synthetix,
		feePool,
		exchangeRates,
		addressResolver,
		sUSDSynth,
		sETHSynth,
		systemStatus,
		debtCache,
		FEE_ADDRESS;

	const getid = async tx => {
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

	const deployCollateral = async ({
		proxy,
		state,
		owner,
		manager,
		resolver,
		collatKey,
		synths,
		minColat,
		intRate,
		liqPen,
	}) => {
		return setupContract({
			accounts,
			contract: 'CollateralEth',
			args: [proxy, state, owner, manager, resolver, collatKey, synths, minColat, intRate, liqPen],
		});
	};

	const setupMultiCollateral = async () => {
		synths = ['sUSD', 'sETH'];
		({
			Synthetix: synthetix,
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
				'Synthetix',
				'FeePool',
				'AddressResolver',
				'ExchangeRates',
				'SystemStatus',
				'Issuer',
				'DebtCache',
			],
		}));

		managerState = await CollateralManagerState.new(owner, ZERO_ADDRESS, { from: deployerAccount });

		manager = await CollateralManager.new(managerState.address, owner, addressResolver.address, {
			from: deployerAccount,
		});

		await managerState.setAssociatedContract(manager.address, { from: owner });

		FEE_ADDRESS = await feePool.FEE_ADDRESS();
		// mintingFee = await multiCollateralEth.issueFeeRate();

		state = await CollateralState.new(owner, ZERO_ADDRESS, { from: deployerAccount });

		ceth = await deployCollateral({
			proxy: ZERO_ADDRESS,
			state: state.address,
			owner: owner,
			manager: manager.address,
			resolver: addressResolver.address,
			collatKey: sETH,
			synths: [toBytes32('SynthsUSD'), toBytes32('SynthsETH')],
			minColat: toUnit(1.5),
			// 5% / 31536000 (seconds in common year)
			intRate: 1585489599,
			liqPen: toUnit(0.1),
		});

		await addressResolver.importAddresses(
			[toBytes32('CollateralEth'), toBytes32('CollateralManager')],
			[ceth.address, manager.address],
			{
				from: owner,
			}
		);

		await state.addCurrency(sUSD, { from: owner });
		await state.addCurrency(sETH, { from: owner });
		await state.setAssociatedContract(ceth.address, { from: owner });

		await ceth.setResolverAndSyncCache(addressResolver.address, { from: owner });
		await feePool.setResolverAndSyncCache(addressResolver.address, { from: owner });
		await manager.setResolverAndSyncCache(addressResolver.address, { from: owner });
		await issuer.setResolverAndSyncCache(addressResolver.address, { from: owner });
		await debtCache.setResolverAndSyncCache(addressResolver.address, { from: owner });

		await manager.addCollateral(ceth.address, { from: owner });

		await manager.addSynth(sUSDSynth.address, { from: owner });
		await manager.addSynth(sETHSynth.address, { from: owner });
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
		assert.equal(await ceth.state(), state.address);
		assert.equal(await ceth.owner(), owner);
		assert.equal(await ceth.resolver(), addressResolver.address);
		assert.equal(await ceth.collateralKey(), sETH);
		assert.equal(await ceth.synths(sUSD), toBytes32('SynthsUSD'));
		assert.equal(await ceth.synths(sETH), toBytes32('SynthsETH'));
		assert.bnEqual(await ceth.minimumCollateralisation(), toUnit(1.5));
		assert.bnEqual(await ceth.baseInterestRate(), 1585489599);
		assert.bnEqual(await ceth.liquidationPenalty(), toUnit(0.1));
		// assert.bnEqual(await ceth.debtCeiling(), 0);
	});

	it('should ensure only expected functions are mutative', async () => {
		ensureOnlyExpectedMutativeFunctions({
			abi: ceth.abi,
			ignoreParents: ['Owned', 'Pausable', 'MixinResolver', 'Proxy', 'Collateral'],
			expected: ['open', 'close', 'deposit', 'repay', 'withdraw', 'liquidate', 'claim'],
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
		beforeEach(async () => {
			tx = await ceth.open(oneHundredsUSD, sUSD, {
				value: twoETH,
				from: account1,
			});

			id = await getid(tx);
			loan = await state.getLoan(account1, id);
		});

		it('when we issue at 200%, our c ratio is 200%', async () => {
			const ratio = await ceth.collateralRatio(loan);
			assert.bnEqual(ratio, toUnit(2));
		});

		it('when the price falls by 25% our c ratio is 150%', async () => {
			await exchangeRates.updateRates([sETH], ['75'].map(toUnit), await currentTime(), {
				from: oracle,
			});

			const ratio = await ceth.collateralRatio(loan);
			assert.bnEqual(ratio, toUnit(1.5));
		});

		it('when the price increases by 100% our c ratio is 400%', async () => {
			await exchangeRates.updateRates([sETH], ['200'].map(toUnit), await currentTime(), {
				from: oracle,
			});

			const ratio = await ceth.collateralRatio(loan);
			assert.bnEqual(ratio, toUnit(4));
		});

		it('when the price falls by 50% our cratio is 100%', async () => {
			await exchangeRates.updateRates([sETH], ['50'].map(toUnit), await currentTime(), {
				from: oracle,
			});

			const ratio = await ceth.collateralRatio(loan);
			assert.bnEqual(ratio, toUnit(1));
		});
	});

	describe('issuance ratio test', async () => {
		it('should work', async () => {
			const ratio = await ceth.issuanceRatio();
		});
	});

	describe('max loan test', async () => {
		it('should convert correctly', async () => {
			// $150 worth of eth should allow 100 sUSD to be issued.
			const sUSDAmount = await ceth.maxLoan(toUnit(1.5), sUSD);

			assert.bnClose(sUSDAmount, toUnit(100), 100);

			// $150 worth of eth should allow $100 (0.01) of sBTC to be issued.
			const sBTCAmount = await ceth.maxLoan(toUnit(1.5), toBytes32('sBTC'));

			assert.bnEqual(sBTCAmount, toUnit(0.01));
		});
	});

	describe('liquidation amount test', async () => {
		let amountToLiquidate;

		/**
		 * r = target issuance ratio
		 * D = debt balance in sUSD
		 * V = Collateral VALUE in sUSD
		 * P = liquidation penalty
		 * Calculates amount of sUSD = (D - V * r) / (1 - (1 + P) * r)
		 *
		 * To go back to another synth, remember to do effective value
		 */

		beforeEach(async () => {
			tx = await ceth.open(oneHundredsUSD, sUSD, {
				value: twoETH,
				from: account1,
			});

			id = await getid(tx);
			loan = await state.getLoan(account1, id);
		});

		it('when we start at 200%, we can take a 25% reduction in collateral prices', async () => {
			await exchangeRates.updateRates([sETH], ['75'].map(toUnit), await currentTime(), {
				from: oracle,
			});

			amountToLiquidate = await ceth.liquidationAmount(loan);

			assert.bnEqual(amountToLiquidate, toUnit(0));
		});

		it('when we start at 200%, a price shock of 30% in the collateral requires 25% of the loan to be liquidated', async () => {
			await exchangeRates.updateRates([sETH], ['70'].map(toUnit), await currentTime(), {
				from: oracle,
			});

			amountToLiquidate = await ceth.liquidationAmount(loan);

			assert.bnClose(amountToLiquidate, toUnit(25), '100');
		});

		it('when we start at 200%, a price shock of 40% in the collateral requires 75% of the loan to be liquidated', async () => {
			await exchangeRates.updateRates([sETH], ['60'].map(toUnit), await currentTime(), {
				from: oracle,
			});

			amountToLiquidate = await ceth.liquidationAmount(loan);

			assert.bnClose(amountToLiquidate, toUnit(75), '100');
		});

		it('when we start at 200%, a price shock of 55% in the collateral requires 100% of the loan to be liquidated', async () => {
			await exchangeRates.updateRates([sETH], ['55'].map(toUnit), await currentTime(), {
				from: oracle,
			});

			amountToLiquidate = await ceth.liquidationAmount(loan);

			assert.bnClose(amountToLiquidate, toUnit(100), '1000');
		});

		it('when we start at 150%, a 25% reduction in collateral requires', async () => {
			tx = await ceth.open(oneHundredsUSD, sUSD, {
				value: toUnit(1.5),
				from: account1,
			});

			id = await getid(tx);

			await exchangeRates.updateRates([sETH], ['75'].map(toUnit), await currentTime(), {
				from: oracle,
			});

			loan = await state.getLoan(account1, id);

			amountToLiquidate = await ceth.liquidationAmount(loan);

			assert.bnClose(amountToLiquidate, toUnit(93.749999999999999882), 1000);
		});

		it('when we start at 150%, any reduction in collateral will make the position undercollateralised ', async () => {
			tx = await ceth.open(oneHundredsUSD, sUSD, {
				value: toUnit(1.5),
				from: account1,
			});

			id = await getid(tx);
			loan = await state.getLoan(account1, id);

			await exchangeRates.updateRates([sETH], ['90'].map(toUnit), await currentTime(), {
				from: oracle,
			});

			amountToLiquidate = await ceth.liquidationAmount(loan);

			assert.bnClose(amountToLiquidate, toUnit(37.499999999999999953), 1000);
		});
	});

	describe('collateral redeemed test', async () => {
		let collateralRedeemed;

		it('when ETH is @ $100 and we are liquidating 10 sUSD, then redeem 0.11 ETH', async () => {
			collateralRedeemed = await ceth.collateralRedeemed(sUSD, tensUSD);

			assert.bnEqual(collateralRedeemed, toUnit(0.11));
		});

		it('when ETH is @ $200 and we are liquidating 10 sUSD, then redeem 0.055 ETH', async () => {
			await exchangeRates.updateRates([sETH], ['200'].map(toUnit), await currentTime(), {
				from: oracle,
			});

			collateralRedeemed = await ceth.collateralRedeemed(sUSD, tensUSD);

			assert.bnEqual(collateralRedeemed, toUnit(0.055));
		});

		it('when ETH is @ $70 and we are liquidating 25 sUSD, then redeem 0.36666 ETH', async () => {
			await exchangeRates.updateRates([sETH], ['70'].map(toUnit), await currentTime(), {
				from: oracle,
			});

			collateralRedeemed = await ceth.collateralRedeemed(sUSD, toUnit(25));

			assert.bnClose(collateralRedeemed, toUnit(0.392857142857142857), '100');
		});

		it('regardless of eth price, we liquidate 1.1 * amount when doing sETH', async () => {
			collateralRedeemed = await ceth.collateralRedeemed(sETH, oneETH);

			assert.bnEqual(collateralRedeemed, toUnit(1.1));

			await exchangeRates.updateRates([sETH], ['1000'].map(toUnit), await currentTime(), {
				from: oracle,
			});

			collateralRedeemed = await ceth.collateralRedeemed(sETH, oneETH);

			assert.bnEqual(collateralRedeemed, toUnit(1.1));
		});
	});

	// END PUBLIC VIEW TESTS

	// SETTER TESTS

	describe('setting variables', async () => {
		describe('setMinimumCollateralisation', async () => {
			describe('revert condtions', async () => {
				it('should fail if not called by the owner', async () => {
					await assert.revert(
						ceth.setMinimumCollateralisation(toUnit(1), { from: account1 }),
						'Only the contract owner may perform this action'
					);
				});
				it('should fail if the minimum is less than 1', async () => {
					await assert.revert(
						ceth.setMinimumCollateralisation(toUnit(0.99), { from: owner }),
						'Minimum collateralisation must be greater than 1'
					);
				});
			});
			describe('when it succeeds', async () => {
				beforeEach(async () => {
					await ceth.setMinimumCollateralisation(toUnit(2), { from: owner });
				});
				it('should update the minimum collateralisation', async () => {
					assert.bnEqual(await ceth.minimumCollateralisation(), toUnit(2));
				});
			});
		});

		describe('setBaseInterestRate', async () => {
			describe('revert condtions', async () => {
				it('should fail if not called by the owner', async () => {
					await assert.revert(
						ceth.setBaseInterestRate(toUnit(1), { from: account1 }),
						'Only the contract owner may perform this action'
					);
				});
			});
			describe('when it succeeds', async () => {
				beforeEach(async () => {
					await ceth.setBaseInterestRate(toUnit(2), { from: owner });
				});
				it('should update the base interest rate', async () => {
					assert.bnEqual(await ceth.baseInterestRate(), toUnit(2));
				});
			});
		});

		describe('setLiquidationPenalty', async () => {
			it('should fail if not called by the owner', async () => {
				await assert.revert(
					ceth.setLiquidationPenalty(toUnit(1), { from: account1 }),
					'Only the contract owner may perform this action'
				);
			});
			describe('when it succeeds', async () => {
				beforeEach(async () => {
					await ceth.setLiquidationPenalty(toUnit(0.2), { from: owner });
				});
				it(' should update the liquidation penalty', async () => {
					assert.bnEqual(await ceth.liquidationPenalty(), toUnit(0.2));
				});
			});
		});

		describe('setManager', async () => {
			it('should fail if not called by the owner', async () => {
				await assert.revert(
					ceth.setManager(ZERO_ADDRESS, { from: account1 }),
					'Only the contract owner may perform this action'
				);
			});
		});
	});

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
							ceth.open(onesUSD, sUSD, { value: oneETH, from: account1 }),
							'Operation prohibited'
						);
					});
					describe(`when ${section} is resumed`, () => {
						beforeEach(async () => {
							await setStatus({ owner, systemStatus, section, suspend: false });
						});
						it('then calling openLoan() succeeds', async () => {
							await ceth.open(onesUSD, sUSD, {
								value: oneETH,
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
						ceth.open(onesUSD, sUSD, { value: oneETH, from: account1 }),
						'Blocked as collateral rate is invalid'
					);
				});
				describe('when ETH gets a rate', () => {
					beforeEach(async () => {
						await updateRatesWithDefaults();
					});
					it('then calling openLoan() succeeds', async () => {
						await ceth.open(onesUSD, sUSD, { value: oneETH, from: account1 });
					});
				});
			});
		});

		describe('revert conditions', async () => {
			it('should revert if they request a currency that is not supported', async () => {
				await assert.revert(
					ceth.open(onesUSD, toBytes32('sJPY'), { value: oneETH, from: account1 }),
					'Not allowed to issue this synth'
				);
			});

			it('should revert if they send 0 collateral', async () => {
				await assert.revert(
					ceth.open(onesUSD, sUSD, { value: toUnit(0), from: account1 }),
					'Not enough collateral to create a loan'
				);
			});

			it('should revert if the requested loan exceeds borrowing power', async () => {
				await assert.revert(
					ceth.open(oneHundredsUSD, sUSD, { value: toUnit(1), from: account1 }),
					'Loan amount exceeds max borrowing power'
				);
			});
		});

		describe('should open an eth loan denominated in sUSD', async () => {
			const fiveHundredSUSD = toUnit(500);
			let issueFeeRate;
			let issueFee;

			beforeEach(async () => {
				tx = await ceth.open(fiveHundredSUSD, sUSD, {
					value: tenETH,
					from: account1,
				});

				id = await getid(tx);

				loan = await state.getLoan(account1, id);

				issueFeeRate = await ceth.issueFeeRate();
				issueFee = fiveHundredSUSD.mul(issueFeeRate);
			});

			it('should set the loan correctly', async () => {
				assert.equal(loan.account, account1);
				assert.equal(loan.collateral, tenETH.toString());
				assert.equal(loan.currency, sUSD);
				assert.equal(loan.amount, fiveHundredSUSD.toString());
				assert.equal(loan.accruedInterest, toUnit(0));
			});

			it('should issue the correct amount to the borrower', async () => {
				const expectedBal = fiveHundredSUSD.sub(issueFee);

				assert.bnEqual(await sUSDSynth.balanceOf(account1), expectedBal);
			});

			it('should issue the minting fee to the fee pool', async () => {
				const feePoolBalance = await sUSDSynth.balanceOf(FEE_ADDRESS);

				assert.equal(issueFee, feePoolBalance.toString());
			});

			it('should emit the event properly', async () => {
				assert.eventEqual(tx, 'LoanCreated', {
					account: account1,
					id: id,
					amount: fiveHundredSUSD,
					collateral: tenETH,
					currency: sUSD,
				});
			});
		});

		describe('should open an eth loan denominated in sETH', async () => {
			let issueFeeRate;
			let issueFee;

			beforeEach(async () => {
				tx = await ceth.open(fiveETH, sETH, {
					value: tenETH,
					from: account1,
				});

				id = await getid(tx);

				loan = await state.getLoan(account1, id);

				issueFeeRate = await ceth.issueFeeRate();
				issueFee = fiveETH.mul(issueFeeRate);
			});

			it('should set the loan correctly', async () => {
				assert.equal(loan.account, account1);
				assert.equal(loan.collateral, tenETH.toString());
				assert.equal(loan.currency, sETH);
				assert.equal(loan.amount, fiveETH.toString());
				assert.equal(loan.accruedInterest, toUnit(0));
			});

			it('should issue the correct amount to the borrower', async () => {
				const expecetdBalance = fiveETH.sub(issueFee);

				assert.bnEqual(await sETHSynth.balanceOf(account1), expecetdBalance);
			});

			xit('should issue the minting fee to the fee pool', async () => {
				const feePoolBalance = await sUSDSynth.balanceOf(FEE_ADDRESS);

				const expecetdBalance = toUnit(2.5);

				assert.equal(expecetdBalance, feePoolBalance.toString());
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

			id = await getid(tx);
		});

		describe('potential blocking conditions', async () => {
			['System', 'Issuance'].forEach(section => {
				describe(`when ${section} is suspended`, () => {
					beforeEach(async () => {
						await setStatus({ owner, systemStatus, section, suspend: true });
					});
					it('then calling depopsit() reverts', async () => {
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
					'Deposit must be greater than 0'
				);
			});
		});

		describe('should allow deposits', async () => {
			beforeEach(async () => {
				await ceth.deposit(account1, id, { value: tenETH, from: account1 });
			});

			it('should increase the total collateral of the loan', async () => {
				loan = await state.getLoan(account1, id);

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

			id = await getid(loan);
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
			it('should revert if they try to withdraw 0', async () => {
				await assert.revert(
					ceth.withdraw(id, 0, { from: account1 }),
					'Amount to withdraw must be greater than 0'
				);
			});

			it('should revert if the withdraw would put them under minimum collateralisation', async () => {
				const nineETH = toUnit(9);
				await assert.revert(
					ceth.withdraw(id, nineETH, { from: account1 }),
					'Collateral ratio below liquidation after withdraw'
				);
			});

			it('should revert if they try to withdraw all the collateral', async () => {
				await assert.revert(
					ceth.withdraw(id, tenETH, { from: account1 }),
					'Request exceeds total collateral'
				);
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
				loan = await state.getLoan(account1, id);

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

			id = await getid(tx);
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
					'Payment must be greater than 0'
				);
			});

			// account 2 had no sUSD
			it('should revert if they have no sUSD', async () => {
				await assert.revert(
					ceth.repay(account1, id, tensUSD, { from: account2 }),
					'Not enough synth balance'
				);
			});

			it('should revert if they try to pay more than the amount owing', async () => {
				await issuesUSDToAccount(toUnit(1000), account1);
				await assert.revert(
					ceth.repay(account1, id, toUnit(1000), { from: account1 }),
					'Repayment would close loan. If you are the borrower then call close loan'
				);
			});
		});

		describe('should allow repayments on an sUSD loan', async () => {
			const expected = new BN('90000000618895678000');

			// I don't want to test interest here. I just want to test repayment.
			beforeEach(async () => {
				await issuesUSDToAccount(oneHundredsUSD, account2);
				tx = await ceth.repay(account1, id, tensUSD, { from: account2 });
			});

			it('should work reduce the repayers balance', async () => {
				const expectedBalance = toUnit(90);
				assert.bnEqual(await sUSDSynth.balanceOf(account2), expectedBalance);
			});

			it('should update the loan', async () => {
				loan = await state.getLoan(account1, id);

				assert.equal(loan.amount, expected);
			});

			it('should emit the event properly', async () => {
				assert.eventEqual(tx, 'LoanRepaymentMade', {
					account: account1,
					repayer: account2,
					id: id,
					amountRepaid: tensUSD,
					amountAfter: expected,
				});
			});
		});

		describe('it should allow repayments on an sETH loan', async () => {
			const expected = new BN('4000000088982814330');

			beforeEach(async () => {
				tx = await ceth.open(fiveETH, sETH, {
					value: tenETH,
					from: account1,
				});

				id = await getid(tx);

				loan = await state.getLoan(account1, id);

				await issuesETHToAccount(twoETH, account2);

				tx = await ceth.repay(account1, id, oneETH, { from: account2 });
			});

			it('should work reduce the repayers balance', async () => {
				const expectedBalance = oneETH;

				assert.bnEqual(await sETHSynth.balanceOf(account2), expectedBalance);
			});

			it('should update the loan', async () => {
				loan = await state.getLoan(account1, id);

				assert.equal(loan.amount, expected);
			});

			it('should emit the event properly', async () => {
				assert.eventEqual(tx, 'LoanRepaymentMade', {
					account: account1,
					repayer: account2,
					id: id,
					amountRepaid: oneETH,
					amountAfter: expected,
				});
			});
		});
	});

	describe('liquidations', async () => {
		beforeEach(async () => {
			// make a loan here so we have a valid ID to pass to the blockers and reverts.
			loan = await ceth.open(oneHundredsUSD, sUSD, {
				value: twoETH,
				from: account1,
			});
			id = await getid(loan);
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
					'Not enough synth balance'
				);
			});

			it('should revert if they are not under collateralised', async () => {
				await issuesUSDToAccount(toUnit(100), account2);

				await assert.revert(
					ceth.liquidate(account1, id, onesUSD, { from: account2 }),
					'Collateral ratio above liquidation ratio'
				);
			});
		});

		describe('should allow liquidations on an undercollateralised sUSD loan', async () => {
			const liquidatedCollateral = new BN('392857142857142856');
			let liquidationAmount;

			beforeEach(async () => {
				const timestamp = await currentTime();
				await exchangeRates.updateRates([sETH], ['70'].map(toUnit), timestamp, {
					from: oracle,
				});

				await issuesUSDToAccount(toUnit(1000), account2);

				loan = await state.getLoan(account1, id);

				liquidationAmount = await ceth.liquidationAmount(loan);

				tx = await ceth.liquidate(account1, id, liquidationAmount, {
					from: account2,
				});
			});

			it('should update the loan correctly', async () => {
				loan = await state.getLoan(account1, id);

				const expectedAmount = toUnit(loan.amount).sub(liquidationAmount);

				// assert.bnClose(loan.amount, expectedAmount, 100);
				// assert.bnEqual(loan.collateral, remainingCollateral);
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

			it('should reduce the liquicators synth amount', async () => {
				const liquidatorBalance = await sUSDSynth.balanceOf(account2);
				const expectedBalance = toUnit(1000).sub(liquidationAmount);

				assert.bnEqual(liquidatorBalance, expectedBalance);
			});

			it('should create a pending withdrawl entry', async () => {
				const withdaw = await ceth.pendingWithdrawals(account2);

				assert.bnEqual(withdaw, liquidatedCollateral);
			});

			it('should pay the interest to the fee pool', async () => {
				const balance = await sUSDSynth.balanceOf(FEE_ADDRESS);

				assert.bnGt(balance, toUnit(0));
			});

			xit('should fix the collateralisation ratio of the loan', async () => {
				loan = await state.getLoan(account1, id);

				const ratio = await ceth.collateralRatio(loan);

				assert.bnGte(ratio, toUnit(1.5));
			});
		});

		describe('when a loan needs to be completely liquidated', async () => {
			let liquidatorEthBalBefore;

			beforeEach(async () => {
				const timestamp = await currentTime();
				await exchangeRates.updateRates([sETH], ['50'].map(toUnit), timestamp, {
					from: oracle,
				});

				loan = await state.getLoan(account1, id);

				await issuesUSDToAccount(toUnit(1000), account2);

				liquidatorEthBalBefore = parseFloat(fromUnit(await getEthBalance(account2)));
				const liquidatorsUSDBalBefore = await sUSDSynth.balanceOf(account2);

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
					collateralLiquidated: twoETH,
				});
			});

			it('should close the loan correctly', async () => {
				loan = await state.getLoan(account1, id);

				assert.equal(loan.amount, 0);
				assert.equal(loan.collateral, 0);
				assert.equal(loan.interestIndex, 0);
			});

			it('should create a pending withdrawl entry', async () => {
				const withdaw = await ceth.pendingWithdrawals(account2);

				assert.bnEqual(withdaw, twoETH);
			});

			it('should reduce the liquidators synth balance', async () => {
				// const liquidatorsUSDBalAfter = await sUSDSynth.balanceOf(account2);
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
			id = await getid(loan);
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
				await assert.revert(ceth.close(id, { from: account1 }), 'Not enough synth balance');
			});

			it('should revert if they are not the borrower', async () => {
				await assert.revert(ceth.close(id, { from: account2 }), 'Loan does not exist');
			});
		});

		describe('when it works', async () => {
			beforeEach(async () => {
				// Give them some more sUSD to make up for the fees.
				await issuesUSDToAccount(tensUSD, account1);

				tx = await ceth.close(id, { from: account1 });
			});

			it('should record the loan as closed', async () => {
				loan = await state.getLoan(account1, id);

				assert.equal(loan.amount, 0);
				assert.equal(loan.collateral, 0);
				assert.equal(loan.accruedInterest, 0);
				assert.equal(loan.interestIndex, 0);
			});

			it('should pay the fee pool', async () => {
				const balance = await sUSDSynth.balanceOf(FEE_ADDRESS);

				assert.bnGt(balance, toUnit(0));
			});

			it('should transfer the collateral back to the borrower', async () => {
				// assert.closeTo(liquidatorEthBalBefore, liquidatorEthBalAfter);
			});

			it('should emit the event', async () => {
				assert.eventEqual(tx, 'LoanClosed', {
					account: account1,
					id: id,
				});
			});
		});
	});

	describe('Accrue Interest', async () => {
		xit('should work', async () => {
			tx = await ceth.open(oneHundredsUSD, sUSD, {
				value: twoETH,
				from: account1,
			});

			id = await getid(tx);

			let rates = await state.getRates(sUSD);

			await fastForwardAndUpdateRates(YEAR);

			// should have accrued about 5% after 1 year when he comes to repay.

			tx = await ceth.repay(account1, id, tensUSD, { from: account1 });

			// so the balance remaining on the loan should be around $95.

			tx = await ceth.open(oneETH, sETH, {
				value: twoETH,
				from: account1,
			});

			rates = await state.getRates(sUSD);

			loan = await state.getLoan(account1, id);

			// assert.bnClose(loan.amount, expected, '197955359900');

			await fastForward(YEAR);

			tx = await ceth.repay(account1, id, tensUSD, { from: account1 });
		});

		it('should work', async () => {
			tx = await ceth.open(oneHundredsUSD, sUSD, {
				value: twoETH,
				from: account1,
			});

			id = await getid(tx);

			tx = await ceth.open(twoETH, sETH, {
				value: fiveETH,
				from: account1,
			});

			const id2 = await getid(tx);

			await fastForwardAndUpdateRates(YEAR);

			tx = await ceth.deposit(account1, id, { from: account1, value: oneETH });
			tx = await ceth.deposit(account1, id2, { from: account1, value: oneETH });

			const rates = await state.getRates(sUSD);
			const rates2 = await state.getRates(sETH);
		});
	});
});
