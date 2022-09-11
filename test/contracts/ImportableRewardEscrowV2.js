'use strict';

const { contract } = require('hardhat');

const { assert, addSnapshotBeforeRestoreAfterEach } = require('./common');

const { setupAllContracts } = require('./setup');

const { toUnit } = require('../utils')();

const { ensureOnlyExpectedMutativeFunctions } = require('./helpers');
const { toBytes32 } = require('../../index');

// const {
// 	constants: { ZERO_ADDRESS },
// } = require('../..');

contract('ImportableRewardEscrowV2', async accounts => {
	const [, owner, account1] = accounts;
	let rewardEscrowV2, resolver, synthetix;

	// Run once at beginning - snapshots will take care of resetting this before each test
	before(async () => {
		({
			RewardEscrowV2: rewardEscrowV2,
			AddressResolver: resolver,
			Synthetix: synthetix,
		} = await setupAllContracts({
			accounts,
			contracts: ['ImportableRewardEscrowV2', 'MintableSynthetix'],
		}));
	});

	addSnapshotBeforeRestoreAfterEach();

	it('ensure only expected functions are mutative', async () => {
		ensureOnlyExpectedMutativeFunctions({
			abi: rewardEscrowV2.abi,
			ignoreParents: ['BaseRewardEscrowV2'],
			expected: [],
		});
	});

	describe('Constructor & Settings ', async () => {
		it('should set owner on contructor', async () => {
			const ownerAddress = await rewardEscrowV2.owner();
			assert.equal(ownerAddress, owner);
		});
	});

	describe('There are no escrow entries initially', async () => {
		it('then numVestingEntries should return 0', async () => {
			assert.equal(0, await rewardEscrowV2.numVestingEntries(account1));
		});
	});

	describe('importVestingEntries', async () => {
		const total = toUnit('1');
		const entries = [[1, toUnit('1')]];
		it('Can only be called by bridge', async () => {
			await assert.revert(
				rewardEscrowV2.importVestingEntries(owner, total, entries, {
					from: owner,
				}),
				'SynthetixBridgeToBase'
			);
		});

		describe('when called by the bridge', async () => {
			before(async () => {
				await resolver.importAddresses([toBytes32('SynthetixBridgeToBase')], [account1], {
					from: owner,
				});
				await rewardEscrowV2.rebuildCache();
				await synthetix.rebuildCache();
			});

			it('reverts on insufficient balance', async () => {
				await assert.revert(
					rewardEscrowV2.importVestingEntries(owner, total, entries, {
						from: account1,
					}),
					'Insufficient'
				);
			});

			describe('when balance is sufficient', async () => {
				before(async () => {
					await synthetix.mintSecondary(rewardEscrowV2.address, total, {
						from: account1,
					});
					await rewardEscrowV2.rebuildCache();
				});

				it('imports an entry', async () => {
					// no entries
					assert.bnEqual(await rewardEscrowV2.numVestingEntries(owner), 0);
					assert.bnEqual(await rewardEscrowV2.totalEscrowedAccountBalance(owner), 0);
					await rewardEscrowV2.importVestingEntries(owner, total, entries, {
						from: account1,
					});
					// 1 entry, with total size
					assert.bnEqual(await rewardEscrowV2.numVestingEntries(owner), 1);
					assert.bnEqual(
						(await rewardEscrowV2.getVestingSchedules(owner, 0, 1))[0].escrowAmount,
						total
					);
					assert.bnEqual(await rewardEscrowV2.totalEscrowedAccountBalance(owner), total);
				});
			});
		});
	});
});
