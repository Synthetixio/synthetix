const ethers = require('ethers');
const { assert } = require('../contracts/common');
const { connectContract } = require('./utils/connectContract');
const { wait, takeSnapshot, restoreSnapshot } = require('./utils/rpc');

const itCanPerformDeposits = ({ ctx }) => {
	describe('when migrating SNX from L1 to L2', () => {
		// --------------------------
		// Setup
		// --------------------------

		const amountToDeposit = ethers.utils.parseEther('100');

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

		describe('when a user has the expected amount of SNX in L1', () => {
			before('record current values', async () => {
				cache.user1.l1.balance = await SynthetixL1.balanceOf(user1Address);
			});

			before('ensure that the user has the expected SNX balance', async () => {
				SynthetixL1 = SynthetixL1.connect(ctx.ownerL1);

				await SynthetixL1.transfer(user1Address, amountToDeposit);
			});

			it('shows the user has SNX', async () => {
				assert.bnEqual(
					await SynthetixL1.balanceOf(user1Address),
					cache.user1.l1.balance.add(amountToDeposit)
				);
			});

			// --------------------------
			// No approval
			// --------------------------

			describe('before a user approves the L1 bridge to transfer its SNX', () => {
				before('make sure approval is zero', async () => {
					SynthetixL1 = SynthetixL1.connect(user1L1);

					await SynthetixL1.approve(
						SynthetixBridgeToOptimismL1.address,
						ethers.utils.parseEther('0')
					);
				});

				it('reverts if the user attempts to initiate a deposit', async () => {
					SynthetixBridgeToOptimismL1 = SynthetixBridgeToOptimismL1.connect(user1L1);

					await assert.revert(
						SynthetixBridgeToOptimismL1.initiateDeposit(amountToDeposit),
						'subtraction overflow'
					);
				});
			});

			// --------------------------
			// Approval
			// --------------------------

			describe('when a user approves the L1 bridge to transfer its SNX', () => {
				before('approve', async () => {
					SynthetixL1 = SynthetixL1.connect(user1L1);

					await SynthetixL1.approve(
						SynthetixBridgeToOptimismL1.address,
						ethers.utils.parseEther('100000000')
					);
				});

				// --------------------------
				// Suspended
				// --------------------------

				// TODO: Implement
				describe.skip('when the system is suspended in L1', () => {});

				// --------------------------
				// With debt
				// --------------------------

				describe('when a user has debt in L1', () => {
					before('take snapshot in L1', async () => {
						snapshotId = await takeSnapshot({ provider: ctx.providerL1 });
					});

					after('restore snapshot in L1', async () => {
						await restoreSnapshot({ id: snapshotId, provider: ctx.providerL1 });
					});

					before('issue sUSD', async () => {
						SynthetixL1 = SynthetixL1.connect(user1L1);

						await SynthetixL1.issueSynths(1);
					});

					it('reverts when the user attempts to deposit', async () => {
						SynthetixBridgeToOptimismL1 = SynthetixBridgeToOptimismL1.connect(user1L1);

						await assert.revert(
							SynthetixBridgeToOptimismL1.initiateDeposit(amountToDeposit),
							'Cannot deposit with debt'
						);
					});
				});

				// --------------------------
				// No debt
				// --------------------------

				describe('when a user doesnt have debt in L1', () => {
					describe('when a user deposits SNX in the L1 bridge', () => {
						before('record current values', async () => {
							cache.bridge.l1.balance = await SynthetixL1.balanceOf(
								SynthetixBridgeToOptimismL1.address
							);

							cache.user1.l1.balance = await SynthetixL1.balanceOf(user1Address);
							cache.user1.l2.balance = await SynthetixL2.balanceOf(user1Address);
						});

						// --------------------------
						// Deposit
						// --------------------------

						before('deposit', async () => {
							SynthetixBridgeToOptimismL1 = SynthetixBridgeToOptimismL1.connect(user1L1);

							await SynthetixBridgeToOptimismL1.initiateDeposit(amountToDeposit);
						});

						// TODO: Implement
						it.skip('emitted a Deposit event', async () => {});

						it('shows that the users new balance L1 is reduced', async () => {
							assert.bnEqual(
								await SynthetixL1.balanceOf(user1Address),
								cache.user1.l1.balance.sub(amountToDeposit)
							);
						});

						it('shows that the L1 bridge received the SNX', async () => {
							assert.bnEqual(
								await SynthetixL1.balanceOf(SynthetixBridgeToOptimismL1.address),
								cache.bridge.l1.balance.add(amountToDeposit)
							);
						});

						// --------------------------
						// Wait...
						// --------------------------

						// TODO: Relayer doesn't seem to be passing messages...
						describe.skip('when a small period of time has elapsed', () => {
							before('wait', async () => {
								// await fastForward({ seconds: 5, provider: providerL1 });
								await wait(10);
							});

							it('shows that the users L2 balance increased', async () => {
								assert.bnEqual(
									await SynthetixL2.balanceOf(user1Address),
									cache.user1.l2.balance.add(amountToDeposit)
								);
							});
						});
					});
				});
			});
		});
	});
};

module.exports = {
	itCanPerformDeposits,
};
