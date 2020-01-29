require('.'); // import common test scaffolding

const EtherCollateral = artifacts.require('EtherCollateral');
const Synthetix = artifacts.require('Synthetix');
const Depot = artifacts.require('Depot');
const Synth = artifacts.require('Synth');
const MultiCollateralSynth = artifacts.require('MultiCollateralSynth');
const FeePoolProxy = artifacts.require('FeePool');

const {
	// currentTime,
	// fastForward,
	getEthBalance,
	toUnit,
	// multiplyDecimal,
	// divideDecimal,
} = require('../utils/testUtils');

const { toBytes32 } = require('../../.');

contract.only('EtherCollateral', async accounts => {
	const sETH = toBytes32('sETH');
	const sUSD = toBytes32('sUSD');

	let etherCollateral,
		synthetix,
		synthProxy,
		feePoolProxy,
		depot,
		sUSDContract,
		sETHContract,
		FEE_ADDRESS;

	const deploySynth = async ({ currencyKey, proxy, tokenState }) => {
		tokenState =
			tokenState ||
			(await TokenState.new(owner, ZERO_ADDRESS, {
				from: deployerAccount,
			}));

		proxy = proxy || (await Proxy.new(owner, { from: deployerAccount }));

		const synth = await MultiCollateralSynth.new(
			proxy.address,
			tokenState.address,
			synthetixProxy.address,
			feePoolProxy.address,
			`Synth ${currencyKey}`,
			currencyKey,
			owner,
			toBytes32(currencyKey),
			exchangeRates.address,
			web3.utils.toWei('0'),
			{
				from: deployerAccount,
			}
		);
		return { synth, tokenState, proxy };
	};

	beforeEach(async () => {
		etherCollateral = await EtherCollateral.deployed();
		synthetix = await Synthetix.deployed();
		depot = await Depot.deployed();
		feePoolProxy = await FeePoolProxy.deployed();
		FEE_ADDRESS = await feePoolProxy.FEE_ADDRESS();

		sUSDContract = await Synth.at(await synthetix.synths(sUSD));

		// Remove sETH
		synthetix.removeSynth(sETH);

		// Deploy sETH as MultiCollateralSynth
		const { synth, tokenState, proxy } = await deploySynth({
			currencyKey: 'sETH',
		});
		await tokenState.setAssociatedContract(synth.address, { from: owner });
		await proxy.setTarget(synth.address, { from: owner });
		await synthetix.addSynth(synth.address, { from: owner });
		synthProxy = synth;
		sETHContract = await Synth.at(await synthetix.synths(sETH));
	});

	const [
		deployerAccount,
		owner,
		address1,
		address2,
		// address3,
		// address4
	] = accounts;

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

			it('issuanceRatio of 0.006666666666666667%', async () => {
				const defaultIssuanceRatio = toUnit('0.006666666666666667');
				const issuanceRatio = await etherCollateral.issuanceRatio();

				assert.bnEqual(issuanceRatio, defaultIssuanceRatio);
			});

			it('issueFeeRate of 50 bips');
			it('interestRate of 5%');
			it('issueLimit of 5000');
			it('minLoanSize of 1');
			it('loanLiquidationOpen of false');
		});

		describe('should allow owner to set', async () => {
			beforeEach(async () => {});

			it('collateralizationRatio', async () => {
				// Confirm defaults
				const defaultCollateralizationRatio = toUnit(150);
				const oldCollateralizationRatio = await etherCollateral.collateralizationRatio();
				assert.bnEqual(oldCollateralizationRatio, defaultCollateralizationRatio);

				// Set new value
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
					it('issuanceRatio is updated', async () => {
						const newIssuanceRatio = toUnit('0.006666666666666667');
						const issuanceRatio = await etherCollateral.issuanceRatio();

						assert.bnEqual(issuanceRatio, newIssuanceRatio);
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

		describe.only('should create a loan and', async () => {
			let loanTransaction;
			const tenETH = toUnit('10');

			beforeEach(async () => {
				console.log('address2 ETH balance', getEthBalance(address2));
				loanTransaction = await etherCollateral.openLoan({ amount: tenETH, from: address2 });
			});

			it('increase the totalLoansCreated', async () => {
				assert.equal(await etherCollateral.totalLoansCreated(), 1);
			});
			it('increase the totalOpenLoanCount', async () => {
				assert.equal(await etherCollateral.totalOpenLoanCount(), 1);
			});
			it('increase the totalIssuedSynths', async () => {
				assert.equal(await etherCollateral.totalIssuedSynths(), toUnit('0.06666666667'));
			});
			it('return a loanID', async () => {
				// TODO: get loanID out of loanTransaction
				console.log(loanTransaction);
				const loanID = 0;
				assert.equal(loanID, 0);
			});
			it('store a synthLoanStruct onchain', async () => {
				const synthLoan = await etherCollateral.getLoan(address1, 0);
				assert.equal(synthLoan.acccount, address1);
				assert.equal(synthLoan.collateralAmount, 10);
				assert.equal(synthLoan.collateralAmount, 10);
				assert.equal(synthLoan.loanAmount, toUnit('0.06666666667'));
				assert.equal(synthLoan.loanID, 0);
				assert.unitNotEqual(synthLoan.timeCreated, 0);
				assert.equal(synthLoan.timeClosed, 0);
			});
			it('add the loan issue amount to creators balance', async () => {
				const expectedsETHBalance = toUnit('0.06666666667');
				const sETHBalance = await sETHContract.balanceOf(address1);
				assert.bnEqual(sETHBalance, expectedsETHBalance);
			});
			it('add the ETH collateral balance to the contract', async () => {
				const ethInContract = getEthBalance(etherCollateral.address);
				assert.equal(ethInContract, tenETH);
			});
		});
	});
});
