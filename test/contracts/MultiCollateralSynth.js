'use strict';

const { artifacts, contract, web3 } = require('hardhat');

const { assert, addSnapshotBeforeRestoreAfterEach } = require('./common');

let MultiCollateralSynth;
let CollateralState;
let CollateralManagerState;
let CollateralManager;

const { onlyGivenAddressCanInvoke, ensureOnlyExpectedMutativeFunctions } = require('./helpers');
const { toUnit, currentTime, fastForward } = require('../utils')();
const {
	toBytes32,
	constants: { ZERO_ADDRESS },
} = require('../..');

const { setupAllContracts, setupContract } = require('./setup');

contract('MultiCollateralSynth @gas-skip', accounts => {
	const [deployerAccount, owner, oracle, , account1] = accounts;

	const sETH = toBytes32('sETH');

	let issuer,
		resolver,
		manager,
		ceth,
		exchangeRates,
		managerState,
		debtCache,
		sUSDSynth,
		feePool,
		synths;

	const getid = async tx => {
		const event = tx.logs.find(log => log.event === 'LoanCreated');
		return event.args.id;
	};

	const deployCollateral = async ({
		state,
		owner,
		manager,
		resolver,
		collatKey,
		minColat,
		minSize,
	}) => {
		return setupContract({
			accounts,
			contract: 'CollateralEth',
			args: [state, owner, manager, resolver, collatKey, minColat, minSize],
		});
	};

	const issuesUSDToAccount = async (issueAmount, receiver) => {
		// Set up the depositor with an amount of synths to deposit.
		await sUSDSynth.issue(receiver, issueAmount, {
			from: owner,
		});
	};

	const updateRatesWithDefaults = async () => {
		const timestamp = await currentTime();

		await exchangeRates.updateRates([sETH], ['100'].map(toUnit), timestamp, {
			from: oracle,
		});

		const sBTC = toBytes32('sBTC');

		await exchangeRates.updateRates([sBTC], ['10000'].map(toUnit), timestamp, {
			from: oracle,
		});
	};

	before(async () => {
		MultiCollateralSynth = artifacts.require('MultiCollateralSynth');
		CollateralState = artifacts.require('CollateralState');
		CollateralManagerState = artifacts.require('CollateralManagerState');
		CollateralManager = artifacts.require('CollateralManager');
	});

	const onlyInternalString = 'Only internal contracts allowed';

	before(async () => {
		synths = ['sUSD'];
		({
			AddressResolver: resolver,
			Issuer: issuer,
			SynthsUSD: sUSDSynth,
			ExchangeRates: exchangeRates,
			DebtCache: debtCache,
			FeePool: feePool,
		} = await setupAllContracts({
			accounts,
			synths,
			contracts: [
				'AddressResolver',
				'Synthetix',
				'Issuer',
				'ExchangeRates',
				'SystemStatus',
				'Exchanger',
				'FeePool',
				'CollateralManager',
				'FuturesMarketManager',
			],
		}));

		managerState = await CollateralManagerState.new(owner, ZERO_ADDRESS, { from: deployerAccount });

		manager = await CollateralManager.new(
			managerState.address,
			owner,
			resolver.address,
			toUnit(10000),
			0,
			0,
			{
				from: deployerAccount,
			}
		);

		await managerState.setAssociatedContract(manager.address, { from: owner });

		const state = await CollateralState.new(owner, ZERO_ADDRESS, { from: deployerAccount });

		ceth = await deployCollateral({
			state: state.address,
			owner: owner,
			manager: manager.address,
			resolver: resolver.address,
			collatKey: toBytes32('sETH'),
			minColat: toUnit(1.5),
			minSize: toUnit(1),
		});

		await state.setAssociatedContract(ceth.address, { from: owner });

		await resolver.importAddresses(
			[toBytes32('CollateralEth'), toBytes32('CollateralManager')],
			[ceth.address, manager.address],
			{
				from: owner,
			}
		);

		await manager.rebuildCache();
		await feePool.rebuildCache();
		await debtCache.rebuildCache();

		await manager.addCollaterals([ceth.address], { from: owner });

		await updateRatesWithDefaults();

		await issuesUSDToAccount(toUnit(1000), owner);
		await debtCache.takeDebtSnapshot();
	});

	addSnapshotBeforeRestoreAfterEach();

	const deploySynth = async ({ currencyKey, proxy, tokenState }) => {
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
			`Synth${currencyKey}`,
			currencyKey,
			owner,
			toBytes32(currencyKey),
			web3.utils.toWei('0'),
			resolver.address,
			{
				from: deployerAccount,
			}
		);

		await resolver.importAddresses([toBytes32(`Synth${currencyKey}`)], [synth.address], {
			from: owner,
		});

		await synth.rebuildCache();
		await manager.rebuildCache();
		await debtCache.rebuildCache();

		await ceth.addSynths([toBytes32(`Synth${currencyKey}`)], [toBytes32(currencyKey)], {
			from: owner,
		});

		return { synth, tokenState, proxy };
	};

	describe('when a MultiCollateral synth is added and connected to Synthetix', () => {
		beforeEach(async () => {
			const { synth, tokenState, proxy } = await deploySynth({
				currencyKey: 'sXYZ',
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
			const actual = await this.synth.resolverAddressesRequired();
			assert.deepEqual(
				actual,
				[
					'SystemStatus',
					'Exchanger',
					'Issuer',
					'FeePool',
					'FuturesMarketManager',
					'CollateralManager',
					'EtherCollateral',
					'EtherCollateralsUSD',
				].map(toBytes32)
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
				const timestamp = await currentTime();

				await exchangeRates.updateRates([toBytes32('sXYZ')], [toUnit(5)], timestamp, {
					from: oracle,
				});
			});
			describe('when multiCollateral tries to issue', () => {
				it('then it can issue new synths', async () => {
					const accountToIssue = account1;
					const issueAmount = toUnit('1');
					const totalSupplyBefore = await this.synth.totalSupply();
					const balanceOfBefore = await this.synth.balanceOf(accountToIssue);

					await ceth.open(issueAmount, toBytes32('sXYZ'), { value: toUnit(2), from: account1 });

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
					const amount = toUnit('5');

					const tx = await ceth.open(amount, toBytes32('sXYZ'), {
						value: toUnit(2),
						from: account1,
					});

					const id = await getid(tx);

					await fastForward(300);

					assert.bnEqual(await this.synth.totalSupply(), totalSupplyBefore.add(amount));
					assert.bnEqual(await this.synth.balanceOf(account1), balanceOfBefore.add(amount));

					await ceth.repay(account1, id, toUnit(3), { from: account1 });

					assert.bnEqual(await this.synth.totalSupply(), toUnit(2));
					assert.bnEqual(await this.synth.balanceOf(account1), toUnit(2));
				});
			});

			describe('when synthetix set to account1', () => {
				beforeEach(async () => {
					// have account1 simulate being Issuer so we can invoke issue and burn
					await resolver.importAddresses([toBytes32('Issuer')], [account1], { from: owner });
					// now have the synth resync its cache
					await this.synth.rebuildCache();
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
