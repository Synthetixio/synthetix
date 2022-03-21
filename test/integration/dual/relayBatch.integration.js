const { assert } = require('../../contracts/common');
const { bootstrapDual } = require('../utils/bootstrap');
const { finalizationOnL2 } = require('../utils/optimism');

describe('relayBatch integration tests (L1, L2)', () => {
	const ctx = this;
	bootstrapDual({ ctx });

	// Signers
	let ownerL1, ownerL2;

	// Contracts
	let AddressResolverL1, AddressResolverL2, OwnerRelayOnEthereum, OwnerRelayOnOptimism;

	let relayReceipt;

	const contractsToBeOwned = [];
	const contractsToBeOwnedAdresses = [];

	before('target contracts and users', () => {
		({ OwnerRelayOnEthereum, ReadProxyAddressResolver: AddressResolverL1 } = ctx.l1.contracts);
		({ OwnerRelayOnOptimism, ReadProxyAddressResolver: AddressResolverL2 } = ctx.l2.contracts);

		ownerL1 = ctx.l1.users.owner;
		ownerL2 = ctx.l2.users.owner;
	});

	before('retrieve all contracts that are ownable on L2', async () => {
		Object.values(ctx.l2.contracts).map(contract => {
			if (contract.functions.owner) {
				contractsToBeOwned.push(contract);
				contractsToBeOwnedAdresses.push(contract.address);
			}
		});
	});

	it('shows that the L1 relay was deployed with the correct parameters', async () => {
		assert.equal(await OwnerRelayOnEthereum.resolver(), AddressResolverL1.address);
	});

	it('shows that the L2 relay was deployed with the correct parameters', async () => {
		assert.equal(await OwnerRelayOnOptimism.resolver(), AddressResolverL2.address);
		assert.equal(await OwnerRelayOnOptimism.temporaryOwner(), ownerL2.address);
	});

	describe('when L2 contracts are owned by an EOA', () => {
		before('check ownership', async function() {
			if ((await AddressResolverL2.owner()) === OwnerRelayOnOptimism.address) {
				this.skip();
			}
		});

		describe('when nominating the L2 relay as the owner of all L2 contracts', () => {
			before('nominate the relay as the new owner for all L2 contracts', async () => {
				for (const contract of contractsToBeOwned) {
					const nominationFn = 'nominateOwner' in contract ? 'nominateOwner' : 'nominateNewOwner';
					const tx = await contract.connect(ownerL2)[nominationFn](OwnerRelayOnOptimism.address);

					await tx.wait();
				}
			});

			it('shows that the L2 relay is the nominated owner for all L2 contracts', async () => {
				for (const contract of contractsToBeOwned) {
					assert.equal(await contract.nominatedOwner(), OwnerRelayOnOptimism.address);
				}
			});

			describe('when the L2 relay accepts ownership via the L1 relayer for all L2 contracts', () => {
				before('call acceptOwnership() via an L1 relay batch', async () => {
					const calldataBatch = contractsToBeOwned.map(contract => {
						return contract.interface.encodeFunctionData('acceptOwnership');
					});

					const tx = await OwnerRelayOnEthereum.connect(ownerL1).initiateRelayBatch(
						contractsToBeOwnedAdresses,
						calldataBatch,
						10000000
					);

					relayReceipt = await tx.wait();
				});

				before('wait for the relay to finalize on L2', async () => {
					await finalizationOnL2({ ctx, transactionHash: relayReceipt.transactionHash });
				});

				it('shows that the L2 relay now owns all the L2 contracts', async () => {
					for (const contract of contractsToBeOwned) {
						assert.equal(await contract.owner(), OwnerRelayOnOptimism.address);
					}
				});
			});
		});
	});

	describe('when L2 contracts are owned by the relay', () => {
		before('check ownership', async function() {
			if ((await AddressResolverL2.owner()) !== OwnerRelayOnOptimism.address) {
				this.skip();
			}
		});

		describe('when the relay relinquishes ownership back to an EOA via the L1 relayer', () => {
			before('relay a tx to nominateNewOwner() from L1', async () => {
				const calldataBatch = contractsToBeOwned.map(contract => {
					const nominationFn = 'nominateOwner' in contract ? 'nominateOwner' : 'nominateNewOwner';
					return contract.interface.encodeFunctionData(nominationFn, [ownerL2.address]);
				});

				const tx = await OwnerRelayOnEthereum.connect(ownerL1).initiateRelayBatch(
					contractsToBeOwnedAdresses,
					calldataBatch,
					10000000
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

			it('shows that the current owner of all contracts in L2 is the EOA', async () => {
				for (const contract of contractsToBeOwned) {
					assert.equal(await contract.owner(), ownerL2.address);
				}
			});
		});
	});
});
