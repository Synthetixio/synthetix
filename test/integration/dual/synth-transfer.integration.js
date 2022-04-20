const ethers = require('ethers');
const chalk = require('chalk');
const hre = require('hardhat');
const { assert } = require('../../contracts/common');
const { bootstrapDual } = require('../utils/bootstrap');
const { ensureBalance } = require('../utils/balances');
const { addAggregatorAndSetRate } = require('../utils/rates');
const { finalizationOnL2, finalizationOnL1 } = require('../utils/optimism');
const { approveIfNeeded } = require('../utils/approve');
const { toBytes32 } = require('../../..');

describe('initiateSynthTransfer() integration tests (L1, L2)', () => {
	const ctx = this;
	bootstrapDual({ ctx });

	const ETH_RATE = '1000';

	const amountToDeposit = ethers.utils.parseEther('10');

	const [sUSD, sETH] = [toBytes32('sUSD'), toBytes32('sETH')];

	let owner, ownerL2;
	let SynthsUSD, SynthsETH, SynthetixBridgeToOptimism, SystemSettings;

	let SynthsUSDL2, SynthsETHL2, SynthetixBridgeToBase, SystemSettingsL2;

	let ownerBalance, ownerL2Balance;

	let depositReceipt;

	describe.only('when the owner sends sUSD and sETH', () => {
		before('target contracts and users', () => {
			({ SynthsUSD, SynthsETH, SynthetixBridgeToOptimism, SystemSettings } = ctx.l1.contracts);
			({
				SynthsUSD: SynthsUSDL2,
				SynthsETH: SynthsETHL2,
				SynthetixBridgeToBase,
				SystemSettings: SystemSettingsL2,
			} = ctx.l2.contracts);

			owner = ctx.l1.users.owner;
			ownerL2 = ctx.l2.users.owner;
		});

		before('set system settings', async () => {
			let tx;
			tx = await SystemSettings.connect(owner).setCrossSynthTransferEnabled(sUSD, 1);
			await tx.wait();
			tx = await SystemSettings.connect(owner).setCrossSynthTransferEnabled(sETH, 1);
			await tx.wait();
			tx = await SystemSettingsL2.connect(ownerL2).setCrossSynthTransferEnabled(sUSD, 1);
			await tx.wait();
			tx = await SystemSettingsL2.connect(ownerL2).setCrossSynthTransferEnabled(sETH, 1);
			await tx.wait();
		});

		before('set rates', async () => {
			await addAggregatorAndSetRate({
				ctx: ctx.l1,
				currencyKey: sETH,
				rate: ethers.utils.parseEther(ETH_RATE),
			});

			await addAggregatorAndSetRate({
				ctx: ctx.l2,
				currencyKey: sETH,
				rate: ethers.utils.parseEther(ETH_RATE),
			});
		});

		before('ensure balance', async () => {
			await ensureBalance({
				ctx: ctx.l1,
				symbol: 'sETH',
				user: owner,
				balance: amountToDeposit.mul(2),
			});

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
				token: SynthsETH,
				owner,
				beneficiary: SynthetixBridgeToOptimism,
				amount: amountToDeposit,
			});

			await approveIfNeeded({
				token: SynthsUSD,
				owner,
				beneficiary: SynthetixBridgeToOptimism,
				amount: amountToDeposit,
			});
		});

		before('make 2 deposits', async () => {
			SynthetixBridgeToOptimism = SynthetixBridgeToOptimism.connect(owner);

			const tx = await SynthetixBridgeToOptimism.initiateSynthTransfer(
				sUSD,
				owner.address,
				amountToDeposit
			);
			await tx.wait();

			const tx2 = await SynthetixBridgeToOptimism.initiateSynthTransfer(
				sETH,
				owner.address,
				amountToDeposit
			);
			depositReceipt = await tx2.wait();
		});

		it('decreases the owner balance', async () => {
			const newOwnerBalance = await SynthsUSD.balanceOf(owner.address);

			assert.bnEqual(newOwnerBalance, ownerBalance.sub(amountToDeposit));
		});

		it('records amount sent', async () => {
			// 1 ETH = 1000 USD and we sent equal amount of each. so `amountToDeposit * 1001`
			assert.bnEqual(
				await SynthetixBridgeToOptimism.synthTransferSent(),
				amountToDeposit.mul(1001)
			);
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

				assert.bnEqual(
					await SynthsETHL2.balanceOf(owner.address),
					ownerL2Balance.add(amountToDeposit)
				);
			});

			it('records amount received', async () => {
				assert.bnEqual(
					await SynthetixBridgeToBase.synthTransferReceived(),
					amountToDeposit.mul(1001)
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
