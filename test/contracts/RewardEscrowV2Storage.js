'use strict';

const { artifacts, contract } = require('hardhat');

const { assert, addSnapshotBeforeRestoreAfterEach } = require('./common');

const { setupAllContracts } = require('./setup');

const { toUnit, toBN } = require('../utils')();

const { ensureOnlyExpectedMutativeFunctions } = require('./helpers');
const { toBytes32 } = require('../../index');

const {
	constants: { ZERO_ADDRESS },
} = require('../..');

contract('RewardEscrowV2Storage', async accounts => {
	const entry1Amount = toUnit(1);

	const [, owner, writeAccount, user1, user2, user3, user4] = accounts;
	let instance, resolver, frozenRewardEscrowV2, synthetix, firstNonFallbackId, user3NumEntries;

	// Run once at beginning - snapshots will take care of resetting this before each test
	before(async () => {
		({
			RewardEscrowV2Frozen: frozenRewardEscrowV2,
			Synthetix: synthetix,
			AddressResolver: resolver,
		} = await setupAllContracts({
			accounts,
			contracts: ['RewardEscrowV2Frozen', 'MintableSynthetix'],
		}));

		// allow owner to write to create entries in old contract
		await resolver.importAddresses(
			['FeePool', 'SynthetixBridgeToBase', 'SynthetixBridgeToOptimism'].map(toBytes32),
			[owner, owner, owner],
			{ from: owner }
		);
		// and set RewardEscrowV2 in resolver to allow SNX transfers
		await resolver.importAddresses(
			['RewardEscrowV2'].map(toBytes32),
			[frozenRewardEscrowV2.address],
			{ from: owner }
		);
		await frozenRewardEscrowV2.rebuildCache();
		await synthetix.rebuildCache();
		// mint some snx into it
		await synthetix.mintSecondary(frozenRewardEscrowV2.address, toUnit(1000), {
			from: owner,
		});

		// create two entries in frozen
		await frozenRewardEscrowV2.appendVestingEntry(user1, entry1Amount, 1, { from: owner });
		await frozenRewardEscrowV2.appendVestingEntry(user1, entry1Amount, 1, { from: owner });
		// vest first entry
		await frozenRewardEscrowV2.vest([1], { from: user1 });
		// create a hundred entries in frozen for user3 for gas tests
		user3NumEntries = 100;
		for (let i = 0; i < user3NumEntries; i++) {
			await frozenRewardEscrowV2.appendVestingEntry(user3, entry1Amount, 1, { from: owner });
		}
		firstNonFallbackId = await frozenRewardEscrowV2.nextEntryId();

		// set RewardEscrowV2 key to not the frozen rewards to prevent any SNX transfers by it
		await resolver.importAddresses(['RewardEscrowV2'].map(toBytes32), [writeAccount], {
			from: owner,
		});
		await synthetix.rebuildCache();

		// create new instance, controlled by writeAccount
		// we're not using the instance created in setupAllContracts because it had its fallback set already
		instance = await artifacts.require('RewardEscrowV2Storage').new(owner, writeAccount);
	});

	addSnapshotBeforeRestoreAfterEach();

	it('ensure only expected functions are mutative', async () => {
		ensureOnlyExpectedMutativeFunctions({
			abi: instance.abi,
			ignoreParents: ['Owned', 'State'],
			expected: [
				'setFallbackRewardEscrow',
				'addVestingEntry',
				'setZeroAmount',
				'setZeroAmountUntilTarget',
				'updateEscrowAccountBalance',
				'updateTotalEscrowedBalance',
				'updateVestedAccountBalance',
			],
		});
	});

	describe('after construction', async () => {
		describe('when not initialized with fallback', () => {
			it('should return expected global values', async () => {
				assert.equal(await instance.owner(), owner);
				assert.equal(await instance.fallbackRewardEscrow(), ZERO_ADDRESS);
				assert.equal(await instance.associatedContract(), writeAccount);
				assert.bnEqual(await instance.nextEntryId(), 0);
				assert.bnEqual(await instance.firstNonFallbackId(), 0);
			});

			it('should revert for view methods relying on fallback contract being initialized', async () => {
				const revertMsg = 'fallback not set';
				await assert.revert(instance.totalEscrowedBalance(), revertMsg);
				await assert.revert(instance.numVestingEntries(user1), revertMsg);
				await assert.revert(instance.totalEscrowedAccountBalance(user1), revertMsg);
				await assert.revert(instance.totalVestedAccountBalance(user1), revertMsg);
				await assert.revert(instance.vestingSchedules(user1, 0), revertMsg);
				await assert.revert(instance.accountVestingEntryIDs(user1, 0), revertMsg);
			});
		});

		describe('when initialized with previous fallback', () => {
			beforeEach(async () => {
				// initialize fallback contract
				await instance.setFallbackRewardEscrow(frozenRewardEscrowV2.address, { from: owner });
			});
			it('should have expected global values', async () => {
				assert.equal(await instance.owner(), owner);
				assert.equal(await instance.fallbackRewardEscrow(), frozenRewardEscrowV2.address);
				assert.equal(await instance.associatedContract(), writeAccount);
				assert.bnEqual(await instance.nextEntryId(), firstNonFallbackId);
				assert.bnEqual(await instance.firstNonFallbackId(), firstNonFallbackId);
				// only on unvested entry
				assert.bnEqual(
					await instance.totalEscrowedBalance(),
					entry1Amount.mul(toBN(user3NumEntries + 1))
				);
			});

			it('should have expected account values for users with existing entries', async () => {
				assert.bnEqual(await instance.numVestingEntries(user1), 2);
				assert.bnEqual(await instance.numVestingEntries(user3), user3NumEntries);
				// one unvested
				assert.bnEqual(await instance.totalEscrowedAccountBalance(user1), entry1Amount);
				assert.bnEqual(
					await instance.totalEscrowedAccountBalance(user3),
					entry1Amount.mul(toBN(user3NumEntries))
				);
				// one vested
				assert.bnEqual(await instance.totalVestedAccountBalance(user1), entry1Amount);
				assert.bnEqual(await instance.totalVestedAccountBalance(user3), 0);
			});
		});
	});

	describe('public mutative methods on frozen contract', async () => {
		// this is not exactly the right place for these tests (they should be done in integration + fork as well)
		// but why not check here as well

		it('are broken due to inability to transfer SNX', async () => {
			const revertMsg = 'Only the proxy';
			// vest
			await assert.revert(frozenRewardEscrowV2.vest([2], { from: user1 }), revertMsg);
			// create
			await assert.revert(
				frozenRewardEscrowV2.createEscrowEntry(owner, toBN(1), 1, { from: user1 }),
				revertMsg
			);
			// burn from bridge
			await assert.revert(
				frozenRewardEscrowV2.burnForMigration(user1, [2], { from: owner }),
				revertMsg
			);
		});
		it('except migrateVestingSchedule, appendVestingEntry, mergeAccount', async () => {
			/**
			 * migrateVestingSchedule: finish any outstanding migrations
			 * appendVestingEntry: fee pool should transfer to new rewards after resolver update
			 * mergeAccount: needs to be disabled by setting setAccountMergingDuration to 0
			 * */
		});
	});

	describe('mutative methods access', async () => {
		it('should revert when not initialized with fallback', async () => {
			const revertMsg = 'fallback not set';
			await assert.revert(instance.setZeroAmount(user1, 1, { from: owner }), revertMsg);
			await assert.revert(
				instance.setZeroAmountUntilTarget(user1, 0, 0, { from: owner }),
				revertMsg
			);
			await assert.revert(
				instance.updateEscrowAccountBalance(user1, 0, { from: owner }),
				revertMsg
			);
			await assert.revert(
				instance.updateVestedAccountBalance(user1, 0, { from: owner }),
				revertMsg
			);
			await assert.revert(instance.updateTotalEscrowedBalance(0, { from: owner }), revertMsg);
			await assert.revert(instance.addVestingEntry(user1, [0, 0], { from: owner }), revertMsg);
		});

		it('setFallbackRewardEscrow revert as expected', async () => {
			// cannot be zero address
			await assert.revert(instance.setFallbackRewardEscrow(ZERO_ADDRESS, { from: owner }), 'zero');
			// only owner
			await assert.revert(instance.setFallbackRewardEscrow(ZERO_ADDRESS, { from: user1 }), 'owner');
		});

		describe('when initialized with previous fallback', () => {
			beforeEach(async () => {
				// initialize fallback contract
				await instance.setFallbackRewardEscrow(frozenRewardEscrowV2.address, { from: owner });
			});

			it('can only setFallbackRewardEscrow once', async () => {
				await assert.revert(
					instance.setFallbackRewardEscrow(user1, { from: owner }),
					'already set'
				);
			});

			it('all revert for anyone that is not storage owner', async () => {
				const revertMsg = 'associated contract';
				await assert.revert(instance.setZeroAmount(user1, 1, { from: owner }), revertMsg);
				await assert.revert(
					instance.setZeroAmountUntilTarget(user1, 0, 0, { from: owner }),
					revertMsg
				);
				await assert.revert(
					instance.updateEscrowAccountBalance(user1, 0, { from: owner }),
					revertMsg
				);
				await assert.revert(
					instance.updateVestedAccountBalance(user1, 0, { from: owner }),
					revertMsg
				);
				await assert.revert(instance.updateTotalEscrowedBalance(0, { from: owner }), revertMsg);
				await assert.revert(instance.addVestingEntry(user1, [0, 0], { from: owner }), revertMsg);
			});

			it('all succeed for storage owner', async () => {
				await instance.setZeroAmount(user1, 1, { from: writeAccount });
				await instance.setZeroAmountUntilTarget(user1, 0, toUnit(1), { from: writeAccount });
				await instance.updateEscrowAccountBalance(user1, 0, { from: writeAccount });
				await instance.updateVestedAccountBalance(user1, 0, { from: writeAccount });
				await instance.updateTotalEscrowedBalance(0, { from: writeAccount });
				await instance.addVestingEntry(user1, [1, toUnit(1)], { from: writeAccount });
			});

			describe('addVestingEntry', async () => {
				it('cannot set vesting time to zero', async () => {
					await assert.revert(
						instance.addVestingEntry(user1, [0, entry1Amount], { from: writeAccount }),
						'time zero'
					);
				});

				it('for user with existing entries', async () => {
					await instance.addVestingEntry(user1, [1, entry1Amount], { from: writeAccount });

					// added on this contract
					assert.bnEqual(await instance.numVestingEntries(user1), 3);
					// entry
					assert.bnEqual(
						(await instance.vestingSchedules(user1, user3NumEntries + 3)).escrowAmount,
						entry1Amount
					);

					// old contract
					assert.bnEqual(await frozenRewardEscrowV2.numVestingEntries(user1), 2);
					assert.bnEqual(
						(await frozenRewardEscrowV2.vestingSchedules(user1, user3NumEntries + 3)).escrowAmount,
						0
					);
				});

				it('for user with no existing entries', async () => {
					await instance.addVestingEntry(user2, [1, entry1Amount], { from: writeAccount });

					// added on this contract
					assert.bnEqual(await instance.numVestingEntries(user2), 1);
					// entry
					assert.bnEqual(
						(await instance.vestingSchedules(user2, user3NumEntries + 3)).escrowAmount,
						entry1Amount
					);

					// old contract
					assert.bnEqual(await frozenRewardEscrowV2.numVestingEntries(user2), 0);
					assert.bnEqual(
						(await frozenRewardEscrowV2.vestingSchedules(user2, user3NumEntries + 3)).escrowAmount,
						0
					);
				});
			});

			describe('setZeroAmount', async () => {
				it('entry on old contract', async () => {
					// set initially
					assert.bnEqual((await instance.vestingSchedules(user1, 2)).escrowAmount, entry1Amount);

					await instance.setZeroAmount(user1, 2, { from: writeAccount });

					// read on this contract
					assert.bnEqual((await instance.vestingSchedules(user1, 2)).escrowAmount, 0);

					// read old contract (untouched)
					assert.bnEqual(
						(await frozenRewardEscrowV2.vestingSchedules(user1, 2)).escrowAmount,
						entry1Amount
					);
				});

				it('new entry', async () => {
					// add entry
					await instance.addVestingEntry(user1, [1, entry1Amount], { from: writeAccount });
					const entryId = user3NumEntries + 3;

					// set initially
					assert.bnEqual(
						(await instance.vestingSchedules(user1, entryId)).escrowAmount,
						entry1Amount
					);

					await instance.setZeroAmount(user1, entryId, { from: writeAccount });

					// read on this contract
					assert.bnEqual((await instance.vestingSchedules(user1, entryId)).escrowAmount, 0);

					// read old contract (didn't exist)
					assert.bnEqual(
						(await frozenRewardEscrowV2.vestingSchedules(user1, entryId)).escrowAmount,
						0
					);
				});
			});

			describe('setZeroAmountUntilTarget', async () => {
				it('reverts on bad input', async () => {
					await assert.revert(
						instance.setZeroAmountUntilTarget(user1, 10, 0, { from: writeAccount }),
						'targetAmount'
					);
					await assert.revert(
						instance.setZeroAmountUntilTarget(user1, 10, 1, { from: writeAccount }),
						'startIndex'
					);
					await assert.revert(
						instance.setZeroAmountUntilTarget(user2, 10, 1, { from: writeAccount }),
						'no entries'
					);
				});

				it('entries on old contract', async () => {
					// set initially
					assert.bnEqual((await instance.vestingSchedules(user1, 2)).escrowAmount, entry1Amount);

					// calls this statically to get the returned values
					const ret = await instance.setZeroAmountUntilTarget.call(user1, 0, toUnit(10), {
						from: writeAccount,
					});

					// return values

					assert.bnEqual(ret.total, entry1Amount);
					assert.bnEqual(ret.endIndex, 1);
					assert.bnEqual(
						ret.lastEntryTime,
						(await frozenRewardEscrowV2.vestingSchedules(user1, 2)).endTime
					);

					// send the transaction
					await instance.setZeroAmountUntilTarget(user1, 0, toUnit(10), { from: writeAccount });

					// read on this contract
					assert.bnEqual((await instance.vestingSchedules(user1, 2)).escrowAmount, 0);

					// read old contract (untouched)
					assert.bnEqual(
						(await frozenRewardEscrowV2.vestingSchedules(user1, 2)).escrowAmount,
						entry1Amount
					);
				});

				it('gas test for 100 entries on old contract', async () => {
					const {
						receipt: { gasUsed },
					} = await instance.setZeroAmountUntilTarget(user3, 0, toUnit(user3NumEntries), {
						from: writeAccount,
					});
					console.log(
						`setZeroAmountUntilTarget() with 100 escrow entries on old contract gas used: ${Math.round(
							gasUsed / 1000
						).toString()}k`
					);
				});

				it('gas test for 100 entries on new contract', async () => {
					for (let i = 0; i < 100; i++) {
						await instance.addVestingEntry(user4, [1, entry1Amount], { from: writeAccount });
					}
					// send the transaction
					const {
						receipt: { gasUsed },
					} = await instance.setZeroAmountUntilTarget(user4, 0, toUnit(user3NumEntries), {
						from: writeAccount,
					});
					console.log(
						`setZeroAmountUntilTarget() with 100 escrow entries on new contract gas used: ${Math.round(
							gasUsed / 1000
						).toString()}k`
					);
				});

				it('entries on new and old contract', async () => {
					// add entry
					const entryId = user3NumEntries + 3;
					await instance.addVestingEntry(user1, [1, entry1Amount], { from: writeAccount });
					const entryEndTime = (await instance.vestingSchedules(user1, entryId)).endTime;

					// set initially
					assert.bnEqual(
						(await instance.vestingSchedules(user1, entryId)).escrowAmount,
						entry1Amount
					);

					// calls this statically to get the returned values
					const ret = await instance.setZeroAmountUntilTarget.call(user1, 0, toUnit(10), {
						from: writeAccount,
					});

					// return values
					assert.bnEqual(ret.total, entry1Amount.mul(toBN(2)));
					assert.bnEqual(ret.endIndex, 2);
					assert.bnEqual(ret.lastEntryTime, entryEndTime);

					// send the transaction
					await instance.setZeroAmountUntilTarget(user1, 0, toUnit(10), { from: writeAccount });

					// read on this contract
					assert.bnEqual((await instance.vestingSchedules(user1, 2)).escrowAmount, 0);
					assert.bnEqual((await instance.vestingSchedules(user1, entryId)).escrowAmount, 0);

					// read old contract (untouched)
					assert.bnEqual(
						(await frozenRewardEscrowV2.vestingSchedules(user1, 2)).escrowAmount,
						entry1Amount
					);
				});

				it('respects startIndex', async () => {
					// add entry
					await instance.addVestingEntry(user1, [1, entry1Amount], { from: writeAccount });
					const entryId = user3NumEntries + 3;
					const entryEndTime = (await instance.vestingSchedules(user1, entryId)).endTime;

					// calls this statically to get the returned values
					const ret = await instance.setZeroAmountUntilTarget.call(user1, 2, toUnit(10), {
						from: writeAccount,
					});

					// return values
					assert.bnEqual(ret.total, entry1Amount);
					assert.bnEqual(ret.endIndex, 2);
					assert.bnEqual(ret.lastEntryTime, entryEndTime);

					// send the transaction
					await instance.setZeroAmountUntilTarget(user1, 2, toUnit(10), { from: writeAccount });

					// first is untouched
					assert.bnEqual((await instance.vestingSchedules(user1, 2)).escrowAmount, entry1Amount);
					// second is zero
					assert.bnEqual((await instance.vestingSchedules(user1, entryId)).escrowAmount, 0);
				});

				it('respects targetAmount', async () => {
					// add entry
					await instance.addVestingEntry(user1, [1, entry1Amount], { from: writeAccount });
					const entryId = user3NumEntries + 3;
					const entryEndTime = (await instance.vestingSchedules(user1, 2)).endTime;

					// calls this statically to get the returned values
					const ret = await instance.setZeroAmountUntilTarget.call(user1, 0, toUnit(0.5), {
						from: writeAccount,
					});

					// return values
					assert.bnEqual(ret.total, entry1Amount);
					assert.bnEqual(ret.endIndex, 1);
					assert.bnEqual(ret.lastEntryTime, entryEndTime);

					// send the transaction
					await instance.setZeroAmountUntilTarget(user1, 0, toUnit(0.5), { from: writeAccount });

					// first is zero
					assert.bnEqual((await instance.vestingSchedules(user1, 2)).escrowAmount, 0);
					// second is untouched
					assert.bnEqual(
						(await instance.vestingSchedules(user1, entryId)).escrowAmount,
						entry1Amount
					);
				});
			});

			// utility to check multiple cases for a writeMethod that expects a delta as input
			// and has a corresponding readMethod
			const balanceUpdateChecks = async (readMethod, writeMethod, firstArgs = []) => {
				const readPromise = (contract, amountArg) =>
					contract[readMethod](...[...firstArgs, amountArg]);

				const writePromise = (contract, amountArg, from) =>
					contract[writeMethod](...[...firstArgs, amountArg], { from });

				it('delta cannot cause negative balance', async () => {
					await assert.revert(
						writePromise(instance, toUnit('-1000'), writeAccount),
						'must be positive'
					);
				});

				// this case is important to check correct usage of ZERO_PLACEHOLDER for zero values
				it('can set old balance to zero', async () => {
					const oldBalance = await readPromise(frozenRewardEscrowV2);
					// not zero
					assert.bnGt(oldBalance, 0);
					// equal in both contracts
					assert.bnEqual(await readPromise(instance), oldBalance);

					// set to zero
					await writePromise(instance, oldBalance.neg(), writeAccount);

					// zero in new contract
					assert.bnEqual(await readPromise(instance), 0);

					// read old contract (untouched)
					assert.bnEqual(await readPromise(frozenRewardEscrowV2), oldBalance);
				});

				it('changes balance', async () => {
					const before = await readPromise(instance);

					const delta = toUnit('-1');
					await writePromise(instance, delta, writeAccount);

					assert.bnEqual(await readPromise(instance), before.add(delta));

					await writePromise(instance, delta.neg(), writeAccount);
					assert.bnEqual(await readPromise(instance), before);
				});
			};

			describe('updateTotalEscrowedBalance', async () => {
				await balanceUpdateChecks('totalEscrowedBalance', 'updateTotalEscrowedBalance');
			});

			describe('updateVestedAccountBalance', async () => {
				await balanceUpdateChecks('totalVestedAccountBalance', 'updateVestedAccountBalance', [
					user1,
				]);
			});

			describe('updateEscrowAccountBalance', async () => {
				await balanceUpdateChecks('totalEscrowedAccountBalance', 'updateEscrowAccountBalance', [
					user1,
				]);
			});
		});
	});
});
