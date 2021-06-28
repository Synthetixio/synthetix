const ethers = require('ethers');
const { assert } = require('../../contracts/common');
const { ensureBalance } = require('../utils/balances');

function itCanWrapETH({ ctx }) {
	describe('ether wrapping', () => {
		let user;
		let balanceWETH, balancesETH;
		let EtherWrapper, WETH, SynthsETH;

		const amountToMint = ethers.utils.parseEther('1');

		before('target contracts and users', async () => {
			({ EtherWrapper, WETH, SynthsETH } = ctx.contracts);

			user = ctx.users.someUser;
		});

		before('ensure the user has WETH', async () => {
			await ensureBalance({ ctx, symbol: 'WETH', user, balance: amountToMint });
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
}

module.exports = {
	itCanWrapETH,
};
