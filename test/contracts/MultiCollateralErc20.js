'use strict';

const { artifacts, contract, web3 } = require('@nomiclabs/buidler');

const { assert, addSnapshotBeforeRestoreAfterEach } = require('./common');

const MultiCollateralErc20 = artifacts.require('MultiCollateralErc20');

const BN = require('bn.js');

const PublicEST = artifacts.require('PublicEST');

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

contract('MultiCollateralErc20', async accounts => {
	const MINUTE = 60;
	const DAY = 86400;
	const WEEK = 604800;
	const MONTH = 2629743;
	const YEAR = 31536000;

	const sUSD = toBytes32('sUSD');
	const sETH = toBytes32('sETH');
	const sBTC = toBytes32('sBTC');

	const [ETH] = ['sETH'].map(toBytes32);

	const oneRenBTC = toUnit(1);
	const twoRenBTC = toUnit(2);
	const fiveRenBTC = toUnit(5);
	const tenRenBTC = toUnit(10);
	const twentyRenBTC = toUnit(20);

	const onesUSD = toUnit(1);
	const twosUSD = toUnit(2);
	const fivesUSD = toUnit(5);
	const tensUSD = toUnit(10);
	const oneHundredsUSD = toUnit(100);

	let tx;
	let loan;
	let id;
	let proxy, tokenState, instance;

	const [deployerAccount, owner, oracle, , account1, account2] = accounts;

	let mcerc20,
		mcstate,
		synthetix,
		feePool,
		exchangeRates,
		addressResolver,
		sUSDSynth,
		sETHSynth,
		sBTCSynth,
		renBTC,
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

	const issuesBTCtoAccount = async (issueAmount, receiver) => {
		await sBTCSynth.transfer(receiver, issueAmount, { from: owner });
	};

	const issueRenBTCtoAccount = async (issueAmount, receiver) => {
		await renBTC.transfer(receiver, issueAmount, { from: owner });
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
		proxy,
		mcState,
		owner,
		resolver,
		collatKey,
		synths,
		minColat,
		intRate,
		liqPen,
		debtCeil,
		underCon,
	}) => {
		return setupContract({
			accounts,
			contract: 'MultiCollateralErc20',
			args: [
				proxy,
				mcState,
				owner,
				resolver,
				collatKey,
				synths,
				minColat,
				intRate,
				liqPen,
				debtCeil,
				underCon,
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

		const ProxyERC20 = artifacts.require(`ProxyERC20`);
		const TokenState = artifacts.require(`TokenState`);

		// the owner is the associated contract, so we can simulate
		proxy = await ProxyERC20.new(owner, {
			from: deployerAccount,
		});
		tokenState = await TokenState.new(owner, ZERO_ADDRESS, { from: deployerAccount });

		renBTC = await PublicEST.new(
			proxy.address,
			tokenState.address,
			'Some Token',
			'TOKEN',
			toUnit('1000'),
			owner,
			{
				from: deployerAccount,
			}
		);

		await tokenState.setAssociatedContract(owner, { from: owner });
		await tokenState.setBalanceOf(owner, toUnit('1000'), { from: owner });
		await tokenState.setAssociatedContract(renBTC.address, { from: owner });

		await proxy.setTarget(renBTC.address, { from: owner });

		// Issue ren and set allowance
		await issueRenBTCtoAccount(toUnit(100), account1);

		mcerc20 = await deployCollateral({
			proxy: ZERO_ADDRESS,
			mcState: mcstate.address,
			owner: owner,
			resolver: addressResolver.address,
			collatKey: sBTC,
			synths: [toBytes32('SynthsUSD'), toBytes32('SynthsBTC')],
			minColat: toUnit(1.5),
			// 5% / 31536000 (seconds in common year)
			intRate: 1585489599,
			liqPen: toUnit(0.1),
			debtCeil: toUnit(100000),
			underCon: renBTC.address,
		});

		await addressResolver.importAddresses(
			[toBytes32('Issuer'), toBytes32('MultiCollateralErc20')],
			[mockIssuer.address, mcerc20.address],
			{
				from: owner,
			}
		);

		// Sync feePool with imported mockIssuer
		await feePool.setResolverAndSyncCache(addressResolver.address, { from: owner });

		await mcstate.setAssociatedContract(mcerc20.address, { from: owner });

		await mcerc20.setResolverAndSyncCache(addressResolver.address, { from: owner });

		await feePool.setResolverAndSyncCache(addressResolver.address, { from: owner });

		await mcstate.addCurrency(sUSD, { from: owner });

		await mcstate.addCurrency(sBTC, { from: owner });

		await renBTC.approve(mcerc20.address, toUnit(100), { from: account1 });
	};

	before(async () => {
		await setupMultiCollateral();
	});

	addSnapshotBeforeRestoreAfterEach();

	beforeEach(async () => {
		await updateRatesWithDefaults();
	});

	it('should set constructor params on deployment', async () => {
		// assert.equal(await mcerc20.proxy(), account1);
		assert.equal(await mcerc20.multiCollateralState(), mcstate.address);
		assert.equal(await mcerc20.owner(), owner);
		assert.equal(await mcerc20.resolver(), addressResolver.address);
		assert.equal(await mcerc20.collateralKey(), sBTC);
		assert.equal(await mcerc20.synths(sUSD), toBytes32('SynthsUSD'));
		assert.equal(await mcerc20.synths(sBTC), toBytes32('SynthsBTC'));
		assert.bnEqual(await mcerc20.minimumCollateralisation(), toUnit(1.5));
		assert.bnEqual(await mcerc20.baseInterestRate(), 1585489599);
		assert.bnEqual(await mcerc20.liquidationPenalty(), toUnit(0.1));
		assert.bnEqual(await mcerc20.debtCeiling(), toUnit(100000));
		assert.equal(await mcerc20.underlyingContract(), renBTC.address);
	});

	it('should ensure only expected functions are mutative', async () => {
		ensureOnlyExpectedMutativeFunctions({
			abi: mcerc20.abi,
			ignoreParents: ['Owned', 'Pausable', 'MixinResolver', 'Proxy', 'MultiCollateral'],
			expected: [
				'openErc20Loan',
				'closeErc20Loan',
				'depositErc20Collateral',
				'repayErc20Loan',
				'withdrawErc20Collateral',
				'liquidateErc20Loan',
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
							mcerc20.openErc20Loan(oneRenBTC, onesUSD, sUSD, false, { from: account1 }),
							'Operation prohibited'
						);
					});
					describe(`when ${section} is resumed`, () => {
						beforeEach(async () => {
							await setStatus({ owner, systemStatus, section, suspend: false });
						});
						it('then calling openLoan() succeeds', async () => {
							await mcerc20.openErc20Loan(oneRenBTC, onesUSD, sUSD, false, {
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
						mcerc20.openErc20Loan(oneRenBTC, onesUSD, sUSD, false, { from: account1 }),
						'Blocked as collateral rate is invalid'
					);
				});
				describe('when BTC gets a rate', () => {
					beforeEach(async () => {
						await updateRatesWithDefaults();
					});
					it('then calling openLoan() succeeds', async () => {
						await mcerc20.openErc20Loan(oneRenBTC, onesUSD, sUSD, false, { from: account1 });
					});
				});
			});
		});

		describe('revert conditions', async () => {
			it('should revert if they request a currency that is not supported', async () => {
				await assert.revert(
					mcerc20.openErc20Loan(oneRenBTC, onesUSD, toBytes32('sJPY'), false, { from: account1 }),
					'Not allowed to issue this synth'
				);
			});

			it('should revert if they send 0 collateral', async () => {
				await assert.revert(
					mcerc20.openErc20Loan(toUnit(0), onesUSD, sUSD, false, { from: account1 }),
					'Not enough collateral to create a loan'
				);
			});

			it('should revert if the requested loan exceeds borrowing power', async () => {
				await assert.revert(
					mcerc20.openErc20Loan(oneRenBTC, toUnit(10000), sUSD, false, {
						from: account1,
					}),
					'Loan amount exceeds max borrowing power'
				);
			});
		});

		describe('should open an eth loan denominated in sUSD', async () => {
			const fiveHundredSUSD = toUnit(500);
			const expectedMintingFee = toUnit(2.5);

			beforeEach(async () => {
				tx = await mcerc20.openErc20Loan(oneRenBTC, fiveHundredSUSD, sUSD, false, {
					from: account1,
				});

				id = await getid(tx);

				loan = await mcstate.getLoan(account1, id);
			});

			it('should set the loan correctly', async () => {
				assert.equal(loan.account, account1);
				assert.equal(loan.collateral, oneRenBTC.toString());
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
					collateral: oneRenBTC,
					currency: sUSD,
				});
			});
		});

		describe('should open a btc loan denominated in sBTC', async () => {
			const expectedMintingFee = toUnit(0.01);

			beforeEach(async () => {
				tx = await mcerc20.openErc20Loan(fiveRenBTC, twoRenBTC, sBTC, false, {
					from: account1,
				});

				id = await getid(tx);

				loan = await mcstate.getLoan(account1, id);
			});

			it('should set the loan correctly', async () => {
				assert.equal(loan.account, account1);
				assert.equal(loan.collateral, fiveRenBTC.toString());
				assert.equal(loan.currency, sBTC);
				assert.equal(loan.amount, twoRenBTC.toString());
				assert.equal(loan.short, false);
				assert.equal(loan.mintingFee, expectedMintingFee.toString());
				assert.equal(loan.accruedInterest, toUnit(0));
			});

			it('should issue the correct amount to the borrower', async () => {
				const expecetdBalance = toUnit(1.99);

				assert.bnEqual(await sBTCSynth.balanceOf(account1), expecetdBalance);
			});

			it('should issue the minting fee to the fee pool', async () => {
				const feePoolBalance = await sUSDSynth.balanceOf(FEE_ADDRESS);

				const expecetdBalance = toUnit(100);

				assert.equal(expecetdBalance, feePoolBalance.toString());
			});

			it('should emit the event properly', async () => {
				assert.eventEqual(tx, 'LoanCreated', {
					account: account1,
					id: id,
					amount: twoRenBTC,
					collateral: fiveRenBTC,
					currency: sBTC,
				});
			});
		});
	});

	describe('deposits', async () => {
		beforeEach(async () => {
			tx = await mcerc20.openErc20Loan(twoRenBTC, oneHundredsUSD, sUSD, false, {
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
							mcerc20.depositErc20Collateral(account1, id, oneRenBTC, { from: account1 }),
							'Operation prohibited'
						);
					});
					describe(`when ${section} is resumed`, () => {
						beforeEach(async () => {
							await setStatus({ owner, systemStatus, section, suspend: false });
						});
						it('then calling deposit() succeeds', async () => {
							await mcerc20.depositErc20Collateral(account1, id, oneRenBTC, { from: account1 });
						});
					});
				});
			});
		});

		describe('revert conditions', async () => {
			it('should revert if they do not send any eth', async () => {
				await assert.revert(
					mcerc20.depositErc20Collateral(account1, id, 0, { from: account1 }),
					'Deposit must be greater than 0'
				);
			});
		});

		describe('should allow deposits', async () => {
			beforeEach(async () => {
				await mcerc20.depositErc20Collateral(account1, id, oneRenBTC, { from: account1 });
			});

			it('should increase the total collateral of the loan', async () => {
				loan = await mcstate.getLoan(account1, id);

				assert.bnEqual(loan.collateral, toUnit(3));
			});
		});
	});

	describe('withdraws', async () => {
		beforeEach(async () => {
			loan = await mcerc20.openErc20Loan(twoRenBTC, oneHundredsUSD, sUSD, false, {
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
							mcerc20.withdrawErc20Collateral(id, oneRenBTC, { from: account1 }),
							'Operation prohibited'
						);
					});
					describe(`when ${section} is resumed`, () => {
						beforeEach(async () => {
							await setStatus({ owner, systemStatus, section, suspend: false });
						});
						it('then calling deposit() succeeds', async () => {
							mcerc20.withdrawErc20Collateral(id, oneRenBTC, { from: account1 });
						});
					});
				});
			});
		});

		describe('revert conditions', async () => {
			it('should revert if they try to withdraw 0', async () => {
				await assert.revert(
					mcerc20.withdrawErc20Collateral(id, 0, { from: account1 }),
					'Amount to withdraw must be greater than 0'
				);
			});

			it('should revert if the withdraw would put them under minimum collateralisation', async () => {
				const lol = toUnit(1.999);

				await assert.revert(
					mcerc20.withdrawErc20Collateral(id, lol, { from: account1 }),
					'Collateral ratio below liquidation after withdraw'
				);
			});

			it('should revert if they try to withdraw all the collateral', async () => {
				await assert.revert(
					mcerc20.withdrawErc20Collateral(id, twoRenBTC, { from: account1 }),
					'Request exceeds total collateral'
				);
			});

			it('should revert if the sender is not borrower', async () => {
				await issuesBTCtoAccount(oneRenBTC, account2);
				await renBTC.approve(mcerc20.address, oneRenBTC, { from: account2 });

				await assert.revert(mcerc20.withdrawErc20Collateral(id, oneRenBTC, { from: account2 }));
			});
		});

		describe('should allow withdraws', async () => {
			beforeEach(async () => {
				await mcerc20.withdrawErc20Collateral(id, oneRenBTC, {
					from: account1,
				});
			});

			it('should decrease the total collateral of the loan', async () => {
				loan = await mcstate.getLoan(account1, id);

				const expectedCollateral = twoRenBTC.sub(oneRenBTC);

				assert.bnEqual(loan.collateral, expectedCollateral);
			});
		});
	});

	describe('repayments', async () => {
		beforeEach(async () => {
			// make a loan here so we have a valid ID to pass to the blockers and reverts.
			tx = await mcerc20.openErc20Loan(twoRenBTC, oneHundredsUSD, sUSD, false, {
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
							mcerc20.repayErc20Loan(account1, id, onesUSD, { from: account1 }),
							'Operation prohibited'
						);
					});
					describe(`when ${section} is resumed`, () => {
						beforeEach(async () => {
							await setStatus({ owner, systemStatus, section, suspend: false });
						});
						it('then calling repay() succeeds', async () => {
							mcerc20.repayErc20Loan(account1, id, onesUSD, { from: account1 });
						});
					});
				});
			});
		});

		describe('revert conditions', async () => {
			it('should revert if they try to repay 0', async () => {
				await assert.revert(
					mcerc20.repayErc20Loan(account1, id, 0, { from: account1 }),
					'Payment must be greater than 0'
				);
			});

			// account 2 had no sUSD
			it('should revert if they have no sUSD', async () => {
				await assert.revert(
					mcerc20.repayErc20Loan(account1, id, tensUSD, { from: account2 }),
					'Not enough synth balance'
				);
			});

			it('should revert if they try to pay more than the amount owing', async () => {
				await issuesUSDToAccount(toUnit(1000), account1);
				await assert.revert(
					mcerc20.repayErc20Loan(account1, id, toUnit(1000), { from: account1 }),
					'Repayment would close loan. If you are the borrower then call close loan'
				);
			});
		});

		describe('should allow repayments on an sUSD loan', async () => {
			const expected = new BN('90000000317097919800');

			// I don't want to test interest here. I just want to test repayment.
			beforeEach(async () => {
				await issuesUSDToAccount(oneHundredsUSD, account2);
				tx = await mcerc20.repayErc20Loan(account1, id, tensUSD, { from: account2 });
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

		describe('it should allow repayments on an sBTC loan', async () => {
			const expected = new BN('1000000006341958396');

			beforeEach(async () => {
				tx = await mcerc20.openErc20Loan(fiveRenBTC, twoRenBTC, sBTC, false, {
					from: account1,
				});

				id = await getid(tx);

				loan = await mcstate.getLoan(account1, id);

				await issuesBTCtoAccount(twoRenBTC, account2);

				tx = await mcerc20.repayErc20Loan(account1, id, oneRenBTC, { from: account2 });
			});

			it('should work reduce the repayers balance', async () => {
				const expectedBalance = oneRenBTC;

				assert.bnEqual(await sBTCSynth.balanceOf(account2), expectedBalance);
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
					repaidAmount: oneRenBTC,
					newLoanAmount: expected,
				});
			});
		});
	});
});
