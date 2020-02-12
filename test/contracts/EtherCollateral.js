require('.'); // import common test scaffolding

const EtherCollateral = artifacts.require('EtherCollateral');
const Synthetix = artifacts.require('Synthetix');
const Depot = artifacts.require('Depot');
const Synth = artifacts.require('Synth');
const MultiCollateralSynth = artifacts.require('MultiCollateralSynth');
const FeePoolProxy = artifacts.require('FeePool');
const ExchangeRates = artifacts.require('ExchangeRates');
const BN = require('bn.js');

const {
	currentTime,
	fastForward,
	getEthBalance,
	toUnit,
	multiplyDecimal,
	// divideDecimal,
	// fromUnit,
	// ZERO_ADDRESS,
} = require('../utils/testUtils');

const { toBytes32 } = require('../../.');

contract('EtherCollateral', async accounts => {
	// const SECOND = 1;
	const MINUTE = 60;
	// const HOUR = 3600;
	const DAY = 86400;
	const WEEK = 604800;
	const MONTH = 2629743;
	const YEAR = 31536000;

	const sETH = toBytes32('sETH');
	const sUSD = toBytes32('sUSD');
	// const SNX = toBytes32('SNX');

	const ISSUACE_RATIO = toUnit('0.666666666666666667');
	const ZERO_BN = toUnit('0');

	const [
		deployerAccount,
		owner,
		// oracle,
		depotDepositor,
		address1,
		address2,
		// address3,
		// address4
	] = accounts;

	let etherCollateral,
		synthetix,
		synthProxy,
		feePoolProxy,
		exchangeRates,
		depot,
		sUSDContract,
		sETHContract,
		FEE_ADDRESS;

	// const updateRatesWithDefaults = async () => {
	// 	const timestamp = await currentTime();

	// 	console.log('call depot.updatePrices');
	// 	await depot.updatePrices(toUnit('190'), toUnit('1.20'), timestamp, {
	// 		from: oracle,
	// 	});

	// 	console.log('call exchangeRates.updateRates');
	// 	await exchangeRates.updateRates([sETH, SNX], ['190', '1.20'].map(toUnit), timestamp, {
	// 		from: oracle,
	// 	});
	// 	console.log('called exchangeRates.updateRates');
	// };

	// const fastForwardAndUpdateRates = async seconds => {
	// 	console.log('fastForwardAndUpdateRates', seconds);
	// 	await fastForward(seconds);
	// 	await updateRatesWithDefaults();
	// };

	// const calcLoanAmount = async ethAmount => {
	// 	return (ethAmount * (100 / 150)).toString();
	// };

	const getLoanID = async tx => {
		const event = tx.logs.find(log => log.event === 'LoanCreated');
		// console.log('getLoanID = ', event.args.loanID.toString());
		return event.args.loanID;
	};

	const issueSynthsUSD = async (issueAmount, receiver) => {
		// We need the owner to issue synths
		// console.log('owner to issue synths sUSD', issueAmount.toString());
		await synthetix.issueSynths(issueAmount, { from: owner });
		// Set up the depositor with an amount of synths to deposit.
		// console.log('transfer synths sUSD to ', receiver.toString());
		await sUSDContract.transfer(receiver, issueAmount, {
			from: owner,
		});
	};

	const depositUSDInDepot = async (synthsToDeposit, depositor) => {
		// Ensure Depot has latest rates
		// await updateRatesWithDefaults();

		// Get sUSD from Owner
		await issueSynthsUSD(synthsToDeposit, depositor);

		// Approve Transaction
		await sUSDContract.approve(depot.address, synthsToDeposit, { from: depositor });

		// Deposit sUSD in Depot
		// const depositorETHBalance = await getEthBalance(depositor);
		// console.log('depositorETHBalance', depositorETHBalance.toString());
		// console.log('Deposit sUSD in Depot amount', synthsToDeposit.toString(), depositor);
		await depot.depositSynths(synthsToDeposit, {
			from: depositor,
		});
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

	beforeEach(async () => {
		etherCollateral = await EtherCollateral.deployed();
		synthetix = await Synthetix.deployed();
		exchangeRates = await ExchangeRates.deployed();
		depot = await Depot.deployed();
		feePoolProxy = await FeePoolProxy.deployed();
		FEE_ADDRESS = await feePoolProxy.FEE_ADDRESS();

		sUSDContract = await Synth.at(await synthetix.synths(sUSD));
		sETHContract = await MultiCollateralSynth.at(await synthetix.synths(sETH));
		synthProxy = sETHContract;

		// TODO: Unable to call in truffle migrations script
		await sETHContract.setMultiCollateral(etherCollateral.address, { from: owner });

		// TODO: Setting to a year becuase fastForwardAndUpdateRates is
		// reverting on ExchangeRates.updateRates() with "Time is too far into the future"
		await exchangeRates.setRateStalePeriod(YEAR, {
			from: owner,
		});
		// reverting on Depot.exchangeEtherForSynths "Prices must not be stale to perform this action"
		await depot.setPriceStalePeriod(YEAR, {
			from: owner,
		});
	});

	describe('On deployment of Contract', async () => {
		it('should set constructor params on deployment', async () => {
			const instance = await EtherCollateral.new(
				owner,
				synthProxy.address,
				sUSDContract.address,
				depot.address,
				{
					from: deployerAccount,
				}
			);

			assert.equal(await instance.synthProxy(), synthProxy.address);
			assert.equal(await instance.sUSDProxy(), sUSDContract.address);
			assert.equal(await instance.depot(), depot.address);
		});

		describe('should have a default', async () => {
			it('collateralizationRatio of 150%', async () => {
				const defaultCollateralizationRatio = toUnit(150);
				const collateralizationRatio = await etherCollateral.collateralizationRatio();
				assert.bnEqual(collateralizationRatio, defaultCollateralizationRatio);
			});
			it('issuanceRatio of 0.666666666666666667%', async () => {
				assert.bnEqual(await etherCollateral.issuanceRatio(), ISSUACE_RATIO);
			});
			it('issueFeeRate of 50 bips', async () => {
				const FIFTY_BIPS = toUnit('0.005');
				assert.bnEqual(await etherCollateral.issueFeeRate(), FIFTY_BIPS);
			});
			it('interestRate of 5%', async () => {
				const FIVE_PERCENT = toUnit('0.05');
				assert.bnEqual(await etherCollateral.interestRate(), FIVE_PERCENT);
			});
			it('issueLimit of 5000', async () => {
				const FIVE_THOUSAND = toUnit('5000');
				assert.bnEqual(await etherCollateral.issueLimit(), FIVE_THOUSAND);
			});
			it('minLoanSize of 1', async () => {
				const ONE_ETH = toUnit('1');
				assert.bnEqual(await etherCollateral.minLoanSize(), ONE_ETH);
			});
			it('loanLiquidationOpen of false', async () => {
				assert.equal(await etherCollateral.loanLiquidationOpen(), false);
			});
			it('liquidationDeadline is set after 92 days', async () => {
				const deadline = await etherCollateral.liquidationDeadline();
				const now = await currentTime();
				// allow variance in reported liquidationDeadline to account for block time slippage
				assert.bnClose(deadline, Number(now) + 92 * DAY, '50');
			});
		});

		describe('should allow owner to set', async () => {
			beforeEach(async () => {});

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
			it('loanLiquidationOpen after 92 days', async () => {
				await fastForward(92 * DAY);
				await etherCollateral.setLoanLiquidationOpen(true, { from: owner });
				assert.bnEqual(await etherCollateral.loanLiquidationOpen(), true);
			});
		});
	});

	describe('When opening a Loan', async () => {
		beforeEach(async () => {});

		describe('then revert when ', async () => {
			it('eth sent is less than minLoanSize', async () => {
				await assert.revert(etherCollateral.openLoan({ amount: 0.1, from: address1 }));
			});
			it('attempting to issue more than the cap (issueLimit)', async () => {
				await etherCollateral.setIssueLimit(50, { from: owner });
				await assert.revert(etherCollateral.openLoan({ amount: 51, from: address1 }));
			});
			it('loanLiquidationOpen is true', async () => {
				await fastForward(93 * DAY);
				await etherCollateral.setLoanLiquidationOpen(true, { from: owner });
				await assert.revert(etherCollateral.openLoan({ amount: 1, from: address1 }));
			});
			it('contract is paused', async () => {
				await etherCollateral.setPaused(true, { from: owner });
				await assert.revert(etherCollateral.openLoan({ amount: 1, from: address1 }));
			});
			it('calling setLoanLiquidationOpen(true) before 92 days', async () => {
				await assert.revert(etherCollateral.setLoanLiquidationOpen(true, { from: owner }));
			});
		});

		describe('then create loan and', async () => {
			const tenETH = toUnit('10');
			const expectedsETHLoanAmount = toUnit('6.66666666666666667');
			let openLoanTransaction;
			let loanID;

			beforeEach(async () => {
				// const ethBalance = await getEthBalance(address2);
				// console.log('address2 ETH balance', ethBalance);
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
				// console.log('synthLoan.timeCreated', synthLoan.timeCreated.toString());
				assert.unitNotEqual(synthLoan.timeCreated, ZERO_BN);
			});
			it('store the synthLoan.timeClosed as 0 for not closed', async () => {
				const synthLoan = await etherCollateral.getLoan(address1, loanID);
				assert.bnEqual(synthLoan.timeClosed, ZERO_BN);
			});
			// it('store a synthLoanStruct onchain', async () => {
			// 	const synthLoan = await etherCollateral.getLoan(address1, loanID);
			// 	assert.equal(synthLoan.account, address1);
			// 	assert.bnEqual(synthLoan.collateralAmount, tenETH);
			// 	assert.bnEqual(synthLoan.loanAmount, expectedsETHLoanAmount);
			// 	assert.equal(synthLoan.loanID, loanID);
			// 	assert.unitNotEqual(synthLoan.timeCreated, ZERO_BN);
			// 	assert.equal(synthLoan.timeClosed, ZERO_BN);
			// });
			it('add the loan issue amount to creators balance', async () => {
				const sETHBalance = await sETHContract.balanceOf(address1);
				assert.bnEqual(sETHBalance, expectedsETHLoanAmount);
			});
			it('add the ETH collateral balance to the contract', async () => {
				const ethInContract = await getEthBalance(etherCollateral.address);
				assert.equal(ethInContract, tenETH);
			});

			describe('When opening a second loan against address1', async () => {
				let loan2Transaction;
				let loan2ID;
				const tenETH = toUnit('7000');
				const expectedsETHLoanAmount = toUnit('4673.333333333333335670');

				beforeEach(async () => {
					loan2Transaction = await etherCollateral.openLoan({ value: tenETH, from: address1 });
					loan2ID = await getLoanID(loan2Transaction);
				});

				it('then increase the totalLoansCreated', async () => {
					assert.equal(await etherCollateral.totalLoansCreated(), 2);
				});
				it('then increase the totalOpenLoanCount', async () => {
					assert.equal(await etherCollateral.totalOpenLoanCount(), 2);
				});
				it('then increase the totalIssuedSynths', async () => {
					assert.bnEqual(await etherCollateral.totalIssuedSynths(), expectedsETHLoanAmount);
				});

				it('then store 2 loans against the account');
				it('then accountsWithOpenLoans has 1 address still');
				it('then return a list of the accounts open loans');

				it('list of accountsWithOpenLoans contains address1', async () => {
					const addressesWithOpenLoans = await etherCollateral.accountsWithOpenLoans();
					// console.log('addressesWithOpenLoans.length', addressesWithOpenLoans.length);
					assert.ok(addressesWithOpenLoans.includes(address1));
				});

				it('list of openLoanIDsByAccount contains both loanIDs', async () => {
					const openLoanIDsByAccount = await etherCollateral.openLoanIDsByAccount(address1, {
						from: address1,
					});
					assert.bnEqual(openLoanIDsByAccount[0], loanID);
					assert.bnEqual(openLoanIDsByAccount[1], loan2ID);
					// assert.ok(openLoanIDsByAccount.includes(loanID));
					// assert.ok(openLoanIDsByAccount.includes(loan2ID));
				});

				// describe('when closing the first loan', async () => {
				// 	let expectedFeeETH;
				// 	let expectedFeesUSD;

				// 	beforeEach(async () => {
				// 		await etherCollateral.closeLoan(loanID, { from: address1 });
				// 		expectedFeeETH = await calculateLoanFees(address1, loanID);
				// 		expectedFeesUSD = await calculateLoanFeesUSD(expectedFeeETH);
				// 		console.log('expectedFeeETH', expectedFeeETH);
				// 		console.log('expectedFeesUSD', expectedFeesUSD);
				// 	});
				// 	it('does not change the totalLoansCreated', async () => {
				// 		assert.equal(await etherCollateral.totalLoansCreated(), 1);
				// 	});
				// 	it('decrease the totalOpenLoanCount', async () => {
				// 		assert.equal(await etherCollateral.totalOpenLoanCount(), 0);
				// 	});
				// 	it('decrease the totalIssuedSynths', async () => {
				// 		assert.bnEqual(await etherCollateral.totalIssuedSynths(), 0);
				// 	});
				// 	it('does not delete it from onchain', async () => {
				// 		const synthLoan = await etherCollateral.getLoan(address1, loanID);
				// 		assert.equal(synthLoan.account, address1);
				// 		assert.bnEqual(synthLoan.loanID, loanID);
				// 		assert.bnEqual(synthLoan.collateralAmount, tenETH);
				// 	});

				// 	it('has the correct loanAmount', async () => {
				// 		const synthLoan = await etherCollateral.getLoan(address1, loanID);
				// 		assert.bnEqual(synthLoan.loanAmount, expectedsETHLoanAmount);
				// 	});

				// 	it('timeClosed > timeCreated', async () => {
				// 		const synthLoan = await etherCollateral.getLoan(address1, loanID);
				// 		assert.ok(synthLoan.timeClosed > synthLoan.timeCreated, true);
				// 	});

				// 	it('reduce sETH totalSupply', async () => {
				// 		assert.bnEqual(await etherCollateral.totalIssuedSynths(), ZERO_BN);
				// 	});
				// });

				describe('when closing the second loan', async () => {
					beforeEach(async () => {
						// await etherCollateral.closeLoan(loan2ID, { from: address1 });
					});
					xit('decrease the totalOpenLoanCount', async () => {
						assert.equal(await etherCollateral.totalOpenLoanCount(), 0);
					});
				});
			});
		});

		describe('When a loan is opened', async () => {
			let loanID;
			let interestRatePerSec;
			let synthLoan;
			let openLoanTransaction;
			const fifteenETH = toUnit('15');

			beforeEach(async () => {
				interestRatePerSec = await etherCollateral.interestPerSecond();
				openLoanTransaction = await etherCollateral.openLoan({ value: fifteenETH, from: address1 });
				loanID = await getLoanID(openLoanTransaction);
				synthLoan = await etherCollateral.getLoan(address1, loanID);
			});

			describe('Then calculate the interest on loan based on APR', async () => {
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
					const interestAmount = await etherCollateral.accruedInterestOnLoan(loanAmount, 12 * WEEK);

					assert.bnEqual(expectedInterest, interestAmount);
				});
			});

			describe('when calculating the interest on open SynthLoan after', async () => {
				it('1 second pass', async () => {
					fastForward(1);
					const loanAmount = synthLoan.loanAmount;

					const expectedInterest = calculateInterest(loanAmount, interestRatePerSec, 1);

					// expect currentInterestOnLoan to calculate accrued interest from synthLoan greater than 1 second interest
					const interest = await etherCollateral.currentInterestOnLoan(address1, loanID);
					assert.ok(interest.gte(expectedInterest));
				});
				it('1 minute pass', async () => {
					fastForward(60);
					const loanAmount = synthLoan.loanAmount;

					const expectedInterest = calculateInterest(loanAmount, interestRatePerSec, 60);

					// expect currentInterestOnLoan to calculate accrued interest from synthLoan
					const interest = await etherCollateral.currentInterestOnLoan(address1, loanID);

					assert.ok(interest.gte(expectedInterest));
				});
				it('1 week pass', async () => {
					fastForward(WEEK);
					const loanAmount = synthLoan.loanAmount;

					const expectedInterest = calculateInterest(loanAmount, interestRatePerSec, WEEK);

					// expect currentInterestOnLoan to calculate accrued interest from synthLoan
					const interest = await etherCollateral.currentInterestOnLoan(address1, loanID);

					assert.ok(interest.gte(expectedInterest));
				});
			});
		});

		describe('When closing a Loan', async () => {
			describe('then it reverts when', async () => {
				let openLoanTransaction;
				// let closeLoanTransaction;
				let loanID;
				const tenETH = toUnit('10');

				beforeEach(async () => {
					openLoanTransaction = await etherCollateral.openLoan({ value: tenETH, from: address1 });
					loanID = await getLoanID(openLoanTransaction);
					// fastForwardAndUpdateRates(WEEK * 2);
					fastForward(WEEK * 2);
				});

				it('loanID does not exist', async () => {
					await assert.revert(etherCollateral.closeLoan(9999, { from: address1 }));
				});

				it('sETH balance is less than loanAmount', async () => {
					// "Burn" some of accounts sETH by sending to the owner
					await sETHContract.transfer(owner, toUnit('4'), { from: address1 });
					await assert.revert(etherCollateral.closeLoan(loanID, { from: address1 }));
				});

				it('Depot has no sUSD to buy for Fees', async () => {
					// Dont put any sUSD into the Depot
					await assert.revert(etherCollateral.closeLoan(loanID, { from: address1 }));
				});
			});

			describe('then it closes the loan and', async () => {
				const hundredETH = toUnit('100');
				const sixtySix = toUnit('66.66666666666666670');
				const oneThousandsUSD = toUnit('1000');

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
					await depositUSDInDepot(oneThousandsUSD, address2);

					// Save Accounts balance
					depositorETHBalanceBefore = await getEthBalance(depotDepositor);
					address1ETHBalanceBefore = await getEthBalance(address1);

					// Open loan with 10 ETH
					openLoanTransaction = await etherCollateral.openLoan({
						value: hundredETH,
						from: address1,
					});

					openLoanID = await getLoanID(openLoanTransaction);

					// Go into the future
					// fastForwardAndUpdateRates(MONTH * 2);
					fastForward(MONTH * 2);

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
					assert.bnEqual(synthLoan.collateralAmount, hundredETH);
				});

				it('has the correct loanAmount', async () => {
					const synthLoan = await etherCollateral.getLoan(address1, openLoanID);
					assert.bnEqual(synthLoan.loanAmount, sixtySix);
				});

				it('timeClosed > timeCreated', async () => {
					const synthLoan = await etherCollateral.getLoan(address1, openLoanID);
					assert.ok(synthLoan.timeClosed > synthLoan.timeCreated, true);
				});

				it('reduce sETH totalSupply', async () => {
					assert.bnEqual(await etherCollateral.totalIssuedSynths(), ZERO_BN);
				});

				it('increase the FeePool sUSD balance', async () => {
					assert.bnEqual(await sUSDContract.balanceOf(FEE_ADDRESS), expectedFeesUSD);
				});

				it('record the fees in the FeePool.feesToDistribute', async () => {
					const currentFeePeriod = await feePoolProxy.recentFeePeriods(0);
					assert.bnEqual(currentFeePeriod.feesToDistribute, expectedFeesUSD);
				});

				xit('increase the ETH balance in Depot depositors account', async () => {
					// console.log('expectedFeeETH', expectedFeeETH.toString());
					// console.log('expectedFeesUSD', expectedFeesUSD.toString());
					const depositorETHBalance = await getEthBalance(depotDepositor);
					// console.log('depositorETHBalanceBefore', depositorETHBalanceBefore.toString());
					// console.log('depositorETHBalance', depositorETHBalance.toString());
					const depositerETHFees = depositorETHBalanceBefore.sub(depositorETHBalance);
					assert.bnEqual(depositerETHFees, expectedFeeETH);
				});

				it('decrease the sUSD balance in Depot', async () => {
					const expectedBalance = oneThousandsUSD.sub(expectedFeesUSD);
					assert.bnEqual(await sUSDContract.balanceOf(depot.address), expectedBalance);
				});

				it('decrease the ETH balance in the EtherCollateral contract', async () => {
					const ethCollateralETHBalance = await getEthBalance(etherCollateral.address);
					assert.bnEqual(ethCollateralETHBalance, ZERO_BN);
				});

				xit('refund the remaining ETH after fees to the loan creater', async () => {
					const address1ETHBalance = await getEthBalance(address1);
					// console.log('address1ETHBalance', address1ETHBalance.toString());
					const expectedEthBalance = address1ETHBalanceBefore.sub(expectedFeeETH);
					// console.log('expectedEthBalance', expectedEthBalance.toString());

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
