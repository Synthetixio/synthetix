const { assert } = require('../../contracts/common');
const { bootstrapDual } = require('../utils/bootstrap');
const { finalizationOnL2 } = require('../utils/optimism');

const {
	defaults: { TEMP_OWNER_DEFAULT_DURATION },
} = require('../../..');

describe('relayBatch integration tests (L1, L2)', () => {
	const ctx = this;
	bootstrapDual({ ctx });

	// Signers
	let ownerL1, ownerL2;

	// Contracts
	let AddressResolverL1,
		AddressResolverL2,
		OwnerRelayOnEthereum,
		OwnerRelayOnOptimism,
		RewardEscrowV2L2,
		SynthetixL2,
		SystemSettingsL2;

	let relayReceipt;

	const contractsToBeOwned = [];
	const contractsToBeOwnedAdresses = [];

	before('target contracts and users', () => {
		({ OwnerRelayOnEthereum, ReadProxyAddressResolver: AddressResolverL1 } = ctx.l1.contracts);
		({
			OwnerRelayOnOptimism,
			SystemSettings: SystemSettingsL2,
			Synthetix: SynthetixL2,
			RewardEscrowV2: RewardEscrowV2L2,
			ReadProxyAddressResolver: AddressResolverL2,
		} = ctx.l2.contracts);

		ownerL1 = ctx.l1.users.owner;
		ownerL2 = ctx.l2.users.owner;

		contractsToBeOwned.push(RewardEscrowV2L2);
		contractsToBeOwned.push(SynthetixL2);
		contractsToBeOwned.push(SystemSettingsL2);
		for (const contract of contractsToBeOwned) {
			contractsToBeOwnedAdresses.push(contract.address);
		}
	});

	it('shows that the L1 relay was deployed with the correct parameters', async () => {
		assert.equal(await OwnerRelayOnEthereum.resolver(), AddressResolverL1.address);
	});

	it('shows that the L2 relay was deployed with the correct parameters', async () => {
		assert.equal(await OwnerRelayOnOptimism.resolver(), AddressResolverL2.address);
		assert.equal(await OwnerRelayOnOptimism.temporaryOwner(), ownerL2.address);

		// Accept results within an hour
		const expectedExpiry =
			(await ctx.l1.provider.getBlock()).timestamp + TEMP_OWNER_DEFAULT_DURATION;
		const expiryTime = (await OwnerRelayOnOptimism.expiryTime()).toString();
		assert.bnClose(expectedExpiry, expiryTime, '3600');
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

		describe('when nominating the L2 relay as the owner of the L2 contracts we want to give ownership to', () => {
			before('nominate the relay as the new ower for candidate contracts', async () => {
				for (const contract of contractsToBeOwned) {
					const tx = await contract.connect(ownerL2).nominateNewOwner(OwnerRelayOnOptimism.address);
					await tx.wait();
				}
			});

			it('shows that the L2 relay is the nominated owner', async () => {
				for (const contract of contractsToBeOwned) {
					assert.equal(await contract.nominatedOwner(), OwnerRelayOnOptimism.address);
				}
			});

			describe('when the L2 relay accepts ownership via the L1 relayer', () => {
				before('call acceptOwnership() via an L1 relay batch', async () => {
					const calldata = SystemSettingsL2.interface.encodeFunctionData('acceptOwnership');
					const calldataBatch = [calldata, calldata, calldata];

					const tx = await OwnerRelayOnEthereum.connect(ownerL1).initiateRelayBatch(
						contractsToBeOwnedAdresses,
						calldataBatch,
						0
					);
					relayReceipt = await tx.wait();
				});

				before('wait for the relay to finalize on L2', async () => {
					await finalizationOnL2({ ctx, transactionHash: relayReceipt.transactionHash });
				});

				it('shows that the current owner of the nominated contracts is the L2 relay', async () => {
					for (const contract of contractsToBeOwned) {
						assert.equal(await contract.owner(), OwnerRelayOnOptimism.address);
					}
				});

				describe('when the relay relinquishes ownership back to an EOA via the L1 relayer', () => {
					before('relay a tx to nominateNewOwner() from L1', async () => {
						const calldata = SystemSettingsL2.interface.encodeFunctionData('nominateNewOwner', [
							ownerL2.address,
						]);

						const calldataBatch = [calldata, calldata, calldata];
						const tx = await OwnerRelayOnEthereum.connect(ownerL1).initiateRelayBatch(
							contractsToBeOwnedAdresses,
							calldataBatch,
							0
						);
						relayReceipt = await tx.wait();
					});

					before('wait for the relay to finalize on L2', async () => {
						await finalizationOnL2({ ctx, transactionHash: relayReceipt.transactionHash });
					});

					before('call acceptOwnership() directly on L2 with the EOA', async () => {
						for (const contract of contractsToBeOwned) {
							const tx = await contract.connect(ownerL2).acceptOwnership();
							await tx.wait();
						}
					});

					it('shows that the current owner of SystemSettings is the EOA', async () => {
						for (const contract of contractsToBeOwned) {
							assert.equal(await contract.owner(), ownerL2.address);
						}
					});
				});
			});
		});
	});
});
