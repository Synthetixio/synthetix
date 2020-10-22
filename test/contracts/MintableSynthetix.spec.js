const { artifacts, contract, web3 } = require('@nomiclabs/buidler');
const { assert } = require('./common');
const { onlyGivenAddressCanInvoke, ensureOnlyExpectedMutativeFunctions } = require('./helpers');
const { setupAllContracts } = require('./setup');
const { toWei } = web3.utils;
const { toBytes32 } = require('../..');
const BN = require('bn.js');

const MintableSynthetix = artifacts.require('MintableSynthetix');
const SYNTHETIX_TOTAL_SUPPLY = toWei('100000000');

contract('MintableSynthetix (spec tests)', accounts => {
	const [, owner, synthetixBridgeToBase, account1] = accounts;

	it('ensure only known functions are mutative', () => {
		ensureOnlyExpectedMutativeFunctions({
			abi: MintableSynthetix.abi,
			ignoreParents: ['Synthetix'],
			expected: ['mintSecondary', 'burnSecondary'],
		});
	});

	let mintableSynthetix;
	let addressResolver;
	describe('when system is setup', () => {
		before('deploy a new instance', async () => {
			({
				Synthetix: mintableSynthetix, // we request Synthetix instead of MintableSynthetix because it is renamed in setup.js
				AddressResolver: addressResolver,
			} = await setupAllContracts({
				accounts,
				contracts: ['MintableSynthetix'],
			}));
			// update resolver
			await addressResolver.importAddresses(
				[toBytes32('SynthetixBridgeToBase')],
				[synthetixBridgeToBase],
				{
					from: owner,
				}
			);
			// synch cache
			await mintableSynthetix.setResolverAndSyncCache(addressResolver.address, { from: owner });
		});

		describe('access permissions', async () => {
			it('should only allow SynthetixBridgeToBase to call mintSecondary()', async () => {
				await onlyGivenAddressCanInvoke({
					fnc: mintableSynthetix.mintSecondary,
					args: [account1, 100],
					address: synthetixBridgeToBase,
					accounts,
					reason: 'Can only be invoked by the SynthetixBridgeToBase contract',
				});
			});

			it('should only allow SynthetixBridgeToBase to call burnSecondary()', async () => {
				await onlyGivenAddressCanInvoke({
					fnc: mintableSynthetix.burnSecondary,
					args: [account1, 100],
					address: synthetixBridgeToBase,
					accounts,
					reason: 'Can only be invoked by the SynthetixBridgeToBase contract',
				});
			});
		});

		describe('mintSecondary()', async () => {
			let mintSecondaryTx;
			const amount = 100;
			before('when SynthetixBridgeToBase calls mintSecondary()', async () => {
				mintSecondaryTx = await mintableSynthetix.mintSecondary(account1, amount, {
					from: synthetixBridgeToBase,
				});
			});

			it('should tranfer the tokens to the right account', async () => {
				assert.equal(await mintableSynthetix.balanceOf(account1), amount);
			});

			it('should increase the total supply', async () => {
				const newSupply = new BN(SYNTHETIX_TOTAL_SUPPLY).add(new BN(amount));
				assert.bnEqual(await mintableSynthetix.totalSupply(), newSupply);
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
			before('when SynthetixBridgeToBase calls burnSecondary()', async () => {
				burnSecondaryTx = await mintableSynthetix.burnSecondary(account1, amount, {
					from: synthetixBridgeToBase,
				});
			});
			it('should tranfer the tokens to the right account', async () => {
				assert.equal(await mintableSynthetix.balanceOf(account1), 0);
			});

			it('should decrease the total supply', async () => {
				assert.bnEqual(await mintableSynthetix.totalSupply(), SYNTHETIX_TOTAL_SUPPLY);
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
