const EtherCollateral = artifacts.require('EtherCollateral');

require('.'); // import common test scaffolding

const {
	currentTime,
	fastForward,
	getEthBalance,
	toUnit,
	multiplyDecimal,
	divideDecimal,
} = require('../utils/testUtils');

const { toBytes32 } = require('../../.');

const Synthetix = artifacts.require('Synthetix');
const Depot = artifacts.require('Depot');
const Synth = artifacts.require('Synth');
const FeePoolProxy = artifacts.require('FeePool');

contract.only('EtherCollateral', async accounts => {
	const sETH = toBytes32('sETH');
	let etherCollateral, synthetix, synthProxy, feePoolProxy, depot;

	beforeEach(async () => {
		etherCollateral = await EtherCollateral.deployed();
		synthetix = await Synthetix.deployed();
		synthProxy = await Synth.at(await synthetix.synths(sETH));
		depot = await Depot.deployed();
		feePoolProxy = await FeePoolProxy.deployed();
	});

	const [deployerAccount, owner, address1, address2, address3, address4] = accounts;

	describe('On deployment of Contract', async () => {
		it('should set constructor params on deployment', async () => {
			const instance = await EtherCollateral.new(
				owner,
				synthProxy.address,
				feePoolProxy.address,
				depot.address,
				{
					from: deployerAccount,
				}
			);

			assert.equal(await instance.synthProxy(), synthProxy.address);
			assert.equal(await instance.feePoolProxy(), feePoolProxy.address);
			assert.equal(await instance.depot(), depot.address);
		});

		it('should have default collateralizationRatio of 150%', async () => {
			const defaultCollateralizationRatio = toUnit(150);
			const collateralizationRatio = await etherCollateral.collateralizationRatio();

			assert.bnEqual(collateralizationRatio, defaultCollateralizationRatio);
		});

		it('should have default issuanceRatio of 0.006666666666666667%', async () => {
			const defaultIssuanceRatio = toUnit('0.006666666666666667');
			const issuanceRatio = await etherCollateral.issuanceRatio();

			assert.bnEqual(issuanceRatio, defaultIssuanceRatio);
		});
	});

	describe('When opening a Loan', async () => {
		beforeEach(async () => {});

		describe('should revert when ', async () => {
			beforeEach(async () => {});

			it('eth sent is less than minLoanSize', async () => {});
			it('attempting to issue more than the cap (issueLimit)');
			it('loanLiquidationOpen is true');
			it('when contract is paused');
		});

		describe('should create a loan and', async () => {
			beforeEach(async () => {});

			it('increase the totalLoansCreated', async () => {});
			it('increase the totalOpenLoanCount', async () => {});
			it('increase the totalIssuedSynths', async () => {});
			it('return a loanID', async () => {});
			it('store a synthLoanStruct onchain', async () => {});
			it('add the loan issue amount to creators balance', async () => {});
			it('add the ETH collateral balance to the contract', async () => {});
		});
	});
});
