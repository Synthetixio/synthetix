const { ethers, contract, artifacts } = require('hardhat');
const chalk = require('chalk');
const { assert } = require('./common');
const { smockit } = require('@eth-optimism/smock');
const { ensureOnlyExpectedMutativeFunctions } = require('./helpers');
const { currentTime, fastForward } = require('../utils')();

contract('OwnerRelayOnOptimism', () => {
	const DAY = 60 * 60 * 24;

	// Signers
	let owner;
	let temporaryOwner;
	let someone;

	// Real contracts
	let OwnerRelayOnOptimism;

	// Mocked contracts
	let MockedMessenger, MockedAddressResolver, MockedOwned1OnL2, MockedOwned2OnL2;

	// Other mocked stuff
	const mockedOwnerRelayOnEthereumAddress = ethers.Wallet.createRandom().address;
	const mockedContractAddressOnL2 = ethers.Wallet.createRandom().address;
	const mockedRelayData = '0xdeadbeef';

	let ownershipDuration;
	let expectedExpiry;

	before('initialize signers', async () => {
		[owner, temporaryOwner, someone] = await ethers.getSigners();
	});

	before('mock other contracts used by OwnerRelayOnOptimism', async () => {
		MockedMessenger = await smockit(
			artifacts.require('iAbs_BaseCrossDomainMessenger').abi,
			ethers.provider
		);
		MockedOwned1OnL2 = await smockit(artifacts.require('Owned').abi, ethers.provider);
		MockedOwned2OnL2 = await smockit(artifacts.require('Owned').abi, ethers.provider);

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
		ownershipDuration = DAY;

		expectedExpiry = (await currentTime()) + ownershipDuration;

		const OwnerRelayOnOptimismFactory = await ethers.getContractFactory(
			'OwnerRelayOnOptimism',
			owner
		);
		OwnerRelayOnOptimism = await OwnerRelayOnOptimismFactory.deploy(
			MockedAddressResolver.address,
			temporaryOwner.address,
			ownershipDuration
		);

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

	it('shows that temp owner is set correctly', async () => {
		assert.equal(temporaryOwner.address, await OwnerRelayOnOptimism.temporaryOwner());
	});

	it('shows that the temp owner duration is set correctly', async () => {
		assert.bnClose(
			expectedExpiry.toString(),
			(await OwnerRelayOnOptimism.expiryTime()).toString(),
			'10'
		);
	});

	it('shows that only the expected functions are mutative', async () => {
		ensureOnlyExpectedMutativeFunctions({
			abi: artifacts.require('OwnerRelayOnOptimism').abi,
			ignoreParents: ['Owned', 'MixinResolver'],
			expected: ['directRelay', 'finalizeRelay', 'finalizeRelayBatch'],
		});
	});

	describe('when attempting to finalize a relay from an account that is not the Optimism Messenger', () => {
		it('reverts with the expected error', async () => {
			await assert.revert(
				OwnerRelayOnOptimism.connect(owner).finalizeRelay(
					mockedContractAddressOnL2, // Any address
					mockedRelayData // Any data
				),
				'Sender is not the messenger'
			);
		});
	});

	describe('when attempting to finalize a relay batch from an account that is not the Optimism Messenger', () => {
		it('reverts with the expected error', async () => {
			await assert.revert(
				OwnerRelayOnOptimism.connect(owner).finalizeRelayBatch(
					[mockedContractAddressOnL2, mockedContractAddressOnL2], // Any addresses
					[(mockedRelayData, mockedRelayData)] // Any data
				),
				'Sender is not the messenger'
			);
		});
	});

	describe('when finalizing relaying from the Optimism Messenger', () => {
		let sendMessageError;
		let relayedMessageData;
		let nominateNewOwnerCalldata;
		let relayReceipt, relayBatchReceipt;

		async function triggerSendMessage() {
			// Calls Messenger.sendMessage(...) with dummy data,
			// because the ABI requires it.
			// The data doesn't matter since we mock the function below,
			// and this data will be ignored.
			const tx = await MockedMessenger.connect(owner).sendMessage(
				mockedContractAddressOnL2,
				mockedRelayData,
				42
			);
			await tx.wait();
		}

		before('mock the target contracts nominateNewOwner(...) function', async () => {
			// Allows us to record the data it receives
			MockedOwned1OnL2.smocked.nominateNewOwner.will.return.with(newOwner => {
				relayedMessageData = newOwner;
			});
			MockedOwned2OnL2.smocked.nominateNewOwner.will.return.with(newOwner => {
				relayedMessageData = newOwner;
			});
		});

		before('generate nominateNewOwner() calldata', async () => {
			nominateNewOwnerCalldata = MockedOwned1OnL2.interface.encodeFunctionData('nominateNewOwner', [
				OwnerRelayOnOptimism.address,
			]);
		});

		describe('when finalizing a single relay from the Optimism Messenger', () => {
			before(
				'mock Messenger.sendMessage(...) to call OwnerRelayOnOptimism.finalizeRelay(...)',
				async () => {
					const MockedMessengerSigner = MockedMessenger.wallet;
					MockedMessenger.smocked.sendMessage.will.return.with(async () => {
						try {
							const tx = await OwnerRelayOnOptimism.connect(MockedMessengerSigner).finalizeRelay(
								MockedOwned1OnL2.address,
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

			describe('when the initiator on L1 is the OwnerRelayOnEthereum', () => {
				before(
					'mock the Messenger to report OwnerRelayOnEthereum as the L1 initiator',
					async () => {
						MockedMessenger.smocked.xDomainMessageSender.will.return.with(
							mockedOwnerRelayOnEthereumAddress
						);
					}
				);

				before('finalize the relay', async () => {
					await triggerSendMessage();
				});

				it('should ultimately relayed contract.nominateNewOwner(...) with the correct data', async () => {
					assert.equal(relayedMessageData, OwnerRelayOnOptimism.address);
				});

				it('emitted a CallRelayed event', async () => {
					const event = relayReceipt.events.find(e => e.event === 'CallRelayed');

					assert.equal(event.args.target, MockedOwned1OnL2.address);
					assert.equal(event.args.data, nominateNewOwnerCalldata);
				});
			});
		});

		describe('when finalizing a relay batch from the Optimism Messenger', () => {
			let mockedTargets, nominateNewOwnerCalldataBatch;
			before(
				'mock Messenger.sendMessage(...) to call OwnerRelayOnOptimism.finalizeRelayBatch(...)',
				async () => {
					mockedTargets = [MockedOwned2OnL2.address, MockedOwned2OnL2.address];
					nominateNewOwnerCalldataBatch = [nominateNewOwnerCalldata, nominateNewOwnerCalldata];
					const MockedMessengerSigner = MockedMessenger.wallet;
					MockedMessenger.smocked.sendMessage.will.return.with(async () => {
						try {
							const tx = await OwnerRelayOnOptimism.connect(
								MockedMessengerSigner
							).finalizeRelayBatch(mockedTargets, nominateNewOwnerCalldataBatch, {
								gasPrice: 0,
							});

							relayBatchReceipt = await tx.wait();
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

				before('attempt to finalize the relay batch', async () => {
					await triggerSendMessage();
				});

				it('reverts with the expected error', async () => {
					assert.ok(sendMessageError.toString().includes('L1 sender is not the owner relay'));
				});
			});

			describe('when the initiator on L1 is the OwnerRelayOnEthereum', () => {
				before(
					'mock the Messenger to report OwnerRelayOnEthereum as the L1 initiator',
					async () => {
						MockedMessenger.smocked.xDomainMessageSender.will.return.with(
							mockedOwnerRelayOnEthereumAddress
						);
					}
				);

				before('finalize the relay', async () => {
					await triggerSendMessage();
				});

				it('should ultimately relay contract.nominateNewOwner(...) with the correct data', async () => {
					assert.equal(relayedMessageData, OwnerRelayOnOptimism.address);
				});

				it('emitted a CallBatchRelayed event', async () => {
					const event = relayBatchReceipt.events.find(e => e.event === 'CallBatchRelayed');
					assert.deepEqual(event.args.targets, mockedTargets);
					assert.deepEqual(event.args.data, nominateNewOwnerCalldataBatch);
				});
			});
		});
	});

	describe('when calling directRelay to bypass the L1 to L2 relay', () => {
		it('should not allow any address to call direct relay', async () => {
			await assert.revert(
				OwnerRelayOnOptimism.connect(someone).directRelay(
					mockedContractAddressOnL2,
					mockedRelayData,
					{ gasPrice: 0 }
				),
				'Only executable by temp owner'
			);
		});

		describe('before ownershipDuration expires', () => {
			let relayReceipt;

			it('should allow the temp owner to call direct relay', async () => {
				const tx = await OwnerRelayOnOptimism.connect(
					temporaryOwner
				).directRelay(mockedContractAddressOnL2, mockedRelayData, { gasPrice: 0 });

				relayReceipt = await tx.wait();
			});

			it('emitted a CallRelayed event', async () => {
				const event = relayReceipt.events.find(e => e.event === 'CallRelayed');

				assert.equal(event.args.target, mockedContractAddressOnL2);
				assert.equal(event.args.data, mockedRelayData);
			});
		});

		describe('after ownershipDuration expires', () => {
			before('fast forward', async () => {
				await fastForward(DAY);
			});

			it('should not allow the temp owner to call direct relay', async () => {
				await assert.revert(
					OwnerRelayOnOptimism.connect(temporaryOwner).directRelay(
						mockedContractAddressOnL2,
						mockedRelayData,
						{ gasPrice: 0 }
					),
					'Ownership expired'
				);
			});
		});
	});
});
