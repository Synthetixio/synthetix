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
	const sampleRelayData = '0xdeadbeef';
	const mockedOwnerRelayOnEthereumAddress = '0x0000000000000000000000000000000000000042';
	// Allows us to control what Messenger.xDomainMessageSender() returns
	let xDomainMesssageSenderReturnedByMessenger;
	// Allows us to catch Messenger.sendMessage(...) errors
	let sendMessageError;
	// This will be populated by OwnerRelayOnOptimism's target calldata
	// on a successful relay.
	let relayedMessageData;

	before('initialize signers', async () => {
		([owner] = await hre.ethers.getSigners());
	});

	before('mock other contracts needed by the contract', async () => {
		// Messeneger (Optimism)
		MockedMessenger = await smockit(artifacts.require('iAbs_BaseCrossDomainMessenger').abi, hre.ethers.provider);
		// This will allow us to initiate txs from js code,
		// with msg.sender = MockedMessenger.address.
		const MockedMessengerSigner = MockedMessenger.wallet;
		// Messenger.sendMessage(...)
		MockedMessenger.smocked.sendMessage.will.return.with(async () => {
			const nominateNewOwnerCalldata = MockedContractOnL2.interface.encodeFunctionData('nominateNewOwner', [OwnerRelayOnOptimism.address]);

			sendMessageError = undefined;
			try {
				OwnerRelayOnOptimism = OwnerRelayOnOptimism.connect(MockedMessengerSigner);
				const tx = await OwnerRelayOnOptimism.finalizeRelay(MockedContractOnL2.address, nominateNewOwnerCalldata, {
					gasPrice: 0,
				});

				await tx.wait();
			} catch (err) {
				sendMessageError = err;
			}
		});
		// Messenger.xDomainMessageSender()
		MockedMessenger.smocked.xDomainMessageSender.will.return.with(() => {
			return xDomainMesssageSenderReturnedByMessenger;
		});
		xDomainMesssageSenderReturnedByMessenger = mockedOwnerRelayOnEthereumAddress;

		// AddressResolver
		MockedAddressResolver = await smockit(artifacts.require('AddressResolver').abi, hre.ethers.provider);
		// AddressResolver.requireAndGetAddress(...)
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

		// Some contract on L2
		MockedContractOnL2 = await smockit(artifacts.require('Owned').abi, hre.ethers.provider);
		// Owned.nominateNewOwner(...)
		MockedContractOnL2.smocked.nominateNewOwner.will.return.with(newOwner => {
			relayedMessageData = newOwner;
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

	describe('when attempting to relay a tx from an account that is not the Optimism Messenger', () => {
		it('reverts with the expected error', async () => {
			OwnerRelayOnOptimism = OwnerRelayOnOptimism.connect(owner);

			await assert.revert(
				OwnerRelayOnOptimism.finalizeRelay(
					MockedContractOnL2.address,
					sampleRelayData,
				),
				'Sender is not the messenger'
			);
		});
	});

	describe('when a tx is relayed from the Optimism Messenger', () => {
		describe('when the initiator on L1 is NOT the OwnerRelayOnEthereum', () => {
			before('cause the cross domain message sender to be some random address', async () => {
				xDomainMesssageSenderReturnedByMessenger = '0x0000000000000000000000000000000000000044';
			});

			it('reverts with the expected error', async () => {
				MockedMessenger = MockedMessenger.connect(owner);

				// This is causes the MockedMessenger to make a call to OwnerRelayOnOptimism.finalizeRelay(...),
				// which reverts and populates "sendMessageError".
				const tx = await MockedMessenger.sendMessage(OwnerRelayOnOptimism.address, sampleRelayData, 42);
				await tx.wait();

				assert.ok(sendMessageError.toString().includes('revert L1 sender is not the owner relay'))
			});
		});

		describe('when the initiator on L1 is the OwnerRelayOnOptimism', () => {
			before('cause the cross domain message sender to be OwnerRelayOnEthereum', async () => {
				xDomainMesssageSenderReturnedByMessenger = mockedOwnerRelayOnEthereumAddress;
			});

			it('can relay a message to a contract on L2, e.g. contract.nominateNewOwner(...)', async () => {
				MockedMessenger = MockedMessenger.connect(owner);

				// This causes the MockedMessenger to make a call to OwnerRelayOnOptimism.finalizeRelay(...),
				// which should now succeed and ultimately populate relayedMessageData.
				const tx = await MockedMessenger.sendMessage(OwnerRelayOnOptimism.address, sampleRelayData, 42);
				await tx.wait();

				// Error should be undefined, i.e. no error
				assert.notOk(sendMessageError);

				// Should have received the relayed data
				assert.equal(relayedMessageData, OwnerRelayOnOptimism.address);
			});
		});
	});
});
