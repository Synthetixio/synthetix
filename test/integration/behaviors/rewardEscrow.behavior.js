const ethers = require('ethers');
const { assert } = require('../../contracts/common');
const { getCompiledArtifacts } = require('../../utils')();
const { toBytes32 } = require('../../..');
const { skipLiquidationDelay } = require('../utils/skip');

function itDoesRewardEscrow({ ctx, contract }) {
	// old escrow should be basically immutable
	describe('RewardEscrowFrozen and RewardEscrowV2', () => {
		const fakeAmount = ethers.utils.parseEther('1');

		let owner, someUser, otherUser;
		let AddressResolver, RewardEscrowV2Frozen, RewardEscrowV2, Synthetix;

		before('target contracts and users and setup', async () => {
			({ AddressResolver, RewardEscrowV2, Synthetix } = ctx.contracts);

			({ owner, someUser, otherUser } = ctx.users);

			// get the address that's configured in the resolver
			const initialFrozenAddress = await AddressResolver.requireAndGetAddress(
				toBytes32('RewardEscrowV2Frozen'),
				'missing RewardEscrowV2Frozen address'
			);

			// create an instance of frozen interface on the address so that we can work with it (it's not part of
			// normal deployment)
			RewardEscrowV2Frozen = new ethers.Contract(
				initialFrozenAddress,
				getCompiledArtifacts('RewardEscrowV2Frozen').abi,
				ctx.provider
			);

			// it should have the correct SNX address for attempted transfers
			await RewardEscrowV2Frozen.connect(owner).rebuildCache();

			// allow owner to create entries
			await Synthetix.connect(owner).approve(RewardEscrowV2.address, ethers.constants.MaxUint256);
			await Synthetix.connect(owner).approve(
				RewardEscrowV2Frozen.address,
				ethers.constants.MaxUint256
			);

			// all below operations will be done by some normie user
			RewardEscrowV2Frozen = RewardEscrowV2Frozen.connect(someUser);
			RewardEscrowV2 = RewardEscrowV2.connect(someUser);
		});

		describe('RewardEscrowFrozen calls revert', () => {
			it('reverts on call to appendVestingEntry', async () => {
				await assert.revert(
					RewardEscrowV2Frozen.appendVestingEntry(someUser.address, fakeAmount, 100),
					'Only the FeePool'
				);
			});

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

			describe('layer 1 specific methods', () => {
				before('skip on l2', async function() {
					if (!ctx.contracts.SynthetixBridgeToOptimism) {
						this.skip();
					}
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

				// nominate account to merge is ok because it doesn't alter escrow states

				it('reverts on call to mergeAccount', async () => {
					await assert.revert(
						RewardEscrowV2Frozen.mergeAccount(someUser.address, []),
						'Account merging has ended'
					);
				});

				// no more accounts will be migratable for migrateVestingSchedule

				it.skip('reverts on call to migrateAccountEscrowBalances', async () => {
					const revertMsg = `Cannot be run on this layer`;
					await assert.revert(
						RewardEscrowV2Frozen.migrateAccountEscrowBalances([], [], []),
						revertMsg
					);
				});

				it('reverts on call to burnForMigration', async () => {
					await assert.revert(
						RewardEscrowV2Frozen.burnForMigration(otherUser.address, [fakeAmount]),
						'Can only be invoked by SynthetixBridgeToOptimism contract'
					);
				});
			});

			// not testing import vesting entries on L2 because its only callable by
			// bridge (after calling burnForMigration on L1)
		});

		describe('new RewardEscrowV2 calls succeed', () => {
			let newEntryId;

			before('set owner as permitted escrow creator', async () => {
				await RewardEscrowV2.connect(owner).setPermittedEscrowCreator(owner.address, true);
			});

			it('can createEscrowEntry', async () => {
				const escrowBefore = await RewardEscrowV2.balanceOf(someUser.address);
				newEntryId = await RewardEscrowV2.nextEntryId();
				await (
					await RewardEscrowV2.connect(owner).createEscrowEntry(someUser.address, fakeAmount, 1)
				).wait();
				const escrowAfter = await RewardEscrowV2.balanceOf(someUser.address);
				assert.bnEqual(escrowAfter.sub(escrowBefore), fakeAmount);
			});

			it('can vest', async () => {
				// skip a small amount of time so that in optimism ops tool (CI L2 integration tests) entries are vestable
				await skipLiquidationDelay({ ctx });

				const balanceBefore = await Synthetix.balanceOf(someUser.address);
				const escrowBefore = await RewardEscrowV2.balanceOf(someUser.address);

				await (await RewardEscrowV2.connect(someUser).vest([newEntryId])).wait();

				const balanceAfter = await Synthetix.balanceOf(someUser.address);
				const escrowAfter = await RewardEscrowV2.balanceOf(someUser.address);

				assert.bnEqual(balanceAfter.sub(balanceBefore), fakeAmount);
				assert.bnEqual(escrowBefore.sub(escrowAfter), fakeAmount);
			});
		});
	});
}

module.exports = {
	itDoesRewardEscrow,
};
