'use strict';

const { contract, web3 } = require('hardhat');

const { assert, addSnapshotBeforeRestoreAfterEach } = require('./common');

const BN = require('bn.js');

const { fastForward, getEthBalance, toUnit, multiplyDecimal, currentTime } = require('../utils')();

const { mockGenericContractFnc, mockToken, setupAllContracts, setupContract } = require('./setup');

// const { GAS_PRICE } = require('../../buidler.config');

const {
	setStatus,
	onlyGivenAddressCanInvoke,
	ensureOnlyExpectedMutativeFunctions,
} = require('./helpers');

const {
	toBytes32,
	constants: { ZERO_ADDRESS },
} = require('../..');

contract('EtherCollateralsUSD', async accounts => {
	const MINUTE = 60;
	const DAY = 86400;
	const WEEK = 604800;
	const MONTH = 2629743;
	const YEAR = 31536000;

	const TEST_TIMEOUT = 160e3;

	const [ETH] = ['ETH'].map(toBytes32);
	const ETH_RATE = 100;

	const ISSUACE_RATIO = toUnit('0.666666666666666667');
	const ZERO_BN = toUnit('0');

	const [, owner, oracle, address1, address2, address3] = accounts;

	let etherCollateral,
		feePool,
		exchangeRates,
		addressResolver,
		sUSDSynth,
		systemStatus,
		mintingFee,
		FEE_ADDRESS;

	const issuesUSDToAccount = async (issueAmount, receiver) => {
		// Set up the depositor with an amount of synths to deposit.
		await sUSDSynth.transfer(receiver, issueAmount, {
			from: owner,
		});
	};

	const getLoanID = async tx => {
		const event = tx.logs.find(log => log.event === 'LoanCreated');
		return event.args.loanID;
	};

	const calculateLoanAmount = ethAmount => {
		return multiplyDecimal(ethAmount, multiplyDecimal(ISSUACE_RATIO, toUnit(ETH_RATE)));
	};

	const calculateMintingFee = loanAmount => {
		return multiplyDecimal(loanAmount, mintingFee);
	};

	const calculateInterest = (loanAmount, ratePerSec, seconds) => {
		// Interest = PV * rt;
		const rt = ratePerSec.mul(new BN(seconds));
		return multiplyDecimal(loanAmount, rt);
	};

	// TODO: Delete if not needed
	// const calculateLoanFees = async (_address, _loanID) => {
	// 	const totalFees = await etherCollateral.totalFeesOnLoan(_address, _loanID);
	// 	return totalFees;
	// };

	const calculateLoanInterestFees = async (_address, _loanID) => {
		const interestRatePerSec = await etherCollateral.interestPerSecond();
		const synthLoan = await etherCollateral.getLoan(_address, _loanID);

		const timeSinceLastInterestAccrual = await etherCollateral.timeSinceInterestAccrualOnLoan(
			_address,
			_loanID
		);

		const compoundedLoanAmount = synthLoan.loanAmount.add(synthLoan.accruedInterest);

		// Expected interest
		const interest = calculateInterest(
			compoundedLoanAmount,
			interestRatePerSec,
			timeSinceLastInterestAccrual
		);

		const expectedInterest = interest.add(synthLoan.accruedInterest);

		// console.log('expectedInterest', expectedInterest.toString());
		return expectedInterest;
	};

	const getSynthLoanTotalInterest = async (_address, _loanID) => {
		const synthLoan = await etherCollateral.getLoan(_address, _loanID);
		return synthLoan.accruedInterest;
	};

	const updateRatesWithDefaults = async () => {
		const timestamp = await currentTime();

		await exchangeRates.updateRates([ETH], ['100'].map(toUnit), timestamp, {
			from: oracle,
		});
	};

	const fastForwardAndUpdateRates = async seconds => {
		await fastForward(seconds);
		await updateRatesWithDefaults();
	};

	// Run once at beginning - snapshots will take care of resetting this before each test
	before(async () => {
		// Mock SNX, sUSD
		[{ token: sUSDSynth }] = await Promise.all([
			mockToken({ accounts, synth: 'sUSD', name: 'Synthetic USD', symbol: 'sUSD' }),
		]);

		({
			EtherCollateralsUSD: etherCollateral,
			FeePool: feePool,
			AddressResolver: addressResolver,
			ExchangeRates: exchangeRates,
			SystemStatus: systemStatus,
		} = await setupAllContracts({
			accounts,
			mocks: {
				SynthsUSD: sUSDSynth,
			},
			contracts: [
				'FeePool',
				'AddressResolver',
				'ExchangeRates',
				'SystemStatus',
				'EtherCollateralsUSD',
				'CollateralManager',
				'Synthetix',
			],
		}));

		FEE_ADDRESS = await feePool.FEE_ADDRESS();
		mintingFee = await etherCollateral.issueFeeRate();

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
		await addressResolver.importAddresses([toBytes32('Issuer')], [mockIssuer.address], {
			from: owner,
		});

		// Sync feePool with imported mockIssuer
		await feePool.rebuildCache();
	});

	addSnapshotBeforeRestoreAfterEach();

	beforeEach(async () => {
		await updateRatesWithDefaults();
	});

	it('ensure only known functions are mutative', () => {
		ensureOnlyExpectedMutativeFunctions({
			abi: etherCollateral.abi,
			ignoreParents: ['Owned', 'Pausable', 'ReentrancyGuard', 'MixinResolver'],
			expected: [
				'openLoan',
				'closeLoan',
				'liquidateLoan',
				'depositCollateral',
				'withdrawCollateral',
				'repayLoan',
				'liquidateUnclosedLoan',
				'setCollateralizationRatio',
				'setInterestRate',
				'setIssueFeeRate',
				'setIssueLimit',
				'setMinLoanCollateralSize',
				'setAccountLoanLimit',
				'setLoanLiquidationOpen',
				'setLiquidationRatio',
			],
		});
	});

	describe('On deployment of Contract', async () => {
		let instance;
		beforeEach(async () => {
			instance = etherCollateral;
		});

		it('should set constructor params on deployment', async () => {
			assert.equal(await instance.resolver(), addressResolver.address);
		});

		it('should access its dependencies via the address resolver', async () => {
			assert.equal(await addressResolver.getAddress(toBytes32('SynthsUSD')), sUSDSynth.address);
			assert.equal(await addressResolver.getAddress(toBytes32('FeePool')), feePool.address);
			assert.equal(
				await addressResolver.getAddress(toBytes32('ExchangeRates')),
				exchangeRates.address
			);
		});

		describe('should have a default', async () => {
			const DEFAULT_C_RATIO = toUnit(150);
			const FIFTY_BIPS = toUnit('0.005');
			const FIVE_PERCENT = toUnit('0.05');
			const TEN_MILLION = toUnit('10000000');
			const ONE_ETH = toUnit('1');
			const SECONDS_IN_A_YEAR = 31536000;
			const INTEREST_PER_SECOND = FIVE_PERCENT.div(web3.utils.toBN(SECONDS_IN_A_YEAR));

			it('collateralizationRatio of 150%', async () => {
				assert.bnEqual(await etherCollateral.collateralizationRatio(), DEFAULT_C_RATIO);
			});
			it('issuanceRatio of 0.666666666666666667%', async () => {
				assert.bnEqual(await etherCollateral.issuanceRatio(), ISSUACE_RATIO);
			});
			it('issueFeeRate of 50 bips', async () => {
				assert.bnEqual(await etherCollateral.issueFeeRate(), FIFTY_BIPS);
			});
			it('interestRate of 5%', async () => {
				assert.bnEqual(await etherCollateral.interestRate(), FIVE_PERCENT);
			});
			it('issueLimit of 10MM', async () => {
				assert.bnEqual(await etherCollateral.issueLimit(), TEN_MILLION);
			});
			it('minLoanCollateralSize of 1', async () => {
				assert.bnEqual(await etherCollateral.minLoanCollateralSize(), ONE_ETH);
			});
			it('loanLiquidationOpen of false', async () => {
				assert.equal(await etherCollateral.loanLiquidationOpen(), false);
			});
			it('getContractInfo', async () => {
				const contractInfo = await etherCollateral.getContractInfo();
				assert.bnEqual(contractInfo._collateralizationRatio, DEFAULT_C_RATIO);
				assert.bnEqual(contractInfo._issuanceRatio, ISSUACE_RATIO);
				assert.bnEqual(contractInfo._issueFeeRate, FIFTY_BIPS);
				assert.bnEqual(contractInfo._interestRate, FIVE_PERCENT);
				assert.bnEqual(contractInfo._interestPerSecond, INTEREST_PER_SECOND);
				assert.bnEqual(contractInfo._issueLimit, TEN_MILLION);
				assert.bnEqual(contractInfo._minLoanCollateralSize, ONE_ETH);
				assert.bnEqual(contractInfo._totalIssuedSynths, toUnit('0'));
				assert.equal(contractInfo._totalLoansCreated, 0);
				assert.equal(contractInfo._ethBalance, 0);
				assert.notEqual(contractInfo._liquidationDeadline, 0);
				assert.equal(contractInfo._loanLiquidationOpen, false);
			});
		});

		describe('should allow owner to set', async () => {
			it('collateralizationRatio to 140', async () => {
				// Confirm defaults
				const defaultCollateralizationRatio = toUnit(150);
				const oldCollateralizationRatio = await etherCollateral.collateralizationRatio();
				assert.bnEqual(oldCollateralizationRatio, defaultCollateralizationRatio);

				// Set new CollateralizationRatio
				const newCollateralizationRatio = toUnit(140);
				const transaction = await etherCollateral.setCollateralizationRatio(
					newCollateralizationRatio,
					{
						from: owner,
					}
				);
				const currentCollateralizationRatio = await etherCollateral.collateralizationRatio();
				assert.bnEqual(currentCollateralizationRatio, newCollateralizationRatio);

				assert.eventEqual(transaction, 'CollateralizationRatioUpdated', {
					ratio: newCollateralizationRatio,
				});
			});

			describe('and when collateralizationRatio is changed', async () => {
				beforeEach(async () => {
					const newCollateralizationRatio = toUnit(160);
					await etherCollateral.setCollateralizationRatio(newCollateralizationRatio, {
						from: owner,
					});
				});

				it('issuanceRatio is updated', async () => {
					const expectedIssuanceRatio = toUnit('0.625000000000000000');
					const issuanceRatio = await etherCollateral.issuanceRatio();

					assert.bnEqual(issuanceRatio, expectedIssuanceRatio);
				});
			});

			it('issueFeeRate', async () => {
				const newFeeRate = toUnit('0.001');
				await etherCollateral.setIssueFeeRate(newFeeRate, { from: owner });
				assert.bnEqual(await etherCollateral.issueFeeRate(), newFeeRate);
			});
			it('interestRate', async () => {
				const newInterestRate = toUnit('0.1'); // 10%
				await etherCollateral.setInterestRate(newInterestRate, { from: owner });
				assert.bnEqual(await etherCollateral.interestRate(), newInterestRate);
			});
			it('interestRate to 100%', async () => {
				const newInterestRate = toUnit('1'); // 100%
				await etherCollateral.setInterestRate(newInterestRate, { from: owner });
				assert.bnEqual(await etherCollateral.interestRate(), newInterestRate);
			});
			it('issueLimit', async () => {
				const newIssueLImit = toUnit('7500');
				await etherCollateral.setIssueLimit(newIssueLImit, { from: owner });
				assert.bnEqual(await etherCollateral.issueLimit(), newIssueLImit);
			});
			it('minLoanCollateralSize', async () => {
				const newMinLoanCollateralSize = toUnit('5');
				await etherCollateral.setMinLoanCollateralSize(newMinLoanCollateralSize, { from: owner });
				assert.bnEqual(await etherCollateral.minLoanCollateralSize(), newMinLoanCollateralSize);
			});
			it('accountLoanLimit', async () => {
				await etherCollateral.setAccountLoanLimit(333, { from: owner });
				assert.bnEqual(await etherCollateral.accountLoanLimit(), 333);
			});
			it('loanLiquidationOpen after 92 days', async () => {
				await fastForwardAndUpdateRates(92 * DAY);
				await etherCollateral.setLoanLiquidationOpen(true, { from: owner });
				assert.bnEqual(await etherCollateral.loanLiquidationOpen(), true);
			});
			describe('then revert when', async () => {
				it('interestRate is set over 100%', async () => {
					const newInterestRate = toUnit('1.01'); // 101%
					await assert.revert(etherCollateral.setInterestRate(newInterestRate, { from: owner }));
				});
				it('interestRate is less than seconds in a year', async () => {
					const newInterestRate = toUnit('0.000000000031536'); // 101%
					await assert.revert(etherCollateral.setInterestRate(newInterestRate, { from: owner }));
				});
				it('owner sets accountLoanLimit over ACCOUNT_LOAN_LIMIT_CAP', async () => {
					await assert.revert(
						etherCollateral.setAccountLoanLimit(1200, { from: owner }),
						'Owner cannot set higher than ACCOUNT_LOAN_LIMIT_CAP'
					);
				});
				describe('non owner attempts to set', async () => {
					it('setIssueFeeRate()', async () => {
						const newFeeRate = toUnit('0');
						await onlyGivenAddressCanInvoke({
							fnc: etherCollateral.setIssueFeeRate,
							args: [newFeeRate],
							accounts,
							address: owner,
							reason: 'Only the contract owner may perform this action',
						});
					});
					it('newInterestRate()', async () => {
						const newInterestRate = toUnit('0.1');
						await onlyGivenAddressCanInvoke({
							fnc: etherCollateral.setInterestRate,
							args: [newInterestRate],
							accounts,
							address: owner,
							reason: 'Only the contract owner may perform this action',
						});
					});
					it('setIssueLimit()', async () => {
						const newIssueLImit = toUnit('999999999999');
						await onlyGivenAddressCanInvoke({
							fnc: etherCollateral.setIssueLimit,
							args: [newIssueLImit],
							accounts,
							address: owner,
							reason: 'Only the contract owner may perform this action',
						});
					});
					it('setMinLoanCollateralSize()', async () => {
						const newminLoanCollateralSize = toUnit('0');
						await onlyGivenAddressCanInvoke({
							fnc: etherCollateral.setMinLoanCollateralSize,
							args: [newminLoanCollateralSize],
							accounts,
							address: owner,
							reason: 'Only the contract owner may perform this action',
						});
					});
					it('setAccountLoanLimit()', async () => {
						await onlyGivenAddressCanInvoke({
							fnc: etherCollateral.setAccountLoanLimit,
							args: [100],
							accounts,
							address: owner,
							reason: 'Only the contract owner may perform this action',
						});
					});
					it('setLoanLiquidationOpen() after 92 days', async () => {
						await fastForwardAndUpdateRates(92 * DAY);
						await onlyGivenAddressCanInvoke({
							fnc: etherCollateral.setLoanLiquidationOpen,
							args: [true],
							accounts,
							address: owner,
							reason: 'Only the contract owner may perform this action',
						});
					});
				});
			});
		});
	});

	describe('when accessing the external views then', async () => {
		it('loanAmountFromCollateral should return 66.66 sUSD when opening a loan with 1 ETH @ 100', async () => {
			const loanAmountFromCollateral = await etherCollateral.loanAmountFromCollateral(toUnit('1'));
			assert.bnEqual(loanAmountFromCollateral, toUnit('66.666666666666666700'));
		});
		it('loanAmountFromCollateral should return 10MM sUSD when opening a loan with 150000 ETH @ 100', async () => {
			const loanAmountFromCollateral = await etherCollateral.loanAmountFromCollateral(
				toUnit('150000')
			);
			assert.bnEqual(loanAmountFromCollateral, toUnit('10000000.000000000005'));
		});
		it('collateralAmountForLoan should return 1 ETH @ 100 required to open 66.66 sUSD', async () => {
			const ethForLoanAmounnt = await etherCollateral.collateralAmountForLoan(
				toUnit('66.666666666666666700')
			);
			assert.bnClose(ethForLoanAmounnt, toUnit('1'), 1);
		});
		it('collateralAmountForLoan should return 150000 ETH @ 100 required to open 10M sUSD', async () => {
			const ethForLoanAmounnt = await etherCollateral.collateralAmountForLoan(toUnit('10000000'));
			assert.bnEqual(ethForLoanAmounnt, toUnit('150000'));
		});
	});

	describe('when opening a Loan', async () => {
		const testLoanAmount = toUnit(1);
		describe('potential blocking conditions', () => {
			['System', 'Issuance'].forEach(section => {
				describe(`when ${section} is suspended`, () => {
					beforeEach(async () => {
						await setStatus({ owner, systemStatus, section, suspend: true });
					});
					it('then calling openLoan() reverts', async () => {
						await assert.revert(
							etherCollateral.openLoan(testLoanAmount, { value: toUnit('1'), from: address1 }),
							'Operation prohibited'
						);
					});
					describe(`when ${section} is resumed`, () => {
						beforeEach(async () => {
							await setStatus({ owner, systemStatus, section, suspend: false });
						});
						it('then calling openLoan() succeeds', async () => {
							await etherCollateral.openLoan(testLoanAmount, {
								value: toUnit('1'),
								from: address1,
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
						etherCollateral.openLoan(testLoanAmount, { value: toUnit('1'), from: address1 }),
						'Blocked as ETH rate is invalid'
					);
				});
				describe('when ETH gets a rate', () => {
					beforeEach(async () => {
						await updateRatesWithDefaults();
					});
					it('then calling openLoan() succeeds', async () => {
						await etherCollateral.openLoan(testLoanAmount, { value: toUnit('1'), from: address1 });
					});
				});
			});
		});

		describe('then revert when ', async () => {
			it('eth sent is less than minLoanCollateralSize', async () => {
				await etherCollateral.setMinLoanCollateralSize(toUnit('2'), { from: owner });
				await assert.revert(
					etherCollateral.openLoan(testLoanAmount, { value: toUnit('1'), from: address1 }),
					'Not enough ETH to create this loan. Please see the minLoanCollateralSize'
				);
			});
			it('attempting to issue more than the cap (issueLimit)', async () => {
				// limit sUSD supply cap to 100
				await etherCollateral.setIssueLimit(toUnit('100'), { from: owner });
				// 3 ETH will issue up to 200 sUSD
				await assert.revert(
					etherCollateral.openLoan(toUnit(150), { value: toUnit('3'), from: address1 }),
					'Loan Amount exceeds the supply cap.'
				);
			});
			it('attempting to issue more near the supply cap', async () => {
				// reduce the supply cap to 100 sUSD
				await etherCollateral.setIssueLimit(toUnit('200'), { from: owner });

				// Issue to under the limit
				await etherCollateral.openLoan(toUnit(100), { value: toUnit('2'), from: address1 });

				// revert when attepmting to issue above
				await assert.revert(
					etherCollateral.openLoan(toUnit(200), { value: toUnit('10'), from: address1 }),
					'Loan Amount exceeds the supply cap.'
				);

				// but allow issuing to the cap
				await etherCollateral.openLoan(toUnit(100), { value: toUnit('2'), from: address2 });
			});
			it('attempting to loan more than the max borrowing power (150%)', async () => {
				// 3 ETH will issue up to 200 sUSD
				const loanAmount = toUnit(201);
				await assert.revert(
					etherCollateral.openLoan(loanAmount, { value: toUnit('3'), from: address1 }),
					'Loan amount exceeds max borrowing power'
				);
			});
			it('loanLiquidationOpen is true', async () => {
				await fastForwardAndUpdateRates(93 * DAY);
				await etherCollateral.setLoanLiquidationOpen(true, { from: owner });
				await assert.revert(
					etherCollateral.openLoan(testLoanAmount, { value: toUnit('1'), from: address1 }),
					'Loans are now being liquidated'
				);
			});
			it('contract is paused', async () => {
				await etherCollateral.setPaused(true, { from: owner });
				await assert.revert(
					etherCollateral.openLoan(testLoanAmount, { value: toUnit('1'), from: address1 }),
					'This action cannot be performed while the contract is paused'
				);
			});
			it('calling setLoanLiquidationOpen(true) before 92 days', async () => {
				await assert.revert(
					etherCollateral.setLoanLiquidationOpen(true, { from: owner }),
					'Before liquidation deadline'
				);
			});
		});

		describe('then create loan and', async () => {
			const tenETH = toUnit('10');
			const expectedsUSDLoanAmount = calculateLoanAmount(tenETH);
			const expectedMintingFee = calculateMintingFee(expectedsUSDLoanAmount);
			const expectedTotalLoan = expectedsUSDLoanAmount.add(expectedMintingFee);
			let openLoanAmount;

			let openLoanTransaction;
			let loan1ID;

			beforeEach(async () => {
				openLoanAmount = await etherCollateral.loanAmountFromCollateral(tenETH);
				openLoanTransaction = await etherCollateral.openLoan(openLoanAmount, {
					value: tenETH,
					from: address1,
				});
				loan1ID = await getLoanID(openLoanTransaction);
			});

			it('increase the totalLoansCreated', async () => {
				assert.equal(await etherCollateral.totalLoansCreated(), 1);
			});
			it('increase the totalOpenLoanCount', async () => {
				assert.equal(await etherCollateral.totalOpenLoanCount(), 1);
			});
			it('increase the totalIssuedSynths', async () => {
				assert.bnEqual(await etherCollateral.totalIssuedSynths(), expectedsUSDLoanAmount);
			});
			it('emit a LoanCreated event', async () => {
				assert.eventEqual(openLoanTransaction, 'LoanCreated', {
					account: address1,
					loanID: 1,
					amount: expectedsUSDLoanAmount,
				});
			});
			it('store the synthLoan.acccount', async () => {
				const synthLoan = await etherCollateral.getLoan(address1, loan1ID);
				assert.equal(synthLoan.account, address1);
			});
			it('store the synthLoan.collateralAmount', async () => {
				const synthLoan = await etherCollateral.getLoan(address1, loan1ID);
				assert.bnEqual(synthLoan.collateralAmount, tenETH);
			});
			it('store the synthLoan.loanAmount', async () => {
				const synthLoan = await etherCollateral.getLoan(address1, loan1ID);
				assert.bnEqual(synthLoan.loanAmount, expectedTotalLoan);
			});
			it('store the synthLoan.loanID', async () => {
				const synthLoan = await etherCollateral.getLoan(address1, loan1ID);
				assert.bnEqual(synthLoan.loanID, loan1ID);
			});
			it('store the synthLoan.timeCreated', async () => {
				const synthLoan = await etherCollateral.getLoan(address1, loan1ID);
				assert.unitNotEqual(synthLoan.timeCreated, ZERO_BN);
			});
			it('store the synthLoan.timeClosed as 0 for not closed', async () => {
				const synthLoan = await etherCollateral.getLoan(address1, loan1ID);
				assert.bnEqual(synthLoan.timeClosed, ZERO_BN);
			});
			it('add the loan issue amount minus minting fees to creators balance', async () => {
				const issuanceFee = calculateMintingFee(expectedsUSDLoanAmount);
				const sUSDBalance = await sUSDSynth.balanceOf(address1);
				assert.bnEqual(sUSDBalance, expectedsUSDLoanAmount.sub(issuanceFee));
			});
			it('add the ETH collateral balance to the contract', async () => {
				const ethInContract = await getEthBalance(etherCollateral.address);
				assert.equal(ethInContract, tenETH);
			});
			describe('then close the only loan open in the system', () => {
				let closeLoanTransaction;
				let expectedInterestUSD;

				beforeEach(async () => {
					// User will have had to made some positive trades to cover the interest
					await issuesUSDToAccount(toUnit('10000'), address1);
					// Go into the future
					await fastForwardAndUpdateRates(MONTH * 2);

					// Repay part of loan to accrue interest in loanAmount
					await etherCollateral.repayLoan(address1, loan1ID, toUnit(100), { from: address1 });

					// Fast forward 2 months
					await fastForwardAndUpdateRates(MONTH * 2);

					// Close loan
					closeLoanTransaction = await etherCollateral.closeLoan(loan1ID, { from: address1 });

					// Cacluate the total interest
					expectedInterestUSD = await getSynthLoanTotalInterest(address1, loan1ID);
				});
				it('LoanClosed event emits the total interest fees charged', async () => {
					assert.eventEqual(closeLoanTransaction, 'LoanClosed', {
						account: address1,
						loanID: loan1ID,
						feesPaid: expectedInterestUSD,
					});
				});
				it('accrued interest is greater than 0', async () => {
					assert.bnGt(expectedInterestUSD, new BN(0));
				});
				it('should reset the totalIssuedSynths to 0, ignoring accrued interest paid as fees', async () => {
					const totalIssuedSynthsAfter = await etherCollateral.totalIssuedSynths();

					assert.bnEqual(totalIssuedSynthsAfter, 0);
				});
			});

			describe('when opening a second loan against address1', async () => {
				let loan2Transaction;
				let loan2ID;
				let totalIssuedSynthsBefore;
				let openLoanAmount;
				const fiveThousandETH = toUnit('5000');
				const expectedsUSDLoanAmount = calculateLoanAmount(fiveThousandETH);
				const expectedMintingFee = calculateMintingFee(expectedsUSDLoanAmount);
				const expectedsUSDTotalLoan = expectedsUSDLoanAmount.add(expectedMintingFee);

				beforeEach(async () => {
					openLoanAmount = await etherCollateral.loanAmountFromCollateral(fiveThousandETH);
					totalIssuedSynthsBefore = await etherCollateral.totalIssuedSynths();
					loan2Transaction = await etherCollateral.openLoan(openLoanAmount, {
						value: fiveThousandETH,
						from: address1,
					});
					loan2ID = await getLoanID(loan2Transaction);
				});

				it('then increase the totalLoansCreated', async () => {
					assert.equal(await etherCollateral.totalLoansCreated(), 2);
				});
				it('then increase the totalOpenLoanCount', async () => {
					assert.equal(await etherCollateral.totalOpenLoanCount(), 2);
				});
				it('then increase the totalIssuedSynths', async () => {
					assert.bnEqual(
						await etherCollateral.totalIssuedSynths(),
						totalIssuedSynthsBefore.add(expectedsUSDTotalLoan)
					);
				});
				it('then store 2 loans against the account', async () => {
					const openLoanIDsByAccount = await etherCollateral.openLoanIDsByAccount(address1);
					assert.equal(openLoanIDsByAccount.length, 2);
				});
				it('list of openLoanIDsByAccount contains both loanIDs', async () => {
					const openLoanIDsByAccount = await etherCollateral.openLoanIDsByAccount(address1);
					assert.bnEqual(openLoanIDsByAccount[0], loan1ID);
					assert.bnEqual(openLoanIDsByAccount[1], loan2ID);
				});

				describe('when opening loan3 against address2', async () => {
					let loan3Transaction;
					let loan3ID;
					let totalSupplyBefore;
					let openLoanAmount;
					const threeNintyETH = toUnit('390');
					const expectedsUSDLoanAmount = calculateLoanAmount(threeNintyETH);

					beforeEach(async () => {
						openLoanAmount = await etherCollateral.loanAmountFromCollateral(threeNintyETH);
						totalSupplyBefore = await etherCollateral.totalIssuedSynths();
						loan3Transaction = await etherCollateral.openLoan(openLoanAmount, {
							value: threeNintyETH,
							from: address2,
						});
						loan3ID = await getLoanID(loan3Transaction);
					});

					it('then increase the totalLoansCreated', async () => {
						assert.equal(await etherCollateral.totalLoansCreated(), 3);
					});
					it('then increase the totalOpenLoanCount', async () => {
						assert.equal(await etherCollateral.totalOpenLoanCount(), 3);
					});
					it('then increase the totalIssuedSynths', async () => {
						assert.bnEqual(
							await etherCollateral.totalIssuedSynths(),
							totalSupplyBefore.add(expectedsUSDLoanAmount)
						);
					});
					it('then store 1 loan against the account', async () => {
						const openLoanIDsByAccount = await etherCollateral.openLoanIDsByAccount(address2);
						assert.equal(openLoanIDsByAccount.length, 1);
					});
					it('list of openLoanIDsByAccount contains loanID', async () => {
						const openLoanIDsByAccount = await etherCollateral.openLoanIDsByAccount(address2);
						assert.bnEqual(openLoanIDsByAccount[0], loan3ID);
					});

					describe('when closing the first loan of address1', async () => {
						let expectedInterestUSD;
						let interestRatePerSec;
						let closeLoanTransaction;

						beforeEach(async () => {
							// User will have had to made some positive trades to cover the interest
							await issuesUSDToAccount(toUnit('10000'), address1);
							// Go into the future
							await fastForwardAndUpdateRates(MONTH * 2);
							interestRatePerSec = await etherCollateral.interestPerSecond();
							// Get the total sUSD Issued
							totalIssuedSynthsBefore = await etherCollateral.totalIssuedSynths();
							// Close loan
							closeLoanTransaction = await etherCollateral.closeLoan(loan1ID, { from: address1 });
							// Cacluate the fees
							expectedInterestUSD = await getSynthLoanTotalInterest(address1, loan1ID);
						});
						it('does not change the totalLoansCreated', async () => {
							assert.equal(await etherCollateral.totalLoansCreated(), 3);
						});
						it('decrease the totalOpenLoanCount', async () => {
							assert.equal(await etherCollateral.totalOpenLoanCount(), 2);
						});
						it('decrease the totalIssuedSynths', async () => {
							const synthLoan = await etherCollateral.getLoan(address1, loan1ID);
							const totalIssuedSynthsLessLoan = totalIssuedSynthsBefore.sub(synthLoan.loanAmount);
							assert.bnEqual(await etherCollateral.totalIssuedSynths(), totalIssuedSynthsLessLoan);
						});
						it('then store 1 loans against the account', async () => {
							const openLoanIDsByAccount = await etherCollateral.openLoanIDsByAccount(address1);
							assert.equal(openLoanIDsByAccount.length, 1);
						});
						it('list of openLoanIDsByAccount contains loanID', async () => {
							const openLoanIDsByAccount = await etherCollateral.openLoanIDsByAccount(address1);
							assert.bnEqual(openLoanIDsByAccount[0], loan2ID);
						});
						it('LoanClosed event emits the total interest fees charged', async () => {
							assert.eventEqual(closeLoanTransaction, 'LoanClosed', {
								account: address1,
								loanID: loan1ID,
								feesPaid: expectedInterestUSD,
							});
						});
						it('Charges the correct interest', async () => {
							const synthLoan = await etherCollateral.getLoan(address1, loan1ID);
							// Expected interest from 3 months at 5% APR
							const expectedInterest = calculateInterest(
								synthLoan.loanAmount,
								interestRatePerSec,
								2 * MONTH
							);
							// Calculate interest from contract
							const interestAmount = await etherCollateral.accruedInterestOnLoan(
								synthLoan.loanAmount,
								2 * MONTH
							);
							assert.bnClose(expectedInterest, interestAmount, 1);
						});

						describe('when closing the second loan of address1', async () => {
							let expectedInterestUSD;
							let closeLoanTransaction;

							beforeEach(async () => {
								// Get the total sUSD Issued
								totalIssuedSynthsBefore = await etherCollateral.totalIssuedSynths();

								closeLoanTransaction = await etherCollateral.closeLoan(loan2ID, { from: address1 });
							});

							it('decrease the totalOpenLoanCount', async () => {
								assert.equal(await etherCollateral.totalOpenLoanCount(), 1);
							});
							it('does not change the totalLoansCreated', async () => {
								assert.equal(await etherCollateral.totalLoansCreated(), 3);
							});
							it('decrease the totalIssuedSynths', async () => {
								const synthLoan = await etherCollateral.getLoan(address1, loan2ID);
								const totalIssuedSynths = await etherCollateral.totalIssuedSynths();
								const totalIssuedSynthsLessLoan = totalIssuedSynthsBefore.sub(synthLoan.loanAmount);
								assert.bnEqual(totalIssuedSynths, totalIssuedSynthsLessLoan);
							});
							it('then address2 has 1 openLoanID', async () => {
								const openLoanIDsByAccount = await etherCollateral.openLoanIDsByAccount(address2);
								assert.equal(openLoanIDsByAccount.length, 1);
							});
							it('list of openLoanIDsByAccount contains loan3ID', async () => {
								const openLoanIDsByAccount = await etherCollateral.openLoanIDsByAccount(address2);
								assert.bnEqual(openLoanIDsByAccount[0], loan3ID);
							});
							it('LoanClosed event emits', async () => {
								assert.eventEqual(closeLoanTransaction, 'LoanClosed', {
									account: address1,
									loanID: loan2ID,
								});
							});
							it('LoanClosed event emits the fees charged', async () => {
								// Get all interest fees
								expectedInterestUSD = await getSynthLoanTotalInterest(address1, loan2ID);

								assert.eventEqual(closeLoanTransaction, 'LoanClosed', {
									account: address1,
									loanID: loan2ID,
									feesPaid: expectedInterestUSD,
								});
							});

							describe('when closing loanID 3 from address2', async () => {
								// let calculatedFeesUSD;
								let closeLoanTransaction;

								beforeEach(async () => {
									// calculatedFeesUSD = await calculateLoanInterestFees(address2, loan3ID);
									// console.log('calculatedFeesUSD', calculatedFeesUSD.toString());

									// User will have had to made some positive trades to cover the interest
									await issuesUSDToAccount(toUnit('1000'), address2);

									closeLoanTransaction = await etherCollateral.closeLoan(loan3ID, {
										from: address2,
									});
								});
								it('decrease the totalOpenLoanCount', async () => {
									assert.equal(await etherCollateral.totalOpenLoanCount(), 0);
								});
								it('does not change the totalLoansCreated', async () => {
									assert.equal(await etherCollateral.totalLoansCreated(), 3);
								});
								it('decrease the totalIssuedSynths', async () => {
									const totalIssuedSynths = await etherCollateral.totalIssuedSynths();
									assert.bnEqual(totalIssuedSynths, ZERO_BN);
								});
								it('list of openLoanIDsByAccount contains 0 length', async () => {
									const openLoanIDsByAccount = await etherCollateral.openLoanIDsByAccount(address2);
									assert.equal(openLoanIDsByAccount.length, 0);
								});
								it('LoanClosed event emits', async () => {
									assert.eventEqual(closeLoanTransaction, 'LoanClosed', {
										account: address2,
										loanID: loan3ID,
									});
								});
								it('LoanClosed event emits the fees charged', async () => {
									assert.eventEqual(closeLoanTransaction, 'LoanClosed', {
										account: address2,
										loanID: loan3ID,
										// feesPaid: calculatedFeesUSD,
										// 217894669494679490149
										// 217894586636993046408
									});
								});
							});
						});
					});
				});
			});

			describe('when a loan is opened', async () => {
				let loanID;
				let interestRatePerSec;
				let synthLoan;
				let openLoanTransaction;
				let openLoanAmount;
				const twelveHalfETH = toUnit('12.5');

				beforeEach(async () => {
					openLoanAmount = await etherCollateral.loanAmountFromCollateral(twelveHalfETH);
					interestRatePerSec = await etherCollateral.interestPerSecond();
					openLoanTransaction = await etherCollateral.openLoan(openLoanAmount, {
						value: twelveHalfETH,
						from: address1,
					});
					loanID = await getLoanID(openLoanTransaction);
					synthLoan = await etherCollateral.getLoan(address1, loanID);
				});

				describe('then calculate the interest on loan based on APR', async () => {
					it('interest rate per second is correct', async () => {
						const expectedRate = toUnit('0.05').div(new BN(YEAR));
						assert.bnEqual(expectedRate, interestRatePerSec);
					});
					it('after 1 year', async () => {
						const loanAmount = synthLoan.loanAmount;

						// Expected interest from 1 year at 5% APR
						const expectedInterest = calculateInterest(loanAmount, interestRatePerSec, YEAR);

						// Calculate interest from contract
						const interestAmount = await etherCollateral.accruedInterestOnLoan(loanAmount, YEAR);

						assert.bnEqual(expectedInterest, interestAmount);

						// Interest amount is close to 0.5 ETH after 1 year
						assert.ok(interestAmount.gt(toUnit('0.4999') && interestAmount.lte('0.5')));
					});
					it('after 1 second', async () => {
						const loanAmount = synthLoan.loanAmount;

						// Expected interest from 1 minute at 5% APR
						const expectedInterest = calculateInterest(loanAmount, interestRatePerSec, 1);

						// Calculate interest from contract
						const interestAmount = await etherCollateral.accruedInterestOnLoan(loanAmount, 1);

						assert.bnClose(expectedInterest, interestAmount);
					});
					it('after 1 minute', async () => {
						const loanAmount = synthLoan.loanAmount;

						// Expected interest from 1 minute at 5% APR
						const expectedInterest = calculateInterest(loanAmount, interestRatePerSec, MINUTE);

						// Calculate interest from contract
						const interestAmount = await etherCollateral.accruedInterestOnLoan(loanAmount, MINUTE);

						assert.bnEqual(expectedInterest, interestAmount);
					});
					it('1 week', async () => {
						const loanAmount = synthLoan.loanAmount;

						// Expected interest from 1 week at 5% APR
						const expectedInterest = calculateInterest(loanAmount, interestRatePerSec, WEEK);

						// Calculate interest from contract
						const interestAmount = await etherCollateral.accruedInterestOnLoan(loanAmount, WEEK);

						assert.bnEqual(expectedInterest, interestAmount);
					});
					it('3 months', async () => {
						const loanAmount = synthLoan.loanAmount;

						// Expected interest from 3 months at 5% APR
						const expectedInterest = calculateInterest(loanAmount, interestRatePerSec, 12 * WEEK);

						// Calculate interest from contract
						const interestAmount = await etherCollateral.accruedInterestOnLoan(
							loanAmount,
							12 * WEEK
						);

						assert.bnEqual(expectedInterest, interestAmount);
					});
				});

				describe('when calculating the interest on open SynthLoan after', async () => {
					it('1 second pass', async () => {
						const timeBefore = await currentTime();
						await fastForward(1);
						const loanAmount = synthLoan.loanAmount;

						const timeAfter = await currentTime();
						const timeElapsed = timeAfter - timeBefore;
						const expectedInterest = calculateInterest(loanAmount, interestRatePerSec, timeElapsed);

						// expect currentInterestOnLoan to calculate accrued interest from synthLoan greater than 1 second interest
						const interest = await etherCollateral.currentInterestOnLoan(address1, loanID);
						assert.ok(interest.gte(expectedInterest));
					});
					it('1 minute pass', async () => {
						const timeBefore = await currentTime();
						await fastForward(60);
						const loanAmount = synthLoan.loanAmount;

						const timeAfter = await currentTime();
						const timeElapsed = timeAfter - timeBefore;

						const expectedInterest = calculateInterest(loanAmount, interestRatePerSec, timeElapsed);

						// expect currentInterestOnLoan to calculate accrued interest from synthLoan
						const interest = await etherCollateral.currentInterestOnLoan(address1, loanID);

						assert.ok(interest.gte(expectedInterest));
					});
					it('1 week pass', async () => {
						const timeBefore = await currentTime();
						await fastForwardAndUpdateRates(WEEK);
						const loanAmount = synthLoan.loanAmount;

						const timeAfter = await currentTime();
						const timeElapsed = timeAfter - timeBefore;

						const expectedInterest = calculateInterest(loanAmount, interestRatePerSec, timeElapsed);

						// expect currentInterestOnLoan to calculate accrued interest from synthLoan
						const interest = await etherCollateral.currentInterestOnLoan(address1, loanID);

						assert.ok(interest.gte(expectedInterest));
					});
				});
			});
		});

		xdescribe('when creating multiple loans', () => {
			const tenETH = toUnit('10');

			beforeEach(async () => {
				// Issue sUSD to pay back interest
				await issuesUSDToAccount(toUnit('1000'), address1);
				await issuesUSDToAccount(toUnit('1000'), address2);
				await issuesUSDToAccount(toUnit('1000'), address3);
			});

			it('then loans are opened and all closed as expected', async () => {
				const openLoanAmount10ETH = await etherCollateral.loanAmountFromCollateral(tenETH);

				// Alice creates a loan
				await etherCollateral.openLoan(openLoanAmount10ETH, { value: tenETH, from: address1 });

				// Bob creates a loan
				await etherCollateral.openLoan(openLoanAmount10ETH, { value: tenETH, from: address2 });

				// Alice creates 2 more loans
				await etherCollateral.openLoan(openLoanAmount10ETH, { value: tenETH, from: address1 });
				await etherCollateral.openLoan(openLoanAmount10ETH, { value: tenETH, from: address1 });

				fastForward(MINUTE * 1);
				assert.equal(await etherCollateral.totalOpenLoanCount(), 4);

				await fastForwardAndUpdateRates(WEEK * 2);

				// Alice closes a loan
				await etherCollateral.closeLoan(4, { from: address1 });
				assert.equal(await etherCollateral.totalOpenLoanCount(), 3);

				// Alice closes all loans
				await etherCollateral.closeLoan(3, { from: address1 });
				await etherCollateral.closeLoan(1, { from: address1 });

				assert.equal(await etherCollateral.totalOpenLoanCount(), 1);

				const openLoanIDsByAccount = await etherCollateral.openLoanIDsByAccount(address2);
				assert.bnEqual(openLoanIDsByAccount[0], 2);

				// Bob closes a loan
				await etherCollateral.closeLoan(2, { from: address2 });
				assert.equal(await etherCollateral.totalOpenLoanCount(), 0);
			}).timeout(TEST_TIMEOUT);

			it('then opening & closing from 10 different accounts', async () => {
				const first10Accounts = accounts.slice(0, 10);
				const openLoanAmount = await etherCollateral.loanAmountFromCollateral(tenETH);

				for (let i = 0; i < first10Accounts.length; i++) {
					await etherCollateral.openLoan(openLoanAmount, {
						value: tenETH,
						from: first10Accounts[i],
					});
					// Issue sUSD to pay back interest
					await issuesUSDToAccount(toUnit('1000'), first10Accounts[i]);
				}
				assert.bnEqual(await etherCollateral.totalOpenLoanCount(), web3.utils.toBN(10));

				await fastForwardAndUpdateRates(MONTH * 3);

				for (let i = 0; i < first10Accounts.length; i++) {
					await etherCollateral.closeLoan(i + 1, { from: first10Accounts[i] });
				}
				assert.equal(await etherCollateral.totalOpenLoanCount(), 0);
			}).timeout(TEST_TIMEOUT);

			it('then address1 opens 50 x 1 eth loans and close them', async () => {
				const minLoanCollateralSize = await etherCollateral.minLoanCollateralSize();
				const minOpenLoanAmount = await etherCollateral.loanAmountFromCollateral(
					minLoanCollateralSize
				);
				const accountLoanLimit = await etherCollateral.accountLoanLimit();
				for (let i = 0; i < accountLoanLimit; i++) {
					await etherCollateral.openLoan(minOpenLoanAmount, {
						value: minLoanCollateralSize,
						from: address1,
					});
				}

				// Opening the next loan should revert
				await assert.revert(
					etherCollateral.openLoan(minOpenLoanAmount, {
						value: minLoanCollateralSize,
						from: address1,
					})
				);

				await fastForwardAndUpdateRates(DAY * 1);

				assert.bnEqual(await etherCollateral.totalOpenLoanCount(), accountLoanLimit);
				assert.bnEqual(await etherCollateral.totalLoansCreated(), accountLoanLimit);

				for (let i = 0; i < accountLoanLimit; i++) {
					await etherCollateral.closeLoan(i + 1, { from: address1 });
				}

				assert.bnEqual(await etherCollateral.totalOpenLoanCount(), 0);
				assert.bnEqual(await etherCollateral.totalLoansCreated(), accountLoanLimit);
			}).timeout(TEST_TIMEOUT);

			it('then 3 accounts open 50 (accountLoanLimit) x 1 eth loans', async () => {
				const minLoanCollateralSize = await etherCollateral.minLoanCollateralSize();
				const minOpenLoanAmount = await etherCollateral.loanAmountFromCollateral(
					minLoanCollateralSize
				);
				const accountLoanLimit = await etherCollateral.accountLoanLimit();
				for (let i = 0; i < accountLoanLimit; i++) {
					await etherCollateral.openLoan(minOpenLoanAmount, {
						value: minLoanCollateralSize,
						from: address1,
					});
					await etherCollateral.openLoan(minOpenLoanAmount, {
						value: minLoanCollateralSize,
						from: address2,
					});
					await etherCollateral.openLoan(minOpenLoanAmount, {
						value: minLoanCollateralSize,
						from: address3,
					});
				}
				assert.bnEqual(await etherCollateral.totalOpenLoanCount(), accountLoanLimit * 3);
				assert.bnEqual(await etherCollateral.totalLoansCreated(), accountLoanLimit * 3);

				for (let i = 0; i < accountLoanLimit * 3; i = i + 3) {
					await etherCollateral.closeLoan(i + 1, { from: address1 });
					await etherCollateral.closeLoan(i + 2, { from: address2 });
					await etherCollateral.closeLoan(i + 3, { from: address3 });
				}

				assert.bnEqual(await etherCollateral.totalOpenLoanCount(), 0);
				assert.bnEqual(await etherCollateral.totalLoansCreated(), accountLoanLimit * 3);
			}).timeout(TEST_TIMEOUT);
		});

		describe('when closing a Loan', async () => {
			const tenETH = toUnit('10');
			let openLoanAmount;

			describe('check conditions', async () => {
				let openLoanTransaction;
				let loanID;

				beforeEach(async () => {
					openLoanAmount = await etherCollateral.loanAmountFromCollateral(tenETH);
					openLoanTransaction = await etherCollateral.openLoan(openLoanAmount, {
						value: tenETH,
						from: address1,
					});
					loanID = await getLoanID(openLoanTransaction);
					await fastForwardAndUpdateRates(WEEK * 2);
				});

				it('when loanID does not exist, then it reverts', async () => {
					await assert.revert(etherCollateral.closeLoan(9999, { from: address1 }));
				});

				it('when sUSD balance is less than loanAmount, then it reverts', async () => {
					// "Burn" some of accounts sUSD by sending to the owner
					await sUSDSynth.transfer(owner, toUnit('4'), { from: address1 });
					await assert.revert(etherCollateral.closeLoan(loanID, { from: address1 }));
				});

				describe('potential blocking conditions', () => {
					['System', 'Issuance'].forEach(section => {
						describe(`when ${section} is suspended`, () => {
							beforeEach(async () => {
								await issuesUSDToAccount(toUnit('100'), address1);
								await setStatus({ owner, systemStatus, section, suspend: true });
							});
							it('then calling closeLoan() reverts', async () => {
								await assert.revert(
									etherCollateral.closeLoan(loanID, {
										from: address1,
									}),
									'Operation prohibited'
								);
							});
							describe(`when ${section} is resumed`, () => {
								beforeEach(async () => {
									await setStatus({ owner, systemStatus, section, suspend: false });
								});
								it('then calling closeLoan() succeeds', async () => {
									await etherCollateral.closeLoan(loanID, {
										from: address1,
									});
								});
							});
						});
					});

					describe('when rates have gone stale', () => {
						beforeEach(async () => {
							await fastForward(
								(await exchangeRates.rateStalePeriod()).add(web3.utils.toBN('300'))
							);
							issuesUSDToAccount(toUnit('100'), address1);
						});
						it('then calling closeLoan() reverts', async () => {
							await assert.revert(
								etherCollateral.closeLoan(loanID, {
									from: address1,
								}),
								'Blocked as ETH rate is invalid'
							);
						});
						describe('when sUSD gets a rate', () => {
							beforeEach(async () => {
								await updateRatesWithDefaults();
							});
							it('then calling closeLoan() succeeds', async () => {
								await etherCollateral.closeLoan(loanID, {
									from: address1,
								});
							});
						});
					});
				});
			});

			describe('then it closes the loan and', async () => {
				let openLoanTransaction;
				let closeLoanTransaction;
				let openLoanID;
				// let interestRatePerSec;
				// let expectedInterest;
				let expectedFeesUSD;
				// let address1ETHBalanceBefore;
				// let gasPaidOpenLoan;
				// let gasPaidCloseLoan;
				let feePoolBalanceBefore;
				let expectedInterestUSD;

				beforeEach(async () => {
					// const feePoolBalance = await sUSDSynth.balanceOf(FEE_ADDRESS);
					// console.log('feePoolBalance', feePoolBalance.toString());

					const openLoanAmount = await etherCollateral.loanAmountFromCollateral(tenETH);

					feePoolBalanceBefore = await sUSDSynth.balanceOf(FEE_ADDRESS);
					// interestRatePerSec = await etherCollateral.interestPerSecond();

					// Save Accounts balance
					// address1ETHBalanceBefore = await getEthBalance(address1);

					// Open loan with 10 ETH
					openLoanTransaction = await etherCollateral.openLoan(openLoanAmount, {
						value: tenETH,
						from: address1,
					});
					openLoanID = await getLoanID(openLoanTransaction);
					// gasPaidOpenLoan = web3.utils.toBN(openLoanTransaction.receipt.gasUsed * GAS_PRICE);

					// Go into the future
					await fastForwardAndUpdateRates(MONTH * 2);

					await issuesUSDToAccount(toUnit('100'), address1);

					// Close the loan
					closeLoanTransaction = await etherCollateral.closeLoan(openLoanID, {
						from: address1,
					});
					// gasPaidCloseLoan = web3.utils.toBN(closeLoanTransaction.receipt.gasUsed * GAS_PRICE);

					// Cacluate the fees
					expectedFeesUSD = await calculateLoanInterestFees(address1, openLoanID);
				});

				it('does not change the totalLoansCreated', async () => {
					assert.equal(await etherCollateral.totalLoansCreated(), 1);
				});

				it('decrease the totalOpenLoanCount', async () => {
					assert.equal(await etherCollateral.totalOpenLoanCount(), 0);
				});

				it('decrease the totalIssuedSynths', async () => {
					assert.bnEqual(await etherCollateral.totalIssuedSynths(), 0);
				});

				it('does not delete it from onchain', async () => {
					const synthLoan = await etherCollateral.getLoan(address1, openLoanID);
					assert.equal(synthLoan.account, address1);
					assert.bnEqual(synthLoan.loanID, openLoanID);
					assert.bnEqual(synthLoan.collateralAmount, tenETH);
				});

				it('has the correct loanAmount', async () => {
					const expectedLoanAmount = await calculateLoanAmount(tenETH);
					const synthLoan = await etherCollateral.getLoan(address1, openLoanID);
					assert.bnEqual(synthLoan.loanAmount, expectedLoanAmount);
				});

				it('timeClosed > timeCreated', async () => {
					const synthLoan = await etherCollateral.getLoan(address1, openLoanID);
					assert.ok(synthLoan.timeClosed > synthLoan.timeCreated, true);
				});

				it('reduce sUSD totalSupply', async () => {
					assert.bnEqual(await etherCollateral.totalIssuedSynths(), ZERO_BN);
				});

				xit('increase the FeePool sUSD balance', async () => {
					// TODO Need to include the minting fee
					const feePoolBalance = await sUSDSynth.balanceOf(FEE_ADDRESS);
					console.log('expectedFeesUSD', expectedFeesUSD.toString());
					console.log('feePoolBalanceBefore', feePoolBalanceBefore.toString());
					console.log('feePoolBalance', feePoolBalance.toString());

					assert.bnEqual(feePoolBalance, expectedFeesUSD);
				});

				xit('record the fees in the FeePool.feesToDistribute', async () => {
					// TODO Need to include the minting fee
					const currentFeePeriod = await feePool.recentFeePeriods(0);
					assert.bnEqual(currentFeePeriod.feesToDistribute, expectedFeesUSD);
				});

				it('decrease the ETH balance in the EtherCollateral contract', async () => {
					const ethCollateralETHBalance = await getEthBalance(etherCollateral.address);
					assert.bnEqual(ethCollateralETHBalance, ZERO_BN);
				});

				it('emits a LoanClosed event', async () => {
					expectedInterestUSD = await getSynthLoanTotalInterest(address1, openLoanID);
					assert.eventEqual(closeLoanTransaction, 'LoanClosed', {
						account: address1,
						loanID: 1,
						feesPaid: expectedInterestUSD,
					});
				});
			});
		});
	});

	describe('when loanLiquidation is opened', async () => {
		const oneETH = toUnit('10');
		const expectedsUSDLoanAmount = calculateLoanAmount(oneETH);
		const alice = address1;
		const bob = address2;
		const chad = address3;
		let openLoanAmount;
		let openLoanTransaction;
		let loanID;

		beforeEach(async () => {
			openLoanAmount = await etherCollateral.loanAmountFromCollateral(oneETH);
			// Setup Alice loan to be liquidated
			openLoanTransaction = await etherCollateral.openLoan(openLoanAmount, {
				value: oneETH,
				from: alice,
			});
			loanID = await getLoanID(openLoanTransaction);

			// Chad opens sUSD loan to liquidate Alice
			const chadLoanAmount = await etherCollateral.loanAmountFromCollateral(toUnit('20'));
			await etherCollateral.openLoan(chadLoanAmount, { value: toUnit('20'), from: chad });

			// Fast Forward to beyond end of the trial
			await fastForwardAndUpdateRates(DAY * 94);
			await etherCollateral.setLoanLiquidationOpen(true, { from: owner });
		});
		it('when bob attempts to liquidate alices loan and he has no sUSD then it reverts', async () => {
			await assert.revert(
				etherCollateral.liquidateUnclosedLoan(alice, loanID, { from: bob }),
				'You do not have the required Synth balance to close this loan.'
			);
		});
		it('when alice create a loan then it reverts', async () => {
			await assert.revert(
				etherCollateral.openLoan(openLoanAmount, { value: oneETH, from: alice }),
				'Loans are now being liquidated'
			);
		});
		xit('then alice has a sUSD loan balance', async () => {
			assert.bnEqual(await sUSDSynth.balanceOf(alice), expectedsUSDLoanAmount);
		});

		describe('when loanLiquidation is open', () => {
			beforeEach(async () => {
				await etherCollateral.setLoanLiquidationOpen(true, { from: owner });
			});
			describe('when chad has some sUSD and alice has her sUSD still', () => {
				beforeEach(async () => {
					// Chad has already opened a sUSD loan
				});
				describe('and chad liquidates alices sUSD loan for her ETH', async () => {
					let liquidateLoanTransaction;
					beforeEach(async () => {
						liquidateLoanTransaction = await etherCollateral.liquidateUnclosedLoan(alice, loanID, {
							from: chad,
						});
					});
					it('then alices loan is closed', async () => {
						const synthLoan = await etherCollateral.getLoan(alice, loanID);
						assert.ok(synthLoan.timeClosed > synthLoan.timeCreated, true);
					});
					it('then alice sUSD balance is still intact', async () => {
						assert.ok(await sUSDSynth.balanceOf(alice), expectedsUSDLoanAmount);
					});
					it('then chads sUSD balance is 0 as it was burnt to repay the loan', async () => {
						assert.ok(await sUSDSynth.balanceOf(chad), 0);
					});
					it('then emits a LoanLiquidated event', async () => {
						assert.eventsEqual(
							liquidateLoanTransaction,
							'LoanClosed',
							{
								account: alice,
								loanID: loanID,
							},
							'LoanLiquidated',
							{
								account: alice,
								loanID: loanID,
								liquidator: chad,
							}
						);
					});
					it('then it decreases the totalOpenLoanCount', async () => {
						assert.equal(await etherCollateral.totalOpenLoanCount(), 1);
					});
					it('then it does not change the totalLoansCreated', async () => {
						assert.equal(await etherCollateral.totalLoansCreated(), 2);
					});
				});
			});

			describe('when bob has some sUSD', () => {
				beforeEach(async () => {
					await sUSDSynth.transfer(bob, await sUSDSynth.balanceOf(alice), { from: alice });
					await issuesUSDToAccount(toUnit('100'), bob);
				});
				describe('and bob liquidates alices sUSD loan for her ETH', async () => {
					let liquidateLoanTransaction;
					beforeEach(async () => {
						liquidateLoanTransaction = await etherCollateral.liquidateUnclosedLoan(alice, loanID, {
							from: bob,
						});
					});
					it('then alices loan is closed', async () => {
						const synthLoan = await etherCollateral.getLoan(alice, loanID);
						assert.ok(synthLoan.timeClosed > synthLoan.timeCreated, true);
					});
					it('then alice sUSD balance is 0 (because she transfered it to bob)', async () => {
						assert.ok(await sUSDSynth.balanceOf(alice), 0);
					});
					it('then bobs sUSD balance is 0 as it was burnt to repay the loan', async () => {
						assert.ok(await sUSDSynth.balanceOf(bob), 0);
					});
					it('then emits a LoanLiquidated event', async () => {
						assert.eventsEqual(
							liquidateLoanTransaction,
							'LoanClosed',
							{
								account: alice,
								loanID: loanID,
							},
							'LoanLiquidated',
							{
								account: alice,
								loanID: loanID,
								liquidator: bob,
							}
						);
					});
					it('then it decreases the totalOpenLoanCount', async () => {
						assert.equal(await etherCollateral.totalOpenLoanCount(), 1);
					});
					it('then it does not change the totalLoansCreated', async () => {
						assert.equal(await etherCollateral.totalLoansCreated(), 2);
					});
				});
				describe('potential blocking conditions', () => {
					['System', 'Issuance'].forEach(section => {
						describe(`when ${section} is suspended`, () => {
							beforeEach(async () => {
								await updateRatesWithDefaults();
								await setStatus({ owner, systemStatus, section, suspend: true });
							});
							it('then calling liquidateUnclosedLoan() reverts', async () => {
								await assert.revert(
									etherCollateral.liquidateUnclosedLoan(alice, loanID, {
										from: bob,
									}),
									'Operation prohibited'
								);
							});
							describe(`when ${section} is resumed`, () => {
								beforeEach(async () => {
									await setStatus({ owner, systemStatus, section, suspend: false });
								});
								it('then calling liquidateUnclosedLoan() succeeds', async () => {
									await etherCollateral.liquidateUnclosedLoan(alice, loanID, {
										from: bob,
									});
								});
							});
						});
					});

					describe('when rates have gone stale', () => {
						beforeEach(async () => {
							await fastForward(
								(await exchangeRates.rateStalePeriod()).add(web3.utils.toBN('300'))
							);
						});
						it('then calling liquidateUnclosedLoan() reverts', async () => {
							await assert.revert(
								etherCollateral.liquidateUnclosedLoan(alice, loanID, {
									from: bob,
								}),
								'Blocked as ETH rate is invalid'
							);
						});
						describe('when sUSD gets a rate', () => {
							beforeEach(async () => {
								await updateRatesWithDefaults();
							});
							it('then calling liquidateUnclosedLoan() succeeds', async () => {
								await etherCollateral.liquidateUnclosedLoan(alice, loanID, {
									from: bob,
								});
							});
						});
					});
				});
			});
		});
	});

	describe('when collateral is deposited', async () => {
		const oneETH = toUnit('10');
		const twoETH = toUnit('20');
		const alice = address1;
		let openLoanAmount;
		let openLoanTransaction;
		let loanID;

		beforeEach(async () => {
			openLoanAmount = await etherCollateral.loanAmountFromCollateral(oneETH);
			openLoanTransaction = await etherCollateral.openLoan(openLoanAmount, {
				value: oneETH,
				from: alice,
			});
			loanID = await getLoanID(openLoanTransaction);
		});

		it('should revert if the sender does not send any eth', async () => {
			await assert.revert(
				etherCollateral.depositCollateral(alice, loanID, { from: alice, value: 0 }),
				'Deposit amount must be greater than 0'
			);
		});

		it('should revert if we are in the liquidation phase', async () => {
			await fastForwardAndUpdateRates(93 * DAY);
			await etherCollateral.setLoanLiquidationOpen(true, { from: owner });
			await assert.revert(
				etherCollateral.depositCollateral(alice, loanID, { from: alice, value: oneETH }),
				'Loans are now being liquidated'
			);
		});

		it('should revert if the loan does not exist', async () => {
			const loanId = 2e10; // assign a big number as the loan id
			await assert.revert(
				etherCollateral.depositCollateral(alice, loanId, { from: alice, value: oneETH }),
				'Loan does not exist'
			);
		});

		it('should update the collateral amount on the loan', async () => {
			await etherCollateral.depositCollateral(alice, loanID, { from: alice, value: oneETH });
			const loan = await etherCollateral.getLoan(alice, loanID);
			assert.bnEqual(loan.collateralAmount, twoETH);
		});

		it('should emit an event after collateral has been deposited', async () => {
			const transaction = await etherCollateral.depositCollateral(alice, loanID, {
				from: alice,
				value: oneETH,
			});
			assert.eventEqual(transaction, 'CollateralDeposited', {
				account: alice,
				loanID: loanID,
				collateralAmount: oneETH,
				collateralAfter: twoETH,
			});
		});
	});

	describe('when collateral is withdrawn', async () => {
		const oneETH = toUnit('10');
		const twoETH = toUnit('20');
		const alice = address1;
		const withdrawAmount = toUnit('1');
		let openLoanAmount;
		let openLoanTransaction;
		let loanID;

		beforeEach(async () => {
			openLoanAmount = await etherCollateral.loanAmountFromCollateral(oneETH);
			openLoanTransaction = await etherCollateral.openLoan(openLoanAmount, {
				value: oneETH,
				from: alice,
			});
			loanID = await getLoanID(openLoanTransaction);
		});

		it('should revert if the sender passes 0 as the withdraw amount', async () => {
			await assert.revert(
				etherCollateral.withdrawCollateral(loanID, 0, { from: alice }),
				'Amount to withdraw must be greater than 0'
			);
		});

		it('should revert if we are in the liquidation phase', async () => {
			await fastForwardAndUpdateRates(93 * DAY);
			await etherCollateral.setLoanLiquidationOpen(true, { from: owner });
			await assert.revert(
				etherCollateral.withdrawCollateral(loanID, withdrawAmount, { from: alice }),
				'Loans are now being liquidated'
			);
		});

		it('should revert if the loan does not exist', async () => {
			const loanId = 2e10; // assign a big number as the loan id
			await assert.revert(
				etherCollateral.withdrawCollateral(loanId, withdrawAmount, { from: alice }),
				'Loan does not exist'
			);
		});

		it('should revert if the amount to withdraw would put the loan under the collateral ratio', async () => {
			await assert.revert(
				etherCollateral.withdrawCollateral(loanID, withdrawAmount, { from: alice }),
				'Collateral ratio below liquidation after withdraw'
			);
		});

		it('should emit an event when the collateral is withdrawn', async () => {
			// deposit some collateral so that there is a buffer to withdraw from
			await etherCollateral.depositCollateral(alice, loanID, { from: alice, value: oneETH });
			const transaction = await etherCollateral.withdrawCollateral(loanID, withdrawAmount, {
				from: alice,
			});
			const newCollateral = twoETH.sub(withdrawAmount);

			assert.eventEqual(transaction, 'CollateralWithdrawn', {
				account: alice,
				loanID: loanID,
				amountWithdrawn: withdrawAmount,
				collateralAfter: newCollateral,
			});
		});
	});

	describe('when a loan is partially repaid', async () => {
		const oneETH = toUnit('10');
		const alice = address1;
		const bob = address2;
		const repayAmount = toUnit('1');
		let openLoanAmount;
		let openLoanTransaction;
		let loanID;

		beforeEach(async () => {
			openLoanAmount = await etherCollateral.loanAmountFromCollateral(oneETH);
			openLoanTransaction = await etherCollateral.openLoan(openLoanAmount, {
				value: oneETH,
				from: alice,
			});
			loanID = await getLoanID(openLoanTransaction);
		});

		it('should revert if the sender does not have enough sUSD to repay the amount requested', async () => {
			sUSDSynth.transfer(bob, await sUSDSynth.balanceOf(alice), { from: alice });
			await assert.revert(
				etherCollateral.repayLoan(alice, loanID, openLoanAmount, { from: alice }),
				'Not enough sUSD balance'
			);
		});

		it('should emit an event after the loan has been partially repaid', async () => {
			const transaction = await etherCollateral.repayLoan(alice, loanID, repayAmount, {
				from: alice,
			});

			// to-do check newLoanAmount in event
			assert.eventEqual(transaction, 'LoanRepaid', {
				account: alice,
				loanID: loanID,
				repaidAmount: repayAmount,
			});
		});
	});
});
