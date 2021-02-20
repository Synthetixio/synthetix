const ethers = require('ethers');
const { assert } = require('../contracts/common');
const { connectContract } = require('./utils/connectContract');
const { toBytes32 } = require('../..');
const { assertRevertOptimism } = require('./utils/revertOptimism');

const itCanPerformSynthExchange = ({ ctx }) => {
	describe.only('[SYNTEXCHANGE] when exchanging synths on L2', () => {
		const amountToDeposit = ethers.utils.parseEther('100');

		let user1L1, user1L2;

		let SynthetixL1, SynthetixBridgeToOptimismL1;
		let SynthetixL2, SynthetixBridgeToBaseL2, SynthsUSDL2, SynthsETHL2, ExchangeStateL2;

		// --------------------------
		// Setup
		// --------------------------

		before('identify signers', async () => {
			user1L1 = ctx.providerL1.getSigner(ctx.user1Address);
			user1L1.address = ctx.user1Address;
			user1L2 = new ethers.Wallet(ctx.user1PrivateKey, ctx.providerL2);
			user1L2.address = ctx.user1Address;
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
			SynthsUSDL2 = connectContract({
				contract: 'ProxysUSD',
				source: 'Synth',
				useOvm: true,
				provider: ctx.providerL2,
			});
			SynthsETHL2 = connectContract({
				contract: 'ProxysETH',
				source: 'Synth',
				useOvm: true,
				provider: ctx.providerL2,
			});
			ExchangeStateL2 = connectContract({
				contract: 'ExchangeState',
				useOvm: true,
				provider: ctx.providerL2,
			});
		});

		// --------------------------
		// Get SNX
		// --------------------------

		describe('when a user has the expected amount of SNX in L1', () => {
			let user1BalanceL1;

			before('record current values', async () => {
				user1BalanceL1 = await SynthetixL1.balanceOf(user1L1.address);
			});

			before('ensure that the user has the expected SNX balance', async () => {
				SynthetixL1 = SynthetixL1.connect(ctx.ownerL1);

				const tx = await SynthetixL1.transfer(user1L1.address, amountToDeposit);
				await tx.wait();
			});

			it('shows the user has SNX', async () => {
				assert.bnEqual(
					await SynthetixL1.balanceOf(user1L1.address),
					user1BalanceL1.add(amountToDeposit)
				);
			});

			// --------------------------
			// Approval
			// --------------------------

			describe('when a user approves the L1 bridge to transfer its SNX', () => {
				before('approve', async () => {
					SynthetixL1 = SynthetixL1.connect(user1L1);

					const tx = await SynthetixL1.approve(
						SynthetixBridgeToOptimismL1.address,
						ethers.utils.parseEther('100000000')
					);
					await tx.wait();
				});

				// --------------------------
				// No debt
				// --------------------------

				describe('when a user doesnt have debt in L1', () => {
					let depositReceipt;

					describe('when a user deposits SNX in the L1 bridge', () => {
						let user1BalanceL2;
						let bridgeBalanceL1;

						before('record current values', async () => {
							bridgeBalanceL1 = await SynthetixL1.balanceOf(SynthetixBridgeToOptimismL1.address);

							user1BalanceL1 = await SynthetixL1.balanceOf(user1L1.address);
							user1BalanceL2 = await SynthetixL2.balanceOf(user1L1.address);
						});

						// --------------------------
						// Deposit
						// --------------------------

						const eventListener = (from, value, event) => {};

						before('listen to events on l2', async () => {
							SynthetixBridgeToBaseL2.on('MintedSecondary', eventListener);
						});

						before('deposit', async () => {
							SynthetixBridgeToOptimismL1 = SynthetixBridgeToOptimismL1.connect(user1L1);

							const tx = await SynthetixBridgeToOptimismL1.initiateDeposit(amountToDeposit);
							depositReceipt = await tx.wait();
						});

						it('shows that the users new balance L1 is reduced', async () => {
							assert.bnEqual(
								await SynthetixL1.balanceOf(user1L1.address),
								user1BalanceL1.sub(amountToDeposit)
							);
						});

						it('shows that the L1 bridge received the SNX', async () => {
							assert.bnEqual(
								await SynthetixL1.balanceOf(SynthetixBridgeToOptimismL1.address),
								bridgeBalanceL1.add(amountToDeposit)
							);
						});

						// --------------------------
						// Wait...
						// --------------------------

						describe('when waiting for the tx to complete on L2', () => {
							before('listen for completion', async () => {
								const [transactionHashL2] = await ctx.watcher.getMessageHashesFromL1Tx(
									depositReceipt.transactionHash
								);
								await ctx.watcher.getL2TransactionReceipt(transactionHashL2);
							});

							before('stop listening to events on L2', async () => {
								SynthetixBridgeToBaseL2.off('MintedSecondary', eventListener);
							});

							it('shows that the users L2 balance increased', async () => {
								assert.bnEqual(
									await SynthetixL2.balanceOf(user1L1.address),
									user1BalanceL2.add(amountToDeposit)
								);
							});

							describe('when the user issues sUSD', () => {
								before('issue sUSD', async () => {
									SynthetixL2 = SynthetixL2.connect(user1L2);

									const tx = await SynthetixL2.issueSynths(ethers.utils.parseEther('10'));
									await tx.wait();
								});

								it('shows that the user L2 sUSD balance has increased (while not having any synth balance)', async () => {
									assert.bnEqual(
										await SynthsUSDL2.balanceOf(user1L2.address),
										ethers.utils.parseEther('10')
									);
									assert.bnEqual(await SynthsETHL2.balanceOf(user1L2.address), '0');
								});

								describe('when the exchanges sUSD for sETH', () => {
									before('sETH exchange', async () => {
										const tx = await SynthetixL2.exchange(
											toBytes32('sUSD'),
											ethers.utils.parseEther('10'),
											toBytes32('sETH')
										);
										await tx.wait();
									});

									it('shows that the user L2 sETH balance has increased', async () => {
										assert.bnGte(await SynthsETHL2.balanceOf(user1L2.address), '0');
									});

									it('should not create any exchange state entries', async () => {
										assert.bnEqual(
											await ExchangeStateL2.getLengthOfEntries(user1L2.address, toBytes32('sETH')),
											'0'
										);
									});
								});

								// describe('when settling the exchange', () => {
								// 	it('reverts when trying to settle immediately after the exchange', async () => {
								// 		const tx = await SynthetixL2.settle(toBytes32('sETH'));

								// 		await assertRevertOptimism({
								// 			tx,
								// 			reason: 'Cannot settle during waiting period',
								// 			provider: ctx.providerL2,
								// 		});
								// 	});

								// before('settle', async () => {
								// 	const tx = await SynthetixL2.settle(toBytes32('sUSD'));
								// 	await tx.wait();
								// });

								// it('shows that the user L2 sETH balance has increased', async () => {
								// 	assert.bnGte(await SynthsETHL2.balanceOf(user1L2.address), '0');
								// });
								// });
							});
						});
					});
				});
			});
		});
	});
};

module.exports = {
	itCanPerformSynthExchange,
};
