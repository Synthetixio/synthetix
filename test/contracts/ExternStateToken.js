const { artifacts, contract } = require('hardhat');

const { assert } = require('./common');

const ExternStateToken = artifacts.require('ExternStateToken');
const PublicEST = artifacts.require('PublicEST');

const { toUnit } = require('../utils')();

const {
	constants: { ZERO_ADDRESS },
} = require('../..');

const { onlyGivenAddressCanInvoke, ensureOnlyExpectedMutativeFunctions } = require('./helpers');

contract('ExternStateToken @ovm-skip', async accounts => {
	const [deployerAccount, owner, account1, account2, account3] = accounts;

	let proxy;
	let instance;
	let tokenState;

	beforeEach(async () => {
		const ProxyERC20 = artifacts.require(`ProxyERC20`);
		const TokenState = artifacts.require(`TokenState`);

		// the owner is the associated contract, so we can simulate
		proxy = await ProxyERC20.new(owner, {
			from: deployerAccount,
		});
		tokenState = await TokenState.new(owner, ZERO_ADDRESS, { from: deployerAccount });

		instance = await ExternStateToken.new(
			proxy.address,
			tokenState.address,
			'Some Token',
			'TOKEN',
			toUnit('1000'),
			'18',
			owner,
			{
				from: deployerAccount,
			}
		);

		await proxy.setTarget(instance.address, { from: owner });

		await tokenState.setAssociatedContract(instance.address, { from: owner });
	});
	it('on instantiation, all parameters are set', async () => {
		assert.equal(await instance.proxy(), proxy.address);
		assert.equal(await instance.tokenState(), tokenState.address);
		assert.equal(await instance.name(), 'Some Token');
		assert.equal(await instance.symbol(), 'TOKEN');
		assert.bnEqual(await instance.totalSupply(), toUnit('1000'));
		assert.bnEqual(await instance.decimals(), '18');
	});
	it('ensure only known functions are mutative', () => {
		ensureOnlyExpectedMutativeFunctions({
			abi: instance.abi,
			ignoreParents: ['Proxyable'],
			expected: ['setTokenState', 'approve'],
		});
	});
	describe('setTokenState', () => {
		it('can only be invoked by the owner', async () => {
			await onlyGivenAddressCanInvoke({
				fnc: instance.setTokenState,
				accounts,
				address: owner,
				args: [account1],
			});
		});
		it('when invoked, changes the token state', async () => {
			assert.equal(await instance.tokenState(), tokenState.address);
			const txn = await instance.setTokenState(account1, { from: owner });
			assert.equal(await instance.tokenState(), account1);
			assert.eventEqual(txn, 'TokenStateUpdated', { newTokenState: account1 });
		});
	});

	describe('approve() and allowance()', () => {
		it('when invoked, changes the approval', async () => {
			assert.equal(await tokenState.allowance(account1, account2), '0');
			assert.equal(await instance.allowance(account1, account2), '0');
			await instance.approve(account2, toUnit('100'), { from: account1 });
			assert.bnEqual(await tokenState.allowance(account1, account2), toUnit('100'));
			assert.bnEqual(await instance.allowance(account1, account2), toUnit('100'));
			// Note: events are emitted on the proxy, so not parsed in txn.logs
		});
		it('when invoked on the proxy, changes the approval', async () => {
			assert.equal(await tokenState.allowance(account1, account2), '0');
			const txn = await proxy.approve(account2, toUnit('100'), { from: account1 });
			assert.bnEqual(await tokenState.allowance(account1, account2), toUnit('100'));
			assert.eventEqual(txn, 'Approval', {
				owner: account1,
				spender: account2,
				value: toUnit('100'),
			});
		});
	});

	describe('when extended into a test class', () => {
		let subInstance;
		beforeEach(async () => {
			subInstance = await PublicEST.new(
				proxy.address,
				tokenState.address,
				'Some Token',
				'TOKEN',
				toUnit('1000'),
				owner,
				{
					from: deployerAccount,
				}
			);
			await proxy.setTarget(subInstance.address, { from: owner });
		});
		describe('when account1 has 100 units', () => {
			beforeEach(async () => {
				await tokenState.setAssociatedContract(owner, { from: owner });
				await tokenState.setBalanceOf(account1, toUnit('100'), { from: owner });
				await tokenState.setAssociatedContract(subInstance.address, { from: owner });
			});
			it('when account1 transfers to account2, it works as expected', async () => {
				assert.bnEqual(await subInstance.balanceOf(account1), toUnit('100'));
				assert.bnEqual(await subInstance.balanceOf(account2), toUnit('0'));
				await subInstance.transfer(account2, toUnit('25'), { from: account1 });
				assert.bnEqual(await subInstance.balanceOf(account1), toUnit('75'));
				assert.bnEqual(await subInstance.balanceOf(account2), toUnit('25'));
			});
			it('when account1 transfers to account2, it works as expected', async () => {
				assert.bnEqual(await subInstance.balanceOf(account1), toUnit('100'));
				assert.bnEqual(await subInstance.balanceOf(account2), toUnit('0'));
				await proxy.transfer(account2, toUnit('25'), { from: account1 });
				assert.bnEqual(await subInstance.balanceOf(account1), toUnit('75'));
				assert.bnEqual(await subInstance.balanceOf(account2), toUnit('25'));
			});
			describe('when account1 approves account2 to transfer from', () => {
				beforeEach(async () => {
					await subInstance.approve(account2, toUnit('50'), { from: account1 });
				});
				describe('when account 2 transferFrom the approved amount', () => {
					it('then it works as expected', async () => {
						assert.bnEqual(await subInstance.balanceOf(account1), toUnit('100'));
						assert.bnEqual(await subInstance.balanceOf(account2), toUnit('0'));
						assert.bnEqual(await subInstance.balanceOf(account3), toUnit('0'));
						await subInstance.transferFrom(account1, account3, toUnit('50'), {
							from: account2,
						});
						assert.bnEqual(await subInstance.balanceOf(account1), toUnit('50'));
						assert.bnEqual(await subInstance.balanceOf(account2), toUnit('0'));
						assert.bnEqual(await subInstance.balanceOf(account3), toUnit('50'));
					});
				});
				describe('when account 2 transferFrom via the proxy of the approved amount', () => {
					it('then it works as expected', async () => {
						assert.bnEqual(await subInstance.balanceOf(account1), toUnit('100'));
						assert.bnEqual(await subInstance.balanceOf(account2), toUnit('0'));
						assert.bnEqual(await subInstance.balanceOf(account3), toUnit('0'));
						await proxy.transferFrom(account1, account3, toUnit('50'), { from: account2 });
						assert.bnEqual(await subInstance.balanceOf(account1), toUnit('50'));
						assert.bnEqual(await subInstance.balanceOf(account2), toUnit('0'));
						assert.bnEqual(await subInstance.balanceOf(account3), toUnit('50'));
					});
				});
			});
		});
	});
});
