const ethers = require('ethers');
const { assert, assertRevert } = require('../contracts/common');
const { wait, fastForward, takeSnapshot, restoreSnapshot, connectContract } = require('./utils');

const L1_PROVIDER_URL = 'http://localhost:9545';
const L2_PROVIDER_URL = 'http://localhost:8545';

// These addresses are set up by optimism-integration in the local chains.
// See publish/src/commands/deploy-ovm-pair.js
const OWNER_ADDRESS = '0x640e7cc27b750144ED08bA09515F3416A988B6a3';
const USER1_PRIVATE_KEY = '0x5b1c2653250e5c580dcb4e51c2944455e144c57ebd6a0645bd359d2e69ca0f0c';
const USER1_ADDRESS = '0x5eeabfdd0f31cebf32f8abf22da451fe46eac131';

describe('Layer 2 production tests', () => {
	let providerL1, providerL2;

	let ownerL1, user1L1, user1L2;

	let SynthetixL1, SynthetixBridgeToOptimismL1;
	let SynthetixL2, SynthetixBridgeToBaseL2;

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

	// --------------------------
	// Setup
	// --------------------------

	before('set up providers', () => {
		providerL1 = new ethers.providers.JsonRpcProvider(L1_PROVIDER_URL);
		providerL2 = new ethers.providers.JsonRpcProvider(L2_PROVIDER_URL);
	});

	before('set up signers', () => {
		ownerL1 = providerL1.getSigner(OWNER_ADDRESS);

		user1L1 = providerL1.getSigner(USER1_ADDRESS);
		user1L2 = new ethers.Wallet(USER1_PRIVATE_KEY, providerL2);
	});

	describe('when instances have been deployed in local L1 and L2 chains', () => {
		before('connect to contracts', async () => {
			SynthetixL1 = connectContract({ contract: 'Synthetix', provider: providerL1 });
			SynthetixL2 = connectContract({
				contract: 'Synthetix',
				source: 'MintableSynthetix',
				useOvm: true,
				provider: providerL2,
			});
			SynthetixBridgeToOptimismL1 = connectContract({
				contract: 'SynthetixBridgeToOptimism',
				provider: providerL1,
			});
			SynthetixBridgeToBaseL2 = connectContract({
				contract: 'SynthetixBridgeToBase',
				useOvm: true,
				provider: providerL2,
			});
		});

		it('shows the expected owners', async () => {
			assert.equal(await SynthetixL1.owner(), OWNER_ADDRESS);
			assert.equal(await SynthetixL2.owner(), OWNER_ADDRESS);
		});

		it('shows the instances have the expected total supplies', async () => {
			assert.bnEqual(await SynthetixL1.totalSupply(), ethers.utils.parseEther('100000000'));

			assert.bnGte(await SynthetixL2.totalSupply(), ethers.utils.parseEther('0'));
			assert.bnLt(await SynthetixL2.totalSupply(), ethers.utils.parseEther('1000000'));
		});

		// --------------------------
		// Deposit
		// --------------------------

		describe('when a user has the expected amount of SNX in L1', () => {
			const amountToDeposit = ethers.utils.parseEther('100');

			before('record current values', async () => {
				cache.user1.l1.balance = await SynthetixL1.balanceOf(USER1_ADDRESS);
			});

			before('ensure that the user has the expected SNX balance', async () => {
				SynthetixL1 = SynthetixL1.connect(ownerL1);

				await SynthetixL1.transfer(USER1_ADDRESS, amountToDeposit);
			});

			it('shows the user has SNX', async () => {
				assert.bnEqual(
					await SynthetixL1.balanceOf(USER1_ADDRESS),
					cache.user1.l1.balance.add(amountToDeposit)
				);
			});

			describe('before a user approves the L1 bridge to transfer its SNX', () => {
				it('reverts if the user attempts to depost', async () => {
					SynthetixBridgeToOptimismL1 = SynthetixBridgeToOptimismL1.connect(user1L1);

					assertRevert(SynthetixBridgeToOptimismL1.deposit(amountToDeposit), '?');
				});
			});

			describe('when a user approves the L1 bridge to transfer its SNX', () => {
				before('approve', async () => {
					SynthetixL1 = SynthetixL1.connect(user1L1);

					await SynthetixL1.approve(
						SynthetixBridgeToOptimismL1.address,
						ethers.utils.parseEther('100000000')
					);
				});

				describe.skip('when the system is suspended in L1', () => {});

				describe('when a user has debt in L1', () => {
					before('take snapshot in L1', async () => {
						snapshotId = await takeSnapshot({ provider: providerL1 });
					});
					after('restore snapshot in L1', async () => {
						await restoreSnapshot({ id: snapshotId, provider: providerL1 });
					});

					before('issue sUSD', async () => {
						SynthetixL1 = SynthetixL1.connect(USER1_ADDRESS);

						await SynthetixL1.issueSynths(1);
					});

					it('reverts when the user attempts to deposit', async () => {
						SynthetixBridgeToOptimismL1 = SynthetixBridgeToOptimismL1.connect(user1L1);

						assertRevert(
							SynthetixBridgeToOptimismL1.deposit(amountToDeposit),
							'Cannot deposit with debt'
						);
					});
				});

				describe('when a user doesnt have debt in L1', () => {
					describe('when a user deposits SNX in the L1 bridge', () => {
						before('record current values', async () => {
							cache.bridge.l1.balance = await SynthetixL1.balanceOf(
								SynthetixBridgeToBaseL2.address
							);

							cache.user1.l1.balance = await SynthetixL1.balanceOf(USER1_ADDRESS);
							cache.user1.l2.balance = await SynthetixL2.balanceOf(USER1_ADDRESS);
						});

						before('deposit', async () => {
							SynthetixBridgeToOptimismL1 = SynthetixBridgeToOptimismL1.connect(user1L1);

							await SynthetixBridgeToOptimismL1.deposit(amountToDeposit);
						});

						it.skip('emitted a Deposit event', async () => {});

						it('shows that the users new balance L1 is reduced', async () => {
							assert.bnEqual(
								await SynthetixL1.balanceOf(USER1_ADDRESS),
								cache.user1.l1.balance.sub(amountToDeposit)
							);
						});

						it('shows that the L1 bridge received the SNX', async () => {
							assert.bnEqual(
								await SynthetixL1.balanceOf(SynthetixBridgeToOptimismL1.address),
								cache.bridge.l1.balance.add(amountToDeposit)
							);
						});

						describe('when a small period of time has elapsed', () => {
							before('wait', async () => {
								await wait(10);
							});

							it('shows that the users L2 balance increased', async () => {
								assert.bnEqual(
									await SynthetixL2.balanceOf(USER1_ADDRESS),
									cache.user1.l2.balance.add(amountToDeposit)
								);
							});

							describe('when a user has debt in L2', () => {
								before('take snapshot in L1', async () => {
									snapshotId = await takeSnapshot({ provider: providerL1 });
								});
								after('restore snapshot in L1', async () => {
									await restoreSnapshot({ id: snapshotId, provider: providerL1 });
								});

								before('issue sUSD', async () => {
									SynthetixL2 = SynthetixL2.connect(USER1_ADDRESS);

									await SynthetixL2.issueSynths(1);
								});

								it('reverts when the user attempts to withdraw', async () => {
									SynthetixBridgeToBaseL2 = SynthetixBridgeToBaseL2.connect(user1L2);

									assertRevert(
										SynthetixBridgeToBaseL2.initiateWithdrawal(1),
										'Cannot withdraw with debt'
									);
								});
							});

							// --------------------------
							// Withdrawal
							// --------------------------

							describe('when a user doesnt have debt in L2', () => {
								describe.skip('when the system is suspended in L2', () => {});

								describe('when a user initiates a withdrawal on L2', () => {
									before('record current values', async () => {
										cache.user1.l1.balance = await SynthetixL1.balanceOf(USER1_ADDRESS);
										cache.user1.l2.balance = await SynthetixL2.balanceOf(USER1_ADDRESS);
									});

									before('initiate withdrawal', async () => {
										SynthetixBridgeToBaseL2 = SynthetixBridgeToBaseL2.connect(user1L2);

										const tx = await SynthetixBridgeToBaseL2.initiateWithdrawal(amountToDeposit);
										await tx.wait();
									});

									it.skip('emitted a Withdrawal event', async () => {});

									it('reduces the users balance', async () => {
										assert.bnEqual(
											await SynthetixL2.balanceOf(USER1_ADDRESS),
											cache.user1.l2.balance.sub(amountToDeposit)
										);
									});

									describe('when a small period of time has elapsed', () => {
										before('wait', async () => {
											await fastForward({ seconds: 5, provider: providerL1 });
											await wait(60);
										});

										it('shows that the users L1 balance increased', async () => {
											assert.bnEqual(
												await SynthetixL1.balanceOf(USER1_ADDRESS),
												cache.user1.l1.balance.add(amountToDeposit)
											);
										});
									});
								});
							});
						});
					});
				});
			});
		});

		// --------------------------
		// Rewards deposit
		// --------------------------

		describe.skip('when depositing rewards', () => {});

		// --------------------------
		// Deposit migration
		// --------------------------

		describe.skip('when migrating the L1 bridge', () => {});
	});

	// --------------------------
	// Utilities
	// --------------------------
});
