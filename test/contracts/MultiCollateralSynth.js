'use strict';

const { artifacts, contract, web3 } = require('@nomiclabs/buidler');

const { assert, addSnapshotBeforeRestoreAfterEach } = require('./common');

const MultiCollateralSynth = artifacts.require('MultiCollateralSynth');

const { onlyGivenAddressCanInvoke, ensureOnlyExpectedMutativeFunctions } = require('./helpers');
const { toUnit } = require('../utils')();
const {
	toBytes32,
	constants: { ZERO_ADDRESS },
} = require('../..');

const { setupAllContracts } = require('./setup');

contract('MultiCollateralSynth', accounts => {
	const [deployerAccount, owner, , , account1] = accounts;

	let issuer, resolver;

	const onlyInternalString = 'Only internal contracts allowed';

	before(async () => {
		({ AddressResolver: resolver, Issuer: issuer } = await setupAllContracts({
			accounts,
			mocks: { FeePool: true, FuturesMarketManager: true },
			contracts: ['AddressResolver', 'Synthetix', 'Issuer'],
		}));
	});

	addSnapshotBeforeRestoreAfterEach();

	const deploySynth = async ({ currencyKey, proxy, tokenState, multiCollateralKey }) => {
		// As either of these could be legacy, we require them in the testing context (see buidler.config.js)
		const TokenState = artifacts.require('TokenState');
		const Proxy = artifacts.require('Proxy');

		tokenState =
			tokenState ||
			(await TokenState.new(owner, ZERO_ADDRESS, {
				from: deployerAccount,
			}));

		proxy = proxy || (await Proxy.new(owner, { from: deployerAccount }));

		const synth = await MultiCollateralSynth.new(
			proxy.address,
			tokenState.address,
			`Synth ${currencyKey}`,
			currencyKey,
			owner,
			toBytes32(currencyKey),
			web3.utils.toWei('0'),
			resolver.address,
			toBytes32(multiCollateralKey),
			{
				from: deployerAccount,
			}
		);
		await synth.setResolverAndSyncCache(resolver.address, { from: owner });

		return { synth, tokenState, proxy };
	};

	describe('when a MultiCollateral synth is added and connected to Synthetix', () => {
		const collateralKey = 'EtherCollateral';

		beforeEach(async () => {
			const { synth, tokenState, proxy } = await deploySynth({
				currencyKey: 'sCollateral',
				multiCollateralKey: collateralKey,
			});
			await tokenState.setAssociatedContract(synth.address, { from: owner });
			await proxy.setTarget(synth.address, { from: owner });
			await issuer.addSynth(synth.address, { from: owner });
			this.synth = synth;
		});

		it('ensure only known functions are mutative', () => {
			ensureOnlyExpectedMutativeFunctions({
				abi: this.synth.abi,
				ignoreParents: ['Synth'],
				expected: [], // issue and burn are both overridden in MultiCollateral from Synth
			});
		});

		it('ensure the list of resolver addresses are as expected', async () => {
			const actual = await this.synth.getResolverAddressesRequired();
			assert.deepEqual(
				actual,
				[
					'SystemStatus',
					'Exchanger',
					'Issuer',
					'FeePool',
					'FuturesMarketManager',
					'EtherCollateral',
				]
					.concat(new Array(18).fill(''))
					.map(toBytes32)
			);
		});

		describe('when non-multiCollateral tries to issue', () => {
			it('then it fails', async () => {
				await onlyGivenAddressCanInvoke({
					fnc: this.synth.issue,
					args: [account1, toUnit('1')],
					accounts,
					reason: onlyInternalString,
				});
			});
		});
		describe('when non-multiCollateral tries to burn', () => {
			it('then it fails', async () => {
				await onlyGivenAddressCanInvoke({
					fnc: this.synth.burn,
					args: [account1, toUnit('1')],
					accounts,
					reason: onlyInternalString,
				});
			});
		});

		describe('when multiCollateral is set to the owner', () => {
			beforeEach(async () => {
				// have the owner simulate being MultiCollateral so we can invoke issue and burn
				await resolver.importAddresses([toBytes32(collateralKey)], [owner], { from: owner });
				// now have the synth resync its cache
				await this.synth.setResolverAndSyncCache(resolver.address, { from: owner });
			});
			describe('when multiCollateral tries to issue', () => {
				it('then it can issue new synths', async () => {
					const accountToIssue = account1;
					const issueAmount = toUnit('1');
					const totalSupplyBefore = await this.synth.totalSupply();
					const balanceOfBefore = await this.synth.balanceOf(accountToIssue);

					await this.synth.issue(accountToIssue, issueAmount, { from: owner });

					assert.bnEqual(await this.synth.totalSupply(), totalSupplyBefore.add(issueAmount));
					assert.bnEqual(
						await this.synth.balanceOf(accountToIssue),
						balanceOfBefore.add(issueAmount)
					);
				});
			});
			describe('when multiCollateral tries to burn', () => {
				it('then it can burn synths', async () => {
					const totalSupplyBefore = await this.synth.totalSupply();
					const balanceOfBefore = await this.synth.balanceOf(account1);
					const amount = toUnit('1');

					await this.synth.issue(account1, amount, { from: owner });

					assert.bnEqual(await this.synth.totalSupply(), totalSupplyBefore.add(amount));
					assert.bnEqual(await this.synth.balanceOf(account1), balanceOfBefore.add(amount));

					await this.synth.burn(account1, amount, { from: owner });

					assert.bnEqual(await this.synth.totalSupply(), totalSupplyBefore);
					assert.bnEqual(await this.synth.balanceOf(account1), balanceOfBefore);
				});
			});
			describe('when synthetix set to account1', () => {
				beforeEach(async () => {
					// have account1 simulate being Issuer so we can invoke issue and burn
					await resolver.importAddresses([toBytes32('Issuer')], [account1], { from: owner });
					// now have the synth resync its cache
					await this.synth.setResolverAndSyncCache(resolver.address, { from: owner });
				});
				it('then it can issue new synths as account1', async () => {
					const accountToIssue = account1;
					const issueAmount = toUnit('1');
					const totalSupplyBefore = await this.synth.totalSupply();
					const balanceOfBefore = await this.synth.balanceOf(accountToIssue);

					await this.synth.issue(accountToIssue, issueAmount, { from: account1 });

					assert.bnEqual(await this.synth.totalSupply(), totalSupplyBefore.add(issueAmount));
					assert.bnEqual(
						await this.synth.balanceOf(accountToIssue),
						balanceOfBefore.add(issueAmount)
					);
				});
			});
		});
	});
});
