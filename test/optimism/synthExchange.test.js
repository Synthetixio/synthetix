const ethers = require('ethers');
const { assert } = require('../contracts/common');
const { connectContract } = require('./utils/connectContract');
const { toBytes32, getUsers } = require('../..');
const { assertRevertOptimism } = require('./utils/revertOptimism');

const itCanPerformSynthExchange = ({ ctx }) => {
	describe('[SYNTEXCHANGE] when exchanging synths on L2', () => {
		const amountToDeposit = ethers.utils.parseEther('100');

		const [sUSD, sETH] = ['sUSD', 'sETH'].map(toBytes32);
		let user1L1, user1L2;

		let SynthetixL1, SynthetixBridgeToOptimismL1;
		let SynthetixL2,
			SynthetixBridgeToBaseL2,
			SynthsUSDL2,
			SynthsETHL2,
			ExchangerL2,
			ExchangeRatesL2,
			ExchangeStateL2,
			FeePoolL2;

		let user1sETHBalanceL2, user1sUSDBalanceL2;
		let waitingPeriod;
		// --------------------------
		// Setup
		// --------------------------

		const itCanSettle = async (canSettle, synth) => {
			if (canSettle) {
				it('settles correctly', async () => {
					const tx = await SynthetixL2.settle(synth);
					const receipt = await tx.wait();
					if (!receipt) {
						throw new Error(`Transaction reverted, even though it was not supposed to.`);
					}
				});
			} else {
				it('settling reverts', async () => {
					const tx = await SynthetixL2.settle(synth);

					await assertRevertOptimism({
						tx,
						reason: 'Cannot settle during waiting',
						provider: ctx.providerL2,
					});
				});
			}
		};

		const itHasExchangeEntries = async numEntries => {
			it(`${numEntries} exchange state entries should have been created`, async () => {
				assert.bnEqual(await ExchangeStateL2.getLengthOfEntries(user1L2.address, sETH), numEntries);
			});
		};

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
			ExchangerL2 = connectContract({
				contract: 'Exchanger',
				useOvm: true,
				provider: ctx.providerL2,
			});
			ExchangeRatesL2 = connectContract({
				contract: 'ExchangeRates',
				source: 'ExchangeRatesWithoutInvPricing',
				useOvm: true,
				provider: ctx.providerL2,
			});
			ExchangeStateL2 = connectContract({
				contract: 'ExchangeState',
				useOvm: true,
				provider: ctx.providerL2,
			});
			FeePoolL2 = connectContract({
				contract: 'FeePool',
				useOvm: true,
				provider: ctx.providerL2,
			});
		});

		// --------------------------
		// Get SNX
		// --------------------------

		describe('Initial values', () => {
			before('record current values', async () => {
				user1sETHBalanceL2 = await SynthsETHL2.balanceOf(user1L2.address);
				user1sUSDBalanceL2 = await SynthsETHL2.balanceOf(user1L2.address);
				waitingPeriod = await ExchangerL2.waitingPeriodSecs();
			});

			it('the initial sETH balance is 0', async () => {
				assert.bnEqual(await SynthsETHL2.balanceOf(user1L2.address), '0');
			});
		});

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

							it('shows that the users L2 SNX balance increased', async () => {
								assert.bnEqual(
									await SynthetixL2.balanceOf(user1L1.address),
									user1BalanceL2.add(amountToDeposit)
								);
							});

							describe('when the user issues sUSD', () => {
								const sUSDIssued = ethers.utils.parseEther('10');
								before('issue sUSD', async () => {
									SynthetixL2 = SynthetixL2.connect(user1L2);

									const tx = await SynthetixL2.issueSynths(sUSDIssued);
									await tx.wait();
								});

								it('shows that the user L2 sUSD balance has increased (while all other synth balacnes remain the same)', async () => {
									assert.bnEqual(
										await SynthsUSDL2.balanceOf(user1L2.address),
										user1sUSDBalanceL2.add(sUSDIssued)
									);
									assert.bnEqual(await SynthsETHL2.balanceOf(user1L2.address), user1sETHBalanceL2);
								});

								describe('when the exchanges sUSD for sETH', () => {
									let received;
									let normalizedFee;
									before('sETH exchange and settlement', async () => {
										const tx = await SynthetixL2.exchange(sUSD, sUSDIssued, sETH);
										await tx.wait();
										const { amountReceived, fee } = await ExchangerL2.getAmountsForExchange(
											sUSDIssued,
											sUSD,
											sETH
										);
										received = amountReceived;
										normalizedFee = await ExchangeRatesL2.effectiveValue(sETH, fee, sUSD);
									});

									it('shows that the user L2 sUSD balance has decreased', async () => {
										assert.bnEqual(
											await SynthsUSDL2.balanceOf(user1L2.address),
											user1sUSDBalanceL2
										);
									});
									it('shows that the user L2 sETH balance has increased', async () => {
										assert.bnEqual(
											await SynthsETHL2.balanceOf(user1L2.address),
											user1sETHBalanceL2.add(received)
										);
									});
									it('shows that the user fees have been recorded correctly', async () => {
										const firstPeriod = await FeePoolL2.recentFeePeriods(0);

										assert.bnEqual(firstPeriod.feePeriodId, '1');
										assert.bnEqual(firstPeriod.feesToDistribute, normalizedFee);
										assert.bnEqual(firstPeriod.feesClaimed, '0');
									});
									it('shows that the fees are initially remitted to the right address(0xfeEFEEfeefEeFeefEEFEEfEeFeefEEFeeFEEFEeF)', async () => {
										// fee remittance
										const feeAddress = getUsers({ network: 'mainnet', user: 'fee' }).address;
										assert.bnEqual(await SynthsUSDL2.balanceOf(feeAddress), normalizedFee);
									});

									if (waitingPeriod > 0) {
										itHasExchangeEntries('1');
										itCanSettle(false, sETH);
										itHasExchangeEntries('1');
										// itCanSetTheWaitingPeriod('0');
									} else {
										itHasExchangeEntries('0');
										itCanSettle(true, sETH);
										// itCanSetTheWaitingPeriod('0');
									}
								});
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
