const chalk = require('chalk');
const { ethers, contract, artifacts } = require('hardhat');
const { assert } = require('./common');
const { smockit } = require('@eth-optimism/smock');
const { ensureOnlyExpectedMutativeFunctions } = require('./helpers');
const {
	defaults: { CROSS_DOMAIN_RELAY_GAS_LIMIT },
} = require('../..');

contract('OwnerRelayOnEthereum', () => {
	// Signers
	let owner, user;

	// Real contracts
	let OwnerRelayOnEthereum;

	// Mocked contracts
	let MockedMessenger, MockedAddressResolver, MockedFlexibleStorage, MockedOwnerRelayOnOptimism;

	// Other mocked stuff
	const mockedOwnerRelayOnOptimismAddress = ethers.Wallet.createRandom().address;
	const mockedContractAddressOnL2 = ethers.Wallet.createRandom().address;
	const mockedRelayData = '0xdeadbeef';

	before('initialize signers', async () => {
		[owner, user] = await ethers.getSigners();
	});

	before('mock other contracts used by OwnerRelayOnEthereum', async () => {
		MockedMessenger = await smockit(
			artifacts.require('iAbs_BaseCrossDomainMessenger').abi,
			ethers.provider
		);

		MockedOwnerRelayOnOptimism = await smockit(
			artifacts.require('OwnerRelayOnOptimism').abi,
			ethers.provider
		);

		MockedFlexibleStorage = await smockit(
			artifacts.require('FlexibleStorage').abi,
			ethers.provider
		);

		MockedAddressResolver = await smockit(
			artifacts.require('AddressResolver').abi,
			ethers.provider
		);
		MockedAddressResolver.smocked.requireAndGetAddress.will.return.with(nameBytes => {
			const name = ethers.utils.toUtf8String(nameBytes);

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
		const OwnerRelayOnEthereumFactory = await ethers.getContractFactory(
			'OwnerRelayOnEthereum',
			owner
		);
		OwnerRelayOnEthereum = await OwnerRelayOnEthereumFactory.deploy(
			owner.address,
			MockedAddressResolver.address
		);

		const tx = await OwnerRelayOnEthereum.rebuildCache();
		await tx.wait();
	});

	it('requires the expected contracts', async () => {
		const requiredAddresses = await OwnerRelayOnEthereum.resolverAddressesRequired();

		assert.equal(requiredAddresses.length, 3);
		assert.ok(requiredAddresses.includes(ethers.utils.formatBytes32String('FlexibleStorage')));
		assert.ok(requiredAddresses.includes(ethers.utils.formatBytes32String('ext:Messenger')));
		assert.ok(
			requiredAddresses.includes(ethers.utils.formatBytes32String('ovm:OwnerRelayOnOptimism'))
		);
	});

	it('shows that only the expected functions are mutative', async () => {
		ensureOnlyExpectedMutativeFunctions({
			abi: artifacts.require('OwnerRelayOnEthereum').abi,
			ignoreParents: ['Owned', 'MixinResolver'],
			expected: ['initiateRelay'],
		});
	});

	describe('when attempting to initiate a relay from a non-owner account', () => {
		it('reverts with the expected error', async () => {
			await assert.revert(
				OwnerRelayOnEthereum.connect(user).initiateRelay(
					mockedContractAddressOnL2,
					mockedRelayData,
					0
				),
				'Only the contract owner may perform this action'
			);
		});
	});

	describe('when initiating a relay from the owner account', () => {
		let relayReceipt;

		const specifiedCrossDomainRelayGasLimit = 3e6;

		let relayedMessage = {
			contractOnL2: undefined,
			messageData: undefined,
			crossDomainGasLimit: undefined,
		};

		before('mock Optimism Messenger.sendMessage(...)', async () => {
			// Allows us to record what Messenger.sendMessage gets called with
			MockedMessenger.smocked.sendMessage.will.return.with(
				(contractOnL2, messageData, crossDomainGasLimit) => {
					relayedMessage = { contractOnL2, messageData, crossDomainGasLimit };
				}
			);
		});

		before('mock SystemSettings.getCrossDomainMessageGasLimit(...)', async () => {
			MockedFlexibleStorage.smocked.getUIntValue.will.return.with(
				(contractNameBytes, valueNameBytes) => {
					const contractName = ethers.utils.toUtf8String(contractNameBytes);
					const valueName = ethers.utils.toUtf8String(valueNameBytes);

					if (
						contractName.includes('SystemSettings') &&
						valueName.includes('crossDomainRelayGasLimit')
					) {
						return CROSS_DOMAIN_RELAY_GAS_LIMIT;
					} else {
						console.log(
							chalk.red(
								`Mocked FlexibleStorage will not be able to resolve ${contractName}:${valueName}`
							)
						);
					}
				}
			);
		});

		before('initiate the relay', async () => {
			const tx = await OwnerRelayOnEthereum.connect(owner).initiateRelay(
				mockedContractAddressOnL2,
				mockedRelayData,
				specifiedCrossDomainRelayGasLimit
			);
			relayReceipt = await tx.wait();
		});

		it('relayed a message to OwnerRelayOnOptimism', async () => {
			assert.equal(relayedMessage.contractOnL2, mockedOwnerRelayOnOptimismAddress);
		});

		it('relayed the message with the expected crossDomainGasLimit', async () => {
			assert.equal(relayedMessage.crossDomainGasLimit, specifiedCrossDomainRelayGasLimit);
		});

		it('relayed the correct data', async () => {
			const expectedRelayData = MockedOwnerRelayOnOptimism.interface.encodeFunctionData(
				'finalizeRelay',
				[mockedContractAddressOnL2, mockedRelayData]
			);

			assert.equal(relayedMessage.messageData, expectedRelayData);
		});

		it('emited a RelayInitiated event', async () => {
			const event = relayReceipt.events.find(e => e.event === 'RelayInitiated');

			assert.equal(event.args.target, mockedContractAddressOnL2);
			assert.equal(event.args.data, mockedRelayData);
		});

		describe('when not specifying a cross domain relay gas limit', () => {
			before('initiate the relay', async () => {
				const tx = await OwnerRelayOnEthereum.connect(owner).initiateRelay(
					mockedContractAddressOnL2,
					mockedRelayData,
					0
				);
				await tx.wait();
			});

			it('relayed the message with the default crossDomainGasLimit', async () => {
				assert.equal(relayedMessage.crossDomainGasLimit, CROSS_DOMAIN_RELAY_GAS_LIMIT);
			});
		});
	});
});
