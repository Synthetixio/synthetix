'use strict';

const { artifacts, contract, web3 } = require('@nomiclabs/buidler');

const { assert, addSnapshotBeforeRestoreAfterEach } = require('./common');

const MultiCollateralEth = artifacts.require('MultiCollateralEth');

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

contract('MultiCollateralEth', async accounts => {
	const MINUTE = 60;
	const DAY = 86400;
	const WEEK = 604800;
	const MONTH = 2629743;
	const YEAR = 31536000;

	const sUSD = toBytes32('sUSD');
	const sETH = toBytes32('sETH');

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

	let mceth,
		mcstate,
		synthetix,
		feePool,
		exchangeRates,
		addressResolver,
		sUSDSynth,
		sETHSynth,
		sBTCSynth,
		systemStatus,
		mintingFee,
		FEE_ADDRESS;

	const getid = async tx => {
		const event = tx.logs.find(log => log.event === 'LoanCreated');
		return event.args.id;
	};

	const issuesUSDToAccount = async (issueAmount, receiver) => {
		// Set up the depositor with an amount of synths to deposit.
		await sUSDSynth.transfer(receiver, issueAmount, {
			from: owner,
		});
	};

	const issuesETHToAccount = async (issueAmount, receiver) => {
		await sETHSynth.transfer(receiver, issueAmount, { from: owner });
	};

	const deployCollateral = async ({
		proxy,
		mcState,
		owner,
		resolver,
		collatKey,
		// synthKeys,
		synths,
		minColat,
		intRate,
		liqPen,
		debtCeil,
	}) => {
		return setupContract({
			accounts,
			contract: 'MultiCollateralEth',
			args: [
				proxy,
				mcState,
				owner,
				resolver,
				collatKey,
				// [sUSD, sETH, toBytes32('sBTC')],
				synths,
				minColat,
				intRate,
				liqPen,
				debtCeil,
			],
		});
	};

	const setupMultiCollateral = async () => {
		// Mock SNX, sUSD
		[
			{ token: synthetix },
			{ token: sUSDSynth },
			{ token: sETHSynth },
			{ token: sBTCSynth },
		] = await Promise.all([
			mockToken({ accounts, name: 'Synthetix', symbol: 'SNX' }),
			mockToken({ accounts, synth: 'sUSD', name: 'Synthetic USD', symbol: 'sUSD' }),
			mockToken({ accounts, synth: 'sETH', name: 'Synthetic ETH', symbol: 'sETH' }),
			mockToken({ accounts, synth: 'sBTC', name: 'Synthetic BTC', symbol: 'sBTC' }),
		]);

		({
			FeePool: feePool,
			AddressResolver: addressResolver,
			ExchangeRates: exchangeRates,
			SystemStatus: systemStatus,
		} = await setupAllContracts({
			accounts,
			mocks: {
				SynthsUSD: sUSDSynth,
				SynthsETH: sETHSynth,
				SynthsBTC: sBTCSynth,
				Synthetix: synthetix,
			},
			contracts: ['FeePool', 'AddressResolver', 'ExchangeRates', 'SystemStatus'],
		}));

		FEE_ADDRESS = await feePool.FEE_ADDRESS();
		// mintingFee = await multiCollateralEth.issueFeeRate();

		// mock a Issuer for the FeePool.onlyInternalContracts
		const mockIssuer = await setupContract({
			accounts,
			contract: 'GenericMock',
			mock: 'Issuer',
		});
		// instruct the mock Issuer synthsByAddress to return an address
		await mockGenericContractFnc({
			instance: mockIssuer,
			mock: 'Issuer',
			fncName: 'synthsByAddress',
			returns: [ZERO_ADDRESS],
		});

		const MultiCollateralState = artifacts.require(`MultiCollateralState`);
		mcstate = await MultiCollateralState.new(owner, ZERO_ADDRESS, { from: deployerAccount });

		mceth = await deployCollateral({
			proxy: account1,
			mcState: mcstate.address,
			owner: owner,
			resolver: addressResolver.address,
			collatKey: sETH,
			synths: [toBytes32('SynthsUSD'), toBytes32('SynthsETH')],
			minColat: toUnit(1.5),
			// 5% / 31536000 (seconds in common year)
			intRate: 1585489599,
			liqPen: toUnit(0.1),
			debtCeil: toUnit(100000),
		});

		await addressResolver.importAddresses(
			[toBytes32('Issuer'), toBytes32('MultiCollateralEth')],
			[mockIssuer.address, mceth.address],
			{
				from: owner,
			}
		);

		// Sync feePool with imported mockIssuer
		await feePool.setResolverAndSyncCache(addressResolver.address, { from: owner });

		await mcstate.setAssociatedContract(mceth.address, { from: owner });

		await mceth.setResolverAndSyncCache(addressResolver.address, { from: owner });

		await feePool.setResolverAndSyncCache(addressResolver.address, { from: owner });

		await mcstate.addCurrency(sUSD, { from: owner });

		await mcstate.addCurrency(sETH, { from: owner });
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
	});

	it('should set constructor params on deployment', async () => {
		// assert.equal(await mceth.proxy(), account1);
		assert.equal(await mceth.multiCollateralState(), mcstate.address);
		assert.equal(await mceth.owner(), owner);
		assert.equal(await mceth.resolver(), addressResolver.address);
		assert.equal(await mceth.collateralKey(), sETH);
		assert.equal(await mceth.synths(sUSD), toBytes32('SynthsUSD'));
		assert.equal(await mceth.synths(sETH), toBytes32('SynthsETH'));
		assert.bnEqual(await mceth.minimumCollateralisation(), toUnit(1.5));
		assert.bnEqual(await mceth.baseInterestRate(), 1585489599);
		assert.bnEqual(await mceth.liquidationPenalty(), toUnit(0.1));
		assert.bnEqual(await mceth.debtCeiling(), toUnit(100000));
	});

	it('should ensure only expected functions are mutative', async () => {
		ensureOnlyExpectedMutativeFunctions({
			abi: mceth.abi,
			ignoreParents: ['Owned', 'Pausable', 'MixinResolver', 'Proxy', 'MultiCollateral'],
			expected: [
				'openEthLoan',
				'closeEthLoan',
				'depositEthCollateral',
				'repayEthLoan',
				'withdrawEthCollateral',
				'liquidateEthLoan',
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

	// PUBLIC VIEW TESTS

	describe('cratio test', async () => {});
	describe('issuance ratio test', async () => {});
	describe('max loan test', async () => {
		it('should convert correctly', async () => {
			// $150 worth of eth should allow 100 sUSD to be issued.
			const sUSDAmount = await mceth.maxLoan(toUnit(1.5), sUSD);

			assert.bnClose(sUSDAmount, toUnit(100), 100);

			// $150 worth of eth should allow $100 (0.01) of sBTC to be issued.
			const sBTCAmount = await mceth.maxLoan(toUnit(1.5), toBytes32('sBTC'));

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

		beforeEach(async () => {});

		it('when we start at 200%, we can take a 25% reduction in collateral prices', async () => {
			tx = await mceth.openEthLoan(oneHundredsUSD, sUSD, {
				value: twoETH,
				from: account1,
			});

			id = await getid(tx);
			loan = await mcstate.getLoan(account1, id);

			await exchangeRates.updateRates([sETH], ['75'].map(toUnit), await currentTime(), {
				from: oracle,
			});

			amountToLiquidate = await mceth.liquidationAmount(loan);

			assert.bnEqual(amountToLiquidate, toUnit(0));
		});

		it('when we start at 150%, any reduction in collateral will make the position undercollateralised ', async () => {
			tx = await mceth.openEthLoan(oneHundredsUSD, sUSD, {
				value: toUnit(1.5),
				from: account1,
			});

			id = await getid(tx);
			loan = await mcstate.getLoan(account1, id);

			await exchangeRates.updateRates([sETH], ['90'].map(toUnit), await currentTime(), {
				from: oracle,
			});

			amountToLiquidate = await mceth.liquidationAmount(loan);

			assert.bnClose(amountToLiquidate, toUnit(37.5), 100);
		});
	});

	describe('collateral redeemed test', async () => {
		let collateralRedeemed;

		it('when ETH is @ $100 and we are liquidating 10 sUSD, then redeem 0.11 ETH', async () => {
			collateralRedeemed = await mceth.collateralRedeemed(sUSD, tensUSD);

			assert.bnEqual(collateralRedeemed, toUnit(0.11));
		});

		it('when ETH is @ $200 and we are liquidating 10 sUSD, then redeem 0.055 ETH', async () => {
			await exchangeRates.updateRates([sETH], ['200'].map(toUnit), await currentTime(), {
				from: oracle,
			});

			collateralRedeemed = await mceth.collateralRedeemed(sUSD, tensUSD);

			assert.bnEqual(collateralRedeemed, toUnit(0.055));
		});

		it('regardless of eth price, we liquidate 1.1 * amount when doing sETH', async () => {
			collateralRedeemed = await mceth.collateralRedeemed(sETH, oneETH);

			assert.bnEqual(collateralRedeemed, toUnit(1.1));

			await exchangeRates.updateRates([sETH], ['1000'].map(toUnit), await currentTime(), {
				from: oracle,
			});

			collateralRedeemed = await mceth.collateralRedeemed(sETH, oneETH);

			assert.bnEqual(collateralRedeemed, toUnit(1.1));
		});
	});

	describe('funding rate test', async () => {});

	// END PUBLIC VIEW TESTS

	describe('interest', async () => {
		// Something wrong here with rates being invalid. Might be to do with chainlink rates vs internally updating.
		xit('should set the rate correctly', async () => {
			fastForwardAndUpdateRates(1 * MONTH);

			let fundingRate = await mceth.getFundingRate(sUSD);

			const loanTx = await mceth.openEthLoan(toUnit(500), sUSD, {
				value: toUnit(10),
				from: account1,
			});

			const id = await getid(loanTx);

			let firstLoan = await mcstate.getLoan(account1, id);

			fastForwardAndUpdateRates(1 * MONTH);

			fundingRate = await mceth.getFundingRate(sUSD);

			const newLoanTx = await mceth.openEthLoan(toUnit(500), sUSD, {
				value: toUnit(10),
				from: account2,
			});

			fastForwardAndUpdateRates(1 * MONTH);

			fundingRate = await mceth.getFundingRate(sUSD);

			const anotherTx = await mceth.openEthLoan(toUnit(500), sUSD, {
				value: toUnit(10),
				from: owner,
			});

			fastForwardAndUpdateRates(1 * MONTH);

			const rates = await mcstate.getRates(sUSD, { from: mceth.address });

			firstLoan = await mcstate.getLoan(account1, id);
		});
	});

	describe('opening', async () => {
		describe('potential blocking conditions', async () => {
			['System', 'Issuance'].forEach(section => {
				describe(`when ${section} is suspended`, () => {
					beforeEach(async () => {
						await setStatus({ owner, systemStatus, section, suspend: true });
					});
					it('then calling openLoan() reverts', async () => {
						await assert.revert(
							mceth.openEthLoan(onesUSD, sUSD, { value: oneETH, from: account1 }),
							'Operation prohibited'
						);
					});
					describe(`when ${section} is resumed`, () => {
						beforeEach(async () => {
							await setStatus({ owner, systemStatus, section, suspend: false });
						});
						it('then calling openLoan() succeeds', async () => {
							await mceth.openEthLoan(onesUSD, sUSD, {
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
						mceth.openEthLoan(onesUSD, sUSD, { value: oneETH, from: account1 }),
						'Blocked as collateral rate is invalid'
					);
				});
				describe('when ETH gets a rate', () => {
					beforeEach(async () => {
						await updateRatesWithDefaults();
					});
					it('then calling openLoan() succeeds', async () => {
						await mceth.openEthLoan(onesUSD, sUSD, { value: oneETH, from: account1 });
					});
				});
			});
		});

		describe('revert conditions', async () => {
			it('should revert if they request a currency that is not supported', async () => {
				await assert.revert(
					mceth.openEthLoan(onesUSD, toBytes32('sJPY'), { value: oneETH, from: account1 }),
					'Not allowed to issue this synth'
				);
			});

			it('should revert if they send 0 collateral', async () => {
				await assert.revert(
					mceth.openEthLoan(onesUSD, sUSD, { value: toUnit(0), from: account1 }),
					'Not enough collateral to create a loan'
				);
			});

			it('should revert if the requested loan exceeds borrowing power', async () => {
				await assert.revert(
					mceth.openEthLoan(oneHundredsUSD, sUSD, { value: toUnit(1), from: account1 }),
					'Loan amount exceeds max borrowing power'
				);
			});
		});

		describe('should open an eth loan denominated in sUSD', async () => {
			const fiveHundredSUSD = toUnit(500);
			const expectedMintingFee = toUnit(2.5);

			beforeEach(async () => {
				tx = await mceth.openEthLoan(fiveHundredSUSD, sUSD, {
					value: tenETH,
					from: account1,
				});

				id = await getid(tx);

				loan = await mcstate.getLoan(account1, id);
			});

			it('should set the loan correctly', async () => {
				assert.equal(loan.account, account1);
				assert.equal(loan.collateral, tenETH.toString());
				assert.equal(loan.currency, sUSD);
				assert.equal(loan.amount, fiveHundredSUSD.toString());
				assert.equal(loan.short, false);
				assert.equal(loan.mintingFee, expectedMintingFee.toString());
				assert.equal(loan.accruedInterest, toUnit(0));
			});

			it('should issue the correct amount to the borrower', async () => {
				const expecetdBalance = toUnit(497.5);

				assert.bnEqual(await sUSDSynth.balanceOf(account1), expecetdBalance);
			});

			it('should issue the minting fee to the fee pool', async () => {
				const feePoolBalance = await sUSDSynth.balanceOf(FEE_ADDRESS);

				assert.equal(loan.mintingFee, feePoolBalance.toString());
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
			const expectedMintingFee = toUnit(0.025);

			beforeEach(async () => {
				tx = await mceth.openEthLoan(fiveETH, sETH, {
					value: tenETH,
					from: account1,
				});

				id = await getid(tx);

				loan = await mcstate.getLoan(account1, id);
			});

			it('should set the loan correctly', async () => {
				assert.equal(loan.account, account1);
				assert.equal(loan.collateral, tenETH.toString());
				assert.equal(loan.currency, sETH);
				assert.equal(loan.amount, fiveETH.toString());
				assert.equal(loan.short, false);
				assert.equal(loan.mintingFee, expectedMintingFee.toString());
				assert.equal(loan.accruedInterest, toUnit(0));
			});

			it('should issue the correct amount to the borrower', async () => {
				const expecetdBalance = toUnit(4.975);

				assert.bnEqual(await sETHSynth.balanceOf(account1), expecetdBalance);
			});

			it('should issue the minting fee to the fee pool', async () => {
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
			tx = await mceth.openEthLoan(100, sUSD, {
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
							mceth.depositEthCollateral(account1, id, { value: tenETH, from: account1 }),
							'Operation prohibited'
						);
					});
					describe(`when ${section} is resumed`, () => {
						beforeEach(async () => {
							await setStatus({ owner, systemStatus, section, suspend: false });
						});
						it('then calling deposit() succeeds', async () => {
							await mceth.depositEthCollateral(account1, id, { value: tenETH, from: account1 });
						});
					});
				});
			});
		});

		describe('revert conditions', async () => {
			it('should revert if they do not send any eth', async () => {
				await assert.revert(
					mceth.depositEthCollateral(account1, id, { value: 0, from: account1 }),
					'Deposit must be greater than 0'
				);
			});
		});

		describe('should allow deposits', async () => {
			beforeEach(async () => {
				await mceth.depositEthCollateral(account1, id, { value: tenETH, from: account1 });
			});

			it('should increase the total collateral of the loan', async () => {
				loan = await mcstate.getLoan(account1, id);

				assert.bnEqual(loan.collateral, twentyETH);
			});
		});
	});

	describe('withdraws', async () => {
		beforeEach(async () => {
			loan = await mceth.openEthLoan(100, sUSD, {
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
					it('then calling depopsit() reverts', async () => {
						await assert.revert(
							mceth.withdrawEthCollateral(id, oneETH, { from: account1 }),
							'Operation prohibited'
						);
					});
					describe(`when ${section} is resumed`, () => {
						beforeEach(async () => {
							await setStatus({ owner, systemStatus, section, suspend: false });
						});
						it('then calling deposit() succeeds', async () => {
							mceth.withdrawEthCollateral(id, oneETH, { from: account1 });
						});
					});
				});
			});
		});

		describe('revert conditions', async () => {
			it('should revert if they try to withdraw 0', async () => {
				await assert.revert(
					mceth.withdrawEthCollateral(id, 0, { from: account1 }),
					'Amount to withdraw must be greater than 0'
				);
			});

			xit('should revert if the withdraw would put them under minimum collateralisation', async () => {
				const nineETH = toUnit(9);

				await assert.revert(
					mceth.withdrawEthCollateral(id, nineETH, { from: account1 }),
					'Collateral ratio below liquidation after withdraw'
				);
			});

			it('should revert if they try to withdraw all the collateral', async () => {
				await assert.revert(
					mceth.withdrawEthCollateral(id, tenETH, { from: account1 }),
					'Request exceeds total collateral'
				);
			});

			it('should revert if the sender is not borrower', async () => {
				await assert.revert(mceth.withdrawEthCollateral(id, tenETH, { from: account2 }));
			});
		});

		describe('should allow withdraws', async () => {
			beforeEach(async () => {
				await mceth.withdrawEthCollateral(id, oneETH, {
					from: account1,
				});
			});

			it('should decrease the total collateral of the loan', async () => {
				loan = await mcstate.getLoan(account1, id);

				const expectedCollateral = tenETH.sub(oneETH);

				assert.bnEqual(loan.collateral, expectedCollateral);
			});
		});
	});

	describe('repayments', async () => {
		beforeEach(async () => {
			// make a loan here so we have a valid ID to pass to the blockers and reverts.
			tx = await mceth.openEthLoan(oneHundredsUSD, sUSD, {
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
							mceth.repayEthLoan(account1, id, onesUSD, { from: account1 }),
							'Operation prohibited'
						);
					});
					describe(`when ${section} is resumed`, () => {
						beforeEach(async () => {
							await setStatus({ owner, systemStatus, section, suspend: false });
						});
						it('then calling deposit() succeeds', async () => {
							mceth.repayEthLoan(account1, id, oneETH, { from: account1 });
						});
					});
				});
			});
		});

		describe('revert conditions', async () => {
			it('should revert if they try to repay 0', async () => {
				await assert.revert(
					mceth.repayEthLoan(account1, id, 0, { from: account1 }),
					'Payment must be greater than 0'
				);
			});

			// account 2 had no sUSD
			it('should revert if they have no sUSD', async () => {
				await assert.revert(
					mceth.repayEthLoan(account1, id, tensUSD, { from: account2 }),
					'Not enough synth balance'
				);
			});
		});

		describe('should allow repayments on an sUSD loan', async () => {
			const expected = new BN('90000000317097919800');

			// I don't want to test interest here. I just want to test repayment.
			beforeEach(async () => {
				await issuesUSDToAccount(oneHundredsUSD, account2);
				tx = await mceth.repayEthLoan(account1, id, tensUSD, { from: account2 });
			});

			it('should work reduce the repayers balance', async () => {
				const expectedBalance = toUnit(90);
				assert.bnEqual(await sUSDSynth.balanceOf(account2), expectedBalance);
			});

			it('should update the loan', async () => {
				loan = await mcstate.getLoan(account1, id);

				assert.equal(loan.amount, expected);
			});

			it('should emit the event properly', async () => {
				assert.eventEqual(tx, 'LoanRepaymentMade', {
					account: account1,
					repayer: account2,
					id: id,
					repaidAmount: tensUSD,
					newLoanAmount: expected,
				});
			});
		});

		describe('it should allow repayments on an sETH loan', async () => {
			const expected = new BN('4000000015854895990');

			beforeEach(async () => {
				tx = await mceth.openEthLoan(fiveETH, sETH, {
					value: tenETH,
					from: account1,
				});

				id = await getid(tx);

				loan = await mcstate.getLoan(account1, id);

				await issuesETHToAccount(twoETH, account2);

				tx = await mceth.repayEthLoan(account1, id, oneETH, { from: account2 });
			});

			it('should work reduce the repayers balance', async () => {
				const expectedBalance = oneETH;

				assert.bnEqual(await sETHSynth.balanceOf(account2), expectedBalance);
			});

			it('should update the loan', async () => {
				loan = await mcstate.getLoan(account1, id);

				assert.equal(loan.amount, expected);
			});

			it('should emit the event properly', async () => {
				assert.eventEqual(tx, 'LoanRepaymentMade', {
					account: account1,
					repayer: account2,
					id: id,
					repaidAmount: oneETH,
					newLoanAmount: expected,
				});
			});
		});
	});

	describe('liquidations', async () => {
		const liquidationAmount = toUnit(50);
		beforeEach(async () => {
			// make a loan here so we have a valid ID to pass to the blockers and reverts.
			loan = await mceth.openEthLoan(oneHundredsUSD, sUSD, {
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
							mceth.liquidateEthLoan(account1, id, onesUSD, { from: account1 }),
							'Operation prohibited'
						);
					});
					describe(`when ${section} is resumed`, () => {
						beforeEach(async () => {
							await setStatus({ owner, systemStatus, section, suspend: false });
						});
						it('then calling liquidate() succeeds', async () => {
							// fast forward a long time to make sure the loan is underwater.
							fastForwardAndUpdateRates(10 * YEAR);
							await mceth.liquidateEthLoan(account1, id, oneETH, { from: account1 });
						});
					});
				});
			});
		});

		describe('revert conditions', async () => {
			it('should revert if they have no sUSD', async () => {
				await assert.revert(
					mceth.liquidateEthLoan(account1, id, liquidationAmount, { from: account2 }),
					'Not enough synth balance'
				);
			});

			it('should revert if they are not under collateralised', async () => {
				await issuesUSDToAccount(toUnit(100), account2);

				await assert.revert(
					mceth.liquidateEthLoan(account1, id, liquidationAmount, { from: account2 }),
					'Collateral ratio above liquidation ratio'
				);
			});
		});

		describe('setup', async () => {
			describe('amounts to liquidate', async () => {
				xit('should correclt calcualte the amount', async () => {
					const amount = await mceth.calculateAmountToLiquidate(toUnit(143), toUnit(200));
				});
			});

			describe('should allow liquidations on an undercollateralised sUSD loan', async () => {
				let liquidatorUSDBalBefore;
				let liquidatorUSDBalAfter;
				let liquidatorEthBalBefore;
				let liquidatorEthBalAfter;
				let feePoolBalanceBefore;
				let feePoolBalanceAfter;
				let expectedInterest;
				let cratioBefore;
				let cratioAfter;
				const liquidatedCollateral = toUnit(0.22);

				beforeEach(async () => {
					// Fast forward to get the loan undercollateralised from interest.
					// fastForward(YEAR);

					// Alternatively, lets change the eth price?
					const timestamp = await currentTime();
					await exchangeRates.updateRates([sETH], ['70'].map(toUnit), timestamp, {
						from: oracle,
					});

					await issuesUSDToAccount(toUnit(1000), account2);
					liquidatorUSDBalBefore = await sUSDSynth.balanceOf(account2);
					liquidatorEthBalBefore = new BN(await getEthBalance(account2));
					feePoolBalanceBefore = await sUSDSynth.balanceOf(FEE_ADDRESS);

					loan = await mcstate.getLoan(account1, id);

					cratioBefore = await mceth.collateralRatio(loan);

					const amountToLiquidate = toUnit(25);
				});

				xit('should cap the amount to liquidate to bring the c ratio back above minimum', async () => {
					tx = await mceth.liquidateEthLoan(account1, id, toUnit(1000), {
						from: account2,
					});

					loan = await mcstate.getLoan(account1, id);

					const expected = toUnit(75);

					assert.closeTo(loan.amount, fromUnit(expected));
				});

				xit('should update the loan correctly', async () => {
					loan = await mcstate.getLoan(account1, id);
				});

				xit('should emit a liquidation event', async () => {
					const maxLiquidatable = await mceth.calculateAmountToLiquidate(loan.amount, V);

					assert.eventEqual(liquidationTx, 'LoanPartiallyLiquidated', {
						account: account1,
						id: id,
						liquidator: account2,
						liquidatedAmount: liquidationAmount,
						liquidatedCollateral: liquidatedCollateral,
					});
				});

				xit('should reduce the liquicators synth amount', async () => {
					liquidatorUSDBalAfter = await sUSDSynth.balanceOf(account2);
					let maxLiquidationAmount;
					assert.bnEqual(liquidatorUSDBalAfter, liquidatorUSDBalBefore.sub(liquidationAmount));
				});

				xit('should transfer the liquidated collateral to the liquidator', async () => {
					// the actual amount of eth is different because of gas spent on transactions
					// so we just check that they have more eth now
					liquidatorEthBalAfter = new BN(await getEthBalance(account2)).add(liquidatedCollateral);

					assert.bnClose(liquidatorEthBalAfter, liquidatorEthBalBefore);
				});

				xit('should pay the interest to the fee pool', async () => {
					feePoolBalanceAfter = await sUSDSynth.balanceOf(FEE_ADDRESS);

					const expected = feePoolBalanceBefore.add(expectedInterest);

					assert.bnEqual(feePoolBalanceAfter, expected);
				});

				xit('should fix the collateralisation ratio of the loan', async () => {
					const loanAfter = await mcstate.getLoan(account1, id);

					cratioAfter = await mceth._loanCollateralRatio(loanAfter);
				});
			});
		});
	});

	describe('closing', async () => {
		xit('tba');
	});

	describe('Accrue Interest', async () => {
		it('should work', async () => {
			tx = await mceth.openEthLoan(oneHundredsUSD, sUSD, {
				value: twoETH,
				from: account1,
			});

			id = await getid(tx);

			fastForward(YEAR);

			// should have accrued about 5% after 1 year when he comes to repay.

			tx = await mceth.repayEthLoan(account1, id, tensUSD, { from: account1 });

			// so the balance remaining on the loan should be around $95.

			loan = await mcstate.getLoan(account1, id);

			const expected = toUnit(95);

			// assert.bnClose(loan.amount, expected, '197955359900');

			fastForward(YEAR);

			tx = await mceth.repayEthLoan(account1, id, tensUSD, { from: account1 });

			const rates = await mcstate.getRates(sUSD);
		});
	});
});
