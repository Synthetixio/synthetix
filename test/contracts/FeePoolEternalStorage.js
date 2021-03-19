'use strict';

const { artifacts, contract } = require('hardhat');

const { assert, addSnapshotBeforeRestoreAfterEach } = require('./common');

const { setupAllContracts } = require('./setup');

const {
	constants: { ZERO_ADDRESS },
} = require('../..');

contract('FeePoolEternalStorage', accounts => {
	const FeePoolEternalStorage = artifacts.require('FeePoolEternalStorage');
	const [deployerAccount, ownerAccount, feePoolAddress, account1, account2, account3] = accounts;
	let feePool, feePoolEternalStorage;

	before(async () => {
		({ FeePool: feePool, FeePoolEternalStorage: feePoolEternalStorage } = await setupAllContracts({
			accounts,
			synths: [],
			contracts: ['FeePool', 'FeePoolEternalStorage'],
		}));
	});

	addSnapshotBeforeRestoreAfterEach();

	it('should revert when owner parameter is passed the zero address', async () => {
		await assert.revert(
			FeePoolEternalStorage.new(ZERO_ADDRESS, feePoolAddress, { from: deployerAccount })
		);
	});

	it('should set owner address on deployment', async () => {
		const instance = await FeePoolEternalStorage.new(ownerAccount, feePoolAddress, {
			from: deployerAccount,
		});
		const owner = await instance.owner();
		assert.equal(owner, ownerAccount);
	});

	describe('given an instance', () => {
		it('when array lengths dont match then revert', async () => {
			const accounts = [account1, account2];
			const feePeriodIDs = [1, 2, 3];

			await assert.revert(
				feePoolEternalStorage.importFeeWithdrawalData(accounts, feePeriodIDs, {
					from: ownerAccount,
				}),
				'Length mismatch'
			);
		});

		it('when importFeeWithdrawalData then it is accessable via feePool.getLastFeeWithdrawal', async () => {
			const accounts = [account1, account2, account3];
			const feePeriodIDs = [1, 2, 3];

			await feePoolEternalStorage.setAssociatedContract(feePoolEternalStorage.address, {
				from: ownerAccount,
			});

			await feePoolEternalStorage.importFeeWithdrawalData(accounts, feePeriodIDs, {
				from: ownerAccount,
			});

			const feePeriodIDAccount1 = await feePool.getLastFeeWithdrawal(account1);
			assert.bnEqual(feePeriodIDAccount1, feePeriodIDs[0]);

			const feePeriodIDAccount2 = await feePool.getLastFeeWithdrawal(account2);
			assert.bnEqual(feePeriodIDAccount2, feePeriodIDs[1]);

			const feePeriodIDAccount3 = await feePool.getLastFeeWithdrawal(account3);
			assert.bnEqual(feePeriodIDAccount3, feePeriodIDs[2]);
		});
	});
});
