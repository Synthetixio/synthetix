'use strict';

const { contract } = require('hardhat');
const { assert, addSnapshotBeforeRestoreAfterEach } = require('./common');

const { setupAllContracts } = require('./setup');

contract('DappMaintenance', accounts => {
	const [, ownerAccount, account1] = accounts;
	let dappMaintenance;

	before(async () => {
		({ DappMaintenance: dappMaintenance } = await setupAllContracts({
			accounts,
			contracts: ['DappMaintenance'],
		}));
	});

	addSnapshotBeforeRestoreAfterEach();

	describe('given an instance', () => {
		it('should have both dApps set to false', async () => {
			assert.equal(await dappMaintenance.isPausedStaking(), false);
			assert.equal(await dappMaintenance.isPausedSX(), false);
		});
		describe('setMaintenanceModeAll', () => {
			it('should only allow owner to call the function', async () => {
				await assert.revert(
					dappMaintenance.setMaintenanceModeAll(true, { from: account1 }),
					'Only the contract owner may perform this action'
				);
			});
			it('should set maintenance to true for both dApps', async () => {
				await dappMaintenance.setMaintenanceModeAll(true, { from: ownerAccount });
				assert.equal(await dappMaintenance.isPausedStaking(), true);
				assert.equal(await dappMaintenance.isPausedSX(), true);
			});
			it('should set maintenance to false for both dApps', async () => {
				await dappMaintenance.setMaintenanceModeAll(false, { from: ownerAccount });
				assert.equal(await dappMaintenance.isPausedStaking(), false);
				assert.equal(await dappMaintenance.isPausedSX(), false);
			});
		});
		describe('setMaintenanceModeStaking', () => {
			it('should only allow owner to call the function', async () => {
				await assert.revert(
					dappMaintenance.setMaintenanceModeStaking(true, { from: account1 }),
					'Only the contract owner may perform this action'
				);
			});
			it('should set maintenance to true for Staking only', async () => {
				await dappMaintenance.setMaintenanceModeStaking(true, { from: ownerAccount });
				assert.equal(await dappMaintenance.isPausedStaking(), true);
				assert.equal(await dappMaintenance.isPausedSX(), false);
			});
			it('should set maintenance to false for Staking only', async () => {
				await dappMaintenance.setMaintenanceModeAll(true, { from: ownerAccount });
				await dappMaintenance.setMaintenanceModeStaking(false, { from: ownerAccount });
				assert.equal(await dappMaintenance.isPausedStaking(), false);
				assert.equal(await dappMaintenance.isPausedSX(), true);
			});
		});
		describe('setMaintenanceModeSX', () => {
			it('should only allow owner to call the function', async () => {
				await assert.revert(
					dappMaintenance.setMaintenanceModeSX(true, { from: account1 }),
					'Only the contract owner may perform this action'
				);
			});
			it('should set maintenance to true for sX only', async () => {
				await dappMaintenance.setMaintenanceModeSX(true, { from: ownerAccount });
				assert.equal(await dappMaintenance.isPausedStaking(), false);
				assert.equal(await dappMaintenance.isPausedSX(), true);
			});
			it('should set maintenance to false for sX only', async () => {
				await dappMaintenance.setMaintenanceModeAll(true, { from: ownerAccount });
				await dappMaintenance.setMaintenanceModeSX(false, { from: ownerAccount });
				assert.equal(await dappMaintenance.isPausedStaking(), true);
				assert.equal(await dappMaintenance.isPausedSX(), false);
			});
		});
	});
});
