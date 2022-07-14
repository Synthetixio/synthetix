const { ethers, contract, artifacts, web3 } = require('hardhat');
const chalk = require('chalk');
const { assert } = require('./common');
const { smockit } = require('@eth-optimism/smock');
const { ensureOnlyExpectedMutativeFunctions } = require('./helpers');
const { currentTime, fastForward, toUnit } = require('../utils')();

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
	let MockedMessengerSigner;
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
		MockedMessengerSigner = MockedMessenger.wallet;

		// Send some ETH to the MockedMessenger so it can perform the relay function.
		await web3.eth.sendTransaction({
			value: toUnit('1'),
			from: owner.address,
			to: MockedMessengerSigner.address,
		});

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
			expected: ['directRelay', 'finalizeRelay', 'finalizeRelayBatch', 'setNewExpiryTime'],
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
		let relayedMessageData;
		let nominateNewOwnerCalldata;

		async function triggerFinalizeRelay(isBatch, targets, calldata) {
			let relayReceipt, sendMessageError;
			const relayFnc = isBatch ? 'finalizeRelayBatch' : 'finalizeRelay';

			OwnerRelayOnOptimism = OwnerRelayOnOptimism.connect(MockedMessengerSigner);

			try {
				const tx = await OwnerRelayOnOptimism[relayFnc](targets, calldata);

				relayReceipt = await tx.wait();
			} catch (err) {
				sendMessageError = err;
			}

			return { relayReceipt, sendMessageError };
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
			describe('when the initiator on L1 is NOT the OwnerRelayOnEthereum', () => {
				let sendMessageError;

				before('mock the Messenger to report some random account as the L1 initiator', async () => {
					MockedMessenger.smocked.xDomainMessageSender.will.return.with(
						ethers.Wallet.createRandom().address
					);
				});

				before('attempt to finalize the relay', async () => {
					({ sendMessageError } = await triggerFinalizeRelay(
						false, // 1st param: isBatch == false then call finalizeRelay()
						mockedContractAddressOnL2,
						mockedRelayData
					));
				});

				it('reverts with the expected error', async () => {
					assert.ok(sendMessageError.toString().includes('L1 sender is not the owner relay'));
				});
			});

			describe('when the initiator on L1 is the OwnerRelayOnEthereum', () => {
				let relayReceipt;

				before(
					'mock the Messenger to report OwnerRelayOnEthereum as the L1 initiator',
					async () => {
						MockedMessenger.smocked.xDomainMessageSender.will.return.with(
							mockedOwnerRelayOnEthereumAddress
						);
					}
				);

				before('finalize the relay', async () => {
					({ relayReceipt } = await triggerFinalizeRelay(
						false, // 1st param: isBatch == false then call finalizeRelay()
						MockedOwned1OnL2.address,
						nominateNewOwnerCalldata
					));
				});

				it('should ultimately relayed contract.nominateNewOwner(...) with the correct data', async () => {
					assert.equal(relayedMessageData, OwnerRelayOnOptimism.address);
				});

				it('emitted a RelayFinalized event', async () => {
					const event = relayReceipt.events.find(e => e.event === 'RelayFinalized');

					assert.equal(event.args.target, MockedOwned1OnL2.address);
					assert.equal(event.args.payload, nominateNewOwnerCalldata);
				});
			});
		});

		describe('when finalizing a relay batch from the Optimism Messenger', () => {
			let mockedTargets, nominateNewOwnerCalldataBatch;
			let sendMessageError;

			before('initialize the batch parameters', async () => {
				mockedTargets = [MockedOwned2OnL2.address, MockedOwned2OnL2.address];
				nominateNewOwnerCalldataBatch = [nominateNewOwnerCalldata, nominateNewOwnerCalldata];
			});

			describe('when the initiator on L1 is NOT the OwnerRelayOnEthereum', () => {
				before('mock the Messenger to report some random account as the L1 initiator', async () => {
					MockedMessenger.smocked.xDomainMessageSender.will.return.with(
						ethers.Wallet.createRandom().address
					);
				});

				before('attempt to finalize the relay batch', async () => {
					mockedTargets = [MockedOwned2OnL2.address, MockedOwned2OnL2.address];
					nominateNewOwnerCalldataBatch = [nominateNewOwnerCalldata, nominateNewOwnerCalldata];
					({ sendMessageError } = await triggerFinalizeRelay(
						true, // 1st param: isBatch == true then call finalizeRelayBatch()
						mockedTargets,
						nominateNewOwnerCalldataBatch
					));
				});

				it('reverts with the expected error', async () => {
					assert.ok(sendMessageError.toString().includes('L1 sender is not the owner relay'));
				});
			});

			describe('when the initiator on L1 is the OwnerRelayOnEthereum', () => {
				let relayReceipt;

				before(
					'mock the Messenger to report OwnerRelayOnEthereum as the L1 initiator',
					async () => {
						MockedMessenger.smocked.xDomainMessageSender.will.return.with(
							mockedOwnerRelayOnEthereumAddress
						);
					}
				);

				before('finalize the relay', async () => {
					({ relayReceipt } = await triggerFinalizeRelay(
						true, // 1st param: isBatch == true then call finalizeRelayBatch()
						mockedTargets,
						nominateNewOwnerCalldataBatch
					));
				});

				it('should ultimately relay contract.nominateNewOwner(...) with the correct data', async () => {
					assert.equal(relayedMessageData, OwnerRelayOnOptimism.address);
				});

				it('emitted a RelayBatchFinalized event', async () => {
					const event = relayReceipt.events.find(e => e.event === 'RelayBatchFinalized');
					assert.deepEqual(event.args.targets, mockedTargets);
					assert.deepEqual(event.args.payloads, nominateNewOwnerCalldataBatch);
				});
			});
		});
	});

	describe('when calling directRelay to bypass the L1 to L2 relay', () => {
		it('should not allow any address to call direct relay', async () => {
			await assert.revert(
				OwnerRelayOnOptimism.connect(someone).directRelay(
					mockedContractAddressOnL2,
					mockedRelayData
				),
				'Only executable by temp owner'
			);
		});

		describe('before ownershipDuration expires', () => {
			let relayReceipt;

			it('should allow the temp owner to call direct relay', async () => {
				const tx = await OwnerRelayOnOptimism.connect(temporaryOwner).directRelay(
					mockedContractAddressOnL2,
					mockedRelayData
				);

				relayReceipt = await tx.wait();
			});

			it('emitted a DirectRelay event', async () => {
				const event = relayReceipt.events.find(e => e.event === 'DirectRelay');

				assert.equal(event.args.target, mockedContractAddressOnL2);
				assert.equal(event.args.payload, mockedRelayData);
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
						mockedRelayData
					),
					'Ownership expired'
				);
			});
		});
	});
});
