const ethers = require('ethers');
const { assert } = require('../../contracts/common');

const { toBytes32 } = require('../../..');

function itDoesRewardEscrow({ ctx, contract }) {
	// old escrow should be basically immutable
	describe('RewardEscrowFrozen', () => {
		const fakeAmount = ethers.utils.parseEther('100');

		let owner, someUser, otherUser;
		let AddressResolver, RewardEscrowV2Frozen, RewardEscrowV2, Synthetix;

		let fakeEscrowEntryId;

		before('target contracts and users and setup', async () => {
			({ AddressResolver, RewardEscrowV2Frozen, RewardEscrowV2, Synthetix } = ctx.contracts);

			({ owner, someUser, otherUser } = ctx.users);

			// create some fake stuff before the migration is completed
			// fake escrow entry

			await AddressResolver.connect(owner).importAddresses(
				[toBytes32('RewardEscrowV2')],
				[RewardEscrowV2Frozen.address]
			);

			await Synthetix.connect(owner).approve(
				RewardEscrowV2Frozen.address,
				ethers.constants.MaxUint256
			);
			await RewardEscrowV2Frozen.connect(owner).createEscrowEntry(otherUser.address, fakeAmount, 1);
			await RewardEscrowV2Frozen.connect(owner).createEscrowEntry(
				someUser.address,
				fakeAmount.mul(2),
				1
			);

			fakeEscrowEntryId = await RewardEscrowV2Frozen.accountVestingEntryIDs(otherUser.address, 0);

			await AddressResolver.connect(owner).importAddresses(
				[toBytes32('RewardEscrowV2')],
				[RewardEscrowV2.address]
			);

			// expected manual release tasks:
			console.log('enter manual release tasks');

			// 1. End merging window
			await RewardEscrowV2Frozen.connect(owner).setAccountMergingDuration(0);

			// 2. Admin transfer all rewards to the new contract
			await Synthetix.connect(owner).migrateEscrowContractBalance();

			// all below operations will be done by some normie user
			RewardEscrowV2Frozen = RewardEscrowV2Frozen.connect(someUser);
		});

		it('reverts on call to appendVestingEntry', async () => {
			await assert.revert(
				RewardEscrowV2Frozen.appendVestingEntry(someUser.address, fakeAmount, 100),
				'Only the FeePool'
			);
		});

		it('reverts on call to startMergingWindow', async () => {
			await assert.revert(RewardEscrowV2Frozen.startMergingWindow(), 'Only the contract owner');
		});

		it('reverts on call to setAccountMergingWindowDuration', async () => {
			await assert.revert(
				RewardEscrowV2Frozen.setAccountMergingDuration(100),
				'Only the contract owner'
			);
		});

		it('reverts on call to setMaxAccountMergingWindow', async () => {
			await assert.revert(
				RewardEscrowV2Frozen.setMaxAccountMergingWindow(100),
				'Only the contract owner'
			);
		});

		it('reverts on call to setMaxAccountEscrowDuration', async () => {
			await assert.revert(
				RewardEscrowV2Frozen.setMaxEscrowDuration(100),
				'Only the contract owner'
			);
		});

		// nominate account to merge is ok

		it('reverts on call to mergeAccount', async () => {
			await assert.revert(
				RewardEscrowV2Frozen.mergeAccount(someUser.address, []),
				'Account merging has ended'
			);
		});

		// no more accounts will be migratable for migrateVestingSchedule

		it('reverts on call to migrateAccountEscrowBalances', async () => {
			await assert.revert(RewardEscrowV2Frozen.migrateAccountEscrowBalances([], [], []), 'Only');
		});

		it('reverts on call to burnForMigration', async () => {
			if (!ctx.contracts.SynthetixBridgeToOptimism) {
				this.skip();
			}

			await assert.revert(
				RewardEscrowV2Frozen.burnForMigration(otherUser.address, [fakeAmount]),
				'Can only be invoked by SynthetixBridgeToOptimism contract'
			);
		});

		// not testing import vesting entries because its only callable by bridge

		it('reverts on call to createEscrowEntry', async () => {
			await assert.revert(
				RewardEscrowV2Frozen.connect(owner.address).createEscrowEntry(
					someUser.address,
					fakeAmount,
					100
				),
				'Only the proxy can call'
			);
		});

		it('reverts on call to vest', async () => {
			await assert.revert(
				RewardEscrowV2Frozen.connect(otherUser).vest([fakeEscrowEntryId]),
				'Only the proxy can call'
			);
		});
	});

	/* describe('', () => {

    }); */
}

module.exports = {
	itDoesRewardEscrow,
};
