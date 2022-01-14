const { assert } = require('../../contracts/common');
const { bootstrapL2 } = require('../utils/bootstrap');

const {
	defaults: { TEMP_OWNER_DEFAULT_DURATION },
} = require('../../..');

// skipped because tempOwner no longer will work for fork tests
describe.skip('tempOwner directRelay integration tests (L2)', () => {
	const ctx = this;
	bootstrapL2({ ctx });

	// Signers
	let ownerL2;

	// Contracts
	let AddressResolverL2, OwnerRelayOnOptimism, SystemSettingsL2;

	before('target contracts and users', () => {
		({
			OwnerRelayOnOptimism,
			SystemSettings: SystemSettingsL2,
			ReadProxyAddressResolver: AddressResolverL2,
		} = ctx.contracts);

		ownerL2 = ctx.users.owner;
	});

	it('shows that the L2 relay was deployed with the correct parameters', async () => {
		assert.equal(AddressResolverL2.address, await OwnerRelayOnOptimism.resolver());
		assert.equal(ownerL2.address, await OwnerRelayOnOptimism.temporaryOwner());

		// Accept results within two hours (TODO: check why the time difference almost doubled)
		const expectedExpiry = (await ctx.provider.getBlock()).timestamp + TEMP_OWNER_DEFAULT_DURATION;
		const expiryTime = (await OwnerRelayOnOptimism.expiryTime()).toString();
		assert.bnClose(expectedExpiry, expiryTime, '7200');
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
				before('call acceptOwnership() directly via directRelay', async () => {
					const calldata = SystemSettingsL2.interface.encodeFunctionData('acceptOwnership');
					const tx = await OwnerRelayOnOptimism.connect(ownerL2).directRelay(
						SystemSettingsL2.address,
						calldata
					);
					await tx.wait();
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

			after('restore SystemSettings owner', async () => {
				const calldata = SystemSettingsL2.interface.encodeFunctionData('nominateNewOwner', [
					ownerL2.address,
				]);

				let tx = await OwnerRelayOnOptimism.connect(ownerL2).directRelay(
					SystemSettingsL2.address,
					calldata
				);

				await tx.wait();

				tx = await SystemSettingsL2.connect(ownerL2).acceptOwnership();
				await tx.wait();

				assert.equal(await SystemSettingsL2.owner(), ownerL2.address);
			});
		});
	});
});
