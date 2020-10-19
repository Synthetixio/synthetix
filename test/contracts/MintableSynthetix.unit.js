const { artifacts, contract, web3 } = require('@nomiclabs/buidler');
const { assert } = require('./common');
const { onlyGivenAddressCanInvoke, ensureOnlyExpectedMutativeFunctions } = require('./helpers');
const { mockGenericContractFnc, setupContract } = require('./setup');
const { toWei } = web3.utils;
const BN = require('bn.js');

const MintableSynthetix = artifacts.require('MintableSynthetix');

contract('MintableSynthetix (unit tests)', accounts => {
	const [deployerAccount, owner, secondaryDeposit, account1] = accounts;

	it('ensure only known functions are mutative', () => {
		ensureOnlyExpectedMutativeFunctions({
			abi: MintableSynthetix.abi,
			ignoreParents: ['Synthetix'],
			expected: ['mintSecondary', 'burnSecondary'],
		});
	});

	describe('initial setup', () => {
		let resolverMock;
		let tokenState;
		let proxyERC20;
		let proxy;
		let mintableSynthetix;
		const cache = {};

		const SYNTHETIX_TOTAL_SUPPLY = toWei('100000000');
		before('deploy a new instance', async () => {
			resolverMock = await artifacts.require('GenericMock').new();
			await mockGenericContractFnc({
				instance: resolverMock,
				mock: 'AddressResolver',
				fncName: 'getAddress',
				returns: [secondaryDeposit],
			});

			proxy = await setupContract({
				contract: 'Proxy',
				accounts,
				skipPostDeploy: true,
				args: [owner],
			});
			cache['ProxyMintableSynthetix'] = proxy;

			proxyERC20 = await setupContract({
				contract: 'ProxyERC20',
				accounts,
				skipPostDeploy: true,
				args: [owner],
			});
			cache['ProxyERC20MintableSynthetix'] = proxyERC20;

			tokenState = await setupContract({
				contract: 'TokenState',
				accounts,
				skipPostDeploy: true,
				args: [owner, deployerAccount],
			});
			cache['TokenStateMintableSynthetix'] = tokenState;

			mintableSynthetix = await setupContract({
				contract: 'MintableSynthetix',
				accounts,
				skipPostDeploy: false,
				cache: cache,
				args: [
					proxyERC20.address,
					tokenState.address,
					owner,
					SYNTHETIX_TOTAL_SUPPLY,
					resolverMock.address,
				],
			});
		});

		it('should set constructor params on deployment', async () => {
			assert.equal(await mintableSynthetix.proxy(), proxyERC20.address);
			assert.equal(await mintableSynthetix.tokenState(), tokenState.address);
			assert.equal(await mintableSynthetix.owner(), owner);
			assert.equal(await mintableSynthetix.totalSupply(), SYNTHETIX_TOTAL_SUPPLY);
			assert.equal(await mintableSynthetix.resolver(), resolverMock.address);
		});

		describe('access permissions', async () => {
			it('should only allow secondaryDeposit  to call mintSecondary()', async () => {
				await onlyGivenAddressCanInvoke({
					fnc: mintableSynthetix.mintSecondary,
					args: [account1, 100],
					address: secondaryDeposit,
					accounts,
					reason: 'Can only be invoked by the SecondaryDeposit contract',
				});
			});

			it('should only allow secondaryDeposit to call burnSecondary()', async () => {
				await onlyGivenAddressCanInvoke({
					fnc: mintableSynthetix.burnSecondary,
					args: [account1, 100],
					address: secondaryDeposit,
					accounts,
					reason: 'Can only be invoked by the SecondaryDeposit contract',
				});
			});
		});

		describe('mintSecondary()', async () => {
			let mintSecondaryTx;
			const amount = 100;
			before('when secondaryDeposit calls mintSecondary()', async () => {
				mintSecondaryTx = await mintableSynthetix.mintSecondary(account1, amount, {
					from: secondaryDeposit,
				});
			});

			it('should tranfer the tokens to the right account', async () => {
				assert.equal(amount, await mintableSynthetix.balanceOf(account1));
			});

			it('should increase the total supply', async () => {
				const newSupply = new BN(SYNTHETIX_TOTAL_SUPPLY).add(new BN(amount));
				assert.bnEqual(newSupply, await mintableSynthetix.totalSupply());
			});

			it('should emit a Transfer event', async () => {
				assert.eventEqual(mintSecondaryTx, 'Transfer', {
					from: mintableSynthetix.address,
					to: account1,
					value: amount,
				});
			});
		});

		describe('burnSecondary()', async () => {
			let burnSecondaryTx;
			const amount = 100;
			before('when secondaryDeposit calls burnSecondary()', async () => {
				burnSecondaryTx = await mintableSynthetix.burnSecondary(account1, amount, {
					from: secondaryDeposit,
				});
			});
			it('should tranfer the tokens to the right account', async () => {
				assert.equal(0, await mintableSynthetix.balanceOf(account1));
			});

			it('should decrease the total supply', async () => {
				assert.bnEqual(SYNTHETIX_TOTAL_SUPPLY, await mintableSynthetix.totalSupply());
			});

			it('should emit a Transfer event', async () => {
				assert.eventEqual(burnSecondaryTx, 'Transfer', {
					from: account1,
					to: '0x0000000000000000000000000000000000000000',
					value: amount,
				});
			});
		});
	});
});
