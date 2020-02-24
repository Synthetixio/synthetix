require('.'); // import common test scaffolding

const ExternStateToken = artifacts.require('ExternStateToken');
const PublicEST = artifacts.require('PublicEST');
const Proxy = artifacts.require('Proxy');
const TokenState = artifacts.require('TokenState');
const { ZERO_ADDRESS, toUnit } = require('../utils/testUtils');

const {
	onlyGivenAddressCanInvoke,
	ensureOnlyExpectedMutativeFunctions,
} = require('../utils/setupUtils');

contract('ExternStateToken', async accounts => {
	const [deployerAccount, owner, account1, account2] = accounts;

	let proxy;
	let instance;
	let tokenState;
	// let subInstance;
	beforeEach(async () => {
		// the owner is the associated contract, so we can simulate
		proxy = await Proxy.new(owner, {
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

		// subInstance = await PublicEST.new(owner, {
		// 	from: deployerAccount,
		// });
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
			ignoreParents: ['SelfDestructible', 'Proxyable'],
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
			await instance.setTokenState(account1, { from: owner });
			assert.equal(await instance.tokenState(), account1);
		});
	});

	describe('approve', () => {
		it('when invoked, changes the approval', async () => {
			assert.equal(await tokenState.allowance(account1, account2), '0');
			await instance.approve(account2, toUnit('100'), { from: account1 });
			assert.bnEqual(await tokenState.allowance(account1, account2), toUnit('100'));
		});
	});
});
