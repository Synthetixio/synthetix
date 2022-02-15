'use strict';

const { artifacts, contract, web3 } = require('hardhat');

const { assert } = require('./common');

const TokenExchanger = artifacts.require('TokenExchanger');

const { toBytes32 } = require('../..');
const { mockToken } = require('./setup');
const { toUnit } = require('../utils')();
const { ensureOnlyExpectedMutativeFunctions, proxyThruTo } = require('./helpers');

contract('ProxyERC20', async accounts => {
	const [, owner, account1, account2, account3] = accounts;

	const name = 'Some name';
	const symbol = 'ABBA';

	let proxyERC20, token;
	beforeEach(async () => {
		({ proxy: proxyERC20, token } = await mockToken({
			accounts,
			name,
			symbol,
			supply: 1e6,
		}));

		// Give some tokens to account1 and account2
		await token.transfer(account1, toUnit('10000'), {
			from: owner,
		});
		await token.transfer(account2, toUnit('10000'), {
			from: owner,
		});
	});

	it('only known functions are mutative', () => {
		ensureOnlyExpectedMutativeFunctions({
			abi: proxyERC20.abi,
			ignoreParents: ['Proxy'],
			hasFallback: true,
			expected: ['transfer', 'transferFrom', 'approve'],
		});
	});

	it('Must pass through to underlying via fallback function and emit on proxy', async () => {
		const txn = await proxyThruTo({
			proxy: proxyERC20,
			target: token,
			fncName: 'somethingToBeProxied',
			args: ['666', toBytes32('MIME')],
			from: account3,
		});

		// get rawLogs as logs not decoded because the truffle cannot decode the events from the
		// underlying from the proxy invocation
		const { topics } = txn.receipt.rawLogs[0];
		// PublicEST.somethingToBeProxied emits messageSender as the first topic and the input args
		// as the following two (all indexed so they become topics), so assert they are correct
		assert.equal(topics[1], web3.eth.abi.encodeParameter('address', account3));
		assert.equal(topics[2], web3.eth.abi.encodeParameter('uint256', '666'));
		assert.equal(topics[3], web3.eth.abi.encodeParameter('bytes32', toBytes32('MIME')));
	});

	describe('ProxyERC20 should adhere to ERC20 standard', async () => {
		it('should be able to query optional ERC20 name', async () => {
			const name = await token.name();
			const proxyName = await proxyERC20.name();
			assert.bnEqual(proxyName, name);
		});
		it('should be able to query optional ERC20 symbol', async () => {
			const symbol = await token.symbol();
			const proxySymbol = await proxyERC20.symbol();
			assert.bnEqual(proxySymbol, symbol);
		});
		it('should be able to query optional ERC20 decimals', async () => {
			const decimals = await token.decimals();
			const proxyDecimals = await proxyERC20.decimals();
			assert.bnEqual(proxyDecimals, decimals);
		});
		it('should be able to query ERC20 totalSupply', async () => {
			const totalSupply = await token.totalSupply();
			const proxyTotalSupply = await proxyERC20.totalSupply();
			assert.bnEqual(proxyTotalSupply, totalSupply);
		});
		it('should be able to query ERC20 balanceOf', async () => {
			const balance = await token.balanceOf(account1);
			const myProxyBalance = await proxyERC20.balanceOf(account1);
			assert.bnEqual(myProxyBalance, balance);
		});

		it('should be able to call ERC20 approve', async () => {
			const amountToTransfer = toUnit('50');

			// Approve Account2 to spend 50
			const approveTX = await proxyERC20.approve(account2, amountToTransfer, {
				from: account1,
			});
			// Check for Approval event
			assert.eventEqual(approveTX, 'Approval', {
				owner: account1,
				spender: account2,
				value: amountToTransfer,
			});
			// should be able to query ERC20 allowance
			const allowance = await proxyERC20.allowance(account1, account2);

			// Assert we have the same
			assert.bnEqual(allowance, amountToTransfer);
		});

		it('should be able to call ERC20 transferFrom', async () => {
			const amountToTransfer = toUnit('33');

			// Approve Account2 to spend 50
			await proxyERC20.approve(account2, amountToTransfer, { from: account1 });

			// Get Before Transfer Balances
			const account1BalanceBefore = await token.balanceOf(account1);
			const account3BalanceBefore = await token.balanceOf(account3);

			// Transfer
			const transferTX = await token.transferFrom(account1, account3, amountToTransfer, {
				from: account2,
			});

			// Check for Transfer event
			assert.eventEqual(transferTX, 'Transfer', {
				from: account1,
				to: account3,
				value: amountToTransfer,
			});

			// Get After Transfer Balances
			const account1BalanceAfter = await token.balanceOf(account1);
			const account3BalanceAfter = await token.balanceOf(account3);

			// Check Balances
			assert.bnEqual(account1BalanceBefore.sub(amountToTransfer), account1BalanceAfter);
			assert.bnEqual(account3BalanceBefore.add(amountToTransfer), account3BalanceAfter);
		});

		it('should be able to call ERC20 transfer', async () => {
			const amountToTransfer = toUnit('44');

			// Get Before Transfer Balances
			const account1BalanceBefore = await token.balanceOf(account1);
			const account2BalanceBefore = await token.balanceOf(account2);

			const transferTX = await token.transfer(account2, amountToTransfer, {
				from: account1,
			});

			// Check for Transfer event
			assert.eventEqual(transferTX, 'Transfer', {
				from: account1,
				to: account2,
				value: amountToTransfer,
			});

			// Get After Transfer Balances
			const account1BalanceAfter = await token.balanceOf(account1);
			const account2BalanceAfter = await token.balanceOf(account2);

			// Check Balances
			assert.bnEqual(account1BalanceBefore.sub(amountToTransfer), account1BalanceAfter);
			assert.bnEqual(account2BalanceBefore.add(amountToTransfer), account2BalanceAfter);
		});
	});

	describe('when third party contracts interact with our proxy', async () => {
		let thirdPartyExchanger;

		beforeEach(async () => {
			thirdPartyExchanger = await TokenExchanger.new(owner, proxyERC20.address);
		});

		it('should be able to query ERC20 balanceOf', async () => {
			// Get account1 MIME balance direct
			const balance = await token.balanceOf(account1);
			// Get account1 balance via ERC20 Proxy
			const thirdPartybalance = await thirdPartyExchanger.checkBalance(account1);
			// Assert Balance with no reverts
			assert.bnEqual(thirdPartybalance, balance);
		});

		it('should be able to transferFrom ERC20', async () => {
			const amountToTransfer = toUnit('77');

			// Approve tokenExchanger to spend account1 balance
			const approveTX = await proxyERC20.approve(thirdPartyExchanger.address, amountToTransfer, {
				from: account1,
			});

			// Check for Approval event
			assert.eventEqual(approveTX, 'Approval', {
				owner: account1,
				spender: thirdPartyExchanger.address,
				value: amountToTransfer,
			});

			// should be able to query ERC20 allowance
			const allowance = await proxyERC20.allowance(account1, thirdPartyExchanger.address);

			// Assert we have the allowance
			assert.bnEqual(allowance, amountToTransfer);

			// Get Before Transfer Balances
			const account1BalanceBefore = await token.balanceOf(account1);
			const account2BalanceBefore = await token.balanceOf(account2);

			// tokenExchanger to transfer Account1's token to Account2
			await thirdPartyExchanger.doTokenSpend(account1, account2, amountToTransfer);

			// Get After Transfer Balances
			const account1BalanceAfter = await token.balanceOf(account1);
			const account2BalanceAfter = await token.balanceOf(account2);

			// Check Balances
			assert.bnEqual(account1BalanceBefore.sub(amountToTransfer), account1BalanceAfter);
			assert.bnEqual(account2BalanceBefore.add(amountToTransfer), account2BalanceAfter);
		});
	});
});
