const hre = require('hardhat');
const chalk = require('chalk');
const { assert } = require('./common');
const { smockit } = require('@eth-optimism/smock');
const { ensureOnlyExpectedMutativeFunctions } = require('./helpers');

const MessengerArtifacts = artifacts.require('iAbs_BaseCrossDomainMessenger');
const OwnerRelayOnOptimismArtifacts = artifacts.require('OwnerRelayOnOptimism');
const AddressResolverArtifacts = artifacts.require('AddressResolver');
const OwnedArtifacts = artifacts.require('Owned');

contract('OwnerRelayOnOptimism', () => {
	// Signers
	let owner, user;

	// Real contracts
	let OwnerRelayOnOptimism;

	// Mocked contracts
	let MockedMessenger, MockedAddressResolver, MockedContractOnL2;

	// Other mocked stuff
	const mockedOwnerRelayOnEthereumAddress = '0x0000000000000000000000000000000000000042';

	let activeCrossDomainMessageSender;
	let acceptOwnershipCalldata;

	let sendMessageData;
	let sendMessageError;

	const sampleRelayData = '0xdeadbeef';

	before('initialize signers', async () => {
		([owner] = await hre.ethers.getSigners());
	});

	before('mock other contracts needed by the contract', async () => {
		// OptimismMesseneger
		MockedMessenger = await smockit(MessengerArtifacts.abi, hre.ethers.provider);
		const MockedMessengerSigner = MockedMessenger.wallet;
		MockedMessenger.smocked.xDomainMessageSender.will.return.with(() => {
			return activeCrossDomainMessageSender;
		});
		MockedMessenger.smocked.sendMessage.will.return.with(async () => {
			OwnerRelayOnOptimism = OwnerRelayOnOptimism.connect(MockedMessengerSigner);

			const relayData = MockedContractOnL2.interface.encodeFunctionData('nominateNewOwner', [OwnerRelayOnOptimism.address]);

			sendMessageError = undefined;
			try {
				const tx = await OwnerRelayOnOptimism.relay(MockedContractOnL2.address, relayData, {
					gasPrice: 0,
				});

				await tx.wait();
			} catch (err) {
				sendMessageError = err;
			}
		});
		activeCrossDomainMessageSender = mockedOwnerRelayOnEthereumAddress;

		// AddressResolver
		MockedAddressResolver = await smockit(AddressResolverArtifacts.abi, hre.ethers.provider);
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
		MockedContractOnL2 = await smockit(OwnedArtifacts.abi, hre.ethers.provider);
		MockedContractOnL2.smocked.nominateNewOwner.will.return.with(newOwner => {
			sendMessageData = newOwner;
		});
	});

	before('instantiate the contract', async () => {
		const OwnerRelayOnOptimismFactory = await hre.ethers.getContractFactory('OwnerRelayOnOptimism', owner);
		OwnerRelayOnOptimism = await OwnerRelayOnOptimismFactory.deploy(MockedAddressResolver.address);

		const tx = await OwnerRelayOnOptimism.rebuildCache();
		await tx.wait();
	});

	describe('when checking which functions are mutative', () => {
		it('shows that only the expected ones are mutative', async () => {
			ensureOnlyExpectedMutativeFunctions({
				abi: OwnerRelayOnOptimismArtifacts.abi,
				ignoreParents: ['Owned', 'MixinResolver'],
				expected: ['relay'],
			});
		});
	});

	describe('when calling relay() directly with an EOA on L2', () => {
		it('reverts', async () => {
			OwnerRelayOnOptimism = OwnerRelayOnOptimism.connect(owner);

			await assert.revert(
				OwnerRelayOnOptimism.relay(
					MockedContractOnL2.address,
					sampleRelayData,
				),
				'Sender is not the messenger'
			);
		});
	});

	describe('when relay() is called by the optimism messenger', () => {
		describe('when the L1 transaction was initiated by a random address', () => {
			before('cause the cross domain message sender to be some random address', async () => {
				activeCrossDomainMessageSender = '0x0000000000000000000000000000000000000044';
			});

			it('reverts', async () => {
				MockedMessenger = MockedMessenger.connect(owner);

				// This is causes the MockedMessenger to make a call to OwnerRelayOnOptimism.relay(...),
				// which reverts and populates "sendMessageError".
				const tx = await MockedMessenger.sendMessage(OwnerRelayOnOptimism.address, sampleRelayData, 42);
				await tx.wait();

				assert.ok(sendMessageError.toString().includes('revert L1 sender is not the owner relay'))
			});
		});

		describe('when the L1 transaction was initiated by the OwnerRelayOnOptimism', () => {
			before('cause the cross domain message sender to be OwnerRelayOnEthereum', async () => {
				activeCrossDomainMessageSender = mockedOwnerRelayOnEthereumAddress;
			});

			it('can relay a message to a contract on L2, e.g. contract.nominateNewOwner()', async () => {
				MockedMessenger = MockedMessenger.connect(owner);

				// This is causes the MockedMessenger to make a call to OwnerRelayOnOptimism.relay(...)
				const tx = await MockedMessenger.sendMessage(OwnerRelayOnOptimism.address, sampleRelayData, 42);
				await tx.wait();

				// Error should be undefined, i.e. no error
				assert.notOk(sendMessageError);

				// Should have received the relayed data
				assert.equal(sendMessageData, OwnerRelayOnOptimism.address);
			});
		});
	});
});
