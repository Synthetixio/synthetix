const ethers = require('ethers');
const { bootstrapL1 } = require('../utils/bootstrap');
const { assert } = require('../../contracts/common');

describe('EtherWrapper integration tests (L1)', () => {
	const ctx = this;
	bootstrapL1({ ctx });

	describe('ether wrapping', () => {
		let user;
		let balanceWETH, balancesETH;
		let EtherWrapper, WETH, SynthsETH;

		const amountToMint = ethers.utils.parseEther('1');

		before('target contracts and users', async () => {
			({ EtherWrapper, WETH, SynthsETH } = ctx.contracts);

			user = ctx.users.someUser;
		});

		describe('when the user has ETH', () => {
			before('ensure the user has ETH', async () => {
				// TODO: On local l1, user will have ETH, but not on local l2, and l1 forks.
			});

			describe('when the user deposits ETH to get WETH', () => {
				before('record balances', async () => {
					balanceWETH = await WETH.balanceOf(user.address);
				});

				before('deposit ETH if needed', async () => {
					WETH = WETH.connect(user);

					if (balanceWETH.lt(amountToMint)) {
						const tx = await WETH.deposit({
							value: amountToMint,
						});

						await tx.wait();
					}
				});

				describe('when the user mints sETH', () => {
					before('record balances', async () => {
						balanceWETH = await WETH.balanceOf(user.address);
						balancesETH = await SynthsETH.balanceOf(user.address);
					});

					before('provide allowance', async () => {
						WETH = WETH.connect(user);

						const tx = await WETH.approve(EtherWrapper.address, ethers.constants.MaxUint256);
						await tx.wait();
					});

					before('mint', async () => {
						EtherWrapper = EtherWrapper.connect(user);

						const tx = await EtherWrapper.mint(amountToMint);
						await tx.wait();
					});

					it('decreases the users WETH balance', async () => {
						assert.bnLt(await WETH.balanceOf(user.address), balanceWETH);
					});

					it('increases the users sETH balance', async () => {
						assert.bnGt(await SynthsETH.balanceOf(user.address), balancesETH);
					});

					describe('when the user burns sETH', () => {
						before('record balances', async () => {
							balanceWETH = await WETH.balanceOf(user.address);
							balancesETH = await SynthsETH.balanceOf(user.address);
						});

						before('provide allowance', async () => {
							SynthsETH = SynthsETH.connect(user);

							const tx = await SynthsETH.approve(EtherWrapper.address, ethers.constants.MaxUint256);
							await tx.wait();
						});

						before('burn', async () => {
							EtherWrapper = EtherWrapper.connect(user);

							const tx = await EtherWrapper.burn(balancesETH);
							await tx.wait();
						});

						it('increases the users WETH balance', async () => {
							assert.bnGt(await WETH.balanceOf(user.address), balanceWETH);
						});

						it('decreases the users sETH balance', async () => {
							assert.bnEqual(await SynthsETH.balanceOf(user.address), ethers.constants.Zero);
						});
					});
				});
			});
		});
	});
});
