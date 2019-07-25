const IntegrationProxy = artifacts.require('IntegrationProxy');
const Synthetix = artifacts.require('Synthetix');
const TokenExchanger = artifacts.require('TokenExchanger');

const { toUnit } = require('../utils/testUtils');

contract.only('IntegrationProxy', async accounts => {
	const [deployerAccount, owner, account1, account2, account3] = accounts;

	let synthetix, integrationProxy, tokenExchanger;

	const [sUSD] = ['sUSD'].map(web3.utils.asciiToHex);

	beforeEach(async () => {
		// console.log('Deploying IntegrationProxy...');
		integrationProxy = await IntegrationProxy.new(owner, { from: deployerAccount });
		// console.log('IntegrationProxy Deployed:', integrationProxy.address);
		synthetix = await Synthetix.deployed();
		// console.log('synthetix.setIntegrationProxy to', integrationProxy.address);
		await synthetix.setIntegrationProxy(integrationProxy.address, { from: owner });
		// console.log('integrationProxy.setTarget to', synthetix.address);

		await integrationProxy.setTarget(synthetix.address, { from: owner });

		// Deploy an on chain exchanger
		// console.log('Deploy an on chain exchanger...');
		tokenExchanger = await TokenExchanger.new(owner, integrationProxy.address, {
			from: deployerAccount,
		});
		// console.log('tokenExchanger', tokenExchanger.address);

		// Give some SNX to account1 and account2
		await synthetix.methods['transfer(address,uint256)'](account1, toUnit('10000'), {
			from: owner,
		});
		await synthetix.methods['transfer(address,uint256)'](account2, toUnit('10000'), {
			from: owner,
		});

		// Issue 10 sUSD each
		await synthetix.issueSynths(sUSD, toUnit('10'), { from: account1 });
		await synthetix.issueSynths(sUSD, toUnit('10'), { from: account2 });
	});

	it('should setIntegrationProxy on synthetix on deployment', async () => {
		const _integrationProxyAddress = await synthetix.integrationProxy();
		assert.equal(integrationProxy.address, _integrationProxyAddress);
	});

	it('should setTarget on IntegrationProxy to synthetix on deployment', async () => {
		const integrationProxyTarget = await integrationProxy.target();
		assert.equal(synthetix.address, integrationProxyTarget);
	});

	it('should tokenExchanger has integrationProxy set on deployment', async () => {
		const _integrationProxyAddress = await tokenExchanger.integrationProxy();
		assert.equal(integrationProxy.address, _integrationProxyAddress);
	});

	describe('IntegrationProxy should adhere to ERC20 standard', async () => {
		it('should be able to query ERC20 totalSupply', async () => {
			// Get SNX totalSupply
			const snxTotalSupply = await synthetix.totalSupply();
			const proxyTotalSupply = await integrationProxy.totalSupply();
			assert.bnEqual(snxTotalSupply, proxyTotalSupply);
		});

		it('should be able to query ERC20 balanceOf', async () => {
			// Get my SNX balance
			const mySNXBalance = await synthetix.balanceOf(account1);
			const myProxyBalance = await integrationProxy.balanceOf(account1);
			assert.bnEqual(myProxyBalance, mySNXBalance);
		});

		it('should be able to call ERC20 approve', async () => {
			const amountToTransfer = toUnit('50');

			// Approve Account2 to spend 50
			const approveTX = await integrationProxy.approve(account2, amountToTransfer, {
				from: account1,
			});
			// Check for Approval event
			assert.eventEqual(approveTX, 'Approval', {
				owner: account1,
				spender: account2,
				value: amountToTransfer,
			});
			// should be able to query ERC20 allowance
			const allowance = await integrationProxy.allowance(account1, account2);

			// Assert we have the same
			assert.bnEqual(allowance, amountToTransfer);
		});

		it('should be able to call ERC20 transferFrom', async () => {
			const amountToTransfer = toUnit('33');

			// Approve Account2 to spend 50
			await integrationProxy.approve(account2, amountToTransfer, { from: account1 });

			// Get Before Transfer Balances
			const account1BalanceBefore = await synthetix.balanceOf(account1);
			const account3BalanceBefore = await synthetix.balanceOf(account3);

			// Transfer SNX
			const transferTX = await synthetix.methods['transferFrom(address,address,uint256)'](
				account1,
				account3,
				amountToTransfer,
				{
					from: account2,
				}
			);

			// Check for Transfer event
			assert.eventEqual(transferTX, 'Transfer', {
				from: account1,
				to: account3,
				value: amountToTransfer,
			});

			// Get After Transfer Balances
			const account1BalanceAfter = await synthetix.balanceOf(account1);
			const account3BalanceAfter = await synthetix.balanceOf(account3);

			// Check Balances
			assert.bnEqual(account1BalanceBefore.sub(amountToTransfer), account1BalanceAfter);
			assert.bnEqual(account3BalanceBefore.add(amountToTransfer), account3BalanceAfter);
		});

		it('should be able to call ERC20 transfer', async () => {
			const amountToTransfer = toUnit('44');

			// Get Before Transfer Balances
			const account1BalanceBefore = await synthetix.balanceOf(account1);
			const account2BalanceBefore = await synthetix.balanceOf(account2);

			// Transfer SNX
			const transferTX = await synthetix.methods['transfer(address,uint256)'](
				account2,
				amountToTransfer,
				{
					from: account1,
				}
			);

			// Check for Transfer event
			assert.eventEqual(transferTX, 'Transfer', {
				from: account1,
				to: account2,
				value: amountToTransfer,
			});

			// Get After Transfer Balances
			const account1BalanceAfter = await synthetix.balanceOf(account1);
			const account2BalanceAfter = await synthetix.balanceOf(account2);

			// Check Balances
			assert.bnEqual(account1BalanceBefore.sub(amountToTransfer), account1BalanceAfter);
			assert.bnEqual(account2BalanceBefore.add(amountToTransfer), account2BalanceAfter);
		});
	});

	describe('third party contracts', async () => {
		it('should be able to query ERC20 balanceOf', async () => {
			// Get account1 SNX balance direct
			const mySNXBalance = await synthetix.balanceOf(account1);
			// Get account1 SNX balance via ERC20 Proxy
			const myProxyBalance = await tokenExchanger.checkBalance(account1);
			// Assert Balance with no reverts
			assert.bnEqual(myProxyBalance, mySNXBalance);
		});

		it('should be able to transferFrom ERC20', async () => {
			const amountToTransfer = toUnit('77');

			// Approve tokenExchanger to spend account1 balance
			const approveTX = await integrationProxy.approve(tokenExchanger.address, amountToTransfer, {
				from: account1,
			});

			// Check for Approval event
			assert.eventEqual(approveTX, 'Approval', {
				owner: account1,
				spender: tokenExchanger.address,
				value: amountToTransfer,
			});

			// should be able to query ERC20 allowance
			const allowance = await integrationProxy.allowance(account1, tokenExchanger.address);
			// console.log('tokenExchanger.allowance', allowance.toString());
			// Assert we have the allowance
			assert.bnEqual(allowance, amountToTransfer);

			// Get Before Transfer Balances
			const account1BalanceBefore = await synthetix.balanceOf(account1);
			const account2BalanceBefore = await synthetix.balanceOf(account2);

			// tokenExchanger to transfer Account1's SNX to Account2
			const transferTX = await tokenExchanger.doTokenSpend(account1, account2, amountToTransfer);

			// TODO: NO TRANSFER EVENT GENERATED FROM doTokenSpend. Check logs
			// const events = transferTX.logs.filter(log => log.event === 'Transfer');
			// console.log(events[0]);

			// assert.eventEqual(events[0], 'Transfer', {
			// 	from: account1,
			// 	to: account2,
			// 	value: amountToTransfer,
			// });

			// Check for Transfer event
			// assert.eventEqual(transferTX, 'Transfer', {
			// from: account1,
			// to: account2,
			// value: amountToTransfer,
			// });

			// Get After Transfer Balances
			const account1BalanceAfter = await synthetix.balanceOf(account1);
			const account2BalanceAfter = await synthetix.balanceOf(account2);

			// Check Balances
			assert.bnEqual(account1BalanceBefore.sub(amountToTransfer), account1BalanceAfter);
			assert.bnEqual(account2BalanceBefore.add(amountToTransfer), account2BalanceAfter);
		});
	});
});
