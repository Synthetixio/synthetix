const { artifacts, contract, web3 } = require('@nomiclabs/buidler');
const { assert } = require('./common');
const { onlyGivenAddressCanInvoke, ensureOnlyExpectedMutativeFunctions } = require('./helpers');
const { mockGenericContractFnc } = require('./setup');
const { toWei } = web3.utils;
const BN = require('bn.js');

const MintableSynthetix = artifacts.require('MintableSynthetix');
const FakeMintableSynthetix = artifacts.require('FakeMintableSynthetix');

contract('MintableSynthetix (unit tests)', accounts => {
	const [owner, secondaryDeposit, mockAddress, account1] = accounts;

	it('ensure only known functions are mutative', () => {
		ensureOnlyExpectedMutativeFunctions({
			abi: MintableSynthetix.abi,
			ignoreParents: ['Synthetix'],
			expected: ['mintSecondary', 'burnSecondary'],
		});
	});

	describe('initial setup', () => {
		let resolverMock;
		let tokenStateMock;
		let mintableSynthetix;

		const SYNTHETIX_TOTAL_SUPPLY = toWei('100000000');
		before('deploy a new instance', async () => {
			resolverMock = await artifacts.require('GenericMock').new();
			await mockGenericContractFnc({
				instance: resolverMock,
				mock: 'AddressResolver',
				fncName: 'getAddress',
				returns: [secondaryDeposit],
			});

			tokenStateMock = await artifacts.require('GenericMock').new();
			await mockGenericContractFnc({
				instance: tokenStateMock,
				mock: 'TokenState',
				fncName: 'setBalanceOf',
				returns: [],
			});

			await mockGenericContractFnc({
				instance: tokenStateMock,
				mock: 'TokenState',
				fncName: 'balanceOf',
				returns: [1000],
			});

			mintableSynthetix = await FakeMintableSynthetix.new(
				mockAddress,
				tokenStateMock.address,
				owner,
				SYNTHETIX_TOTAL_SUPPLY,
				resolverMock.address,
				{
					from: owner,
				}
			);
		});

		it('should set constructor params on deployment', async () => {
			assert.equal(await mintableSynthetix.proxy(), mockAddress);
			assert.equal(await mintableSynthetix.tokenState(), tokenStateMock.address);
			assert.equal(await mintableSynthetix.owner(), owner);
			assert.equal(await mintableSynthetix.totalSupply(), SYNTHETIX_TOTAL_SUPPLY);
			assert.equal(await mintableSynthetix.resolver(), resolverMock.address);
		});

		describe('access permissions', async () => {
			const amount = 100;
			it('should only allow secondaryDeposit  to call mintSecondary()', async () => {
				await onlyGivenAddressCanInvoke({
					fnc: mintableSynthetix.mintSecondary,
					args: [account1, amount],
					address: secondaryDeposit,
					accounts,
					reason: 'Can only be invoked by the SecondaryDeposit contract',
				});
			});

			it('should only allow secondaryDeposit to call burnSecondary()', async () => {
				await onlyGivenAddressCanInvoke({
					fnc: mintableSynthetix.burnSecondary,
					args: [account1, amount],
					address: secondaryDeposit,
					accounts,
					reason: 'Can only be invoked by the SecondaryDeposit contract',
				});
			});
		});

		describe('mintSecondary()', async () => {
			const amount = 100;
			before('when secondaryDeposit calls mintSecondary()', async () => {
				await mintableSynthetix.mintSecondary(account1, amount, {
					from: secondaryDeposit,
				});
			});

			it('should increase the total supply', async () => {
				const newSupply = new BN(SYNTHETIX_TOTAL_SUPPLY).add(new BN(amount));
				assert.bnEqual(newSupply, await mintableSynthetix.totalSupply());
			});
		});

		describe('burnSecondary()', async () => {
			const amount = 100;
			before('when secondaryDeposit calls burnSecondary()', async () => {
				await mintableSynthetix.burnSecondary(account1, amount, {
					from: secondaryDeposit,
				});
			});

			it('should decrease the total supply', async () => {
				assert.bnEqual(SYNTHETIX_TOTAL_SUPPLY, await mintableSynthetix.totalSupply());
			});
		});
	});
});
