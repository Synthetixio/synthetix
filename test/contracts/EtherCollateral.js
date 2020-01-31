require('.'); // import common test scaffolding

const EtherCollateral = artifacts.require('EtherCollateral');
const Synthetix = artifacts.require('Synthetix');
const Depot = artifacts.require('Depot');
const Synth = artifacts.require('Synth');
const MultiCollateralSynth = artifacts.require('MultiCollateralSynth');
const TokenState = artifacts.require('TokenState');
const Proxy = artifacts.require('Proxy');
const FeePoolProxy = artifacts.require('FeePool');

const {
	currentTime,
	fastForward,
	getEthBalance,
	toUnit,
	// multiplyDecimal,
	// divideDecimal,
	ZERO_ADDRESS,
} = require('../utils/testUtils');

const { toBytes32 } = require('../../.');

contract.only('EtherCollateral', async accounts => {
	const SECOND = 1000;
	const DAY = 86400;
	const WEEK = 604800;

	const sETH = toBytes32('sETH');
	const sUSD = toBytes32('sUSD');

	const ISSUACE_RATIO = toUnit('0.666666666666666667');

	let etherCollateral,
		synthetix,
		synthProxy,
		feePoolProxy,
		depot,
		sUSDContract,
		sETHContract,
		FEE_ADDRESS;

	beforeEach(async () => {
		etherCollateral = await EtherCollateral.deployed();
		synthetix = await Synthetix.deployed();
		depot = await Depot.deployed();
		feePoolProxy = await FeePoolProxy.deployed();
		FEE_ADDRESS = await feePoolProxy.FEE_ADDRESS();

		sUSDContract = await Synth.at(await synthetix.synths(sUSD));
		sETHContract = await MultiCollateralSynth.at(await synthetix.synths(sETH));
		synthProxy = sETHContract;
		await sETHContract.setMultiCollateral(etherCollateral.address, { from: owner });
	});

	const [
		deployerAccount,
		owner,
		address1,
		address2,
		// address3,
		// address4
	] = accounts;

	const calcLoanAmount = async ethAmount => {
		return (ethAmount * (100 / 150)).toString();
	};

	const issueSynthsUSD = async (issueAmount, receiver) => {
		// We need the owner to issue synths
		console.log('owner to issue synths sUSD', issueAmount);
		await synthetix.issueSynths(issueAmount, { from: owner });
		// Set up the depositor with an amount of synths to deposit.
		console.log('transfer synths sUSD to ', receiver);
		await sUSDContract.transfer(receiver, issueAmount, {
			from: owner,
		});
	};

	const depositUSDInDepot = async (synthsToDeposit, depositor) => {
		// Get sUSD from Owner
		await issueSynthsUSD(synthsToDeposit, depositor);

		// Approve Transaction
		console.log('Approve Transaction on sUSD');
		await sUSDContract.approve(depot.address, synthsToDeposit, { from: depositor });

		// Deposit sUSD in Depot
		console.log('Deposit sUSD in Depot amount', synthsToDeposit, depositor);
		await depot.depositSynths(synthsToDeposit, {
			from: depositor,
		});
	};

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
			beforeEach(async () => {});

			it('collateralizationRatio of 150%', async () => {
				const defaultCollateralizationRatio = toUnit(150);
				const collateralizationRatio = await etherCollateral.collateralizationRatio();

				assert.bnEqual(collateralizationRatio, defaultCollateralizationRatio);
			});

			it('issuanceRatio of 0.666666666666666667%', async () => {
				const issuanceRatio = await etherCollateral.issuanceRatio();

				assert.bnEqual(issuanceRatio, ISSUACE_RATIO);
			});

			it('issueFeeRate of 50 bips');
			it('interestRate of 5%');
			it('issueLimit of 5000');
			it('minLoanSize of 1');
			it('loanLiquidationOpen of false');
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

			it('issueFeeRate');
			it('interestRate');
			it('issueLimit');
			it('minLoanSize');
			it('loanLiquidationOpen');
		});
	});

	describe('When opening a Loan', async () => {
		beforeEach(async () => {});

		describe('should revert when ', async () => {
			beforeEach(async () => {});

			it('eth sent is less than minLoanSize', async () => {
				await assert.revert(etherCollateral.openLoan({ amount: 0.1, from: address1 }));
			});

			it('attempting to issue more than the cap (issueLimit)', async () => {
				await etherCollateral.setIssueLimit(50, { from: owner });

				await assert.revert(etherCollateral.openLoan({ amount: 51, from: address1 }));
			});

			it('loanLiquidationOpen is true', async () => {
				await etherCollateral.setLoanLiquidationOpen(true, { from: owner });

				await assert.revert(etherCollateral.openLoan({ amount: 1, from: address1 }));
			});

			it('when contract is paused', async () => {
				await etherCollateral.setPaused(true, { from: owner });

				await assert.revert(etherCollateral.openLoan({ amount: 1, from: address1 }));
			});
		});

		describe('should create a loan and', async () => {
			let loanTransaction;
			const tenETH = toUnit('10');
			const expectedsETHLoanAmount = toUnit('6.66666666666666667');

			beforeEach(async () => {
				// const ethBalance = await getEthBalance(address2);
				// console.log('address2 ETH balance', ethBalance);
				loanTransaction = await etherCollateral.openLoan({ value: tenETH, from: address1 });
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
			it('emits a LoanCreated event', async () => {
				assert.eventEqual(loanTransaction, 'LoanCreated', {
					account: address1,
					loanID: 1,
					amount: expectedsETHLoanAmount,
				});
			});
			it('store the synthLoan.acccount', async () => {
				const synthLoan = await etherCollateral.getLoan(address1, 1);
				assert.equal(synthLoan.account, address1);
			});
			it('store the synthLoan.collateralAmount', async () => {
				const synthLoan = await etherCollateral.getLoan(address1, 1);
				assert.bnEqual(synthLoan.collateralAmount, tenETH);
			});
			it('store the synthLoan.loanAmount', async () => {
				const synthLoan = await etherCollateral.getLoan(address1, 1);
				assert.bnEqual(synthLoan.loanAmount, expectedsETHLoanAmount);
			});
			it('store the synthLoan.loanID', async () => {
				const synthLoan = await etherCollateral.getLoan(address1, 1);
				assert.bnEqual(synthLoan.loanID, 1);
			});
			it('store the synthLoan.timeCreated', async () => {
				const synthLoan = await etherCollateral.getLoan(address1, 1);
				// console.log('synthLoan.timeCreated', synthLoan.timeCreated.toString());
				assert.unitNotEqual(synthLoan.timeCreated, toUnit(0));
			});
			it('store the synthLoan.timeClosed as 0 for not closed', async () => {
				const synthLoan = await etherCollateral.getLoan(address1, 0);
				assert.bnEqual(synthLoan.timeClosed, toUnit(0));
			});
			// it('store a synthLoanStruct onchain', async () => {
			// 	const synthLoan = await etherCollateral.getLoan(address1, 1);
			// 	assert.equal(synthLoan.account, address1);
			// 	assert.bnEqual(synthLoan.collateralAmount, tenETH);
			// 	assert.bnEqual(synthLoan.loanAmount, expectedsETHLoanAmount);
			// 	assert.equal(synthLoan.loanID, 1);
			// 	assert.unitNotEqual(synthLoan.timeCreated, toUnit(0));
			// 	assert.equal(synthLoan.timeClosed, toUnit(0));
			// });
			it('add the loan issue amount to creators balance', async () => {
				const sETHBalance = await sETHContract.balanceOf(address1);
				assert.bnEqual(sETHBalance, expectedsETHLoanAmount);
			});
			it('add the ETH collateral balance to the contract', async () => {
				const ethInContract = await getEthBalance(etherCollateral.address);
				assert.equal(ethInContract, tenETH);
			});

			describe('should create a second loan and', async () => {
				let loan2Transaction;
				const tenETH = toUnit('7000');
				const expectedsETHLoanAmount = toUnit('4673.333333333333335670');
				// const expectedsETHLoanAmount = toUnit(calcLoanAmount(tenETH));

				beforeEach(async () => {
					// const ethBalance = await getEthBalance(address2);
					// console.log('address2 ETH balance', ethBalance);
					loan2Transaction = await etherCollateral.openLoan({ value: tenETH, from: address1 });
				});

				it('increase the totalLoansCreated', async () => {
					assert.equal(await etherCollateral.totalLoansCreated(), 2);
				});
				it('increase the totalOpenLoanCount', async () => {
					assert.equal(await etherCollateral.totalOpenLoanCount(), 2);
				});
				it('increase the totalIssuedSynths', async () => {
					assert.bnEqual(await etherCollateral.totalIssuedSynths(), expectedsETHLoanAmount);
				});
			});
		});

		describe('when a loan is opened', async () => {
			let openLoanTransaction;
			let loanID;
			const tenETH = toUnit('10');

			beforeEach(async () => {
				openLoanTransaction = await etherCollateral.openLoan({ value: tenETH, from: address1 });
				loanID = 1;
			});

			describe('it should calculates interest over ', async () => {
				it('1 minute', async () => {
					// fastForward(WEEK * 4);
					// const interest = await etherCollateral.currentInterestOnMyLoan(loanID, {
					// 	from: address1,
					// });
					// console.log(interest);
				});

				it('1 week');
				it('4 weeks');
				it('16 weeks');
				it('16 weeks + minting fee');
			});

			describe('it should be able to read', async () => {
				it('open loans');
				it('openLoansByAccount');
				it('openLoansByID');
			});
		});

		describe('When closing a Loan', async () => {
			describe('should revert when', async () => {
				let openLoanTransaction;
				let closeLoanTransaction;
				let loanID;
				const tenETH = toUnit('10');

				beforeEach(async () => {
					openLoanTransaction = await etherCollateral.openLoan({ value: tenETH, from: address1 });
					loanID = 1;
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

			describe('should close a loan and', async () => {
				let openLoanTransaction;
				let closeLoanTransaction;
				const tenETH = toUnit('10');
				const oneThousandsUSD = toUnit('1000');

				beforeEach(async () => {
					// Deposit sUSD in Depot to allow fees to be bought with ETH
					depositUSDInDepot(oneThousandsUSD, address2);
					// Open loan with 10 ETH
					openLoanTransaction = await etherCollateral.openLoan({ value: tenETH, from: address1 });
					// Go into the future
					fastForward(WEEK * 8);
					// Close the loan
					closeLoanTransaction = await etherCollateral.closeLoan({ from: address1 });
				});

				it('not change the totalLoansCreated');
				it('decrease the totalOpenLoanCount');
				it('decrease the totalIssuedSynths');
				it('delete the loan from storage');
				it('reduce sETH totalSupply');
				it('increase the FeePool sUSD balance');
				it('record the fees in the FeePool.feesToDistribute');
				it('decrease the sUSD in Depot');
				it('decrease the ETH balance in the EtherCollateral contract');
				it('refund the ETH to the loan creater');
			});
		});
	});
});
