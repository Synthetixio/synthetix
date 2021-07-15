const hre = require('hardhat');
const chalk = require('chalk');
const { assert } = require('./common');
const { smockit } = require('@eth-optimism/smock');
const { ensureOnlyExpectedMutativeFunctions } = require('./helpers');

contract('OwnerRelayOnOptimism', () => {
	// Signers
	let owner, user;

	// Real contracts
	let OwnerRelayOnOptimism;

	// Mocked contracts
	let MockedMessenger, MockedAddressResolver, MockedContractOnL2;

	// Other mocked stuff
	const mockedOwnerRelayOnEthereumAddress = '0x0000000000000000000000000000000000000042';

	before('initialize signers', async () => {
		([owner] = await hre.ethers.getSigners());
	});

	before('mock other contracts used by OwnerRelayOnOptimism', async () => {
		MockedMessenger = await smockit(artifacts.require('iAbs_BaseCrossDomainMessenger').abi, hre.ethers.provider);

		MockedAddressResolver = await smockit(artifacts.require('AddressResolver').abi, hre.ethers.provider);
		MockedAddressResolver.smocked.requireAndGetAddress.will.return.with(nameBytes => {
			const name = hre.ethers.utils.toUtf8String(nameBytes);

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
		const OwnerRelayOnOptimismFactory = await hre.ethers.getContractFactory('OwnerRelayOnOptimism', owner);
		OwnerRelayOnOptimism = await OwnerRelayOnOptimismFactory.deploy(MockedAddressResolver.address);

		const tx = await OwnerRelayOnOptimism.rebuildCache();
		await tx.wait();
	});

	it('requires the expected contracts', async () => {
		const requiredAddresses = await OwnerRelayOnOptimism.resolverAddressesRequired();

		assert.equal(requiredAddresses.length, 2);
		assert.ok(requiredAddresses.includes(hre.ethers.utils.formatBytes32String('ext:Messenger')));
		assert.ok(requiredAddresses.includes(hre.ethers.utils.formatBytes32String('base:OwnerRelayOnEthereum')));
	});

	it('shows that only the expected functions are mutative', async () => {
		ensureOnlyExpectedMutativeFunctions({
			abi: artifacts.require('OwnerRelayOnOptimism').abi,
			ignoreParents: ['Owned', 'MixinResolver'],
			expected: ['finalizeRelay'],
		});
	});

	describe('when attempting to finalize a relay from an account that is not the Optimism Messenger', () => {
		it('reverts with the expected error', async () => {
			OwnerRelayOnOptimism = OwnerRelayOnOptimism.connect(owner);

			await assert.revert(
				OwnerRelayOnOptimism.finalizeRelay(
					'0x0000000000000000000000000000000000000045', // Any address
					'0xdeadbeef', // Any data
				),
				'Sender is not the messenger'
			);
		});
	});

	describe('when finalizing a relay from the Optimism Messenger', () => {
		let sendMessageError;
		let relayedMessageData;

		async function triggerSendMessage() {
			// Calls Messenger.sendMessage(...) with dummy data,
			// which doesn't matter since we mock the function below.
			const tx = await MockedMessenger.connect(owner).sendMessage(
				'0x0000000000000000000000000000000000000046',
				'0xdeadbeef',
				42
			);

			await tx.wait();
		}

		before('mock a target contract on L2', async () => {
			MockedContractOnL2 = await smockit(artifacts.require('Owned').abi, hre.ethers.provider);
			MockedContractOnL2.smocked.nominateNewOwner.will.return.with(newOwner => {
				relayedMessageData = newOwner;
			});
		});

		before('mock Messenger.sendMessage(...) to call OwnerRelayOnOptimism.finalizeRelay(...)', async () => {
			const MockedMessengerSigner = MockedMessenger.wallet;
			MockedMessenger.smocked.sendMessage.will.return.with(async () => {
				const nominateNewOwnerCalldata = MockedContractOnL2.interface.encodeFunctionData('nominateNewOwner', [OwnerRelayOnOptimism.address]);

				try {
					const tx = await OwnerRelayOnOptimism.connect(MockedMessengerSigner).finalizeRelay(MockedContractOnL2.address, nominateNewOwnerCalldata, {
						gasPrice: 0,
					});

					await tx.wait();
				} catch (err) {
					sendMessageError = err;
				}
			});
		});

		describe('when the initiator on L1 is NOT the OwnerRelayOnEthereum', () => {
			before('mock the Messenger to report some random account as the L1 initiator', async () => {
				MockedMessenger.smocked.xDomainMessageSender.will.return.with(() => {
					return '0x0000000000000000000000000000000000000044';
				});
			});

			before('attempt to finalize the relay', async () => {
				await triggerSendMessage();
			});

			it('reverts with the expected error', async () => {
				assert.ok(sendMessageError.toString().includes('revert L1 sender is not the owner relay'))
			});
		});

		describe('when the initiator on L1 is the OwnerRelayOnOptimism', () => {
			let relayReceipt;

			before('mock the Messenger to report OwnerRelayOnEthereum as the L1 initiator', async () => {
				MockedMessenger.smocked.xDomainMessageSender.will.return.with(() => {
					return mockedOwnerRelayOnEthereumAddress;
				});
			});

			before('finalize the relay', async () => {
				await triggerSendMessage();
			});

			it('should ultimately relayed contract.nominateNewOwner(...) with the correct data', async () => {
				assert.equal(relayedMessageData, OwnerRelayOnOptimism.address);
			});
		});
	});
});
