'use strict';

const { contract } = require('hardhat');

const { assert, addSnapshotBeforeRestoreAfterEach } = require('./common');

const { setupAllContracts } = require('./setup');

const { toUnit } = require('../utils')();

const { ensureOnlyExpectedMutativeFunctions } = require('./helpers');

const { toBytes32 } = require('../..');

const BN = require('bn.js');

contract('RewardEscrowV2', async accounts => {
	const entry1Amount = toUnit(1);
	const [, owner, user1, bridge] = accounts;
	let rewardEscrowV2, synthetix, resolver;

	// Run once at beginning - snapshots will take care of resetting this before each test
	before(async () => {
		({
			RewardEscrowV2: rewardEscrowV2,
			AddressResolver: resolver,
			Synthetix: synthetix,
		} = await setupAllContracts({
			accounts,
			contracts: ['RewardEscrowV2', 'MintableSynthetix'],
		}));
		// allow owner to write to create entries
		await resolver.importAddresses(
			['FeePool', 'SynthetixBridgeToBase', 'SynthetixBridgeToOptimism'].map(toBytes32),
			[owner, owner, bridge],
			{ from: owner }
		);
		await rewardEscrowV2.rebuildCache();
		await synthetix.rebuildCache();
		// mint some snx into the contract (the holder of the SNX)
		await synthetix.mintSecondary(rewardEscrowV2.address, toUnit(100), {
			from: owner,
		});
		// create two entries
		await rewardEscrowV2.appendVestingEntry(user1, entry1Amount, 1, { from: owner });
		await rewardEscrowV2.appendVestingEntry(user1, entry1Amount, 1, { from: owner });
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

	describe('There are two escrow entries initially', async () => {
		it('then numVestingEntries should return 2', async () => {
			assert.equal(2, await rewardEscrowV2.numVestingEntries(user1));
		});
	});

	describe('burnForMigration', () => {
		it('reverts if called not by bridge', async () => {
			await assert.revert(
				rewardEscrowV2.burnForMigration(user1, [1, 2], { from: user1 }),
				'SynthetixBridgeToOptimism'
			);
		});

		it('should succeed when burning from the bridge', async () => {
			assert.bnEqual(await rewardEscrowV2.numVestingEntries(user1), new BN(2));

			await rewardEscrowV2.burnForMigration(user1, [1, 2], { from: bridge });

			// entries exist but are zeroes out
			assert.bnEqual(await rewardEscrowV2.numVestingEntries(user1), 2);
			// no balance
			assert.bnEqual(await rewardEscrowV2.totalEscrowedAccountBalance(user1), 0);
			assert.bnEqual(await rewardEscrowV2.balanceOf(user1), 0);
			// entry is zero
			assert.bnEqual((await rewardEscrowV2.getVestingSchedules(user1, 0, 1))[0].escrowAmount, 0);
		});
	});
});
