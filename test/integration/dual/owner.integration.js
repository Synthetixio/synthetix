const ethers = require('ethers');
const { assert } = require('../../contracts/common');
const { bootstrapDual } = require('../utils/bootstrap');
const { finalizationOnL2 } = require('../utils/optimism');

describe.only('owner relay integration tests (L1, L2)', () => {
	const ctx = this;
	bootstrapDual({ ctx });

	let ownerL1, ownerL2;
	let OwnerRelayOnEthereum, OwnerRelayOnOptimism, SystemSettingsL2;

	describe('when changing an L2 system setting from L1 via the relay', () => {
		before('target contracts and users', () => {
			({ OwnerRelayOnEthereum } = ctx.l1.contracts);
			({ OwnerRelayOnOptimism, SystemSettings: SystemSettingsL2 } = ctx.l2.contracts);

			ownerL1 = ctx.l1.users.owner;
			ownerL2 = ctx.l2.users.owner;
		});

		// TODO: What if the relay is already the owner?
		it('shows that the current owner of SystemSettings is the deployer', async () => {
			assert.equal(await SystemSettingsL2.owner(), ownerL2.address);
		});

		describe('when nominating the L2 relay as the owner of the L2 SystemSettings', () => {
			before('nominate the relay as the new ower', async () => {
				SystemSettingsL2 = SystemSettingsL2.connect(ownerL2);

				const tx = await SystemSettingsL2.nominateNewOwner(OwnerRelayOnOptimism.address);
				await tx.wait();
			});

			it('shows that the L2 relay is the nominated owner', async () => {
				assert.equal(await SystemSettingsL2.nominatedOwner(), OwnerRelayOnOptimism.address);
			});

			describe('when the L2 relay accepts ownership via an L1 tx', () => {
				let relayReceipt;

				before('relay accept ownership via the bridge', async () => {
					OwnerRelayOnEthereum = OwnerRelayOnEthereum.connect(ownerL1);

					const calldata = SystemSettingsL2.interface.encodeFunctionData('acceptOwnership', []);

					const tx = await OwnerRelayOnEthereum.relay(SystemSettingsL2.address, calldata);
					relayReceipt = await tx.wait();
				});

				before('wait for the relay to finalize on L2', async () => {
					await finalizationOnL2({ ctx, transactionHash: relayReceipt.transactionHash });
				});

				it('shows that the current owner of SystemSettings is the L2 relay', async () => {
					assert.equal(await SystemSettingsL2.owner(), OwnerRelayOnOptimism.address);
				});
			});
		});
	});
});
