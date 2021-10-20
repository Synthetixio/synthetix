'use strict';

const { contract } = require('hardhat');

const { assert } = require('./common');

const { toUnit } = require('../utils')();

const { setupAllContracts } = require('./setup');

const { ensureOnlyExpectedMutativeFunctions, onlyGivenAddressCanInvoke } = require('./helpers');

let collateral, synths;

contract('Collateral', async accounts => {
	const [, owner] = accounts;

	before(async () => {
		synths = ['sUSD', 'sBTC', 'sETH'];
		({ Collateral: collateral } = await setupAllContracts({
			accounts,
			synths,
			contracts: [
				'Synthetix',
				'FeePool',
				'AddressResolver',
				'Exchanger',
				'ExchangeRates',
				'SystemStatus',
				'Issuer',
				'DebtCache',
				'SystemSettings',
				'CollateralUtil',
				'CollateralShort',
				'CollateralManager',
				'CollateralManagerState',
			],
		}));
	});

	it('should ensure only expected functions are mutative', async () => {
		ensureOnlyExpectedMutativeFunctions({
			abi: collateral.abi,
			ignoreParents: ['Owned', 'Pausable', 'MixinResolver', 'Proxy'],
			expected: [
				'addRewardsContracts',
				'addSynths',
				'setCanOpenLoans',
				'setIssueFeeRate',
				'setMinCollateral',
			],
		});
	});

	describe('setting variables', async () => {
		describe('setCanOpenLoans', async () => {
			describe('revert condtions', async () => {
				it('should fail if not called by the owner', async () => {
					await onlyGivenAddressCanInvoke({
						fnc: collateral.setCanOpenLoans,
						accounts,
						args: [false],
						address: owner,
						skipPassCheck: true,
						reason: 'Only the contract owner may perform this action',
					});
				});
			});
			describe('when it succeeds', async () => {
				beforeEach(async () => {
					await collateral.setCanOpenLoans(false, { from: owner });
				});
				it('should update the flag', async () => {
					assert.isFalse(await collateral.canOpenLoans());
				});
			});
		});

		describe('setMinCollateral', async () => {
			describe('revert condtions', async () => {
				it('should fail if not called by the owner', async () => {
					await onlyGivenAddressCanInvoke({
						fnc: collateral.setMinCollateral,
						accounts,
						args: [toUnit(1.2)],
						address: owner,
						skipPassCheck: true,
						reason: 'Only the contract owner may perform this action',
					});
				});
			});
			describe('when it succeeds', async () => {
				beforeEach(async () => {
					await collateral.setMinCollateral(toUnit(1.2), { from: owner });
				});
				it('should allow min collateral to be 0', async () => {
					await collateral.setMinCollateral(toUnit(0), { from: owner });
					assert.bnEqual(await collateral.minCollateral(), toUnit(0));
				});
			});
		});

		describe('setIssueFeeRate', async () => {
			describe('revert condtions', async () => {
				it('should fail if not called by the owner', async () => {
					await onlyGivenAddressCanInvoke({
						fnc: collateral.setIssueFeeRate,
						accounts,
						args: [toUnit(1)],
						address: owner,
						skipPassCheck: true,
						reason: 'Only the contract owner may perform this action',
					});
				});
			});
			describe('when it succeeds', async () => {
				beforeEach(async () => {
					await collateral.setIssueFeeRate(toUnit(0.2), { from: owner });
				});
				it('should update the issue fee', async () => {
					assert.bnEqual(await collateral.issueFeeRate(), toUnit(0.2));
				});
				it('should allow the issue fee rate to be 0', async () => {
					await collateral.setIssueFeeRate(toUnit(0), { from: owner });
					assert.bnEqual(await collateral.issueFeeRate(), toUnit(0));
				});
			});
		});
	});
});
