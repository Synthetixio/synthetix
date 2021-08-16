const { assert } = require('../../contracts/common');
const { bootstrapDual } = require('../utils/bootstrap');
const { finalizationOnL2 } = require('../utils/optimism');

const {
	defaults: { TEMP_OWNER_DEFAULT_EOL },
} = require('../../..');

describe('owner relay integration tests (L1, L2)', () => {
	const ctx = this;
	bootstrapDual({ ctx });

	// Signers
	let ownerL1, ownerL2;

	// Contracts
	let OwnerRelayOnEthereum,
		OwnerRelayOnOptimism,
		SystemSettingsL2,
		AddressResolverL1,
		AddressResolverL2;

	let relayReceipt;

	before('target contracts and users', () => {
		({ OwnerRelayOnEthereum, ReadProxyAddressResolver: AddressResolverL1 } = ctx.l1.contracts);
		({
			OwnerRelayOnOptimism,
			SystemSettings: SystemSettingsL2,
			ReadProxyAddressResolver: AddressResolverL2,
		} = ctx.l2.contracts);

		ownerL1 = ctx.l1.users.owner;
		ownerL2 = ctx.l2.users.owner;
	});

	it('shows that the L1 relay was deployed with the correct parameters', async () => {
		assert.equal(AddressResolverL1.address, await OwnerRelayOnEthereum.resolver());
	});

	it('shows that the L2 relay was deployed with the correct parameters', async () => {
		assert.equal(AddressResolverL2.address, await OwnerRelayOnOptimism.resolver());
		assert.equal(ownerL2.address, await OwnerRelayOnOptimism.tempOwner());

		// Accept results within an hour
		const eol = (await OwnerRelayOnOptimism.tempOwnerEOL()).toNumber();
		assert.bnClose(eol, Math.floor(new Date().getTime() / 1000) + TEMP_OWNER_DEFAULT_EOL, 60 * 60);
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
		let originalMinimumStakeTime;
		const newMinimumStakeTime = '42';

		it('shows that the current owner of SystemSettings is the L2 relay', async () => {
			assert.equal(await SystemSettingsL2.owner(), OwnerRelayOnOptimism.address);
		});

		before('store minimumStakeTime', async () => {
			originalMinimumStakeTime = await SystemSettingsL2.minimumStakeTime();
		});

		describe('when changing an L2 system setting with directRelay', () => {
			before('call setMinimumStakeTime directly', async () => {
				const calldata = SystemSettingsL2.interface.encodeFunctionData('setMinimumStakeTime', [
					newMinimumStakeTime,
				]);

				const tx = await OwnerRelayOnOptimism.connect(ownerL2).directRelay(
					SystemSettingsL2.address,
					calldata
				);

				await tx.wait();
			});

			it(`shows that the minimum stake time is now ${newMinimumStakeTime}`, async () => {
				assert.equal((await SystemSettingsL2.minimumStakeTime()).toString(), newMinimumStakeTime);
			});

			after('restore minimumStakeTime', async () => {
				const calldata = SystemSettingsL2.interface.encodeFunctionData('setMinimumStakeTime', [
					originalMinimumStakeTime,
				]);

				const tx = await OwnerRelayOnOptimism.connect(ownerL2).directRelay(
					SystemSettingsL2.address,
					calldata
				);

				await tx.wait();

				assert.equal(
					(await SystemSettingsL2.minimumStakeTime()).toString(),
					originalMinimumStakeTime
				);
			});
		});

		describe('when changing an L2 system setting with an L1 relay tx', () => {
			before('relay setMinimumStakeTime via the bridge', async () => {
				const calldata = SystemSettingsL2.interface.encodeFunctionData('setMinimumStakeTime', [
					newMinimumStakeTime,
				]);

				const tx = await OwnerRelayOnEthereum.connect(ownerL1).initiateRelay(
					SystemSettingsL2.address,
					calldata,
					0
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
					calldata,
					0
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
					calldata,
					3e6
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
