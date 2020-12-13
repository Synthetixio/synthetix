
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
