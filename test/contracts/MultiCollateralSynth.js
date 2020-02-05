require('.'); // import common test scaffolding

const FeePool = artifacts.require('FeePool');
const Synthetix = artifacts.require('Synthetix');
const MultiCollateralSynth = artifacts.require('MultiCollateralSynth');
const TokenState = artifacts.require('TokenState');
const Proxy = artifacts.require('Proxy');

const { toUnit, ZERO_ADDRESS } = require('../utils/testUtils');
const { toBytes32 } = require('../..');

contract('MultiCollateralSynth', accounts => {
	const [
		deployerAccount,
		owner, // Oracle next, is not needed
		,
		,
		account1,
		account2,
	] = accounts;

	let feePool,
		feePoolProxy,
		// FEE_ADDRESS,
		synthetix,
		synthetixProxy;

	beforeEach(async () => {
		// Save ourselves from having to await deployed() in every single test.
		// We do this in a beforeEach instead of before to ensure we isolate
		// contract interfaces to prevent test bleed.
		feePool = await FeePool.deployed();
		// Deploy new proxy for feePool
		feePoolProxy = await Proxy.new(owner, { from: deployerAccount });

		synthetix = await Synthetix.deployed();
		// Deploy new proxy for Synthetix
		synthetixProxy = await Proxy.new(owner, { from: deployerAccount });

		// ensure synthetixProxy has target set to synthetix
		await feePool.setProxy(feePoolProxy.address, { from: owner });
		await synthetix.setProxy(synthetixProxy.address, { from: owner });
		// set new proxies on Synthetix and FeePool
		await synthetixProxy.setTarget(synthetix.address, { from: owner });
		await feePoolProxy.setTarget(feePool.address, { from: owner });
	});

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
			web3.utils.toWei('0'),
			owner,
			{
				from: deployerAccount,
			}
		);
		return { synth, tokenState, proxy };
	};

	describe('when a MultiCollateral synth is added and connected to Synthetix', () => {
		beforeEach(async () => {
			const { synth, tokenState, proxy } = await deploySynth({
				currencyKey: 'sCollateral',
			});
			await tokenState.setAssociatedContract(synth.address, { from: owner });
			await proxy.setTarget(synth.address, { from: owner });
			await synthetix.addSynth(synth.address, { from: owner });
			this.synth = synth;
		});
		it('it sets multiCollateral correctly', async () => {
			const multiCollateral = await this.synth.multiCollateral();
			assert.equal(multiCollateral, owner);
		});
		describe('setMultiCollateral', () => {
			const newMultiCollateral = account1;
			describe('when a non-owner tries to invoke', () => {
				it('then it fails', async () => {
					await assert.revert(
						this.synth.setMultiCollateral(newMultiCollateral, { from: account1 })
					);
					await assert.revert(
						this.synth.setMultiCollateral(newMultiCollateral, { from: account2 })
					);
				});
			});
			describe('when an owner invokes', () => {
				it('then it succeeds', async () => {
					await this.synth.setMultiCollateral(newMultiCollateral, { from: owner });
					const multiCollateral = await this.synth.multiCollateral();
					assert.equal(newMultiCollateral, multiCollateral);
				});
			});
		});
		describe('when multiCollateral is set', () => {
			describe('when non-multiCollateral tries to issue', () => {
				it('then it fails', async () => {
					await assert.revert(this.synth.issue(account1, toUnit('1'), { from: account1 }));
				});
			});
			describe('when multiCollateral tries to issue', () => {
				it('then it can issue new synths', async () => {
					const accountToIssue = account1;
					const issueAmount = toUnit('1');
					const totalSupplyBefore = await this.synth.totalSupply();
					const balanceOfBefore = await this.synth.balanceOf(accountToIssue);

					await this.synth.issue(accountToIssue, issueAmount, { from: owner });

					assert.bnEqual(await this.synth.totalSupply(), totalSupplyBefore.add(issueAmount));
					assert.bnEqual(
						await this.synth.balanceOf(accountToIssue),
						balanceOfBefore.add(issueAmount)
					);
				});
			});
			describe('when synthetixProxy has target set to account1', () => {
				beforeEach(async () => {
					await synthetixProxy.setTarget(account1, { from: owner });
				});
				it('then it can issue new synths as account1', async () => {
					const accountToIssue = account1;
					const issueAmount = toUnit('1');
					const totalSupplyBefore = await this.synth.totalSupply();
					const balanceOfBefore = await this.synth.balanceOf(accountToIssue);

					await this.synth.issue(accountToIssue, issueAmount, { from: account1 });

					assert.bnEqual(await this.synth.totalSupply(), totalSupplyBefore.add(issueAmount));
					assert.bnEqual(
						await this.synth.balanceOf(accountToIssue),
						balanceOfBefore.add(issueAmount)
					);
				});
			});
		});
	});
});
