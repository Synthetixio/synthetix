'use strict';

const { contract } = require('hardhat');
const { assert, addSnapshotBeforeRestoreAfterEach } = require('../contracts/common');
const { toUnit } = require('../utils')();

const {
	ensureOnlyExpectedMutativeFunctions,
	onlyGivenAddressCanInvoke,
	setupPriceAggregators,
	updateAggregatorRates,
} = require('../contracts/helpers');

const { setupAllContracts } = require('../contracts/setup');
const { toBytes32 } = require('../..');

contract('DynamicSynthRedeemer', async accounts => {
	const synths = ['sUSD', 'sETH', 'ETH', 'SNX'];
	const [sETH, ETH] = ['sETH', 'ETH'].map(toBytes32);

	const [, owner, , , account1] = accounts;

	let instance;
	let addressResolver,
		dynamicSynthRedeemer,
		exchangeRates,
		issuer,
		proxysETH,
		proxysUSD,
		proxySynthetix;

	before(async () => {
		({
			AddressResolver: addressResolver,
			DynamicSynthRedeemer: dynamicSynthRedeemer,
			ExchangeRates: exchangeRates,
			Issuer: issuer,
			ProxyERC20sETH: proxysETH,
			ProxyERC20sUSD: proxysUSD,
			ProxySynthetix: proxySynthetix,
		} = await setupAllContracts({
			accounts,
			synths,
			contracts: [
				'AddressResolver',
				'DebtCache',
				'DynamicSynthRedeemer',
				'ExchangeRates',
				'Issuer',
				'Liquidator',
				'LiquidatorRewards',
				'ProxyERC20',
				'RewardEscrowV2',
			],
		}));

		await setupPriceAggregators(exchangeRates, owner, [sETH, ETH]);
		await updateAggregatorRates(exchangeRates, null, [sETH, ETH], ['5000', '5000'].map(toUnit));
	});

	addSnapshotBeforeRestoreAfterEach();

	it('ensure only known functions are mutative', () => {
		ensureOnlyExpectedMutativeFunctions({
			abi: dynamicSynthRedeemer.abi,
			ignoreParents: ['Owned', 'MixinResolver'],
			expected: [
				'redeem',
				'redeemAll',
				'redeemPartial',
				'setDiscountRate',
				'resumeRedemption',
				'suspendRedemption',
			],
		});
	});

	describe('On contract deployment', async () => {
		beforeEach(async () => {
			instance = dynamicSynthRedeemer;
		});

		it('should set constructor params', async () => {
			assert.equal(await instance.owner(), owner);
			assert.equal(await instance.resolver(), addressResolver.address);
		});

		it('should set default discount rate', async () => {
			assert.bnEqual(await instance.getDiscountRate(), toUnit('1'));
		});

		it('should not be active for redemption', async () => {
			assert.equal(await instance.redemptionActive(), false);
		});

		it('should access its dependencies via the address resolver', async () => {
			assert.equal(await addressResolver.getAddress(toBytes32('Issuer')), issuer.address);
			assert.equal(
				await addressResolver.getAddress(toBytes32('ExchangeRates')),
				exchangeRates.address
			);
		});
	});

	describe('suspendRedemption', () => {
		describe('failure modes', () => {
			beforeEach(async () => {
				// first resume redemptions
				await instance.resumeRedemption({ from: owner });
			});

			it('reverts when not invoked by the owner', async () => {
				await onlyGivenAddressCanInvoke({
					fnc: instance.suspendRedemption,
					args: [],
					accounts,
					reason: 'Only the contract owner may perform this action',
					address: owner,
				});
			});

			it('reverts when redemption is already suspended', async () => {
				await instance.suspendRedemption({ from: owner });
				await assert.revert(instance.suspendRedemption({ from: owner }), 'Redemption suspended');
			});
		});

		describe('when invoked by the owner', () => {
			let txn;
			beforeEach(async () => {
				// first resume redemptions
				await instance.resumeRedemption({ from: owner });
				txn = await instance.suspendRedemption({ from: owner });
			});

			it('and redemptionActive is false', async () => {
				assert.equal(await instance.redemptionActive(), false);
			});

			it('and a RedemptionSuspended event is emitted', async () => {
				assert.eventEqual(txn, 'RedemptionSuspended', []);
			});
		});
	});

	describe('resumeRedemption', () => {
		describe('failure modes', () => {
			it('reverts when not invoked by the owner', async () => {
				await onlyGivenAddressCanInvoke({
					fnc: instance.resumeRedemption,
					args: [],
					accounts,
					reason: 'Only the contract owner may perform this action',
					address: owner,
				});
			});

			it('reverts when redemption is not suspended', async () => {
				await instance.resumeRedemption({ from: owner });
				await assert.revert(instance.resumeRedemption({ from: owner }), 'Redemption not suspended');
			});
		});

		describe('when redemption is suspended', () => {
			it('redemptionActive is false', async () => {
				assert.equal(await instance.redemptionActive(), false);
			});

			describe('when invoked by the owner', () => {
				let txn;
				beforeEach(async () => {
					txn = await instance.resumeRedemption({ from: owner });
				});

				it('redemptions are active again', async () => {
					assert.equal(await instance.redemptionActive(), true);
				});

				it('a RedemptionResumed event is emitted', async () => {
					assert.eventEqual(txn, 'RedemptionResumed', []);
				});
			});
		});
	});

	describe('setDiscountRate()', () => {
		it('may only be called by the owner', async () => {
			await onlyGivenAddressCanInvoke({
				fnc: instance.setDiscountRate,
				args: [toUnit('1.0')],
				accounts,
				address: owner,
				reason: 'Only the contract owner may perform this action',
			});
		});

		it('may not set a rate greater than 1', async () => {
			await assert.revert(
				instance.setDiscountRate(toUnit('1.000001'), { from: owner }),
				'Invalid rate'
			);
		});
	});

	describe('redemption', () => {
		describe('redeem()', () => {
			beforeEach(async () => {
				await instance.resumeRedemption({ from: owner });
			});

			it('reverts when redemption is suspended', async () => {
				await instance.suspendRedemption({ from: owner });
				await assert.revert(
					instance.redeem(proxysETH.address, {
						from: account1,
					}),
					'Redemption deactivated'
				);
			});

			it('reverts when discount rate is set to zero', async () => {
				await instance.setDiscountRate(toUnit('0'), { from: owner });
				await assert.revert(
					instance.redeem(proxysETH.address, {
						from: account1,
					}),
					'Synth not redeemable'
				);
			});

			it('reverts when user has no balance', async () => {
				await assert.revert(
					instance.redeem(proxysETH.address, {
						from: account1,
					}),
					'No balance of synth to redeem'
				);
			});

			it('reverts when user attempts to redeem sUSD', async () => {
				await assert.revert(
					instance.redeem(proxysUSD.address, {
						from: account1,
					}),
					'Cannot redeem sUSD'
				);
			});

			it('reverts when user attempts to redeem a non-synth token', async () => {
				await assert.revert(
					instance.redeem(proxySynthetix.address, {
						from: account1,
					})
				);
			});

			describe('when the user has a synth balance', () => {
				let userBalanceBefore;
				beforeEach(async () => {
					// TODO: check owner ETH balance
					// if got ETH, wrap it using ETH wrapper to get sETH and transfer to account1

					// await proxysETH.transfer(account1, toUnit('5'), { from: owner });
					userBalanceBefore = await proxysETH.balanceOf(account1);
					console.log(userBalanceBefore);
				});
				describe('when redeem is called by the user', () => {
					// let txn;
					// beforeEach(async () => {
					// 	txn = await instance.redeem(proxysETH.address, { from: account1 });
					// });
					// it('emitting a SynthRedeemed event', async () => {
					// 	assert.eventEqual(txn, 'SynthRedeemed', {
					// 		synth: proxysETH.address,
					// 		account: account1,
					// 		amountOfSynth: userBalanceBefore,
					// 		amountInsUSD: toUnit('25000'), // 5 sETH redeemed at price of 5000 is 25000 sUSD
					// 	});
					// });
				});
			});
		});
		describe('redeemAll()', () => {});
		describe('redeemPartial()', () => {});
	});
});
