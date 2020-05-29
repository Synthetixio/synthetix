'use strict';

const { contract } = require('@nomiclabs/buidler');

const { assert, addSnapshotBeforeRestoreAfterEach } = require('./common');

const { setupAllContracts, setupContract } = require('./setup');

const { currentTime, multiplyDecimal, divideDecimal, toUnit, fastForward } = require('../utils')();

const {
	onlyGivenAddressCanInvoke,
	ensureOnlyExpectedMutativeFunctions,
	setStatus,
} = require('./helpers');

const {
	constants: { ZERO_ADDRESS },
} = require('../..');

const { toBytes32 } = require('../..');

contract('Liquidations', accounts => {
	const [sUSD, SNX] = ['sUSD', 'SNX'].map(toBytes32);
	const [deployerAccount, owner, oracle, account1, alice, bob, carol] = accounts;
	const [week, month] = [604800, 2629743];

	let addressResolver,
		issuer,
		exchangeRates,
		liquidations,
		eternalStorageLiquidations,
		synthetix,
		synthetixState,
		timestamp;

	// run this once before all tests to prepare our environment, snapshots on beforeEach will take
	// care of resetting to this state
	before(async () => {
		({
			AddressResolver: addressResolver,
			ExchangeRates: exchangeRates,
			Issuer: issuer,
			Liquidations: liquidations,
			EternalStorageLiquidations: eternalStorageLiquidations,
			Synthetix: synthetix,
			SynthetixState: synthetixState,
		} = await setupAllContracts({
			accounts,
			synths: [],
			contracts: [
				'AddressResolver',
				'ExchangeRates',
				'Issuer',
				'Liquidations',
				'EternalStorageLiquidations',
				'Synthetix',
				'SynthetixState',
			],
		}));
	});

	addSnapshotBeforeRestoreAfterEach();

	beforeEach(async () => {
		timestamp = await currentTime();

		await exchangeRates.updateRates([SNX], ['0.1'].map(toUnit), timestamp, {
			from: oracle,
		});
	});

	it('ensure only known functions are mutative', () => {
		ensureOnlyExpectedMutativeFunctions({
			abi: liquidations.abi,
			ignoreParents: ['MixinResolver'],
			expected: [
				'flagAccountForLiquidation',
				'removeAccountInLiquidation',
				'checkAndRemoveAccountInLiquidation',
				'setLiquidationDelay',
				'setLiquidationRatio',
				'setLiquidationPenalty',
			],
		});
	});

	it('should set constructor params on deployment', async () => {
		const instance = await setupContract({
			contract: 'Liquidations',
			accounts,
			skipPostDeploy: true,
			args: [account1, addressResolver.address],
		});

		assert.equal(await instance.owner(), account1);
		assert.equal(await instance.resolver(), addressResolver.address);
	});

	describe('protected methods', () => {
		describe('only owner functions', () => {
			it('setLiquidationDelay() can only be invoked by owner', async () => {
				await onlyGivenAddressCanInvoke({
					fnc: liquidations.setLiquidationDelay,
					args: [week],
					address: owner,
					accounts,
					reason: 'Only the contract owner may perform this action',
				});
			});
			it('setLiquidationRatio() can only be invoked by owner', async () => {
				await onlyGivenAddressCanInvoke({
					fnc: liquidations.setLiquidationRatio,
					args: [200],
					address: owner,
					accounts,
					reason: 'Only the contract owner may perform this action',
				});
			});
			it('setLiquidationPenalty() can only be invoked by owner', async () => {
				await onlyGivenAddressCanInvoke({
					fnc: liquidations.setLiquidationPenalty,
					args: [20],
					address: owner,
					accounts,
					reason: 'Only the contract owner may perform this action',
				});
			});
		});

		describe('Only internal contracts can call', () => {
			beforeEach(async () => {
				await liquidations.flagAccountForLiquidation(alice, { from: bob });
			});
			it('removeAccountInLiquidation() can only be invoked by synthetix', async () => {
				await onlyGivenAddressCanInvoke({
					fnc: liquidations.removeAccountInLiquidation,
					args: [alice],
					address: synthetix.address,
					accounts,
					reason: 'Liquidations: Only the synthetix or Issuer contract can perform this action',
				});
			});
			it('removeAccountInLiquidation() can only be invoked by issuer', async () => {
				await onlyGivenAddressCanInvoke({
					fnc: liquidations.removeAccountInLiquidation,
					args: [alice],
					address: issuer.address,
					accounts,
					reason: 'Liquidations: Only the synthetix or Issuer contract can perform this action',
				});
			});
		});

		describe('Given Alice is undercollateralized', () => {
			beforeEach(async () => {});
			describe('when bob flags Alice for liquidation', () => {
				beforeEach(async () => {});
				it('then a liquidation entry is added for Alice');
				it('then sets a deadline liquidation delay of 2 weeks');
				it('then emits an event accountFlaggedForLiquidation');
				describe('when Bob or anyone else tries to flag Alice address for liquidation again', () => {
					beforeEach(async () => {});
					it('then it fails as Alices address is already flagged');
				});
				describe('Given Alice does not fix her c ratio and 2 weeks have passed', () => {
					beforeEach(async () => {});
					describe('when bob calls liquidateSynthetix and burns 100 sUSD to liquidate SNX', () => {
						beforeEach(async () => {});

						it('then Bob sUSD balance is reduced by 100 sUSD');
						it('then Bob has 100 sUSD worth SNX + the penalty');
						it('then Alice debt is reduced by 100 sUSD');
						it('then Alice has less SNX + penalty');
					});
				});
			});
		});
	});
});
