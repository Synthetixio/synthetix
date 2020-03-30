require('.'); // import common test scaffolding

const FeePool = artifacts.require('FeePool');
const AddressResolver = artifacts.require('AddressResolver');
const Synthetix = artifacts.require('Synthetix');
const MultiCollateralSynth = artifacts.require('MultiCollateralSynth');
const TokenState = artifacts.require('TokenState');
const Proxy = artifacts.require('Proxy');

const {
	onlyGivenAddressCanInvoke,
	ensureOnlyExpectedMutativeFunctions,
} = require('../utils/setupUtils');
const { toUnit, ZERO_ADDRESS } = require('../utils/testUtils');
const { toBytes32 } = require('../..');

contract('MultiCollateralSynth', accounts => {
	const [
		deployerAccount,
		owner, // Oracle next, is not needed
		,
		,
		account1,
	] = accounts;

	let feePool,
		feePoolProxy,
		// FEE_ADDRESS,
		synthetix,
		synthetixProxy,
		resolver;

	beforeEach(async () => {
		// Save ourselves from having to await deployed() in every single test.
		// We do this in a beforeEach instead of before to ensure we isolate
		// contract interfaces to prevent test bleed.
		feePool = await FeePool.deployed();
		// Deploy new proxy for feePool
		feePoolProxy = await Proxy.new(owner, { from: deployerAccount });

		synthetix = await Synthetix.deployed();
		// Deploy new proxy for Synthetix
		synthetixProxy = await Proxy.new(owner, { from: deployerAccount });

		resolver = await AddressResolver.deployed();

		// ensure synthetixProxy has target set to synthetix
		await feePool.setProxy(feePoolProxy.address, { from: owner });
		await synthetix.setProxy(synthetixProxy.address, { from: owner });
		// set new proxies on Synthetix and FeePool
		await synthetixProxy.setTarget(synthetix.address, { from: owner });
		await feePoolProxy.setTarget(feePool.address, { from: owner });
	});

	const deploySynth = async ({ currencyKey, proxy, tokenState, multiCollateralKey }) => {
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
			await synthetix.addSynth(synth.address, { from: owner });
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
				['SystemStatus', 'Synthetix', 'Exchanger', 'Issuer', 'FeePool', 'EtherCollateral']
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
					reason: 'Only Synthetix, FeePool, Exchanger, Issuer or MultiCollateral contracts allowed',
				});
			});
		});
		describe('when non-multiCollateral tries to burn', () => {
			it('then it fails', async () => {
				await onlyGivenAddressCanInvoke({
					fnc: this.synth.burn,
					args: [account1, toUnit('1')],
					accounts,
					reason: 'Only Synthetix, FeePool, Exchanger, Issuer or MultiCollateral contracts allowed',
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
			describe('when synthetix set to account1', () => {
				beforeEach(async () => {
					// have account1 simulate being Synthetix so we can invoke issue and burn
					await resolver.importAddresses([toBytes32('Synthetix')], [account1], { from: owner });
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
