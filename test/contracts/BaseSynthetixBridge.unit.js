const { artifacts, contract } = require('hardhat');
const { assert } = require('./common');
const { onlyGivenAddressCanInvoke, ensureOnlyExpectedMutativeFunctions } = require('./helpers');

const { toBytes32 } = require('../..');
const { smockit } = require('@eth-optimism/smock');

const BaseSynthetixBridge = artifacts.require('BaseSynthetixBridge');

contract('BaseSynthetixBridge (unit tests)', accounts => {
	const [owner, smockedMessenger, flexibleStorage] = accounts;

	it('ensure only known functions are mutative', () => {
		ensureOnlyExpectedMutativeFunctions({
			abi: BaseSynthetixBridge.abi,
			ignoreParents: ['Owned', 'MixinResolver'],
			expected: ['resumeInitiation', 'suspendInitiation'],
		});
	});

	describe('when all the deps are mocked', () => {
		let messenger;
		let synthetix;
		let resolver;
		let feePool;
		let rewardEscrow;

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

			// now add to address resolver
			resolver = await artifacts.require('AddressResolver').new(owner);

			await resolver.importAddresses(
				['ext:Messenger', 'Synthetix', 'RewardEscrowV2', 'FlexibleStorage', 'FeePool'].map(
					toBytes32
				),
				[
					messenger.address,
					synthetix.address,
					rewardEscrow.address,
					flexibleStorage,
					feePool.address,
				],
				{ from: owner }
			);
		});

		describe('when the target is deployed and the proxy is set', () => {
			let instance;

			beforeEach(async () => {
				instance = await artifacts.require('BaseSynthetixBridge').new(owner, resolver.address);

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
		});
	});
});
