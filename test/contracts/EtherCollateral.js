require('.'); // import common test scaffolding

const EtherCollateral = artifacts.require('EtherCollateral');
const Synthetix = artifacts.require('Synthetix');
const Depot = artifacts.require('Depot');
const Synth = artifacts.require('Synth');
const MultiCollateralSynth = artifacts.require('MultiCollateralSynth');
const FeePoolProxy = artifacts.require('FeePool');
const ExchangeRates = artifacts.require('ExchangeRates');
const AddressResolver = artifacts.require('AddressResolver');
const BN = require('bn.js');

const {
	fastForward,
	getEthBalance,
	toUnit,
	multiplyDecimal,
	currentTime,
	// divideDecimal,
	// fromUnit,
	// ZERO_ADDRESS,
} = require('../utils/testUtils');

const { setStatus } = require('../utils/setupUtils');

const { toBytes32 } = require('../../.');

contract('EtherCollateral', async accounts => {
	// const SECOND = 1;
	const MINUTE = 60;
	// const HOUR = 3600;
	const DAY = 86400;
	const WEEK = 604800;
	const MONTH = 2629743;
	const YEAR = 31536000;

	const [sUSD, sETH, ETH, SNX] = ['sUSD', 'sETH', 'ETH', 'SNX'].map(toBytes32);

	// const [sUSD, sAUD, sEUR, sBTC, SNX, iBTC, sETH] = [
	// 	'sUSD',
	// 	'sAUD',
	// 	'sEUR',
	// 	'sBTC',
	// 	'SNX',
	// 	'iBTC',
	// 	'sETH',
	// ].map(toBytes32);

	const ISSUACE_RATIO = toUnit('0.666666666666666667');
	const ZERO_BN = toUnit('0');

	const [
		deployerAccount,
		owner,
		oracle,
		depotDepositor,
		address1,
		address2,
		address3,
		// address4
	] = accounts;

	let etherCollateral,
		synthetix,
		feePoolProxy,
		exchangeRates,
		depot,
		addressResolver,
		sUSDSynth,
		sETHSynth,
		FEE_ADDRESS;

	// const updateRatesWithDefaults = async () => {
	// 	const timestamp = await currentTime();

	// 	await exchangeRates.updateRates(
	// 		[sAUD, sEUR, SNX, sBTC, iBTC, sETH],
	// 		[0.5', '1.25', '0.1', '5000', '4000', '172'].map(toUnit),
	// 		timestamp,
	// 		{
	// 			from: oracle,
	// 		}
	// 	);
	// };

	// const fastForwardAndUpdateRates = async seconds => {
	// 	console.log('fastForwardAndUpdateRates', seconds);
	// 	await fastForward(seconds);
	// 	await updateRatesWithDefaults();
	// };

	const getLoanID = async tx => {
		const event = tx.logs.find(log => log.event === 'LoanCreated');
		return event.args.loanID;
	};

	const issueSynthsUSD = async (issueAmount, receiver) => {
		// We need the owner to issue synths
		await synthetix.issueSynths(issueAmount, { from: owner });
		// Set up the depositor with an amount of synths to deposit.
		await sUSDSynth.transfer(receiver, issueAmount, {
			from: owner,
		});
	};

	const depositUSDInDepot = async (synthsToDeposit, depositor) => {
		// Ensure Depot has latest rates
		// await updateRatesWithDefaults();

		// Get sUSD from Owner
		await issueSynthsUSD(synthsToDeposit, depositor);

		// Approve Transaction
		await sUSDSynth.approve(depot.address, synthsToDeposit, { from: depositor });

		// Deposit sUSD in Depot
		await depot.depositSynths(synthsToDeposit, {
			from: depositor,
		});
	};

	const calculateLoanAmount = ethAmount => {
		return multiplyDecimal(ethAmount, ISSUACE_RATIO);
	};

	const calculateInterest = (loanAmount, ratePerSec, seconds) => {
		// Interest = PV * rt;
		const rt = ratePerSec.mul(new BN(seconds));
		return multiplyDecimal(loanAmount, rt);
	};

	const calculateLoanFees = async (_address, _loanID) => {
		const interestRatePerSec = await etherCollateral.interestPerSecond();
		const synthLoan = await etherCollateral.getLoan(_address, _loanID);
		const loanLifeSpan = await etherCollateral.loanLifeSpan(_address, _loanID);
		const mintingFee = await etherCollateral.calculateMintingFee(_address, _loanID);

		// Expected interest
		const expectedInterest = calculateInterest(
			synthLoan.loanAmount,
			interestRatePerSec,
			loanLifeSpan
		);

		// Get the minting fee
		const expectedFeeETH = expectedInterest.add(mintingFee);
		// console.log('expectedFeeETH', expectedFeeETH.toString());
		return expectedFeeETH;
	};

	const calculateLoanFeesUSD = async feesInETH => {
		// Ask the Depot how many sUSD I will get for this ETH
		const expectedFeesUSD = await depot.synthsReceivedForEther(feesInETH);
		// console.log('expectedFeesUSD', expectedFeesUSD.toString());
		return expectedFeesUSD;
	};

	const updateRatesWithDefaults = async () => {
		const timestamp = await currentTime();

		// Depot requires SNX and ETH rates
		await exchangeRates.updateRates(
			[SNX, sETH, ETH],
			['0.1', '172', '172'].map(toUnit),
			timestamp,
			{
				from: oracle,
			}
		);

		await exchangeRates.setRateStalePeriod(YEAR, { from: owner });
	};

	beforeEach(async () => {
		etherCollateral = await EtherCollateral.deployed();
		synthetix = await Synthetix.deployed();
		exchangeRates = await ExchangeRates.deployed();
		depot = await Depot.deployed();
		feePoolProxy = await FeePoolProxy.deployed();
		FEE_ADDRESS = await feePoolProxy.FEE_ADDRESS();
		addressResolver = await AddressResolver.deployed();

		sUSDSynth = await Synth.at(await synthetix.synths(sUSD));
		sETHSynth = await MultiCollateralSynth.at(await synthetix.synths(sETH));

		// TODO: Setting to a year because fastForwardAndUpdateRates is
		await updateRatesWithDefaults();
	});

	describe('On deployment of Contract', async () => {
		let instance;
		beforeEach(async () => {
			instance = await EtherCollateral.new(owner, addressResolver.address, {
				from: deployerAccount,
			});
		});

		it('should set constructor params on deployment', async () => {
			assert.equal(await instance.resolver(), addressResolver.address);
		});

		it('should access its dependencies via the address resolver', async () => {
			assert.equal(await addressResolver.getAddress(toBytes32('SynthsETH')), sETHSynth.address);
			assert.equal(await addressResolver.getAddress(toBytes32('SynthsUSD')), sUSDSynth.address);
			assert.equal(await addressResolver.getAddress(toBytes32('Depot')), depot.address);
		});

		describe('should have a default', async () => {
			const DEFAULT_C_RATIO = toUnit(150);
			const FIFTY_BIPS = toUnit('0.005');
			const FIVE_PERCENT = toUnit('0.05');
			const FIVE_THOUSAND = toUnit('5000');
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
			it('issueLimit of 5000', async () => {
				assert.bnEqual(await etherCollateral.issueLimit(), FIVE_THOUSAND);
			});
			it('minLoanSize of 1', async () => {
				assert.bnEqual(await etherCollateral.minLoanSize(), ONE_ETH);
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
				assert.bnEqual(contractInfo._issueLimit, FIVE_THOUSAND);
				assert.bnEqual(contractInfo._minLoanSize, ONE_ETH);
				assert.bnEqual(contractInfo._totalIssuedSynths, toUnit('0'));
				assert.equal(contractInfo._totalLoansCreated, 0);
				assert.equal(contractInfo._ethBalance, 0);
				assert.notEqual(contractInfo._liquidationDeadline, 0);
				assert.equal(contractInfo._loanLiquidationOpen, false);
			});
		});

		describe('should allow owner to set', async () => {
			it('collateralizationRatio to 110', async () => {
				// Confirm defaults
				const defaultCollateralizationRatio = toUnit(150);
				const oldCollateralizationRatio = await etherCollateral.collateralizationRatio();
				assert.bnEqual(oldCollateralizationRatio, defaultCollateralizationRatio);

				// Set new CollateralizationRatio
				const newCollateralizationRatio = toUnit(110);
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
					const newCollateralizationRatio = toUnit(110);
					await etherCollateral.setCollateralizationRatio(newCollateralizationRatio, {
						from: owner,
					});
				});

				it('issuanceRatio is updated', async () => {
					const expectedIssuanceRatio = toUnit('0.909090909090909091');
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
			it('minLoanSize', async () => {
				const newMinLoanSize = toUnit('5');
				await etherCollateral.setMinLoanSize(newMinLoanSize, { from: owner });
				assert.bnEqual(await etherCollateral.minLoanSize(), newMinLoanSize);
			});
			it('accountLoanLimit', async () => {
				await etherCollateral.setAccountLoanLimit(333, { from: owner });
				assert.bnEqual(await etherCollateral.accountLoanLimit(), 333);
			});
			it('loanLiquidationOpen after 92 days', async () => {
				await fastForward(92 * DAY);
				await etherCollateral.setLoanLiquidationOpen(true, { from: owner });
				assert.bnEqual(await etherCollateral.loanLiquidationOpen(), true);
			});
			describe('then revert when ', async () => {
				it('interestRate is set over 100%', async () => {
					const newInterestRate = toUnit('1.01'); // 101%
					await assert.revert(etherCollateral.setInterestRate(newInterestRate, { from: owner }));
				});
				it('interestRate is less than seconds in a year', async () => {
					const newInterestRate = toUnit('0.000000000031536'); // 101%
					await assert.revert(etherCollateral.setInterestRate(newInterestRate, { from: owner }));
				});
				it('owner sets accountLoanLimit over HARD_CAP', async () => {
					await assert.revert(
						etherCollateral.setAccountLoanLimit(1200, { from: owner }),
						'Owner cannot set higher than HARD_CAP'
					);
				});
				describe('non owner attempts to set', async () => {
					it('issueFeeRate', async () => {
						const newFeeRate = toUnit('0');
						await assert.revert(etherCollateral.setIssueFeeRate(newFeeRate, { from: address1 }));
					});
					it('interestRate', async () => {
						const newInterestRate = toUnit('0');
						await assert.revert(
							etherCollateral.setInterestRate(newInterestRate, { from: address1 })
						);
					});
					it('issueLimit', async () => {
						const newIssueLImit = toUnit('999999999999');
						await assert.revert(etherCollateral.setIssueLimit(newIssueLImit, { from: address1 }));
					});
					it('minLoanSize', async () => {
						const newMinLoanSize = toUnit('0');
						await assert.revert(etherCollateral.setMinLoanSize(newMinLoanSize, { from: address1 }));
					});
					it('accountLoanLimit', async () => {
						await assert.revert(etherCollateral.setAccountLoanLimit(9999999, { from: address1 }));
					});
					it('loanLiquidationOpen after 92 days', async () => {
						await fastForward(92 * DAY);
						await assert.revert(etherCollateral.setLoanLiquidationOpen(true, { from: address1 }));
					});
				});
			});
		});
	});

	describe('when accessing the external views then', async () => {
		it('collateralAmountForLoan should return 7500 ETH required to open 5000 sETH', async () => {
			const ethForLoanAmounnt = await etherCollateral.collateralAmountForLoan(toUnit('5000'));
			assert.bnEqual(ethForLoanAmounnt, toUnit('7500'));
		});
		it('loanAmountFromCollateral should return 5000 sETH when opening a loan with 7500 ETH', async () => {
			const loanAmountFromCollateral = await etherCollateral.loanAmountFromCollateral(
				toUnit('7500')
			);
			// There is a rounding up. You get more sETH rather than less for your loan
			assert.bnClose(loanAmountFromCollateral, toUnit('5000'), 2500);
		});
	});

	describe('when opening a Loan', async () => {
		['System', 'Issuance'].forEach(section => {
			describe(`when ${section} is suspended`, () => {
				beforeEach(async () => {
					await setStatus({ owner, section, suspend: true });
				});
				it('then calling openLoan() reverts', async () => {
					await assert.revert(
						etherCollateral.openLoan({ value: toUnit('1'), from: address1 }),
						'Operation prohibited'
					);
				});
				describe(`when ${section} is resumed`, () => {
					beforeEach(async () => {
						await setStatus({ owner, section, suspend: false });
					});
					it('then calling openLoan() succeeds', async () => {
						await etherCollateral.openLoan({ value: toUnit('1'), from: address1 });
					});
				});
			});
		});

		describe('then revert when ', async () => {
			it('eth sent is less than minLoanSize', async () => {
				await etherCollateral.setMinLoanSize(toUnit('2'), { from: owner });
				await assert.revert(etherCollateral.openLoan({ value: toUnit('1'), from: address1 }));
			});
			it('attempting to issue more than the cap (issueLimit)', async () => {
				// limit sETH supply cap to 50
				await etherCollateral.setIssueLimit(toUnit('50'), { from: owner });
				// 150 ETH will issue 66 sETH
				await assert.revert(etherCollateral.openLoan({ value: toUnit('150'), from: address1 }));
			});
			it('attempting to issue more near the supply cap', async () => {
				// reduce the supply cap to 100 sETH
				await etherCollateral.setIssueLimit(toUnit('100'), { from: owner });

				// Issue to the just under the limit
				await etherCollateral.openLoan({ value: toUnit('148'), from: address1 });

				// revert when attepmting to issue above
				await assert.revert(etherCollateral.openLoan({ value: toUnit('10'), from: address1 }));

				// but allow issuing to the cap
				await etherCollateral.openLoan({ value: toUnit('1'), from: address2 });
			});
			it('loanLiquidationOpen is true', async () => {
				await fastForward(93 * DAY);
				await etherCollateral.setLoanLiquidationOpen(true, { from: owner });
				await assert.revert(etherCollateral.openLoan({ value: toUnit('1'), from: address1 }));
			});
			it('contract is paused', async () => {
				await etherCollateral.setPaused(true, { from: owner });
				await assert.revert(etherCollateral.openLoan({ value: toUnit('1'), from: address1 }));
			});
			it('calling setLoanLiquidationOpen(true) before 92 days', async () => {
				await assert.revert(etherCollateral.setLoanLiquidationOpen(true, { from: owner }));
			});
		});

		describe('then create loan and', async () => {
			const tenETH = toUnit('10');
			const expectedsETHLoanAmount = calculateLoanAmount(tenETH);
			let openLoanTransaction;
			let loanID;

			beforeEach(async () => {
				openLoanTransaction = await etherCollateral.openLoan({ value: tenETH, from: address1 });
				loanID = await getLoanID(openLoanTransaction);
			});

			it('increase the totalLoansCreated', async () => {
				assert.equal(await etherCollateral.totalLoansCreated(), 1);
			});
			it('increase the totalOpenLoanCount', async () => {
				assert.equal(await etherCollateral.totalOpenLoanCount(), 1);
			});
			it('increase the totalIssuedSynths', async () => {
				assert.bnEqual(await etherCollateral.totalIssuedSynths(), expectedsETHLoanAmount);
			});
			it('emit a LoanCreated event', async () => {
				assert.eventEqual(openLoanTransaction, 'LoanCreated', {
					account: address1,
					loanID: 1,
					amount: expectedsETHLoanAmount,
				});
			});
			it('store the synthLoan.acccount', async () => {
				const synthLoan = await etherCollateral.getLoan(address1, loanID);
				assert.equal(synthLoan.account, address1);
			});
			it('store the synthLoan.collateralAmount', async () => {
				const synthLoan = await etherCollateral.getLoan(address1, loanID);
				assert.bnEqual(synthLoan.collateralAmount, tenETH);
			});
			it('store the synthLoan.loanAmount', async () => {
				const synthLoan = await etherCollateral.getLoan(address1, loanID);
				assert.bnEqual(synthLoan.loanAmount, expectedsETHLoanAmount);
			});
			it('store the synthLoan.loanID', async () => {
				const synthLoan = await etherCollateral.getLoan(address1, loanID);
				assert.bnEqual(synthLoan.loanID, loanID);
			});
			it('store the synthLoan.timeCreated', async () => {
				const synthLoan = await etherCollateral.getLoan(address1, loanID);
				assert.unitNotEqual(synthLoan.timeCreated, ZERO_BN);
			});
			it('store the synthLoan.timeClosed as 0 for not closed', async () => {
				const synthLoan = await etherCollateral.getLoan(address1, loanID);
				assert.bnEqual(synthLoan.timeClosed, ZERO_BN);
			});
			it('add the loan issue amount to creators balance', async () => {
				const sETHBalance = await sETHSynth.balanceOf(address1);
				assert.bnEqual(sETHBalance, expectedsETHLoanAmount);
			});
			it('add the ETH collateral balance to the contract', async () => {
				const ethInContract = await getEthBalance(etherCollateral.address);
				assert.equal(ethInContract, tenETH);
			});

			describe('when opening a second loan against address1', async () => {
				let loan2Transaction;
				let loan2ID;
				let totalIssuedSynthsBefore;
				const fiveThousandETH = toUnit('5000');
				const expectedsETHLoanAmount = calculateLoanAmount(fiveThousandETH);

				beforeEach(async () => {
					totalIssuedSynthsBefore = await etherCollateral.totalIssuedSynths();
					loan2Transaction = await etherCollateral.openLoan({
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
						totalIssuedSynthsBefore.add(expectedsETHLoanAmount)
					);
				});
				it('then store 2 loans against the account', async () => {
					const openLoanIDsByAccount = await etherCollateral.openLoanIDsByAccount(address1);
					assert.equal(openLoanIDsByAccount.length, 2);
				});
				it('list of openLoanIDsByAccount contains both loanIDs', async () => {
					const openLoanIDsByAccount = await etherCollateral.openLoanIDsByAccount(address1);
					assert.bnEqual(openLoanIDsByAccount[0], loanID);
					assert.bnEqual(openLoanIDsByAccount[1], loan2ID);
				});

				describe('when opening a third loan against address2', async () => {
					let loan3Transaction;
					let loan3ID;
					let totalSupplyBefore;
					const threeNintyETH = toUnit('390');
					const expectedsETHLoanAmount = calculateLoanAmount(threeNintyETH);

					beforeEach(async () => {
						totalSupplyBefore = await etherCollateral.totalIssuedSynths();
						loan3Transaction = await etherCollateral.openLoan({
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
							totalSupplyBefore.add(expectedsETHLoanAmount)
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
						let expectedFeeETH;
						// let expectedFeesUSD;
						let interestRatePerSec;
						let closeLoanTransaction;

						beforeEach(async () => {
							// Deposit sUSD in Depot to allow fees to be bought with ETH
							await depositUSDInDepot(toUnit('10000'), depotDepositor);
							// Go into the future
							// fastForwardAndUpdateRates(MONTH * 2);
							await fastForward(MONTH * 2);
							// Cacluate the fees
							expectedFeeETH = await calculateLoanFees(address1, loanID);
							// expectedFeesUSD = await calculateLoanFeesUSD(expectedFeeETH);
							interestRatePerSec = await etherCollateral.interestPerSecond();
							// Get the total sETH Issued
							totalIssuedSynthsBefore = await etherCollateral.totalIssuedSynths();
							// Close loan
							closeLoanTransaction = await etherCollateral.closeLoan(loanID, { from: address1 });
						});
						it('does not change the totalLoansCreated', async () => {
							assert.equal(await etherCollateral.totalLoansCreated(), 3);
						});
						it('decrease the totalOpenLoanCount', async () => {
							assert.equal(await etherCollateral.totalOpenLoanCount(), 2);
						});
						it('decrease the totalIssuedSynths', async () => {
							const synthLoan = await etherCollateral.getLoan(address1, loanID);
							const totalIssuedSynthsLessLoan = totalIssuedSynthsBefore.sub(synthLoan.loanAmount);
							assert.bnEqual(await etherCollateral.totalIssuedSynths(), totalIssuedSynthsLessLoan);
						});
						it('then store 1 loan against the account', async () => {
							const openLoanIDsByAccount = await etherCollateral.openLoanIDsByAccount(address1);
							assert.equal(openLoanIDsByAccount.length, 1);
						});
						it('list of openLoanIDsByAccount contains loanID', async () => {
							const openLoanIDsByAccount = await etherCollateral.openLoanIDsByAccount(address1);
							assert.bnEqual(openLoanIDsByAccount[0], loan2ID);
						});
						xit('LoanClosed event emits the fees charged', async () => {
							assert.eventEqual(closeLoanTransaction, 'LoanClosed', {
								account: address1,
								loanID: loanID,
								feesPaid: expectedFeeETH,
							});
						});
						it('Charges the correct interest', async () => {
							const synthLoan = await etherCollateral.getLoan(address1, loanID);
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
							assert.bnEqual(expectedInterest, interestAmount);
						});

						describe('when closing the second loan of address1', async () => {
							let expectedFeeETH;
							// let expectedFeesUSD;
							let closeLoanTransaction;

							beforeEach(async () => {
								// Deposit sUSD in Depot to allow fees to be bought with ETH
								await depositUSDInDepot(toUnit('100000'), depotDepositor);

								// Cacluate the fees
								expectedFeeETH = await calculateLoanFees(address1, loan2ID);
								// expectedFeesUSD = await calculateLoanFeesUSD(expectedFeeETH);

								// console.log('expectedFeeETH', expectedFeeETH.toString());
								// console.log('expectedFeesUSD', expectedFeesUSD.toString());
								// Get the total sETH Issued
								totalIssuedSynthsBefore = await etherCollateral.totalIssuedSynths();
								// console.log('totalIssuedSynthsBefore', totalIssuedSynthsBefore.toString());
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
							xit('LoanClosed event emits the fees charged', async () => {
								assert.eventEqual(closeLoanTransaction, 'LoanClosed', {
									account: address1,
									loanID: loan2ID,
									feesPaid: expectedFeeETH,
									// 44462878400217706689
									// 44462873115252376688
								});
							});

							describe('when closing the third loan', async () => {
								let expectedFeeETH;
								// let expectedFeesUSD;
								let closeLoanTransaction;

								beforeEach(async () => {
									expectedFeeETH = await calculateLoanFees(address2, loan3ID);
									// expectedFeesUSD = await calculateLoanFeesUSD(expectedFeeETH);
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
								xit('LoanClosed event emits the fees charged', async () => {
									assert.eventEqual(closeLoanTransaction, 'LoanClosed', {
										account: address2,
										loanID: loan3ID,
										feesPaid: expectedFeeETH,
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
				const fifteenETH = toUnit('15');

				beforeEach(async () => {
					interestRatePerSec = await etherCollateral.interestPerSecond();
					openLoanTransaction = await etherCollateral.openLoan({
						value: fifteenETH,
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

						// Loan Amount should be 10 ETH
						assert.bnClose(loanAmount, toUnit('10'));

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

						assert.bnEqual(expectedInterest, interestAmount);
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
						await fastForward(WEEK);
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

		describe('when creating multiple loans', async () => {
			const tenETH = toUnit('10');

			beforeEach(async () => {
				// Deposit sUSD in Depot to allow fees to be bought with ETH
				await depositUSDInDepot(toUnit('100000'), depotDepositor);
			});

			it('then loans are opened and all closed as expected', async () => {
				// Alice creates a loan
				await etherCollateral.openLoan({ value: tenETH, from: address1 });

				// Bob creates a loan
				await etherCollateral.openLoan({ value: tenETH, from: address2 });

				// Alice creates 2 more loans
				await etherCollateral.openLoan({ value: tenETH, from: address1 });
				await etherCollateral.openLoan({ value: tenETH, from: address1 });

				fastForward(MINUTE * 1);
				assert.equal(await etherCollateral.totalOpenLoanCount(), 4);

				// fastForwardAndUpdateRates(WEEK * 2);
				await fastForward(WEEK * 2);

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
			});
			it('then opening & closing from 10 different accounts', async () => {
				for (let i = 0; i < accounts.length; i++) {
					await etherCollateral.openLoan({ value: tenETH, from: accounts[i] });
				}
				assert.equal(await etherCollateral.totalOpenLoanCount(), 10);

				fastForward(MONTH * 3);

				for (let i = 0; i < accounts.length; i++) {
					await etherCollateral.closeLoan(i + 1, { from: accounts[i] });
				}
				assert.equal(await etherCollateral.totalOpenLoanCount(), 0);
			});
			it('then creat accountLoanLimit x 1 eth loans and close them', async () => {
				const minLoanSize = await etherCollateral.minLoanSize();
				const accountLoanLimit = await etherCollateral.accountLoanLimit();
				for (let i = 0; i < accountLoanLimit; i++) {
					await etherCollateral.openLoan({ value: minLoanSize, from: address1 });
					// console.log(`openLoan[${i}]`);
				}

				// Opening the next loan should revert
				await assert.revert(etherCollateral.openLoan({ value: minLoanSize, from: address1 }));

				// fastForwardAndUpdateRates(WEEK * 2);
				await fastForward(DAY * 1);

				assert.bnEqual(await etherCollateral.totalOpenLoanCount(), accountLoanLimit);
				assert.bnEqual(await etherCollateral.totalLoansCreated(), accountLoanLimit);

				for (let i = 0; i < accountLoanLimit; i++) {
					await etherCollateral.closeLoan(i + 1, { from: address1 });
				}

				assert.bnEqual(await etherCollateral.totalOpenLoanCount(), 0);
				assert.bnEqual(await etherCollateral.totalLoansCreated(), accountLoanLimit);
			});
			it('then creating 3 accounts create 500 1 eth loans', async () => {
				const minLoanSize = await etherCollateral.minLoanSize();
				const accountLoanLimit = await etherCollateral.accountLoanLimit();
				for (let i = 0; i < accountLoanLimit; i++) {
					await etherCollateral.openLoan({ value: minLoanSize, from: address1 });
					await etherCollateral.openLoan({ value: minLoanSize, from: address2 });
					await etherCollateral.openLoan({ value: minLoanSize, from: address3 });
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
			});
		});

		describe('when closing a Loan', async () => {
			const tenETH = toUnit('10');
			const sixSixETH = toUnit('6.666666666666666670');
			const oneThousandsUSD = toUnit('1000');

			describe('check conditions', async () => {
				let openLoanTransaction;
				let loanID;

				beforeEach(async () => {
					openLoanTransaction = await etherCollateral.openLoan({ value: tenETH, from: address1 });
					loanID = await getLoanID(openLoanTransaction);
					// fastForwardAndUpdateRates(WEEK * 2);
					await fastForward(WEEK * 2);
				});

				it('when loanID does not exist, then it reverts', async () => {
					await assert.revert(etherCollateral.closeLoan(9999, { from: address1 }));
				});

				it('when sETH balance is less than loanAmount, then it reverts', async () => {
					// "Burn" some of accounts sETH by sending to the owner
					await sETHSynth.transfer(owner, toUnit('4'), { from: address1 });
					await assert.revert(etherCollateral.closeLoan(loanID, { from: address1 }));
				});

				it('when Depot has no sUSD to buy for Fees, then it reverts', async () => {
					// Dont put any sUSD into the Depot and close the loan
					await assert.revert(etherCollateral.closeLoan(loanID, { from: address1 }));
				});

				['System', 'Issuance'].forEach(section => {
					describe(`when ${section} is suspended`, () => {
						beforeEach(async () => {
							// ensure close can work
							await depositUSDInDepot(oneThousandsUSD, depotDepositor);

							await setStatus({ owner, section, suspend: true });
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
								await setStatus({ owner, section, suspend: false });
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
				let expectedFeeETH;
				let expectedFeesUSD;
				let address1ETHBalanceBefore;
				let depositorETHBalanceBefore;

				beforeEach(async () => {
					// interestRatePerSec = await etherCollateral.interestPerSecond();

					// Deposit sUSD in Depot to allow fees to be bought with ETH
					await depositUSDInDepot(oneThousandsUSD, depotDepositor);

					// Save Accounts balance
					depositorETHBalanceBefore = await getEthBalance(depotDepositor);
					address1ETHBalanceBefore = await getEthBalance(address1);

					// Open loan with 10 ETH
					openLoanTransaction = await etherCollateral.openLoan({
						value: tenETH,
						from: address1,
					});
					openLoanID = await getLoanID(openLoanTransaction);

					// Go into the future
					// fastForwardAndUpdateRates(MONTH * 2);
					await fastForward(MONTH * 2);

					// Close the loan
					closeLoanTransaction = await etherCollateral.closeLoan(openLoanID, {
						from: address1,
					});

					// Cacluate the fees
					expectedFeeETH = await calculateLoanFees(address1, openLoanID);
					expectedFeesUSD = await calculateLoanFeesUSD(expectedFeeETH);
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
					const synthLoan = await etherCollateral.getLoan(address1, openLoanID);
					assert.bnEqual(synthLoan.loanAmount, sixSixETH);
				});

				it('timeClosed > timeCreated', async () => {
					const synthLoan = await etherCollateral.getLoan(address1, openLoanID);
					assert.ok(synthLoan.timeClosed > synthLoan.timeCreated, true);
				});

				it('reduce sETH totalSupply', async () => {
					assert.bnEqual(await etherCollateral.totalIssuedSynths(), ZERO_BN);
				});

				it('increase the FeePool sUSD balance', async () => {
					assert.bnEqual(await sUSDSynth.balanceOf(FEE_ADDRESS), expectedFeesUSD);
				});

				it('record the fees in the FeePool.feesToDistribute', async () => {
					const currentFeePeriod = await feePoolProxy.recentFeePeriods(0);
					assert.bnEqual(currentFeePeriod.feesToDistribute, expectedFeesUSD);
				});

				xit('increase the ETH balance in Depot depositors account', async () => {
					console.log('expectedFeeETH', expectedFeeETH.toString());
					console.log('expectedFeesUSD', expectedFeesUSD.toString());
					const depositorETHBalance = await getEthBalance(depotDepositor);
					console.log('depositorETHBalanceBefore', depositorETHBalanceBefore.toString());
					console.log('depositorETHBalance', depositorETHBalance.toString());
					const depositerETHFees = depositorETHBalanceBefore.sub(depositorETHBalance);
					console.log('depositerETHFees', depositerETHFees.toString());
					assert.bnEqual(depositerETHFees, expectedFeeETH);
				});

				it('decrease the sUSD balance in Depot', async () => {
					const expectedBalance = oneThousandsUSD.sub(expectedFeesUSD);
					assert.bnEqual(await sUSDSynth.balanceOf(depot.address), expectedBalance);
				});

				it('decrease the ETH balance in the EtherCollateral contract', async () => {
					const ethCollateralETHBalance = await getEthBalance(etherCollateral.address);
					assert.bnEqual(ethCollateralETHBalance, ZERO_BN);
				});

				xit('refund the remaining ETH after fees to the loan creater', async () => {
					const address1ETHBalance = await getEthBalance(address1);
					console.log('address1ETHBalanceBefore', address1ETHBalanceBefore.toString());
					console.log('address1ETHBalanceNow', address1ETHBalance.toString());
					console.log('expectedFeeETH', expectedFeeETH.toString());
					const expectedEthBalance = address1ETHBalanceBefore.sub(expectedFeeETH);
					console.log('expectedEthBalance', expectedEthBalance.toString());

					assert.bnEqual(address1ETHBalance, expectedEthBalance);
				});

				it('emits a LoanClosed event', async () => {
					assert.eventEqual(closeLoanTransaction, 'LoanClosed', {
						account: address1,
						loanID: 1,
						feesPaid: expectedFeeETH,
					});
				});
			});
		});
	});
});
