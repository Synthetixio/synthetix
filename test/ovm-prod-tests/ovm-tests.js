const ethers = require('ethers');

const { parseEther } = ethers.utils;

const { assert } = require('../contracts/common');
const testUtils = require('../utils');

describe('L1/L2 prod tests', () => {
	let setupProvider, getContract;

	const overrides = {
		gasPrice: '0',
		gasLimit: 1.5e6,
	};

	const network = 'local';

	const wallets = [];
	let l1Provider, l2Provider;

	// fetches an array of both instance contracts
	const fetchContract = ({ contract, source = contract, useOvm, user }) =>
		getContract({
			contract,
			source,
			network,
			useOvm,
			wallet: user || (useOvm ? wallets[1] : wallets[0]),
		});

	before('set up test utils', async () => {
		({ setupProvider, getContract } = testUtils());
	});

	before('setup providers and deployer wallets', async () => {
		({ wallet: wallets[0], provider: l1Provider } = setupProvider({
			providerUrl: 'http://127.0.0.1:9545',
			privateKey: '0x6fcb386bca1dd44b31a33e371a2cc26a039f72732396f2bbc88d8a50ba13fcc4',
		}));

		({ wallet: wallets[1], provider: l2Provider } = setupProvider({
			providerUrl: 'http://127.0.0.1:8545',
			privateKey: wallets[0].privateKey,
		}));
	});

	describe('when Synthetix is deployed on both layers', () => {
		let mintableSynthetix, synthetix;
		let l1InitialTotalSupply, l2InitialTotalSupply;

		before('fetch Synthetix instances', async () => {
			synthetix = fetchContract({
				contract: 'Synthetix',
				source: 'Synthetix',
				useOvm: false,
			});

			mintableSynthetix = fetchContract({
				contract: 'Synthetix',
				source: 'MintableSynthetix',
				useOvm: true,
			});

			l1InitialTotalSupply = await synthetix.totalSupply();
			l2InitialTotalSupply = await mintableSynthetix.totalSupply();
		});

		it('the totalSupply on both sides should be the expected ones', async () => {
			assert.bnEqual(l1InitialTotalSupply, parseEther('100000000'));
			assert.equal(l2InitialTotalSupply.toString(), '0');
		});

		describe('when a user owns SNX on L1', () => {
			let l1User;

			before('transfer SNX to user', async () => {
				l1User = new ethers.Wallet(ethers.Wallet.createRandom().privateKey, l1Provider);
				await (await synthetix.transfer(l1User.address, parseEther('10'), overrides)).wait();
			});

			it('should update the user balance', async () => {
				assert.bnEqual(await synthetix.balanceOf(l1User.address), parseEther('10'));
			});

			describe('when a user deposits SNX into the L1 bridge', () => {
				let l1ToL2Bridge;
				before('approve and deposit 100 SNX', async () => {
					l1ToL2Bridge = fetchContract({
						contract: 'SynthetixBridgeToOptimism',
						useOvm: false,
						user: l1User,
					});

					// user must approve SynthetixBridgeToOptimism to transfer SNX on their behalf
					await (
						await fetchContract({ contract: 'Synthetix', useOvm: false, user: l1User }).approve(
							l1ToL2Bridge.address,
							parseEther('1'),
							overrides
						)
					).wait();
					await (await l1ToL2Bridge.deposit(parseEther('1'), overrides)).wait();
				});

				it('the balances should be updated accordingly', async () => {
					assert.bnEqual(await synthetix.balanceOf(l1ToL2Bridge.address), parseEther('1'));
					assert.bnEqual(await synthetix.balanceOf(l1User.address), parseEther('9'));
				});

				describe('when the message is relayed to L2', () => {
					it('the amount should be credited', async () => {
						assert.bnEqual(await mintableSynthetix.balanceOf(l1User.address), parseEther('1'));
					});
				});

				// describe('when the user owns SNX on L2', () => {
				// 	let l2User;
				// 	before('credit user with SNX', async () => {
				// 		l2User = new ethers.Wallet(ethers.Wallet.createRandom().privateKey, l2Provider);
				// 		await (
				// 			await mintableSynthetix.transfer(l2User.address, parseEther('100'), overrides)
				// 		).wait();
				// 	});

				// 	it('the user balance should be updated accordingly', async () => {
				// 		assert.bnEqual(await mintableSynthetix.balanceOf(l2User.address), parseEther('100'));
				// 	});

				// 	describe('when the user tries to withdraw', () => {
				// 		let l2ToL1Bridge;
				// 		before('initiate withdrawal', async () => {
				// 			l2ToL1Bridge = fetchContract({
				// 				contract: 'SynthetixBridgeToBase',
				// 				useOvm: true,
				// 				user: l2User,
				// 			});
				// 			// initiate withdrawal on L2
				// 			await l2ToL1Bridge.initiateWithdrawal(parseEther('10'), overrides);
				// 		});

				// 		it('the balances should be updated accordingly', async () => {
				// 			assert.bnEqual(await mintableSynthetix.balanceOf(l2User.address), parseEther('90'));
				// 		});
				// 	});
				// });
			});
		});
	});
});
