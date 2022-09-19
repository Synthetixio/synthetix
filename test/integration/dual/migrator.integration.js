const { assert } = require('../../contracts/common');
const { bootstrapDual } = require('../utils/bootstrap');
const { finalizationOnL2 } = require('../utils/optimism');

describe('debt migrator integration tests (L1 -> L2)', () => {
	const ctx = this;
	bootstrapDual({ ctx });

	// Signers
	let ownerL1, ownerL2;

	// Contracts
	let DebtMigratorOnEthereum,
		DebtMigratorOnOptimism,
		SystemSettingsL2,
		AddressResolverL1,
		AddressResolverL2;

	let relayReceipt;

	before('target contracts and users', () => {
		({ DebtMigratorOnEthereum, ReadProxyAddressResolver: AddressResolverL1 } = ctx.l1.contracts);
		({
			DebtMigratorOnOptimism,
			SystemSettings: SystemSettingsL2,
			ReadProxyAddressResolver: AddressResolverL2,
		} = ctx.l2.contracts);

		ownerL1 = ctx.l1.users.owner;
		ownerL2 = ctx.l2.users.owner;
	});

	it('shows that the L1 relay was deployed with the correct parameters', async () => {
		assert.equal(await DebtMigratorOnEthereum.resolver(), AddressResolverL1.address);
		assert.equal(await DebtMigratorOnEthereum.owner(), ownerL1.address);
	});

	it('shows that the L2 relay was deployed with the correct parameters', async () => {
		assert.equal(await DebtMigratorOnOptimism.resolver(), AddressResolverL2.address);
		assert.equal(await DebtMigratorOnOptimism.owner(), ownerL2.address);
	});

	describe('when finalizing on L2 with an L1 relay tx', () => {
		before('relay setMinimumStakeTime via the bridge', async () => {
			// TODO:
			// setup migrateable account

			// check requirements

			// initiate migration on L1

			// check to make sure L1 position changed

			// wait for finalization on L2

			// show updated account on L2 with added before values from L1

			const calldata = SystemSettingsL2.interface.encodeFunctionData('setMinimumStakeTime', [
				newMinimumStakeTime,
			]);

			const tx = await DebtMigratorOnEthereum.connect(ownerL1).initiateRelay(
				SystemSettingsL2.address,
				calldata,
				1000000
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

			const tx = await DebtMigratorOnEthereum.connect(ownerL1).initiateRelay(
				SystemSettingsL2.address,
				calldata,
				1000000
			);
			relayReceipt = await tx.wait();

			await finalizationOnL2({ ctx, transactionHash: relayReceipt.transactionHash });

			assert.bnEqual(await SystemSettingsL2.minimumStakeTime(), originalMinimumStakeTime);
		});
	});
});
