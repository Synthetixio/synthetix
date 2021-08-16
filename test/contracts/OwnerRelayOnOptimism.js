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
	let tempOwner;
	let someone;

	// Real contracts
	let OwnerRelayOnOptimism;

	// Mocked contracts
	let MockedMessenger, MockedAddressResolver, MockedOwnedL2;

	// Other mocked stuff
	const mockedOwnerRelayOnEthereumAddress = ethers.Wallet.createRandom().address;
	const mockedContractAddressOnL2 = ethers.Wallet.createRandom().address;
	const mockedRelayData = '0xdeadbeef';

	let tempOwnerEOL;

	before('initialize signers', async () => {
		[owner, tempOwner, someone] = await ethers.getSigners();
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
		tempOwnerEOL = (await currentTime()) + DAY;

		const OwnerRelayOnOptimismFactory = await ethers.getContractFactory(
			'OwnerRelayOnOptimism',
			owner
		);
		OwnerRelayOnOptimism = await OwnerRelayOnOptimismFactory.deploy(
			MockedAddressResolver.address,
			tempOwner.address,
			tempOwnerEOL
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
		assert.equal(tempOwner.address, await OwnerRelayOnOptimism.tempOwner());
	});

	it('shows that the temp owner EOL date is set correctly', async () => {
		assert.equal(tempOwnerEOL, await OwnerRelayOnOptimism.tempOwnerEOL());
	});

	it('shows that only the expected functions are mutative', async () => {
		ensureOnlyExpectedMutativeFunctions({
			abi: artifacts.require('OwnerRelayOnOptimism').abi,
			ignoreParents: ['Owned', 'MixinResolver'],
			expected: ['finalizeRelay', 'directRelay', 'acceptOwnershipOn'],
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
				mockedContractAddressOnL2,
				mockedRelayData,
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

			it('emited a CallRelayed event', async () => {
				const event = relayReceipt.events.find(e => e.event === 'CallRelayed');

				assert.equal(event.args.target, MockedOwnedL2.address);
				assert.equal(event.args.data, nominateNewOwnerCalldata);
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

		describe('before the EOL date is reached', () => {
			let relayReceipt;

			it('should allow the temp owner to call direct relay', async () => {
				const tx = await OwnerRelayOnOptimism.connect(
					tempOwner
				).directRelay(mockedContractAddressOnL2, mockedRelayData, { gasPrice: 0 });

				relayReceipt = await tx.wait();
			});

			it('emited a CallRelayed event', async () => {
				const event = relayReceipt.events.find(e => e.event === 'CallRelayed');

				assert.equal(event.args.target, mockedContractAddressOnL2);
				assert.equal(event.args.data, mockedRelayData);
			});
		});

		describe('after the EOL date is reached', () => {
			before('fast forward', async () => {
				await fastForward(DAY + 1);
			});

			it('should not allow the temp ownet to call direct relay', async () => {
				await assert.revert(
					OwnerRelayOnOptimism.connect(tempOwner).directRelay(
						mockedContractAddressOnL2,
						mockedRelayData,
						{ gasPrice: 0 }
					),
					'Owner EOL date already reached'
				);
			});
		});
	});
});
