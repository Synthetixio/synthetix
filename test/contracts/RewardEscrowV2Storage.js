'use strict';

const { artifacts, contract } = require('hardhat');

const { assert, addSnapshotBeforeRestoreAfterEach } = require('./common');

const { setupAllContracts } = require('./setup');

const { toUnit, toBN } = require('../utils')();

const { ensureOnlyExpectedMutativeFunctions } = require('./helpers');
const { toBytes32 } = require('../../index');

// const {
// 	constants: { ZERO_ADDRESS },
// } = require('../..');

contract('RewardEscrowV2Storage', async accounts => {
	// const WEEK = 7 * 86400;
	const entry1Amount = toUnit(1);

	const [, owner, writeAccount, user1] = accounts;
	let instance, resolver, frozenRewardEscrowV2, synthetix;

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
		await synthetix.mintSecondary(frozenRewardEscrowV2.address, toUnit(100), {
			from: owner,
		});

		// create two entries in frozen
		await frozenRewardEscrowV2.appendVestingEntry(user1, entry1Amount, 1, { from: owner });
		await frozenRewardEscrowV2.appendVestingEntry(user1, entry1Amount, 1, { from: owner });
		// vest first entry
		await frozenRewardEscrowV2.vest([1], { from: user1 });

		// set RewardEscrowV2 key to not the frozen rewards to prevent any SNX transfers by it
		await resolver.importAddresses(['RewardEscrowV2'].map(toBytes32), [writeAccount], {
			from: owner,
		});
		await synthetix.rebuildCache();

		// create instance, controlled by writeAccount
		instance = await artifacts
			.require('RewardEscrowV2Storage')
			.new(owner, writeAccount, synthetix.address, frozenRewardEscrowV2.address);
	});

	addSnapshotBeforeRestoreAfterEach();

	it('ensure only expected functions are mutative', async () => {
		ensureOnlyExpectedMutativeFunctions({
			abi: instance.abi,
			ignoreParents: ['Owned', 'State'],
			expected: [
				'addVestingEntry',
				'setEntryZeroAmount',
				'setZerosUntilTarget',
				'subtractAndTransfer',
				'updateEscrowAccountBalance',
				'updateTotalEscrowedBalance',
				'updateVestedAccountBalance',
			],
		});
	});

	describe('after construction', async () => {
		it('should have expected global values', async () => {
			assert.equal(await instance.owner(), owner);
			assert.equal(await instance.fallbackRewardEscrow(), frozenRewardEscrowV2.address);
			assert.equal(await instance.associatedContract(), writeAccount);
			assert.bnEqual(await instance.nextEntryId(), 3);
			assert.bnEqual(await instance.fallbackId(), 3);
			// only on unvested entry
			assert.bnEqual(await instance.totalEscrowedBalance(), entry1Amount);
		});

		it('should have expected account values for user with existing entries', async () => {
			assert.bnEqual(await instance.numVestingEntries(user1), 2);
			// one unvested
			assert.bnEqual(await instance.totalEscrowedAccountBalance(user1), entry1Amount);
			// one vested
			assert.bnEqual(await instance.totalVestedAccountBalance(user1), entry1Amount);
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
		it('all revert for anyone that is not storage owner', async () => {
			const revertMsg = 'associated contract';
			await assert.revert(instance.setEntryZeroAmount(user1, 1, { from: owner }), revertMsg);
			await assert.revert(instance.setZerosUntilTarget(user1, 0, 0, { from: owner }), revertMsg);
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
			await instance.setEntryZeroAmount(user1, 1, { from: writeAccount });
			await instance.setZerosUntilTarget(user1, 0, toUnit(1), { from: writeAccount });
			await instance.updateEscrowAccountBalance(user1, 0, { from: writeAccount });
			await instance.updateVestedAccountBalance(user1, 0, { from: writeAccount });
			await instance.updateTotalEscrowedBalance(0, { from: writeAccount });
			await instance.addVestingEntry(user1, [0, toUnit(1)], { from: writeAccount });
		});
	});

	describe('when adding new entries', async () => {
		it.skip('for user with existing entries', async () => {});

		it.skip('for user with no existing entries', async () => {});
	});

	describe('when zeroing out existing entries', async () => {
		it.skip('setEntryZeroAmount', async () => {});

		it.skip('setZerosUntilTarget', async () => {});
	});
});
