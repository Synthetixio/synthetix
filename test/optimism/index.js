const fs = require('fs');
const path = require('path');
const ethers = require('ethers');
const { assert } = require('../contracts/common');
const { getSource, getTarget } = require('../..');

const L1_PROVIDER_URL = 'http://localhost:9545';
const L2_PROVIDER_URL = 'http://localhost:8545';
const DATA_PROVIDER_URL = 'http://localhost:8080';

// These addresses are set up by optimism-integration in the local chains
const OWNER_ADDRESS = '0x640e7cc27b750144ED08bA09515F3416A988B6a3';
const USER1_ADDRESS = '0x5eeabfdd0f31cebf32f8abf22da451fe46eac131';

describe('L1/L2 prod tests', () => {
	let provider_l1, provider_l2;

	let owner_l1, owner_l2, user1_l1;

	let Synthetix_l1, SynthetixBridgeToOptimism_l1;
	let Synthetix_l2, SynthetixBridgeToBase_l2;

	const zero = ethers.utils.parseEther('0');

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
			useOvm ? provider_l2 : provider_l1
		);
	}

	before('set up providers', () => {
		provider_l1 = new ethers.providers.JsonRpcProvider(L1_PROVIDER_URL);
		provider_l2 = new ethers.providers.JsonRpcProvider(L2_PROVIDER_URL);
	});

	before('set up signers', () => {
		owner_l1 = provider_l1.getSigner(OWNER_ADDRESS);
		owner_l2 = provider_l2.getSigner(OWNER_ADDRESS);
		user1_l1 = provider_l1.getSigner(USER1_ADDRESS);
		user1_l2 = provider_l2.getSigner(USER1_ADDRESS);
	});

	describe('when instances have been deployed in local L1 and L2 chains', () => {
		before('connect to contracts', async () => {
			Synthetix_l1 = connectContract({ contract: 'Synthetix' });
			Synthetix_l2 = connectContract({
				contract: 'Synthetix',
				source: 'MintableSynthetix',
				useOvm: true,
			});
			SynthetixBridgeToOptimism_l1 = connectContract({ contract: 'SynthetixBridgeToOptimism' });
			SynthetixBridgeToBase_l2 = connectContract({
				contract: 'SynthetixBridgeToBase',
				useOvm: true,
			});
		});

		it('shows the expected owners', async () => {
			assert.equal(await Synthetix_l1.owner(), OWNER_ADDRESS);
			assert.equal(await Synthetix_l2.owner(), OWNER_ADDRESS);
		});

		it('shows the instances have the expected total supplies', async () => {
			assert.bnEqual(await Synthetix_l1.totalSupply(), ethers.utils.parseEther('100000000'));
			assert.bnEqual(await Synthetix_l2.totalSupply(), ethers.utils.parseEther('0'));
		});

		describe('when a user has SNX in L1', () => {
			const amountToDeposit = ethers.utils.parseEther('100');

			before('ensure that the user has the expected SNX balance', async () => {
				const currentBalance = await Synthetix_l1.balanceOf(USER1_ADDRESS);
				const delta = amountToDeposit.sub(currentBalance);

				if (delta.gt(zero)) {
					Synthetix_l1 = Synthetix_l1.connect(owner_l1);

					await Synthetix_l1.transfer(USER1_ADDRESS, delta);
				} else if (delta.lt(zero)) {
					Synthetix_l1 = Synthetix_l1.connect(user1_l1);

					await Synthetix_l1.transfer(OWNER_ADDRESS, delta.abs());
				}
			});

			it('shows the user has SNX', async () => {
				assert.bnEqual(await Synthetix_l1.balanceOf(USER1_ADDRESS), amountToDeposit);
			});

			// TODO
			describe.skip('when a user has debt in L1', () => {});

			describe('when a user doesnt have debt in L1', () => {
				// TODO
				describe.skip('before a user approves the L1 bridge to transfer its SNX', () => {});

				describe('when a user approves the L1 bridge to transfer its SNX', () => {
					before('approve', async () => {
						Synthetix_l1 = Synthetix_l1.connect(user1_l1);

						await Synthetix_l1.approve(
							SynthetixBridgeToOptimism_l1.address,
							ethers.utils.parseEther('100000000')
						);
					});

					describe('when a user deposits SNX in the L1 bridge', () => {
						const bridgeBalance = {};

						before('record the deposit contracts balance', async () => {
							bridgeBalance.before = await Synthetix_l1.balanceOf(
								SynthetixBridgeToOptimism_l1.address
							);
						});

						before('deposit', async () => {
							SynthetixBridgeToOptimism_l1 = SynthetixBridgeToOptimism_l1.connect(user1_l1);

							await SynthetixBridgeToOptimism_l1.deposit(amountToDeposit);
						});

						it('shows that the users new balance is zero', async () => {
							assert.bnEqual(await Synthetix_l1.balanceOf(USER1_ADDRESS), zero);
						});

						it('shows that the bridge received the SNX', async () => {
							assert.bnEqual(
								await Synthetix_l1.balanceOf(SynthetixBridgeToOptimism_l1.address),
								bridgeBalance.before.add(amountToDeposit)
							);
						});

						it('wait', async () => {
							console.log((await Synthetix_l2.balanceOf(USER1_ADDRESS)).toString());
						});
					});
				});
			});
		});
	});

	// 		describe('when a user deposits SNX into the L1 bridge', () => {
	// 			describe('when the message is relayed to L2', () => {
	// 				it('the amount should be credited', async () => {
	// 					assert.bnEqual(await mintableSynthetix.balanceOf(l1User.address), parseEther('1'));
	// 				});
	// 			});

	// 			// describe('when the user owns SNX on L2', () => {
	// 			// 	let l2User;
	// 			// 	before('credit user with SNX', async () => {
	// 			// 		l2User = new ethers.Wallet(ethers.Wallet.createRandom().privateKey, l2Provider);
	// 			// 		await (
	// 			// 			await mintableSynthetix.transfer(l2User.address, parseEther('100'), overrides)
	// 			// 		).wait();
	// 			// 	});

	// 			// 	it('the user balance should be updated accordingly', async () => {
	// 			// 		assert.bnEqual(await mintableSynthetix.balanceOf(l2User.address), parseEther('100'));
	// 			// 	});

	// 			// 	describe('when the user tries to withdraw', () => {
	// 			// 		let l2ToL1Bridge;
	// 			// 		before('initiate withdrawal', async () => {
	// 			// 			l2ToL1Bridge = fetchContract({
	// 			// 				contract: 'SynthetixBridgeToBase',
	// 			// 				useOvm: true,
	// 			// 				user: l2User,
	// 			// 			});
	// 			// 			// initiate withdrawal on L2
	// 			// 			await l2ToL1Bridge.initiateWithdrawal(parseEther('10'), overrides);
	// 			// 		});

	// 			// 		it('the balances should be updated accordingly', async () => {
	// 			// 			assert.bnEqual(await mintableSynthetix.balanceOf(l2User.address), parseEther('90'));
	// 			// 		});
	// 			// 	});
	// 			// });
	// 		});
	// 	});
	// });
});
