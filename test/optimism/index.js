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
const USER1_ADDRESS = '0x5eeabfdd0f31cebf32f8abf22da451fe46eac131';

describe('Layer 2 production tests', () => {
	let providerL1, providerL2;

	let ownerL1, user1L1, user1L2;
	// let ownerL1, ownerL2, user1L1, user1L2;

	let SynthetixL1, SynthetixBridgeToOptimismL1;
	let SynthetixL2, SynthetixBridgeToBaseL2;

	// const zero = ethers.utils.parseEther('0');

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

	before('set up providers', () => {
		providerL1 = new ethers.providers.JsonRpcProvider(L1_PROVIDER_URL);
		providerL2 = new ethers.providers.JsonRpcProvider(L2_PROVIDER_URL);
	});

	before('set up signers', () => {
		ownerL1 = providerL1.getSigner(OWNER_ADDRESS);
		// ownerL2 = providerL2.getSigner(OWNER_ADDRESS);
		user1L1 = providerL1.getSigner(USER1_ADDRESS);
		user1L2 = providerL2.getSigner(USER1_ADDRESS);
	});

	describe('when instances have been deployed in local L1 and L2 chains', () => {
		before('connect to contracts', async () => {
			SynthetixL1 = connectContract({ contract: 'Synthetix' });
			SynthetixL2 = connectContract({
				contract: 'Synthetix',
				source: 'MintableSynthetix',
				useOvm: true,
			});
			SynthetixBridgeToOptimismL1 = connectContract({ contract: 'SynthetixBridgeToOptimism' });
			SynthetixBridgeToBaseL2 = connectContract({
				contract: 'SynthetixBridgeToBase',
				useOvm: true,
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

			describe.skip('when a user has debt in L1', () => {});

			describe('when a user doesnt have debt in L1', () => {
				describe.skip('before a user approves the L1 bridge to transfer its SNX', () => {});

				describe('when a user approves the L1 bridge to transfer its SNX', () => {
					before('approve', async () => {
						SynthetixL1 = SynthetixL1.connect(user1L1);

						await SynthetixL1.approve(
							SynthetixBridgeToOptimismL1.address,
							ethers.utils.parseEther('100000000')
						);
					});

					describe('when a user deposits SNX in the L1 bridge', () => {
						before('record current values', async () => {
							cache.bridge.l1.balance = await SynthetixL1.balanceOf(
								SynthetixBridgeToOptimismL1.address
							);

							cache.user1.l1.balance = await SynthetixL1.balanceOf(USER1_ADDRESS);
							cache.user1.l2.balance = await SynthetixL2.balanceOf(USER1_ADDRESS);
						});

						before('deposit', async () => {
							SynthetixBridgeToOptimismL1 = SynthetixBridgeToOptimismL1.connect(user1L1);

							await SynthetixBridgeToOptimismL1.deposit(amountToDeposit);
						});

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
								await wait(5);
							});

							it('shows that the users L2 balance increased', async () => {
								assert.bnEqual(
									await SynthetixL2.balanceOf(USER1_ADDRESS),
									cache.user1.l2.balance.add(amountToDeposit)
								);
							});

							describe.skip('when a user has debt in L2', () => {});

							describe.skip('when a user doesnt have debt in L2', () => {
								describe('when a user initiates a withdrawal on L2', () => {
									before('record current values', async () => {
										cache.user1.l1.balance = await SynthetixL1.balanceOf(USER1_ADDRESS);
										cache.user1.l2.balance = await SynthetixL2.balanceOf(USER1_ADDRESS);
									});

									before('initiate withdrawal', async () => {
										SynthetixBridgeToBaseL2 = SynthetixBridgeToBaseL2.connect(user1L2);

										await SynthetixBridgeToBaseL2.initiateWithdrawal(amountToDeposit);
									});

									it('reduces the users balance', async () => {
										assert.bnEqual(
											await SynthetixL2.balanceOf(USER1_ADDRESS),
											cache.user1.l2.balance.sub(amountToDeposit)
										);
									});

									describe('when a small period of time has elapsed', () => {
										before('wait', async () => {
											await wait(10);
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
	});
});
