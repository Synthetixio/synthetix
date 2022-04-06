const { artifacts, contract } = require('hardhat');
const { assert } = require('./common');
const { onlyGivenAddressCanInvoke, ensureOnlyExpectedMutativeFunctions } = require('./helpers');

const { toBytes32 } = require('../..');
const { smockit } = require('@eth-optimism/smock');

const { toUnit } = require('../utils')();

const BaseSynthetixBridge = artifacts.require('BaseSynthetixBridge');

contract('BaseSynthetixBridge (unit tests)', accounts => {
	const [, owner, user1, smockedMessenger] = accounts;

	const sETH = toBytes32('sETH');

	it('ensure only known functions are mutative', () => {
		ensureOnlyExpectedMutativeFunctions({
			abi: BaseSynthetixBridge.abi,
			ignoreParents: ['Owned', 'MixinResolver'],
			expected: [
				'resumeInitiation',
				'suspendInitiation',
				'initiateSynthTransfer',
				'finalizeSynthTransfer',
			],
		});
	});

	describe('when all the deps are mocked', () => {
		let messenger;
		let synthetix;
		let resolver;
		let issuer;
		let feePool;
		let rewardEscrow;
		let flexibleStorage;

		beforeEach(async () => {
			messenger = await smockit(artifacts.require('iAbs_BaseCrossDomainMessenger').abi, {
				address: smockedMessenger,
			});

			rewardEscrow = await smockit(
				artifacts.require('contracts/interfaces/IRewardEscrowV2.sol:IRewardEscrowV2').abi
			);

			// can't use ISynthetix as we need ERC20 functions as well
			synthetix = await smockit(artifacts.require('Synthetix').abi);

			feePool = await smockit(artifacts.require('FeePool').abi);

			issuer = await smockit(artifacts.require('Issuer').abi);
			flexibleStorage = await smockit(artifacts.require('FlexibleStorage').abi);

			resolver = await artifacts.require('AddressResolver').new(owner);

			await resolver.importAddresses(
				[
					'ext:Messenger',
					'Synthetix',
					'RewardEscrowV2',
					'FlexibleStorage',
					'Issuer',
					'FeePool',
					'base:SynthetixBridgeToOptimism',
				].map(toBytes32),
				[
					messenger.address,
					synthetix.address,
					rewardEscrow.address,
					flexibleStorage.address,
					issuer.address,
					feePool.address,
					issuer.address,
				],
				{ from: owner }
			);
		});

		describe('when the target is deployed and the proxy is set', () => {
			let instance;

			beforeEach(async () => {
				instance = await artifacts
					.require('SynthetixBridgeToBase') // have to use a sub-contract becuase `BaseSynthetixBridge` is abstract
					.new(owner, resolver.address);

				await instance.rebuildCache();
			});

			it('should set constructor params on deployment', async () => {
				assert.equal(await instance.owner(), owner);
				assert.equal(await instance.resolver(), resolver.address);
			});

			it('initially initiations are active', async () => {
				assert.equal(await instance.initiationActive(), true);
			});

			describe('suspendInitiation', () => {
				describe('failure modes', () => {
					it('reverts when not invoked by the owner', async () => {
						await onlyGivenAddressCanInvoke({
							fnc: instance.suspendInitiation,
							args: [],
							accounts,
							reason: 'Only the contract owner may perform this action',
							address: owner,
						});
					});

					it('reverts when initiation is already suspended', async () => {
						await instance.suspendInitiation({ from: owner });

						await assert.revert(
							instance.suspendInitiation({ from: owner }),
							'Initiation suspended'
						);
					});
				});

				describe('when invoked by the owner', () => {
					let txn;
					beforeEach(async () => {
						txn = await instance.suspendInitiation({ from: owner });
					});

					it('and initiationActive is false', async () => {
						assert.equal(await instance.initiationActive(), false);
					});

					it('and a InitiationSuspended event is emitted', async () => {
						assert.eventEqual(txn, 'InitiationSuspended', []);
					});
				});
			});

			describe('resumeInitiation', () => {
				describe('failure modes', () => {
					it('reverts when not invoked by the owner', async () => {
						// first suspend initiations
						await instance.suspendInitiation({ from: owner });
						await onlyGivenAddressCanInvoke({
							fnc: instance.resumeInitiation,
							args: [],
							accounts,
							reason: 'Only the contract owner may perform this action',
							address: owner,
						});
					});

					it('reverts when initiation is not suspended', async () => {
						await assert.revert(
							instance.resumeInitiation({ from: owner }),
							'Initiation not suspended'
						);
					});
				});

				describe('when initiation is suspended', () => {
					let txn;
					beforeEach(async () => {
						txn = await instance.suspendInitiation({ from: owner });
					});

					it('initiationActive is false', async () => {
						assert.equal(await instance.initiationActive(), false);
					});

					describe('when invoked by the owner', () => {
						beforeEach(async () => {
							txn = await instance.resumeInitiation({ from: owner });
						});

						it('initiations are active again', async () => {
							assert.equal(await instance.initiationActive(), true);
						});

						it('a InitiationResumed event is emitted', async () => {
							assert.eventEqual(txn, 'InitiationResumed', []);
						});
					});
				});
			});

			describe('initiateSynthTransfer', () => {
				describe('when successfully invoked', () => {
					let txn;
					beforeEach(async () => {
						txn = await instance.initiateSynthTransfer(sETH, owner, toUnit('100'), { from: user1 });
					});

					it('burns synths from caller', () => {
						assert.bnEqual(issuer.smocked.burnFreeSynths.calls[0].amount, toUnit('100'));
					});

					it('calls messenger', () => {
						assert.bnEqual(messenger.smocked.sendMessage.calls[0]._target, issuer.address);
					});

					it('emits event', () => {
						assert.eventEqual(txn, 'InitiateSynthTransfer', [sETH, owner, toUnit('100')]);
					});
				});
			});

			describe('finalizeSynthTransfer', () => {
				beforeEach('set counterpart bridge', async () => {
					messenger.smocked.xDomainMessageSender.will.return.with(issuer.address);
				});

				it('fails if xdomainmessagesender doesnt match counterpart', async () => {
					messenger.smocked.xDomainMessageSender.will.return.with(owner);
					await assert.revert(instance.finalizeSynthTransfer(sETH, owner, '100'));
				});

				it('can only be called by messenger and registered counterpart', async () => {
					await onlyGivenAddressCanInvoke({
						fnc: instance.finalizeSynthTransfer,
						accounts,
						address: smockedMessenger,
						args: [sETH, owner, '100'],
						reason: 'Only the relayer can call this',
					});
				});

				describe('when successfully invoked', () => {
					let txn;
					beforeEach(async () => {
						txn = await instance.finalizeSynthTransfer(sETH, user1, toUnit('125'), {
							from: smockedMessenger,
						});
					});

					it('mints synths to the destination', () => {
						assert.bnEqual(issuer.smocked.issueFreeSynths.calls[0].amount, toUnit('125'));
					});

					it('emits event', () => {
						assert.eventEqual(txn, 'FinalizeSynthTransfer', [sETH, user1, toUnit('125')]);
					});
				});
			});
		});
	});
});
