'use strict';

const { ethers, contract, artifacts } = require('hardhat');

const { assert } = require('./common');
const { ensureOnlyExpectedMutativeFunctions } = require('./helpers');

contract('ProxyFuturesV2', async accounts => {
	// Signers
	let owner, user;

	// Real contracts
	let ProxyFuturesV2, SampleTarget, SampleRouted1, SampleRouted2;

	// Other mocked stuff
	const mockedAddress1 = ethers.Wallet.createRandom().address;
	const mockedAddress2 = ethers.Wallet.createRandom().address;

	beforeEach(async () => {
		let factory;
		[owner, user] = await ethers.getSigners();

		factory = await ethers.getContractFactory('ProxyFuturesV2', owner);
		ProxyFuturesV2 = await factory.deploy(owner.address);

		// Using TestableAddressSet as a generic target contract
		factory = await ethers.getContractFactory('TestableAddressSet', owner);
		SampleTarget = await factory.deploy();

		factory = await ethers.getContractFactory('TestableAddressSet', owner);
		SampleRouted1 = await factory.deploy();

		factory = await ethers.getContractFactory('TestableAddressSet', owner);
		SampleRouted2 = await factory.deploy();

		await SampleRouted1.add(mockedAddress1);
		await SampleRouted2.add(mockedAddress2);
	});

	it('only known functions are mutative', () => {
		ensureOnlyExpectedMutativeFunctions({
			abi: artifacts.require('ProxyFuturesV2').abi,
			ignoreParents: ['Owned'],
			hasFallback: true,
			expected: ['addRoute', 'removeRoute', 'setTarget', '_emit'],
		});
	});

	describe('only the owner can call owned protected functions', async () => {
		describe('when calling setTarget', () => {
			it('reverts calling it by a normal user', async () => {
				await assert.revert(
					ProxyFuturesV2.connect(user).setTarget(SampleTarget.address),
					'Only the contract owner may perform this action'
				);
			});

			it('sets the target when the user is the owner', async () => {
				await ProxyFuturesV2.connect(owner).setTarget(SampleTarget.address);
				assert.equal(await ProxyFuturesV2.target(), SampleTarget.address);
			});
		});

		describe('when calling addRoute', () => {
			it('reverts calling it by a normal user', async () => {
				await assert.revert(
					ProxyFuturesV2.connect(user).addRoute('0x00112233', SampleRouted1.address, false),
					'Only the contract owner may perform this action'
				);
			});

			it('sets a route when the user is the owner', async () => {
				const initialRouteLen = await ProxyFuturesV2.getRoutesLength();
				await ProxyFuturesV2.connect(owner).addRoute('0x00112233', SampleRouted1.address, false);

				assert.equal(
					(await ProxyFuturesV2.getRoutesLength()).toString(),
					initialRouteLen.add(1).toString()
				);
			});
		});

		describe('when calling removeRoute', () => {
			beforeEach('add a sample route to remove', async () => {
				await ProxyFuturesV2.connect(owner).addRoute('0x00112233', SampleRouted1.address, false);
			});

			it('reverts calling it by a normal user', async () => {
				await assert.revert(
					ProxyFuturesV2.connect(user).removeRoute('0x00112233'),
					'Only the contract owner may perform this action'
				);
			});

			it('removes a route when the user is the owner', async () => {
				const initialRouteLen = await ProxyFuturesV2.getRoutesLength();

				await ProxyFuturesV2.connect(owner).removeRoute('0x00112233');

				assert.equal(
					(await ProxyFuturesV2.getRoutesLength()).toString(),
					initialRouteLen.sub(1).toString()
				);
			});
		});
	});

	describe('only targets can call target protected functions', async () => {
		describe('when calling _emit', () => {
			let TestableProxyable;

			beforeEach('setup proxyable contract', async () => {
				const factory = await ethers.getContractFactory('TestableProxyable', owner);
				TestableProxyable = await factory.deploy(ProxyFuturesV2.address, owner.address);
			});

			it('emits an event if the contract is the target', async () => {
				await ProxyFuturesV2.connect(owner).setTarget(TestableProxyable.address);

				const receipt = await (await TestableProxyable.emitSomeEvent()).wait();

				assert.equal(receipt.events.length, 1);
			});

			it('emits an event if the contract is in the targeted routes', async () => {
				await ProxyFuturesV2.connect(owner).addRoute(
					'0x00112233',
					TestableProxyable.address,
					false
				);

				const receipt = await (await TestableProxyable.emitSomeEvent()).wait();

				assert.equal(receipt.events.length, 1);
			});

			it('reverts calling it by a not enabled contract', async () => {
				await assert.revert(TestableProxyable.emitSomeEvent(), 'Must be a proxy target');
			});
		});
	});

	describe('when is not configured', async () => {});

	describe('when a target is configured', async () => {});

	describe('when only routes are configured (no target)', async () => {});

	// it('Must pass through to underlying via fallback function and emit on proxy', async () => {
	// 	const txn = await proxyThruTo({
	// 		proxy,
	// 		target: token,
	// 		fncName: 'somethingToBeProxied',
	// 		args: ['666', toBytes32('SNX')],
	// 		from: account3,
	// 	});

	// 	// get rawLogs as logs not decoded because the truffle cannot decode the events from the
	// 	// underlying from the proxy invocation
	// 	const { topics } = txn.receipt.rawLogs[0];
	// 	// PublicEST.somethingToBeProxied emits messageSender as the first topic and the input args
	// 	// as the following two (all indexed so they become topics), so assert they are correct
	// 	assert.equal(topics[1], web3.eth.abi.encodeParameter('address', account3));
	// 	assert.equal(topics[2], web3.eth.abi.encodeParameter('uint256', '666'));
	// 	assert.equal(topics[3], web3.eth.abi.encodeParameter('bytes32', toBytes32('SNX')));
	// });

	// describe('ProxyERC20 should adhere to ERC20 standard', async () => {
	// 	it('should be able to query optional ERC20 name', async () => {
	// 		const name = await token.name();
	// 		const proxyName = await proxyERC20.name();
	// 		assert.bnEqual(proxyName, name);
	// 	});
	// 	it('should be able to query optional ERC20 symbol', async () => {
	// 		const symbol = await token.symbol();
	// 		const proxySymbol = await proxyERC20.symbol();
	// 		assert.bnEqual(proxySymbol, symbol);
	// 	});
	// 	it('should be able to query optional ERC20 decimals', async () => {
	// 		const decimals = await token.decimals();
	// 		const proxyDecimals = await proxyERC20.decimals();
	// 		assert.bnEqual(proxyDecimals, decimals);
	// 	});
	// 	it('should be able to query ERC20 totalSupply', async () => {
	// 		const totalSupply = await token.totalSupply();
	// 		const proxyTotalSupply = await proxyERC20.totalSupply();
	// 		assert.bnEqual(proxyTotalSupply, totalSupply);
	// 	});
	// 	it('should be able to query ERC20 balanceOf', async () => {
	// 		const balance = await token.balanceOf(account1);
	// 		const myProxyBalance = await proxyERC20.balanceOf(account1);
	// 		assert.bnEqual(myProxyBalance, balance);
	// 	});

	// 	it('should be able to call ERC20 approve', async () => {
	// 		const amountToTransfer = toUnit('50');

	// 		// Approve Account2 to spend 50
	// 		const approveTX = await proxyERC20.approve(account2, amountToTransfer, {
	// 			from: account1,
	// 		});
	// 		// Check for Approval event
	// 		assert.eventEqual(approveTX, 'Approval', {
	// 			owner: account1,
	// 			spender: account2,
	// 			value: amountToTransfer,
	// 		});
	// 		// should be able to query ERC20 allowance
	// 		const allowance = await proxyERC20.allowance(account1, account2);

	// 		// Assert we have the same
	// 		assert.bnEqual(allowance, amountToTransfer);
	// 	});

	// 	it('should be able to call ERC20 transferFrom', async () => {
	// 		const amountToTransfer = toUnit('33');

	// 		// Approve Account2 to spend 50
	// 		await proxyERC20.approve(account2, amountToTransfer, { from: account1 });

	// 		// Get Before Transfer Balances
	// 		const account1BalanceBefore = await token.balanceOf(account1);
	// 		const account3BalanceBefore = await token.balanceOf(account3);

	// 		// Transfer
	// 		const transferTX = await token.transferFrom(account1, account3, amountToTransfer, {
	// 			from: account2,
	// 		});

	// 		// Check for Transfer event
	// 		assert.eventEqual(transferTX, 'Transfer', {
	// 			from: account1,
	// 			to: account3,
	// 			value: amountToTransfer,
	// 		});

	// 		// Get After Transfer Balances
	// 		const account1BalanceAfter = await token.balanceOf(account1);
	// 		const account3BalanceAfter = await token.balanceOf(account3);

	// 		// Check Balances
	// 		assert.bnEqual(account1BalanceBefore.sub(amountToTransfer), account1BalanceAfter);
	// 		assert.bnEqual(account3BalanceBefore.add(amountToTransfer), account3BalanceAfter);
	// 	});

	// 	it('should be able to call ERC20 transfer', async () => {
	// 		const amountToTransfer = toUnit('44');

	// 		// Get Before Transfer Balances
	// 		const account1BalanceBefore = await token.balanceOf(account1);
	// 		const account2BalanceBefore = await token.balanceOf(account2);

	// 		const transferTX = await token.transfer(account2, amountToTransfer, {
	// 			from: account1,
	// 		});

	// 		// Check for Transfer event
	// 		assert.eventEqual(transferTX, 'Transfer', {
	// 			from: account1,
	// 			to: account2,
	// 			value: amountToTransfer,
	// 		});

	// 		// Get After Transfer Balances
	// 		const account1BalanceAfter = await token.balanceOf(account1);
	// 		const account2BalanceAfter = await token.balanceOf(account2);

	// 		// Check Balances
	// 		assert.bnEqual(account1BalanceBefore.sub(amountToTransfer), account1BalanceAfter);
	// 		assert.bnEqual(account2BalanceBefore.add(amountToTransfer), account2BalanceAfter);
	// 	});
	// });

	// describe('when third party contracts interact with our proxy', async () => {
	// 	let thirdPartyExchanger;

	// 	beforeEach(async () => {
	// 		thirdPartyExchanger = await TokenExchanger.new(owner, proxyERC20.address);
	// 	});

	// 	it('should be able to query ERC20 balanceOf', async () => {
	// 		// Get account1 SNX balance direct
	// 		const balance = await token.balanceOf(account1);
	// 		// Get account1 balance via ERC20 Proxy
	// 		const thirdPartybalance = await thirdPartyExchanger.checkBalance(account1);
	// 		// Assert Balance with no reverts
	// 		assert.bnEqual(thirdPartybalance, balance);
	// 	});

	// 	it('should be able to transferFrom ERC20', async () => {
	// 		const amountToTransfer = toUnit('77');

	// 		// Approve tokenExchanger to spend account1 balance
	// 		const approveTX = await proxyERC20.approve(thirdPartyExchanger.address, amountToTransfer, {
	// 			from: account1,
	// 		});

	// 		// Check for Approval event
	// 		assert.eventEqual(approveTX, 'Approval', {
	// 			owner: account1,
	// 			spender: thirdPartyExchanger.address,
	// 			value: amountToTransfer,
	// 		});

	// 		// should be able to query ERC20 allowance
	// 		const allowance = await proxyERC20.allowance(account1, thirdPartyExchanger.address);

	// 		// Assert we have the allowance
	// 		assert.bnEqual(allowance, amountToTransfer);

	// 		// Get Before Transfer Balances
	// 		const account1BalanceBefore = await token.balanceOf(account1);
	// 		const account2BalanceBefore = await token.balanceOf(account2);

	// 		// tokenExchanger to transfer Account1's token to Account2
	// 		await thirdPartyExchanger.doTokenSpend(account1, account2, amountToTransfer);

	// 		// Get After Transfer Balances
	// 		const account1BalanceAfter = await token.balanceOf(account1);
	// 		const account2BalanceAfter = await token.balanceOf(account2);

	// 		// Check Balances
	// 		assert.bnEqual(account1BalanceBefore.sub(amountToTransfer), account1BalanceAfter);
	// 		assert.bnEqual(account2BalanceBefore.add(amountToTransfer), account2BalanceAfter);
	// 	});
	// });
});
