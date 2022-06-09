const ethers = require('ethers');
const { assert } = require('../../contracts/common');
const { ensureBalance } = require('../utils/balances');

function itBehavesLikeAnERC20({ ctx, contract }) {
	describe('erc20 functionality', () => {
		let owner, user;
		let TokenImpl, TokenViaProxy;

		let userBalance;

		const amountToTransfer = ethers.utils.parseEther('1');

		before('target contracts and users', () => {
			let proxyContractName;

			if (!contract) {
				contract = 'Synthetix';
				proxyContractName = 'ProxySynthetix';
			} else {
				proxyContractName = `Proxy` + contract.replace('Synth', '');
			}

			const Proxy = ctx.contracts[proxyContractName];
			TokenImpl = ctx.contracts[contract];
			// use proxy address but token ABI
			TokenViaProxy = new ethers.Contract(Proxy.address, TokenImpl.interface, ctx.provider);

			owner = ctx.users.owner;
			user = ctx.users.someUser;
		});

		before('ensure owner balance for Token', async () => {
			const symbol = await TokenImpl.symbol();

			await ensureBalance({
				ctx,
				symbol,
				user: ctx.users.owner,
				balance: ethers.utils.parseEther('10'),
			});
		});

		before('record user balance', async () => {
			userBalance = await TokenImpl.balanceOf(user.address);
		});

		describe('when the owner transfers Tokens to the user', async () => {
			before('transfer', async () => {
				TokenViaProxy = TokenViaProxy.connect(owner);

				const tx = await TokenViaProxy.transfer(user.address, amountToTransfer);
				await tx.wait();
			});

			it('increases the users balance', async () => {
				assert.bnEqual(await TokenImpl.balanceOf(user.address), userBalance.add(amountToTransfer));
			});

			it('increases the users balance when viewed through proxy', async () => {
				assert.bnEqual(
					await TokenViaProxy.balanceOf(user.address),
					userBalance.add(amountToTransfer)
				);
			});
		});

		// SIP-238
		describe('transfers calling implementation revert', async () => {
			before('transfer', async () => {
				TokenViaProxy = TokenViaProxy.connect(owner);

				const tx = await TokenViaProxy.approve(user.address, amountToTransfer);
				await tx.wait();
			});

			it('approve using implementation succeeds', async () => {
				await TokenImpl.connect(user).approve(user.address, amountToTransfer);
			});

			it('transfer', async () => {
				await assert.revert(
					TokenImpl.connect(user).transfer(owner.address, amountToTransfer),
					'Only the proxy'
				);
			});

			it('transferFrom', async () => {
				await assert.revert(
					TokenImpl.connect(user).transferFrom(owner.address, user.address, amountToTransfer),
					'Only the proxy'
				);
			});
		});
	});
}

module.exports = {
	itBehavesLikeAnERC20,
};
