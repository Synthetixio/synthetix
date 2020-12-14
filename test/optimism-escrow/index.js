const fs = require('fs');
const path = require('path');
const ethers = require('ethers');
const { assert } = require('../contracts/common');
const { getSource, getTarget } = require('../..');

const L1_PROVIDER_URL = 'http://localhost:9545';
const L2_PROVIDER_URL = 'http://localhost:8545';
// const DATA_PROVIDER_URL = 'http://localhost:8080';

// These addresses are set up by optimism-integration in the local chains.
// See publish/src/commands/deploy-ovm-pair.js
const OWNER_ADDRESS = '0x640e7cc27b750144ED08bA09515F3416A988B6a3';
const USER1_PRIVATE_KEY = '0x5b1c2653250e5c580dcb4e51c2944455e144c57ebd6a0645bd359d2e69ca0f0c';
const USER1_ADDRESS = '0x5eeabfdd0f31cebf32f8abf22da451fe46eac131';

const SECOND = 1000;
const MINUTE = SECOND * 60;

describe('Layer 2 production tests', () => {
	let providerL1, providerL2;

	let ownerL1, user1L1, user1L2;

	let RewardEscrowV2L1, SynthetixBridgeToOptimismL1, SynthetixL1;
	let RewardEscrowV2L2, SynthetixBridgeToBaseL2, SynthetixL2;

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

	function connectContract({ contract, source = contract, useOvm = false }) {
		const params = {
			path,
			fs,
			network: 'local',
			useOvm,
		};

		return new ethers.Contract(
			getTarget({ ...params, contract }).address,
			getSource({ ...params, contract: source }).abi,
			useOvm ? providerL2 : providerL1
		);
	}

	async function wait(seconds) {
		return new Promise(resolve => {
			setTimeout(() => {
				resolve();
			}, seconds * 1000);
		});
	}

	async function fastForward(seconds, provider) {
		await provider.send('evm_increaseTime', [seconds]);

		await provider.send('evm_mine', []);
	}

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
			SynthetixL1 = connectContract({ contract: 'Synthetix' });
			SynthetixL2 = connectContract({
				contract: 'Synthetix',
				source: 'MintableSynthetix',
				useOvm: true,
			});
			RewardEscrowV2L1 = connectContract({ contract: 'RewardEscrowV2' });
			RewardEscrowV2L2 = connectContract({
				contract: 'RewardEscrowV2',
				source: 'ImportableRewardEscrowV2',
				useOvm: true,
			});
			SynthetixBridgeToOptimismL1 = connectContract({ contract: 'SynthetixBridgeToOptimism' });
			SynthetixBridgeToBaseL2 = connectContract({
				contract: 'SynthetixBridgeToBase',
				useOvm: true,
			});
		});

		it('the initial values are the expected ones', async () => {
			assert.equal(await RewardEscrowV2L1.numVestingEntries(USER1_ADDRESS), 0);
			assert.equal(await RewardEscrowV2L1.totalEscrowedAccountBalance(USER1_ADDRESS), 0);
			assert.equal(await RewardEscrowV2L1.totalVestedAccountBalance(USER1_ADDRESS), 0);
		});

		describe('when a user owns enough SNX', () => {
			const snxAmount = ethers.utils.parseEther('100');

			before('transfer SNX to the L1 user', async () => {
				SynthetixL1 = SynthetixL1.connect(ownerL1);

				await SynthetixL1.transfer(USER1_ADDRESS, snxAmount);
			});

			it('updates user balance', async () => {
				assert.bnEqual(await SynthetixL1.balanceOf(USER1_ADDRESS), snxAmount);
			});

			describe('when the user approves the reward escrow to transfer their SNX', () => {
				before('approve reward escrow ', async () => {
					SynthetixL1 = SynthetixL1.connect(user1L1);

					await SynthetixL1.approve(RewardEscrowV2L1.address, snxAmount);
				});

				describe('when the user creates 52 escrow entries', () => {
					const escrowEntryAmount = ethers.utils.parseEther('1');
					const duration = MINUTE;
					const userEntries = [];
					const escrowNum = 52;
					let currentId;
					let totalEscrowed = ethers.BigNumber.from('0');
					before('create and append escrow entries', async () => {
						RewardEscrowV2L1 = RewardEscrowV2L1.connect(user1L1);
						for (let i = 0; i < escrowNum; i++) {
							currentId = await RewardEscrowV2L1.nextEntryId();
							await RewardEscrowV2L1.createEscrowEntry(USER1_ADDRESS, escrowEntryAmount, duration);
							userEntries[i] = currentId;
							totalEscrowed = totalEscrowed.add(escrowEntryAmount);
						}
					});

					it('Should create 52 entry IDs', async () => {
						assert.equal(userEntries.length, escrowNum);
						assert.bnEqual(await RewardEscrowV2L1.nextEntryId(), (escrowNum + 1).toString());
					});

					it('should update the L1 escrow balances', async () => {
						assert.bnEqual(
							await RewardEscrowV2L1.numVestingEntries(USER1_ADDRESS),
							escrowNum.toString()
						);
						assert.bnEqual(
							await RewardEscrowV2L1.totalEscrowedAccountBalance(USER1_ADDRESS),
							totalEscrowed
						);
						assert.bnEqual(await RewardEscrowV2L1.totalVestedAccountBalance(USER1_ADDRESS), '0');
					});

					describe('when the user has no outsanding debt on L1', () => {
						describe('when the user wants to migrate their escrow and deposit SNX', () => {
							describe('when the user has approved the L1 bridge to transfer their SNX', () => {
								const depositAmount = ethers.utils.parseEther('20');
								before('approve L1 bridge', async () => {
									SynthetixL1 = SynthetixL1.connect(user1L1);
									await SynthetixL1.approve(SynthetixBridgeToOptimismL1.address, depositAmount);
								});

								describe('when the user deposits SNX along with the migration', () => {
									let tx;
									before('call depositAndMigrateEscrow', async () => {
										SynthetixBridgeToOptimismL1 = SynthetixBridgeToOptimismL1.connect(user1L1);
										tx = await SynthetixBridgeToOptimismL1.depositAndMigrateEscrow(
											depositAmount,
											userEntries
										);
										await tx.wait();
									});

									it('should update the L1 escrow state', async () => {
										assert.bnEqual(
											await RewardEscrowV2L1.numVestingEntries(USER1_ADDRESS),
											escrowNum.toString()
										);
										assert.bnEqual(
											await RewardEscrowV2L1.totalEscrowedAccountBalance(USER1_ADDRESS),
											'0'
										);
										assert.bnEqual(
											await RewardEscrowV2L1.totalVestedAccountBalance(USER1_ADDRESS),
											'0'
										);
									});

									// it('should emit two events', async () => {
									// assert.eventEqual(tx.logs[0], 'ExportedVestingEntries', [
									// 	USER1_ADDRESS,
									// 	totalEscrowed,
									// 	[],
									// ]);
									// });

									describe('when a small period of time has elapsed', () => {
										before('wait', async () => {
											await wait(10);
										});

										it('should update the L2 escrow state', async () => {
											RewardEscrowV2L2 = RewardEscrowV2L2.connect(user1L2);
											assert.bnEqual(
												await RewardEscrowV2L2.numVestingEntries(USER1_ADDRESS),
												escrowNum.toString()
											);
											assert.bnEqual(
												await RewardEscrowV2L2.totalEscrowedAccountBalance(USER1_ADDRESS),
												totalEscrowed
											);
											assert.bnEqual(
												await RewardEscrowV2L2.totalVestedAccountBalance(USER1_ADDRESS),
												'0'
											);
										});

										it('should update the L2 Synthetix state', async () => {
											SynthetixL2 = SynthetixL2.connect(user1L2);
											assert.bnEqual(await SynthetixL2.balanceOf(USER1_ADDRESS), depositAmount);
											assert.bnEqual(
												await SynthetixL2.balanceOf(RewardEscrowV2L2.address),
												escrowNum.toString()
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
	});
});
