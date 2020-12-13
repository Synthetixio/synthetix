const ethers = require('ethers');
const { assert } = require('../contracts/common');
const { connectContract } = require('./utils/connectContract');
const { wait, takeSnapshot, restoreSnapshot } = require('./utils/rpc');

const itCanPerformWithdrawals = ({ ctx }) => {
	describe('when migrating SNX from L2 to L1', () => {
		// --------------------------
		// Setup
		// --------------------------

		const amountToWithdraw = ethers.utils.parseEther('100');

		let user1Address, user1L1, user1L2;

		let SynthetixL1, SynthetixL2;
		let SynthetixBridgeToOptimismL1, SynthetixBridgeToBaseL2;

		let snapshotId;

		const cache = {
			bridge: {
				l1: { balance: 0 },
				l2: { balance: 0 },
			},
			user1: {
				l1: { balance: 0 },
				l2: { balance: 0 },
			},
		};

		before('identify signers', async () => {
			// users
			// See publish/src/commands/deploy-ovm-pair.js
			user1Address = '0x5eeabfdd0f31cebf32f8abf22da451fe46eac131';

			user1L1 = ctx.providerL1.getSigner(user1Address);
			user1L2 = new ethers.Wallet('0x5b1c2653250e5c580dcb4e51c2944455e144c57ebd6a0645bd359d2e69ca0f0c', ctx.providerL2);
		});

		before('connect to contracts', async () => {
			// L1
			SynthetixL1 = connectContract({ contract: 'Synthetix', provider: ctx.providerL1 });
			SynthetixBridgeToOptimismL1 = connectContract({
				contract: 'SynthetixBridgeToOptimism',
				provider: ctx.providerL1,
			});

			// L2
			SynthetixL2 = connectContract({
				contract: 'Synthetix',
				source: 'MintableSynthetix',
				useOvm: true,
				provider: ctx.providerL2,
			});
			SynthetixBridgeToBaseL2 = connectContract({
				contract: 'SynthetixBridgeToBase',
				useOvm: true,
				provider: ctx.providerL2,
			});
		});

		// --------------------------
		// Get SNX
		// --------------------------

		describe('when a user has the expected amount of SNX in L2', () => {
			before('record current values', async () => {
				cache.user1.l2.balance = await SynthetixL2.balanceOf(user1Address);
			});

			before('ensure that the user has the expected SNX balance', async () => {
				SynthetixL2 = SynthetixL2.connect(ctx.ownerL2);

				await SynthetixL2.transfer(user1Address, amountToWithdraw);
			});

			it('shows the user has SNX', async () => {
				assert.bnEqual(
					await SynthetixL2.balanceOf(user1Address),
					cache.user1.l2.balance.add(amountToWithdraw)
				);
			});
		});
	});
};

module.exports = {
	itCanPerformWithdrawals,
};

// 							// TODO
// 							describe.skip('when a user has debt in L2', () => {
// 								before('take snapshot in L1', async () => {
// 									snapshotId = await takeSnapshot({ provider: providerL1 });
// 								});
// 								after('restore snapshot in L1', async () => {
// 									await restoreSnapshot({ id: snapshotId, provider: providerL1 });
// 								});

// 								before('issue sUSD', async () => {
// 									SynthetixL2 = SynthetixL2.connect(user1L1);

// 									await SynthetixL2.issueSynths(1);
// 								});

// 								it('reverts when the user attempts to withdraw', async () => {
// 									SynthetixBridgeToBaseL2 = SynthetixBridgeToBaseL2.connect(user1L2);

// 									await assert.revert(
// 										SynthetixBridgeToBaseL2.initiateWithdrawal(1),
// 										'Cannot withdraw with debt'
// 									);
// 								});
// 							});

						// describe('when a user doesnt have debt in L2', () => {
						// 	describe.skip('when the system is suspended in L2', () => {});

						// 	describe('when a user initiates a withdrawal on L2', () => {
						// 		before('record current values', async () => {
						// 			cache.user1.l1.balance = await SynthetixL1.balanceOf(USER1_ADDRESS);
						// 			cache.user1.l2.balance = await SynthetixL2.balanceOf(USER1_ADDRESS);
						// 		});

						// 		before('initiate withdrawal', async () => {
						// 			SynthetixBridgeToBaseL2 = SynthetixBridgeToBaseL2.connect(user1L2);

						// 			const tx = await SynthetixBridgeToBaseL2.initiateWithdrawal(amountToDeposit);
						// 			await tx.wait();
						// 		});

						// 		it.skip('emitted a Withdrawal event', async () => {});

						// 		it('reduces the users balance', async () => {
						// 			assert.bnEqual(
						// 				await SynthetixL2.balanceOf(USER1_ADDRESS),
						// 				cache.user1.l2.balance.sub(amountToDeposit)
						// 			);
						// 		});

						// 		describe('when a small period of time has elapsed', () => {
						// 			before('wait', async () => {
						// 				await fastForward({ seconds: 5, provider: providerL1 });
						// 				await wait(60);
						// 			});

						// 			it('shows that the users L1 balance increased', async () => {
						// 				assert.bnEqual(
						// 					await SynthetixL1.balanceOf(USER1_ADDRESS),
						// 					cache.user1.l1.balance.add(amountToDeposit)
						// 				);
						// 			});
						// 		});
						// 	});
						// });
