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
			FeePoolL2,
			SystemSettingsL2;

		// --------------------------
		// Setup
		// --------------------------

		const itCanSettleL2 = async (canSettle, synth) => {
			describe('When the user tries to settle', () => {
				before('connect user to contract', async () => {
					SynthetixL2 = SynthetixL2.connect(user1L2);
				});
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
						await assertRevertOptimism({
							tx: SynthetixL2.settle(synth),
							reason: 'Cannot settle during waiting',
							provider: ctx.providerL2,
						});
					});
				}
			});
		};

		const itHasExchangeEntriesL2 = async numEntries => {
			describe('When checking ExhangeState', () => {
				it(`${numEntries} exchange state entries should have been created`, async () => {
					assert.bnEqual(
						await ExchangeStateL2.getLengthOfEntries(user1L2.address, sETH),
						numEntries
					);
				});
			});
		};

		const itCanSetTheWaitingPeriodL2 = async waitingPeriod => {
			describe(`When setting the waiting period to ${waitingPeriod}`, () => {
				before('setWaitingPeriod', async () => {
					SystemSettingsL2 = SystemSettingsL2.connect(ctx.ownerL2);
					const tx = await SystemSettingsL2.setWaitingPeriodSecs(waitingPeriod);
					await tx.wait();
				});

				it('waiting is set correctly', async () => {
					assert.bnEqual(await ExchangerL2.waitingPeriodSecs(), waitingPeriod);
				});
			});
		};

		const itCanExchangeUsdToEthL2 = async sUSDtoBeExchanged => {
			describe('when the user exchanges sUSD for sETH', () => {
				let received;
				let normalizedFee;
				let feeAddresssUSDBalanceL2;
				let feesToDistributeL2;
				let user1sETHBalanceL2, user1sUSDBalanceL2;
				const feeAddress = getUsers({ network: 'mainnet', user: 'fee' }).address;

				before('record current values', async () => {
					user1sETHBalanceL2 = await SynthsETHL2.balanceOf(user1L2.address);
					user1sUSDBalanceL2 = await SynthsUSDL2.balanceOf(user1L2.address);
					feeAddresssUSDBalanceL2 = await SynthsUSDL2.balanceOf(feeAddress);
					const feePeriodZero = await FeePoolL2.recentFeePeriods(0);
					feesToDistributeL2 = feePeriodZero.feesToDistribute;
				});

				before('connect user to contract', async () => {
					SynthetixL2 = SynthetixL2.connect(user1L2);
				});

				before('sUSD to sETH exchange', async () => {
					const tx = await SynthetixL2.exchange(sUSD, sUSDtoBeExchanged, sETH);
					await tx.wait();
					const { amountReceived, fee } = await ExchangerL2.getAmountsForExchange(
						sUSDtoBeExchanged,
						sUSD,
						sETH
					);
					received = amountReceived;
					normalizedFee = await ExchangeRatesL2.effectiveValue(sETH, fee, sUSD);
				});

				it('shows that the user L2 sUSD balance has decreased', async () => {
					assert.bnEqual(
						await SynthsUSDL2.balanceOf(user1L2.address),
						user1sUSDBalanceL2.sub(sUSDtoBeExchanged)
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
					assert.bnEqual(firstPeriod.feesToDistribute, feesToDistributeL2.add(normalizedFee));
					assert.bnEqual(firstPeriod.feesClaimed, '0');
				});
				it('shows that the fees are initially remitted to the right address(0xfeEFEEfeefEeFeefEEFEEfEeFeefEEFeeFEEFEeF)', async () => {
					// fee remittance
					assert.bnEqual(
						await SynthsUSDL2.balanceOf(feeAddress),
						feeAddresssUSDBalanceL2.add(normalizedFee)
					);
				});
			});
		};

		const itCanIssueL2 = async sUSDIssued => {
			describe('When the user issues sUSD', () => {
				let user1sETHBalanceL2, user1sUSDBalanceL2;
				before('connect user to contract', async () => {
					SynthetixL2 = SynthetixL2.connect(user1L2);
				});
				before('record current values', async () => {
					user1sETHBalanceL2 = await SynthsETHL2.balanceOf(user1L2.address);
					user1sUSDBalanceL2 = await SynthsUSDL2.balanceOf(user1L2.address);
				});

				before(`issue ${sUSDIssued} sUSD`, async () => {
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
			SystemSettingsL2 = connectContract({
				contract: 'SystemSettings',
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
						let depositFinalizedEvent;

						before('record current values', async () => {
							user1BalanceL1 = await SynthetixL1.balanceOf(user1L1.address);
							user1BalanceL2 = await SynthetixL2.balanceOf(user1L1.address);
						});

						// --------------------------
						// Deposit
						// --------------------------

						const eventListener = (from, value, event) => {
							if (event && event.event === 'DepositFinalized') {
								depositFinalizedEvent = event;
							}
						};

						before('listen to events on l2', async () => {
							SynthetixBridgeToBaseL2.on('DepositFinalized', eventListener);
						});

						before('deposit', async () => {
							SynthetixBridgeToOptimismL1 = SynthetixBridgeToOptimismL1.connect(user1L1);

							const tx = await SynthetixBridgeToOptimismL1.deposit(amountToDeposit);
							depositReceipt = await tx.wait();
						});

						it('shows that the users new balance L1 is reduced', async () => {
							assert.bnEqual(
								await SynthetixL1.balanceOf(user1L1.address),
								user1BalanceL1.sub(amountToDeposit)
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
								SynthetixBridgeToBaseL2.off('DepositFinalized', eventListener);
							});

							it('emitted a DepositFinalized event', async () => {
								assert.exists(depositFinalizedEvent);
								assert.bnEqual(depositFinalizedEvent.args._amount, amountToDeposit);
								assert.equal(depositFinalizedEvent.args._to, user1L1.address);
							});

							it('shows that the users L2 SNX balance increased', async () => {
								assert.bnEqual(
									await SynthetixL2.balanceOf(user1L1.address),
									user1BalanceL2.add(amountToDeposit)
								);
							});

							describe('When the waiting period is 0', () => {
								const sUSDIssued = ethers.utils.parseEther('10');
								itCanSetTheWaitingPeriodL2('0');
								itCanIssueL2(sUSDIssued);
								itCanExchangeUsdToEthL2(sUSDIssued);
								// since the waiting period is 0 is should skip creating exchange entries (SIP-118)
								itHasExchangeEntriesL2('0');
								// since the waiting period is 0 it settle should not fail, it just has no effect
								itCanSettleL2(true, sETH);
							});

							describe('When the waiting period is greater than 0', () => {
								const sUSDIssued = ethers.utils.parseEther('10');
								itCanSetTheWaitingPeriodL2('360');
								itCanIssueL2(sUSDIssued);
								itCanExchangeUsdToEthL2(sUSDIssued);
								// since the waiting period is gt 0 it should have created exchange entries
								itHasExchangeEntriesL2('1');
								// since the waiting period is gt 0 it should not be possible to settle immediately, hence the fist argument is false
								// itCanSettleL2(false, sETH);
								// since settlement fails, the entries should persist
								itHasExchangeEntriesL2('1');
								// set the waiting period to 0
								itCanSetTheWaitingPeriodL2('0');
								// it should be able to settle now!
								itCanSettleL2(true, sETH);
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
