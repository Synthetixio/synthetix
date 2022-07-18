const ethers = require('ethers');
const chalk = require('chalk');
const { assert } = require('../../contracts/common');
const { ensureBalance } = require('../utils/balances');

// Load Compiled
const path = require('path');
const {
	toBytes32,
	constants: { BUILD_FOLDER },
} = require('../../..');
console.log('build:', BUILD_FOLDER);
const buildPath = path.join(__dirname, '..', '..', '..', `${BUILD_FOLDER}`);
console.log('buildPath', buildPath);
const { loadCompiledFiles } = require('../../../publish/src/solidity');
const { compiled } = loadCompiledFiles({ buildPath });

function itCanWrapETH({ ctx }) {
	// deploy a test wrapper
	const wrapperOptions = { Wrapper: null, Synth: null, Token: null };

	before(async () => {
		const WrapperFactory = ctx.contracts.WrapperFactory.connect(ctx.users.owner);

		const wrapperCreatedEvent = new Promise((resolve, reject) => {
			WrapperFactory.on('WrapperCreated', (token, currencyKey, wrapperAddress, event) => {
				event.removeListener();

				resolve({
					token: token,
					currencyKey: currencyKey,
					wrapperAddress: wrapperAddress,
				});
			});

			setTimeout(() => {
				reject(new Error('timeout'));
			}, 60000);
		});

		await WrapperFactory.createWrapper(
			ctx.contracts.WETH.address,
			toBytes32('sETH'),
			toBytes32('SynthsETH')
		);

		const event = await wrapperCreatedEvent;

		// extract address from events
		const etherWrapperAddress = event.wrapperAddress;

		ctx.contracts.Wrapper = new ethers.Contract(
			etherWrapperAddress,
			compiled.Wrapper.abi,
			ctx.provider
		);
		console.log('Wrapper: ', ctx.contracts.Wrapper);
		wrapperOptions.Wrapper = ctx.contracts.Wrapper;
		wrapperOptions.Synth = ctx.contracts.SynthsETH;
		wrapperOptions.Token = ctx.contracts.WETH;
	});

	describe('ether wrapping', () => {
		let user;
		let balanceToken, balanceSynth;

		let Wrapper, Token, Synth;

		const amountToMint = ethers.utils.parseEther('1');

		before('target contracts and users', async () => {
			({ Wrapper, Token, Synth } = wrapperOptions);

			user = ctx.users.someUser;
		});

		before('ensure the user has token', async () => {
			await ensureBalance({ ctx, symbol: await Token.symbol(), user, balance: amountToMint });
		});

		describe('when there is sufficient capacity in the wrapper', () => {
			before(async function() {
				const capacity = await Wrapper.capacity();
				if (capacity.lt(amountToMint)) {
					console.log(chalk.yellow('> Skipping Wrapper.mint as insufficient capacity'));
					this.skip();
				}
			});
			describe('when the user mints sETH', () => {
				before('record balances', async () => {
					balanceToken = await Token.balanceOf(user.address);
					balanceSynth = await Synth.balanceOf(user.address);
				});

				before('provide allowance', async () => {
					Token = Token.connect(user);

					const tx = await Token.approve(Wrapper.address, ethers.constants.MaxUint256);
					await tx.wait();
				});

				before('mint', async () => {
					Wrapper = Wrapper.connect(user);

					const tx = await Wrapper.mint(amountToMint);
					await tx.wait();
				});

				it('decreases the users token balance', async () => {
					assert.bnLt(await Token.balanceOf(user.address), balanceToken);
				});

				it('increases the users synth balance', async () => {
					assert.bnGt(await Synth.balanceOf(user.address), balanceSynth);
				});

				describe('when the user burns sETH', () => {
					before('record balances', async () => {
						balanceToken = await Token.balanceOf(user.address);
						balanceSynth = await Synth.balanceOf(user.address);
					});

					before('provide allowance', async () => {
						Synth = Synth.connect(user);

						const tx = await Synth.approve(Wrapper.address, ethers.constants.MaxUint256);
						await tx.wait();
					});

					before('burn', async () => {
						Wrapper = Wrapper.connect(user);

						const tx = await Wrapper.burn(balanceSynth);
						await tx.wait();
					});

					it('increases the users token balance', async () => {
						assert.bnGt(await Token.balanceOf(user.address), balanceToken);
					});

					it('decreases the users synth balance', async () => {
						assert.bnEqual(await Synth.balanceOf(user.address), ethers.constants.Zero);
					});
				});
			});
		});
	});
}

module.exports = {
	itCanWrapETH,
};
