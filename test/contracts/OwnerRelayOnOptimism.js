const { ethers, contract, artifacts } = require('hardhat');
const chalk = require('chalk');
const { assert } = require('./common');
const { smockit } = require('@eth-optimism/smock');
const { ensureOnlyExpectedMutativeFunctions } = require('./helpers');

contract('OwnerRelayOnOptimism', () => {
	// Signers
	let owner;

	// Real contracts
	let OwnerRelayOnOptimism;

	// Mocked contracts
	let MockedMessenger, MockedAddressResolver, MockedOwnedL2;

	// Other mocked stuff
	const mockedOwnerRelayOnEthereumAddress = ethers.Wallet.createRandom().address;

	before('initialize signers', async () => {
		[owner] = await ethers.getSigners();
	});

	before('mock other contracts used by OwnerRelayOnOptimism', async () => {
		MockedMessenger = await smockit(
			artifacts.require('iAbs_BaseCrossDomainMessenger').abi,
			ethers.provider
		);
		MockedOwnedL2 = await smockit(artifacts.require('Owned').abi, ethers.provider);

		MockedAddressResolver = await smockit(
			artifacts.require('AddressResolver').abi,
			ethers.provider
		);
		MockedAddressResolver.smocked.requireAndGetAddress.will.return.with(nameBytes => {
			const name = ethers.utils.toUtf8String(nameBytes);

			if (name.includes('ext:Messenger')) {
				return MockedMessenger.address;
			} else if (name.includes('base:OwnerRelayOnEthereum')) {
				return mockedOwnerRelayOnEthereumAddress;
			} else {
				console.log(chalk.red(`Mocked AddressResolver will not be able to resolve ${name}`));
			}
		});
	});

	before('instantiate the contract', async () => {
		const OwnerRelayOnOptimismFactory = await ethers.getContractFactory(
			'OwnerRelayOnOptimism',
			owner
		);
		OwnerRelayOnOptimism = await OwnerRelayOnOptimismFactory.deploy(MockedAddressResolver.address);

		const tx = await OwnerRelayOnOptimism.rebuildCache();
		await tx.wait();
	});

	it('requires the expected contracts', async () => {
		const requiredAddresses = await OwnerRelayOnOptimism.resolverAddressesRequired();

		assert.equal(requiredAddresses.length, 2);
		assert.ok(requiredAddresses.includes(ethers.utils.formatBytes32String('ext:Messenger')));
		assert.ok(
			requiredAddresses.includes(ethers.utils.formatBytes32String('base:OwnerRelayOnEthereum'))
		);
	});

	it('shows that only the expected functions are mutative', async () => {
		ensureOnlyExpectedMutativeFunctions({
			abi: artifacts.require('OwnerRelayOnOptimism').abi,
			ignoreParents: ['Owned', 'MixinResolver'],
			expected: ['finalizeRelay', 'acceptOwnershipOn'],
		});
	});

	describe('when attempting to finalize a relay from an account that is not the Optimism Messenger', () => {
		it('reverts with the expected error', async () => {
			await assert.revert(
				OwnerRelayOnOptimism.connect(owner).finalizeRelay(
					'0x0000000000000000000000000000000000000001', // Any address
					'0xdeadbeef' // Any data
				),
				'Sender is not the messenger'
			);
		});
	});

	describe('when accepting ownership by calling OwnerRelayOnOptimism directly', () => {
		before('mock the target contract acceptOwnership() function', async () => {
			MockedOwnedL2.smocked.acceptOwnership.will.return();
		});

		before('call the target acceptOwnership() function via OwnerRelayOnOptimism', async () => {
			const tx = await OwnerRelayOnOptimism.connect(owner).acceptOwnershipOn(MockedOwnedL2.address);
			await tx.wait();
		});

		it('called the function on the target contract', async () => {
			assert.equal(MockedOwnedL2.smocked.acceptOwnership.calls.length, 1);
		});
	});

	describe('when finalizing a relay from the Optimism Messenger', () => {
		let sendMessageError;
		let relayedMessageData;
		let nominateNewOwnerCalldata;
		let relayReceipt;

		async function triggerSendMessage() {
			// Calls Messenger.sendMessage(...) with dummy data,
			// because the ABI requires it.
			// The data doesn't matter since we mock the function below,
			// and this data will be ignored.
			const tx = await MockedMessenger.connect(owner).sendMessage(
				'0x0000000000000000000000000000000000000001',
				'0xdeadbeef',
				42
			);
			await tx.wait();
		}

		before('mock the target contract nominateNewOwner(...) function', async () => {
			// Allows us to record the data it receives
			MockedOwnedL2.smocked.nominateNewOwner.will.return.with(newOwner => {
				relayedMessageData = newOwner;
			});
		});

		before(
			'mock Messenger.sendMessage(...) to call OwnerRelayOnOptimism.finalizeRelay(...)',
			async () => {
				const MockedMessengerSigner = MockedMessenger.wallet;
				MockedMessenger.smocked.sendMessage.will.return.with(async () => {
					nominateNewOwnerCalldata = MockedOwnedL2.interface.encodeFunctionData(
						'nominateNewOwner',
						[OwnerRelayOnOptimism.address]
					);

					try {
						const tx = await OwnerRelayOnOptimism.connect(MockedMessengerSigner).finalizeRelay(
							MockedOwnedL2.address,
							nominateNewOwnerCalldata,
							{
								gasPrice: 0,
							}
						);

						relayReceipt = await tx.wait();
					} catch (err) {
						sendMessageError = err;
					}
				});
			}
		);

		describe('when the initiator on L1 is NOT the OwnerRelayOnEthereum', () => {
			before('mock the Messenger to report some random account as the L1 initiator', async () => {
				MockedMessenger.smocked.xDomainMessageSender.will.return.with(
					ethers.Wallet.createRandom().address
				);
			});

			before('attempt to finalize the relay', async () => {
				await triggerSendMessage();
			});

			it('reverts with the expected error', async () => {
				assert.ok(sendMessageError.toString().includes('L1 sender is not the owner relay'));
			});
		});

		describe('when the initiator on L1 is the OwnerRelayOnOptimism', () => {
			before('mock the Messenger to report OwnerRelayOnEthereum as the L1 initiator', async () => {
				MockedMessenger.smocked.xDomainMessageSender.will.return.with(
					mockedOwnerRelayOnEthereumAddress
				);
			});

			before('finalize the relay', async () => {
				await triggerSendMessage();
			});

			it('should ultimately relayed contract.nominateNewOwner(...) with the correct data', async () => {
				assert.equal(relayedMessageData, OwnerRelayOnOptimism.address);
			});

			it('emited a RelayFinalized event', async () => {
				const event = relayReceipt.events.find(e => e.event === 'RelayFinalized');

				assert.equal(event.args.target, MockedOwnedL2.address);
				assert.equal(event.args.data, nominateNewOwnerCalldata);
			});
		});
	});
});
