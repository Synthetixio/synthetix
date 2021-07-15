const ethers = require('ethers');
const { assert } = require('../../contracts/common');
const { bootstrapDual } = require('../utils/bootstrap');
const { finalizationOnL2 } = require('../utils/optimism');

describe.only('owner relay integration tests (L1, L2)', () => {
	const ctx = this;
	bootstrapDual({ ctx });

	let ownerL1, ownerL2;
	let OwnerRelayOnEthereum, OwnerRelayOnOptimism, SystemSettingsL2;

	before('target contracts and users', () => {
		({ OwnerRelayOnEthereum } = ctx.l1.contracts);
		({ OwnerRelayOnOptimism, SystemSettings: SystemSettingsL2 } = ctx.l2.contracts);

		ownerL1 = ctx.l1.users.owner;
		ownerL2 = ctx.l2.users.owner;
	});

	describe('when SystemSettings on L2 is owned by an EOA', () => {
		before('check ownership', async function() {
			if ((await SystemSettingsL2.owner()) === OwnerRelayOnOptimism.address) {
				this.skip();
			}
		});

		it('shows that the current owner of SystemSettings is the EOA', async () => {
			assert.equal(await SystemSettingsL2.owner(), ownerL2.address);
		});

		describe('when nominating the L2 relay as the owner of the L2 SystemSettings', () => {
			before('nominate the relay as the new ower', async () => {
				const tx = await SystemSettingsL2.connect(ownerL2).nominateNewOwner(
					OwnerRelayOnOptimism.address
				);
				await tx.wait();
			});

			it('shows that the L2 relay is the nominated owner', async () => {
				assert.equal(await SystemSettingsL2.nominatedOwner(), OwnerRelayOnOptimism.address);
			});

			describe('when the L2 relay accepts ownership', () => {
				let relayReceipt;

				before('call acceptOwnershipOn() directly on OwnerRelayOnOptimism', async () => {
					const tx = await OwnerRelayOnOptimism.connect(ownerL2).acceptOwnershipOn(
						SystemSettingsL2.address
					);
					relayReceipt = await tx.wait();
				});

				it('shows that the current owner of SystemSettings is the L2 relay', async () => {
					assert.equal(await SystemSettingsL2.owner(), OwnerRelayOnOptimism.address);
				});
			});
		});
	});

	describe('when SystemSettings on L2 is owned by the relay', () => {
		it('shows that the current owner of SystemSettings is the L2 relay', async () => {
			assert.equal(await SystemSettingsL2.owner(), OwnerRelayOnOptimism.address);
		});

		describe('when changing an L2 system setting with an L1 tx', () => {
			let originalMinimumStakeTime;
			const newMinimumStakeTime = '42';

			before('store minimumStakeTime', async () => {
				originalMinimumStakeTime = await SystemSettingsL2.minimumStakeTime();
			});

			before('relay setMinimumStakeTime via the bridge', async () => {
				const calldata = SystemSettingsL2.interface.encodeFunctionData('setMinimumStakeTime', [
					newMinimumStakeTime,
				]);

				const tx = await OwnerRelayOnEthereum.connect(ownerL1).initiateRelay(
					SystemSettingsL2.address,
					calldata
				);
				relayReceipt = await tx.wait();
			});

			before('wait for the relay to finalize on L2', async () => {
				await finalizationOnL2({ ctx, transactionHash: relayReceipt.transactionHash });
			});

			it(`shows that the minimum stake time is now ${newMinimumStakeTime}`, async () => {
				assert.equal((await SystemSettingsL2.minimumStakeTime()).toString(), newMinimumStakeTime);
			});

			after('restore minimumStakeTime', async () => {
				const calldata = SystemSettingsL2.interface.encodeFunctionData('setMinimumStakeTime', [
					originalMinimumStakeTime,
				]);

				const tx = await OwnerRelayOnEthereum.connect(ownerL1).initiateRelay(
					SystemSettingsL2.address,
					calldata
				);
				relayReceipt = await tx.wait();

				await finalizationOnL2({ ctx, transactionHash: relayReceipt.transactionHash });

				assert.bnEqual(await SystemSettingsL2.minimumStakeTime(), originalMinimumStakeTime);
			});
		});

		describe('when the relay relinquishes ownership back to an EOA on L1', () => {
			before('relay a tx to nominateNewOwner() from L1', async () => {
				const calldata = SystemSettingsL2.interface.encodeFunctionData('nominateNewOwner', [
					ownerL2.address,
				]);

				const tx = await OwnerRelayOnEthereum.connect(ownerL1).initiateRelay(
					SystemSettingsL2.address,
					calldata
				);
				relayReceipt = await tx.wait();
			});

			before('wait for the relay to finalize on L2', async () => {
				await finalizationOnL2({ ctx, transactionHash: relayReceipt.transactionHash });
			});

			before('call acceptOwnership() directly on L2 with the EOA', async () => {
				const tx = await SystemSettingsL2.connect(ownerL2).acceptOwnership();
				await tx.wait();
			});

			it('shows that the current owner of SystemSettings is the EOA', async () => {
				assert.equal(await SystemSettingsL2.owner(), ownerL2.address);
			});
		});
	});
});
