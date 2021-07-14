const hre = require('hardhat');
const chalk = require('chalk');
const { assert } = require('./common');
const { smockit } = require('@eth-optimism/smock');
const { ensureOnlyExpectedMutativeFunctions } = require('./helpers');

const MessengerArtifacts = artifacts.require('iAbs_BaseCrossDomainMessenger');
const OwnerRelayOnEthereumArtifacts = artifacts.require('OwnerRelayOnEthereum');
const AddressResolverArtifacts = artifacts.require('AddressResolver');
const FlexibleStorageArtifacts = artifacts.require('FlexibleStorage');

contract('OwnerRelayOnEthereum', () => {
	// Signers
	let owner, user;

	// Real contracts
	let OwnerRelayOnEthereum;

	// Mocked contracts
	let MockedMessenger, MockedAddressResolver, MockedFlexibleStorage;

	// Other mocked stuff
	const mockedOwnerRelayOnOptimismAddress = '0x0000000000000000000000000000000000000042';
	const mockedContractAddressOnL2 = '0x0000000000000000000000000000000000000043';
	const mockedCrossDomainRelayGasLimit = 42;

	// Used to capture call parameters to mocked Messenger.sendMessage(...)
	let relayedMessage = {
		targetAddress: undefined,
		messageData: undefined,
		crossDomainGasLimit: undefined,
	};

	const sampleRelayData = '0xdeadbeef';

	before('initialize signers', async () => {
		([owner, user] = await hre.ethers.getSigners());
	});

	before('mock other contracts needed by the contract', async () => {
		// OptimismMesseneger
		MockedMessenger = await smockit(MessengerArtifacts.abi, hre.ethers.provider);
		MockedMessenger.smocked.sendMessage.will.return.with((targetAddress, messageData, crossDomainGasLimit) => {
			relayedMessage = { targetAddress, messageData, crossDomainGasLimit };
		});

		// FlexibleStorage
		MockedFlexibleStorage = await smockit(FlexibleStorageArtifacts.abi, hre.ethers.provider);
		MockedFlexibleStorage.smocked.getUIntValue.will.return.with((contractNameBytes, valueNameBytes) => {
			const contractName = hre.ethers.utils.toUtf8String(contractNameBytes);
			const valueName = hre.ethers.utils.toUtf8String(valueNameBytes);

			if (contractName.includes('SystemSettings') && valueName.includes('crossDomainRelayGasLimit')) {
				return mockedCrossDomainRelayGasLimit;
			} else {
				console.log(chalk.red(`Mocked FlexibleStorage will not be able to resolve ${contractName}:${valueName}`));
			}
		});

		// AddressResolver
		MockedAddressResolver = await smockit(AddressResolverArtifacts.abi, hre.ethers.provider);
		MockedAddressResolver.smocked.requireAndGetAddress.will.return.with(nameBytes => {
			const name = hre.ethers.utils.toUtf8String(nameBytes);

			if (name.includes('ext:Messenger')) {
				return MockedMessenger.address;
			} else if (name.includes('FlexibleStorage')) {
				return MockedFlexibleStorage.address;
			} else if (name.includes('ovm:OwnerRelayOnOptimism')) {
				return mockedOwnerRelayOnOptimismAddress;
			} else {
				console.log(chalk.red(`Mocked AddressResolver will not be able to resolve ${name}`));
			}
		});
	});

	before('instantiate the contract', async () => {
		const OwnerRelayOnEthereumFactory = await hre.ethers.getContractFactory('OwnerRelayOnEthereum', owner);
		OwnerRelayOnEthereum = await OwnerRelayOnEthereumFactory.deploy(owner.address, MockedAddressResolver.address);

		const tx = await OwnerRelayOnEthereum.rebuildCache();
		await tx.wait();
	});

	describe('when checking which functions are mutative', () => {
		it('shows that only the expected ones are mutative', async () => {
			ensureOnlyExpectedMutativeFunctions({
				abi: OwnerRelayOnEthereumArtifacts.abi,
				ignoreParents: ['Owned', 'MixinResolver'],
				expected: ['relay'],
			});
		});
	});

	describe('when attempting to relay with an non-owner EOA', () => {
		it('reverts', async () => {
			OwnerRelayOnEthereum = OwnerRelayOnEthereum.connect(user);

			await assert.revert(
				OwnerRelayOnEthereum.relay(
					mockedContractAddressOnL2,
					sampleRelayData,
				),
				'Only the contract owner may perform this action'
			);
		});
	});

	describe('when calling relay with the owner EOA', () => {
		it('relays the expected values', async () => {
			OwnerRelayOnEthereum = OwnerRelayOnEthereum.connect(owner);

			const tx = await OwnerRelayOnEthereum.relay(
				mockedContractAddressOnL2,
				sampleRelayData,
			);
			await tx.wait();

			assert.equal(relayedMessage.targetAddress, mockedOwnerRelayOnOptimismAddress);
			assert.equal(relayedMessage.crossDomainGasLimit, mockedCrossDomainRelayGasLimit);
			assert.equal(relayedMessage.messageData, tx.data);
		});
	});
});
