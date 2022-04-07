const ethers = require('ethers');
const chalk = require('chalk');
const hre = require('hardhat');
const { assert } = require('../../contracts/common');
const { bootstrapDual } = require('../utils/bootstrap');
const { ensureBalance } = require('../utils/balances');
const { finalizationOnL2, finalizationOnL1 } = require('../utils/optimism');
const { approveIfNeeded } = require('../utils/approve');

const { toBytes32 } = require('../../../index');

describe('initiateSynthTransfer() integration tests (L1, L2)', () => {
	const ctx = this;
	bootstrapDual({ ctx });

	const amountToDeposit = ethers.utils.parseEther('10');

	let owner;
	let SynthsUSD, SynthetixBridgeToOptimism;

	let SynthsUSDL2, SynthetixBridgeToBase;

	let ownerBalance, ownerL2Balance;

	let depositReceipt;

	const sUSD = toBytes32('sUSD');

	describe('when the owner sends sUSD', () => {
		before('target contracts and users', () => {
			({ SynthsUSD, SynthetixBridgeToOptimism } = ctx.l1.contracts);
			({ SynthsUSD: SynthsUSDL2, SynthetixBridgeToBase } = ctx.l2.contracts);

			owner = ctx.l1.users.owner;
		});

		before('ensure balance', async () => {
			await ensureBalance({
				ctx: ctx.l1,
				symbol: 'sUSD',
				user: owner,
				balance: amountToDeposit.mul(2),
			});
		});

		before('record balances', async () => {
			ownerBalance = await SynthsUSD.balanceOf(owner.address);
			ownerL2Balance = await SynthsUSDL2.balanceOf(owner.address);
		});

		before('approve if needed', async () => {
			await approveIfNeeded({
				token: SynthsUSD,
				owner,
				beneficiary: SynthetixBridgeToOptimism,
				amount: amountToDeposit,
			});
		});

		before('make the deposit', async () => {
			SynthetixBridgeToOptimism = SynthetixBridgeToOptimism.connect(owner);

			const tx = await SynthetixBridgeToOptimism.initiateSynthTransfer(
				sUSD,
				owner.address,
				amountToDeposit
			);
			depositReceipt = await tx.wait();
		});

		it('decreases the owner balance', async () => {
			const newOwnerBalance = await SynthsUSD.balanceOf(owner.address);

			assert.bnEqual(newOwnerBalance, ownerBalance.sub(amountToDeposit));
		});

		describe('when the deposit gets picked up in L2', () => {
			before('target contracts and users', () => {
				owner = ctx.l2.users.owner;
			});

			before('wait for deposit finalization', async () => {
				await finalizationOnL2({ ctx, transactionHash: depositReceipt.transactionHash });
			});

			it('increases the owner balance', async () => {
				assert.bnEqual(
					await SynthsUSDL2.balanceOf(owner.address),
					ownerL2Balance.add(amountToDeposit)
				);
			});

			describe('send back to L1', () => {
				let withdrawReceipt;
				before('transfer synths', async () => {
					SynthetixBridgeToBase = SynthetixBridgeToBase.connect(owner);

					const tx = await SynthetixBridgeToBase.initiateSynthTransfer(
						sUSD,
						owner.address,
						amountToDeposit
					);
					withdrawReceipt = await tx.wait();
				});

				it('decreases the owner balance', async () => {
					const newOwnerBalance = await SynthsUSDL2.balanceOf(owner.address);

					assert.bnEqual(newOwnerBalance, ownerL2Balance);
				});

				describe('picked up on L1', () => {
					before('wait for deposit finalization', async function() {
						if (!hre.config.debugOptimism) {
							console.log(
								chalk.yellow.bold(
									'WARNING: Skipping until ops tool relayer is stable for L1>L2 finalizations'
								)
							);
							this.skip();
						}

						await finalizationOnL1({ ctx, transactionHash: withdrawReceipt.transactionHash });
					});

					it('increases the owner balance', async () => {
						assert.bnEqual(await SynthsUSD.balanceOf(owner.address), ownerBalance);
					});
				});
			});
		});
	});
});
