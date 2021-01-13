'use strict';

const { contract, web3 } = require('@nomiclabs/buidler');

const { assert, addSnapshotBeforeRestoreAfterEach } = require('./common');

require('./common'); // import common test scaffolding

const { setupContract, setupAllContracts } = require('./setup');

const { currentTime, fastForward, toUnit } = require('../utils')();

const {
	ensureOnlyExpectedMutativeFunctions,
	onlyGivenAddressCanInvoke,
	updateRatesWithDefaults,
	setStatus,
} = require('./helpers');

const { toBytes32 } = require('../..');

contract('BaseSynthetix', async accounts => {
	const [sUSD, sAUD, sEUR, SNX, sETH] = ['sUSD', 'sAUD', 'sEUR', 'SNX', 'sETH'].map(toBytes32);

	const [, owner, account1, account2, account3] = accounts;

	let baseSynthetix,
		exchangeRates,
		debtCache,
		escrow,
		oracle,
		timestamp,
		addressResolver,
		systemStatus;

	before(async () => {
		({
			Synthetix: baseSynthetix,
			AddressResolver: addressResolver,
			ExchangeRates: exchangeRates,
			DebtCache: debtCache,
			SystemStatus: systemStatus,
			SynthetixEscrow: escrow,
		} = await setupAllContracts({
			accounts,
			synths: ['sUSD', 'sETH', 'sEUR', 'sAUD'],
			contracts: [
				'BaseSynthetix',
				'SynthetixState',
				'SupplySchedule',
				'AddressResolver',
				'ExchangeRates',
				'SystemStatus',
				'DebtCache',
				'Issuer',
				'Exchanger',
				'RewardsDistribution',
				'CollateralManager',
				'RewardEscrowV2', // required for collateral check in issuer
			],
		}));

		// Send a price update to guarantee we're not stale.
		oracle = account1;
		timestamp = await currentTime();
	});

	addSnapshotBeforeRestoreAfterEach();

	it('ensure only expected functions are mutative', async () => {
		ensureOnlyExpectedMutativeFunctions({
			abi: baseSynthetix.abi,
			ignoreParents: ['ExternStateToken', 'MixinResolver'],
			expected: [
				'burnSecondary',
				'burnSynths',
				'burnSynthsOnBehalf',
				'burnSynthsToTarget',
				'burnSynthsToTargetOnBehalf',
				'exchange',
				'exchangeOnBehalf',
				'exchangeOnBehalfWithTracking',
				'exchangeWithTracking',
				'exchangeWithVirtual',
				'issueMaxSynths',
				'issueMaxSynthsOnBehalf',
				'issueSynths',
				'issueSynthsOnBehalf',
				'mint',
				'mintSecondary',
				'mintSecondaryRewards',
				'settle',
				'transfer',
				'transferFrom',
				'liquidateDelinquentAccount',
				'liquidateEscrowedSNX',
			],
		});
	});

	describe('constructor', () => {
		it('should set constructor params on deployment', async () => {
			const SYNTHETIX_TOTAL_SUPPLY = web3.utils.toWei('100000000');
			const instance = await setupContract({
				contract: 'BaseSynthetix',
				accounts,
				skipPostDeploy: true,
				args: [account1, account2, owner, SYNTHETIX_TOTAL_SUPPLY, addressResolver.address],
			});

			assert.equal(await instance.proxy(), account1);
			assert.equal(await instance.tokenState(), account2);
			assert.equal(await instance.owner(), owner);
			assert.equal(await instance.totalSupply(), SYNTHETIX_TOTAL_SUPPLY);
			assert.equal(await instance.resolver(), addressResolver.address);
		});

		it('should set constructor params on upgrade to new totalSupply', async () => {
			const YEAR_2_SYNTHETIX_TOTAL_SUPPLY = web3.utils.toWei('175000000');
			const instance = await setupContract({
				contract: 'BaseSynthetix',
				accounts,
				skipPostDeploy: true,
				args: [account1, account2, owner, YEAR_2_SYNTHETIX_TOTAL_SUPPLY, addressResolver.address],
			});

			assert.equal(await instance.proxy(), account1);
			assert.equal(await instance.tokenState(), account2);
			assert.equal(await instance.owner(), owner);
			assert.equal(await instance.totalSupply(), YEAR_2_SYNTHETIX_TOTAL_SUPPLY);
			assert.equal(await instance.resolver(), addressResolver.address);
		});
	});

	describe('non-basic functions always revert', () => {
		const amount = 100;
		it('Exchange should revert no matter who the caller is', async () => {
			await onlyGivenAddressCanInvoke({
				fnc: baseSynthetix.exchange,
				accounts,
				args: [sUSD, amount, sETH],
				reason: 'Cannot be run on this layer',
			});
		});
		it('ExchangeOnBehalf should revert no matter who the caller is', async () => {
			await onlyGivenAddressCanInvoke({
				fnc: baseSynthetix.exchangeOnBehalf,
				accounts,
				args: [account1, sUSD, amount, sETH],
				reason: 'Cannot be run on this layer',
			});
		});
		it('ExchangeWithTracking should revert no matter who the caller is', async () => {
			await onlyGivenAddressCanInvoke({
				fnc: baseSynthetix.exchangeWithTracking,
				accounts,
				args: [sUSD, amount, sAUD, account1, toBytes32('1INCH')],
				reason: 'Cannot be run on this layer',
			});
		});
		it('ExchangeOnBehalfWithTracking should revert no matter who the caller is', async () => {
			await onlyGivenAddressCanInvoke({
				fnc: baseSynthetix.exchangeOnBehalfWithTracking,
				accounts,
				args: [account1, sUSD, amount, sAUD, account2, toBytes32('1INCH')],
				reason: 'Cannot be run on this layer',
			});
		});
		it('ExchangeWithVirtual should revert no matter who the caller is', async () => {
			await onlyGivenAddressCanInvoke({
				fnc: baseSynthetix.exchangeWithVirtual,
				accounts,
				args: [sUSD, amount, sAUD, toBytes32('AGGREGATOR')],
				reason: 'Cannot be run on this layer',
			});
		});
		it('Settle should revert no matter who the caller is', async () => {
			await onlyGivenAddressCanInvoke({
				fnc: baseSynthetix.settle,
				accounts,
				args: [sAUD],
				reason: 'Cannot be run on this layer',
			});
		});
		it('Mint should revert no matter who the caller is', async () => {
			await onlyGivenAddressCanInvoke({
				fnc: baseSynthetix.mint,
				accounts,
				args: [],
				reason: 'Cannot be run on this layer',
			});
		});

		it('LiquidateDelinquentAccount should revert no matter who the caller is', async () => {
			await onlyGivenAddressCanInvoke({
				fnc: baseSynthetix.liquidateDelinquentAccount,
				accounts,
				args: [account1, amount],
				reason: 'Cannot be run on this layer',
			});
		});
		it('MintSecondary should revert no matter who the caller is', async () => {
			await onlyGivenAddressCanInvoke({
				fnc: baseSynthetix.mintSecondary,
				accounts,
				args: [account1, amount],
				reason: 'Cannot be run on this layer',
			});
		});
		it('MintSecondaryRewards should revert no matter who the caller is', async () => {
			await onlyGivenAddressCanInvoke({
				fnc: baseSynthetix.mintSecondaryRewards,
				accounts,
				args: [amount],
				reason: 'Cannot be run on this layer',
			});
		});
		it('BurnSecondary should revert no matter who the caller is', async () => {
			await onlyGivenAddressCanInvoke({
				fnc: baseSynthetix.burnSecondary,
				accounts,
				args: [account1, amount],
				reason: 'Cannot be run on this layer',
			});
		});
	});

	describe('anySynthOrSNXRateIsInvalid()', () => {
		it('should have stale rates initially', async () => {
			assert.equal(await baseSynthetix.anySynthOrSNXRateIsInvalid(), true);
		});
		describe('when synth rates set', () => {
			beforeEach(async () => {
				// fast forward to get past initial SNX setting
				await fastForward((await exchangeRates.rateStalePeriod()).add(web3.utils.toBN('300')));

				timestamp = await currentTime();

				await exchangeRates.updateRates(
					[sAUD, sEUR, sETH],
					['0.5', '1.25', '100'].map(toUnit),
					timestamp,
					{ from: oracle }
				);
				await debtCache.takeDebtSnapshot();
			});
			it('should still have stale rates', async () => {
				assert.equal(await baseSynthetix.anySynthOrSNXRateIsInvalid(), true);
			});
			describe('when SNX is also set', () => {
				beforeEach(async () => {
					timestamp = await currentTime();

					await exchangeRates.updateRates([SNX], ['1'].map(toUnit), timestamp, { from: oracle });
				});
				it('then no stale rates', async () => {
					assert.equal(await baseSynthetix.anySynthOrSNXRateIsInvalid(), false);
				});

				describe('when only some synths are updated', () => {
					beforeEach(async () => {
						await fastForward((await exchangeRates.rateStalePeriod()).add(web3.utils.toBN('300')));

						timestamp = await currentTime();

						await exchangeRates.updateRates([SNX, sAUD], ['0.1', '0.78'].map(toUnit), timestamp, {
							from: oracle,
						});
					});

					it('then anySynthOrSNXRateIsInvalid() returns true', async () => {
						assert.equal(await baseSynthetix.anySynthOrSNXRateIsInvalid(), true);
					});
				});
			});
		});
	});

	describe('availableCurrencyKeys()', () => {
		it('returns all currency keys by default', async () => {
			assert.deepEqual(await baseSynthetix.availableCurrencyKeys(), [sUSD, sETH, sEUR, sAUD]);
		});
	});

	describe('isWaitingPeriod()', () => {
		it('returns false by default', async () => {
			assert.isFalse(await baseSynthetix.isWaitingPeriod(sETH));
		});
	});

	describe('transfer()', () => {
		describe('when the system is suspended', () => {
			beforeEach(async () => {
				// approve for transferFrom to work
				await baseSynthetix.approve(account1, toUnit('10'), { from: owner });
				await setStatus({ owner, systemStatus, section: 'System', suspend: true });
			});
			it('when transfer() is invoked, it reverts with operation prohibited', async () => {
				await assert.revert(
					baseSynthetix.transfer(account1, toUnit('10'), { from: owner }),
					'Operation prohibited'
				);
			});
			it('when transferFrom() is invoked, it reverts with operation prohibited', async () => {
				await assert.revert(
					baseSynthetix.transferFrom(owner, account2, toUnit('10'), { from: account1 }),
					'Operation prohibited'
				);
			});
			describe('when the system is resumed', () => {
				beforeEach(async () => {
					await setStatus({ owner, systemStatus, section: 'System', suspend: false });
				});
				it('when transfer() is invoked, it works as expected', async () => {
					await baseSynthetix.transfer(account1, toUnit('10'), { from: owner });
				});
				it('when transferFrom() is invoked, it works as expected', async () => {
					await baseSynthetix.transferFrom(owner, account2, toUnit('10'), { from: account1 });
				});
			});
		});

		beforeEach(async () => {
			// Ensure all synths have rates to allow issuance
			await updateRatesWithDefaults({ exchangeRates, oracle, debtCache });
		});

		it('should transfer using the ERC20 transfer function @gasprofile', async () => {
			// Ensure our environment is set up correctly for our assumptions
			// e.g. owner owns all SNX.

			assert.bnEqual(await baseSynthetix.totalSupply(), await baseSynthetix.balanceOf(owner));

			const transaction = await baseSynthetix.transfer(account1, toUnit('10'), { from: owner });

			assert.eventEqual(transaction, 'Transfer', {
				from: owner,
				to: account1,
				value: toUnit('10'),
			});

			assert.bnEqual(await baseSynthetix.balanceOf(account1), toUnit('10'));
		});

		it('should revert when exceeding locked synthetix and calling the ERC20 transfer function', async () => {
			// Ensure our environment is set up correctly for our assumptions
			// e.g. owner owns all SNX.
			assert.bnEqual(await baseSynthetix.totalSupply(), await baseSynthetix.balanceOf(owner));

			// Issue max synths.
			await baseSynthetix.issueMaxSynths({ from: owner });

			// Try to transfer 0.000000000000000001 SNX
			await assert.revert(
				baseSynthetix.transfer(account1, '1', { from: owner }),
				'Cannot transfer staked or escrowed SNX'
			);
		});

		it('should transfer using the ERC20 transferFrom function @gasprofile', async () => {
			// Ensure our environment is set up correctly for our assumptions
			// e.g. owner owns all SNX.
			const previousOwnerBalance = await baseSynthetix.balanceOf(owner);
			assert.bnEqual(await baseSynthetix.totalSupply(), previousOwnerBalance);

			// Approve account1 to act on our behalf for 10 SNX.
			let transaction = await baseSynthetix.approve(account1, toUnit('10'), { from: owner });
			assert.eventEqual(transaction, 'Approval', {
				owner: owner,
				spender: account1,
				value: toUnit('10'),
			});

			// Assert that transferFrom works.
			transaction = await baseSynthetix.transferFrom(owner, account2, toUnit('10'), {
				from: account1,
			});

			assert.eventEqual(transaction, 'Transfer', {
				from: owner,
				to: account2,
				value: toUnit('10'),
			});

			// Assert that account2 has 10 SNX and owner has 10 less SNX
			assert.bnEqual(await baseSynthetix.balanceOf(account2), toUnit('10'));
			assert.bnEqual(await baseSynthetix.balanceOf(owner), previousOwnerBalance.sub(toUnit('10')));

			// Assert that we can't transfer more even though there's a balance for owner.
			await assert.revert(
				baseSynthetix.transferFrom(owner, account2, '1', {
					from: account1,
				})
			);
		});

		it('should revert when exceeding locked synthetix and calling the ERC20 transferFrom function', async () => {
			// Ensure our environment is set up correctly for our assumptions
			// e.g. owner owns all SNX.
			assert.bnEqual(await baseSynthetix.totalSupply(), await baseSynthetix.balanceOf(owner));

			// Approve account1 to act on our behalf for 10 SNX.
			const transaction = await baseSynthetix.approve(account1, toUnit('10'), { from: owner });
			assert.eventEqual(transaction, 'Approval', {
				owner: owner,
				spender: account1,
				value: toUnit('10'),
			});

			// Issue max synths
			await baseSynthetix.issueMaxSynths({ from: owner });

			// Assert that transferFrom fails even for the smallest amount of SNX.
			await assert.revert(
				baseSynthetix.transferFrom(owner, account2, '1', {
					from: account1,
				}),
				'Cannot transfer staked or escrowed SNX'
			);
		});

		describe('rates stale for transfers', () => {
			const value = toUnit('300');
			const ensureTransferReverts = async () => {
				await assert.revert(
					baseSynthetix.transfer(account2, value, { from: account1 }),
					'A synth or SNX rate is invalid'
				);
				await assert.revert(
					baseSynthetix.transferFrom(account2, account1, value, {
						from: account3,
					}),
					'A synth or SNX rate is invalid'
				);
			};

			beforeEach(async () => {
				// Give some SNX to account1 & account2
				await baseSynthetix.transfer(account1, toUnit('10000'), {
					from: owner,
				});
				await baseSynthetix.transfer(account2, toUnit('10000'), {
					from: owner,
				});

				// Ensure that we can do a successful transfer before rates go stale
				await baseSynthetix.transfer(account2, value, { from: account1 });

				// approve account3 to transferFrom account2
				await baseSynthetix.approve(account3, toUnit('10000'), { from: account2 });
				await baseSynthetix.transferFrom(account2, account1, value, {
					from: account3,
				});
			});

			describe('when the user has a debt position', () => {
				beforeEach(async () => {
					// ensure the accounts have a debt position
					await Promise.all([
						baseSynthetix.issueSynths(toUnit('1'), { from: account1 }),
						baseSynthetix.issueSynths(toUnit('1'), { from: account2 }),
					]);

					// Now jump forward in time so the rates are stale
					await fastForward((await exchangeRates.rateStalePeriod()) + 1);
				});
				it('should not allow transfer if the exchange rate for SNX is stale', async () => {
					await ensureTransferReverts();

					const timestamp = await currentTime();

					// now give some synth rates
					await exchangeRates.updateRates([sAUD, sEUR], ['0.5', '1.25'].map(toUnit), timestamp, {
						from: oracle,
					});
					await debtCache.takeDebtSnapshot();

					await ensureTransferReverts();

					// the remainder of the synths have prices
					await exchangeRates.updateRates([sETH], ['100'].map(toUnit), timestamp, {
						from: oracle,
					});
					await debtCache.takeDebtSnapshot();

					await ensureTransferReverts();

					// now give SNX rate
					await exchangeRates.updateRates([SNX], ['1'].map(toUnit), timestamp, {
						from: oracle,
					});

					// now SNX transfer should work
					await baseSynthetix.transfer(account2, value, { from: account1 });
					await baseSynthetix.transferFrom(account2, account1, value, {
						from: account3,
					});
				});

				it('should not allow transfer if the exchange rate for any synth is stale', async () => {
					await ensureTransferReverts();

					const timestamp = await currentTime();

					// now give SNX rate
					await exchangeRates.updateRates([SNX], ['1'].map(toUnit), timestamp, {
						from: oracle,
					});
					await debtCache.takeDebtSnapshot();

					await ensureTransferReverts();

					// now give some synth rates
					await exchangeRates.updateRates([sAUD, sEUR], ['0.5', '1.25'].map(toUnit), timestamp, {
						from: oracle,
					});
					await debtCache.takeDebtSnapshot();

					await ensureTransferReverts();

					// now give the remainder of synths rates
					await exchangeRates.updateRates([sETH], ['100'].map(toUnit), timestamp, {
						from: oracle,
					});
					await debtCache.takeDebtSnapshot();

					// now SNX transfer should work
					await baseSynthetix.transfer(account2, value, { from: account1 });
					await baseSynthetix.transferFrom(account2, account1, value, {
						from: account3,
					});
				});
			});

			describe('when the user has no debt', () => {
				it('should allow transfer if the exchange rate for SNX is stale', async () => {
					// SNX transfer should work
					await baseSynthetix.transfer(account2, value, { from: account1 });
					await baseSynthetix.transferFrom(account2, account1, value, {
						from: account3,
					});
				});

				it('should allow transfer if the exchange rate for any synth is stale', async () => {
					// now SNX transfer should work
					await baseSynthetix.transfer(account2, value, { from: account1 });
					await baseSynthetix.transferFrom(account2, account1, value, {
						from: account3,
					});
				});
			});
		});

		describe('when the user holds SNX', () => {
			beforeEach(async () => {
				await baseSynthetix.transfer(account1, toUnit('1000'), {
					from: owner,
				});
			});

			describe('and has an escrow entry', () => {
				beforeEach(async () => {
					// Setup escrow
					const escrowedSynthetixs = toUnit('30000');
					await baseSynthetix.transfer(escrow.address, escrowedSynthetixs, {
						from: owner,
					});
				});

				it('should allow transfer of synthetix by default', async () => {
					await baseSynthetix.transfer(account2, toUnit('100'), { from: account1 });
				});

				describe('when the user has a debt position (i.e. has issued)', () => {
					beforeEach(async () => {
						await baseSynthetix.issueSynths(toUnit('10'), { from: account1 });
					});

					it('should not allow transfer of synthetix in escrow', async () => {
						// Ensure the transfer fails as all the synthetix are in escrow
						await assert.revert(
							baseSynthetix.transfer(account2, toUnit('990'), { from: account1 }),
							'Cannot transfer staked or escrowed SNX'
						);
					});
				});
			});
		});

		it('should not be possible to transfer locked synthetix', async () => {
			const issuedSynthetixs = web3.utils.toBN('200000');
			await baseSynthetix.transfer(account1, toUnit(issuedSynthetixs), {
				from: owner,
			});

			// Issue
			const amountIssued = toUnit('2000');
			await baseSynthetix.issueSynths(amountIssued, { from: account1 });

			await assert.revert(
				baseSynthetix.transfer(account2, toUnit(issuedSynthetixs), {
					from: account1,
				}),
				'Cannot transfer staked or escrowed SNX'
			);
		});
	});
});
