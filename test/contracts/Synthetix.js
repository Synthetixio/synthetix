'use strict';

const { contract, web3 } = require('@nomiclabs/buidler');

const { assert, addSnapshotBeforeRestoreAfterEach } = require('./common');

require('./common'); // import common test scaffolding

const { setupContract, setupAllContracts } = require('./setup');

const { currentTime, fastForward, fastForwardTo, toUnit, fromUnit } = require('../utils')();

const {
	ensureOnlyExpectedMutativeFunctions,
	updateRatesWithDefaults,
	setStatus,
} = require('./helpers');

const {
	toBytes32,
	constants: { inflationStartTimestampInSecs },
} = require('../..');

contract('Synthetix', async accounts => {
	const [sUSD, sAUD, sEUR, SNX, sETH] = ['sUSD', 'sAUD', 'sEUR', 'SNX', 'sETH'].map(toBytes32);

	const [, owner, account1, account2, account3] = accounts;

	let synthetix,
		exchangeRates,
		systemSettings,
		supplySchedule,
		escrow,
		rewardEscrow,
		oracle,
		timestamp,
		addressResolver,
		systemStatus;

	before(async () => {
		({
			Synthetix: synthetix,
			AddressResolver: addressResolver,
			ExchangeRates: exchangeRates,
			SystemStatus: systemStatus,
			SystemSettings: systemSettings,
			SynthetixEscrow: escrow,
			RewardEscrow: rewardEscrow,
			SupplySchedule: supplySchedule,
			// Proxy: proxy,
		} = await setupAllContracts({
			accounts,
			synths: ['sUSD', 'sETH', 'sEUR', 'sAUD'],
			contracts: [
				'Synthetix',
				'SynthetixState',
				'SupplySchedule',
				'SystemSettings',
				'AddressResolver',
				'ExchangeRates',
				'SystemStatus',
				'Issuer',
				'Exchanger',
				'RewardsDistribution',
			],
		}));

		// Send a price update to guarantee we're not stale.
		oracle = account1;
		timestamp = await currentTime();
	});

	addSnapshotBeforeRestoreAfterEach();

	it('ensure only expected functions are mutative', async () => {
		ensureOnlyExpectedMutativeFunctions({
			abi: synthetix.abi,
			ignoreParents: ['ExternStateToken', 'MixinResolver'],
			expected: [
				'burnSynths',
				'burnSynthsOnBehalf',
				'burnSynthsToTarget',
				'burnSynthsToTargetOnBehalf',
				'emitExchangeRebate',
				'emitExchangeReclaim',
				'emitSynthExchange',
				'exchange',
				'exchangeOnBehalf',
				'exchangeWithTracking',
				'exchangeOnBehalfWithTracking',
				'issueMaxSynths',
				'issueMaxSynthsOnBehalf',
				'issueSynths',
				'issueSynthsOnBehalf',
				'mint',
				'settle',
				'transfer',
				'transferFrom',
				'liquidateDelinquentAccount',
			],
		});
	});

	describe('constructor', () => {
		it('should set constructor params on deployment', async () => {
			const SYNTHETIX_TOTAL_SUPPLY = web3.utils.toWei('100000000');
			const instance = await setupContract({
				contract: 'Synthetix',
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
				contract: 'Synthetix',
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

	describe('anySynthOrSNXRateIsInvalid()', () => {
		it('should have stale rates initially', async () => {
			assert.equal(await synthetix.anySynthOrSNXRateIsInvalid(), true);
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
			});
			it('should still have stale rates', async () => {
				assert.equal(await synthetix.anySynthOrSNXRateIsInvalid(), true);
			});
			describe('when SNX is also set', () => {
				beforeEach(async () => {
					timestamp = await currentTime();

					await exchangeRates.updateRates([SNX], ['1'].map(toUnit), timestamp, { from: oracle });
				});
				it('then no stale rates', async () => {
					assert.equal(await synthetix.anySynthOrSNXRateIsInvalid(), false);
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
						assert.equal(await synthetix.anySynthOrSNXRateIsInvalid(), true);
					});
				});
			});
		});
	});

	describe('availableCurrencyKeys()', () => {
		it('returns all currency keys by default', async () => {
			assert.deepEqual(await synthetix.availableCurrencyKeys(), [sUSD, sETH, sEUR, sAUD]);
		});
	});

	describe('isWaitingPeriod()', () => {
		it('returns false by default', async () => {
			assert.isFalse(await synthetix.isWaitingPeriod(sETH));
		});
		describe('when a user has exchanged into sETH', () => {
			beforeEach(async () => {
				await updateRatesWithDefaults({ exchangeRates, oracle });

				await synthetix.issueSynths(toUnit('100'), { from: owner });
				await synthetix.exchange(sUSD, toUnit('10'), sETH, { from: owner });
			});
			it('then waiting period is true', async () => {
				assert.isTrue(await synthetix.isWaitingPeriod(sETH));
			});
			describe('when the waiting period expires', () => {
				beforeEach(async () => {
					await fastForward(await systemSettings.waitingPeriodSecs());
				});
				it('returns false by default', async () => {
					assert.isFalse(await synthetix.isWaitingPeriod(sETH));
				});
			});
		});
	});
	describe('transfer()', () => {
		describe('when the system is suspended', () => {
			beforeEach(async () => {
				// approve for transferFrom to work
				await synthetix.approve(account1, toUnit('10'), { from: owner });
				await setStatus({ owner, systemStatus, section: 'System', suspend: true });
			});
			it('when transfer() is invoked, it reverts with operation prohibited', async () => {
				await assert.revert(
					synthetix.transfer(account1, toUnit('10'), { from: owner }),
					'Operation prohibited'
				);
			});
			it('when transferFrom() is invoked, it reverts with operation prohibited', async () => {
				await assert.revert(
					synthetix.transferFrom(owner, account2, toUnit('10'), { from: account1 }),
					'Operation prohibited'
				);
			});
			describe('when the system is resumed', () => {
				beforeEach(async () => {
					await setStatus({ owner, systemStatus, section: 'System', suspend: false });
				});
				it('when transfer() is invoked, it works as expected', async () => {
					await synthetix.transfer(account1, toUnit('10'), { from: owner });
				});
				it('when transferFrom() is invoked, it works as expected', async () => {
					await synthetix.transferFrom(owner, account2, toUnit('10'), { from: account1 });
				});
			});
		});

		beforeEach(async () => {
			// Ensure all synths have rates to allow issuance
			await updateRatesWithDefaults({ exchangeRates, oracle });
		});

		it('should transfer using the ERC20 transfer function @gasprofile', async () => {
			// Ensure our environment is set up correctly for our assumptions
			// e.g. owner owns all SNX.

			assert.bnEqual(await synthetix.totalSupply(), await synthetix.balanceOf(owner));

			const transaction = await synthetix.transfer(account1, toUnit('10'), { from: owner });

			assert.eventEqual(transaction, 'Transfer', {
				from: owner,
				to: account1,
				value: toUnit('10'),
			});

			assert.bnEqual(await synthetix.balanceOf(account1), toUnit('10'));
		});

		it('should revert when exceeding locked synthetix and calling the ERC20 transfer function', async () => {
			// Ensure our environment is set up correctly for our assumptions
			// e.g. owner owns all SNX.
			assert.bnEqual(await synthetix.totalSupply(), await synthetix.balanceOf(owner));

			// Issue max synths.
			await synthetix.issueMaxSynths({ from: owner });

			// Try to transfer 0.000000000000000001 SNX
			await assert.revert(
				synthetix.transfer(account1, '1', { from: owner }),
				'Cannot transfer staked or escrowed SNX'
			);
		});

		it('should transfer using the ERC20 transferFrom function @gasprofile', async () => {
			// Ensure our environment is set up correctly for our assumptions
			// e.g. owner owns all SNX.
			const previousOwnerBalance = await synthetix.balanceOf(owner);
			assert.bnEqual(await synthetix.totalSupply(), previousOwnerBalance);

			// Approve account1 to act on our behalf for 10 SNX.
			let transaction = await synthetix.approve(account1, toUnit('10'), { from: owner });
			assert.eventEqual(transaction, 'Approval', {
				owner: owner,
				spender: account1,
				value: toUnit('10'),
			});

			// Assert that transferFrom works.
			transaction = await synthetix.transferFrom(owner, account2, toUnit('10'), { from: account1 });

			assert.eventEqual(transaction, 'Transfer', {
				from: owner,
				to: account2,
				value: toUnit('10'),
			});

			// Assert that account2 has 10 SNX and owner has 10 less SNX
			assert.bnEqual(await synthetix.balanceOf(account2), toUnit('10'));
			assert.bnEqual(await synthetix.balanceOf(owner), previousOwnerBalance.sub(toUnit('10')));

			// Assert that we can't transfer more even though there's a balance for owner.
			await assert.revert(
				synthetix.transferFrom(owner, account2, '1', {
					from: account1,
				})
			);
		});

		it('should revert when exceeding locked synthetix and calling the ERC20 transferFrom function', async () => {
			// Ensure our environment is set up correctly for our assumptions
			// e.g. owner owns all SNX.
			assert.bnEqual(await synthetix.totalSupply(), await synthetix.balanceOf(owner));

			// Approve account1 to act on our behalf for 10 SNX.
			const transaction = await synthetix.approve(account1, toUnit('10'), { from: owner });
			assert.eventEqual(transaction, 'Approval', {
				owner: owner,
				spender: account1,
				value: toUnit('10'),
			});

			// Issue max synths
			await synthetix.issueMaxSynths({ from: owner });

			// Assert that transferFrom fails even for the smallest amount of SNX.
			await assert.revert(
				synthetix.transferFrom(owner, account2, '1', {
					from: account1,
				}),
				'Cannot transfer staked or escrowed SNX'
			);
		});

		describe('when the user has issued some sUSD and exchanged for other synths', () => {
			beforeEach(async () => {
				await synthetix.issueSynths(toUnit('100'), { from: owner });
				await synthetix.exchange(sUSD, toUnit('10'), sETH, { from: owner });
				await synthetix.exchange(sUSD, toUnit('10'), sAUD, { from: owner });
				await synthetix.exchange(sUSD, toUnit('10'), sEUR, { from: owner });
			});
			it('should transfer using the ERC20 transfer function @gasprofile', async () => {
				await synthetix.transfer(account1, toUnit('10'), { from: owner });

				assert.bnEqual(await synthetix.balanceOf(account1), toUnit('10'));
			});

			it('should transfer using the ERC20 transferFrom function @gasprofile', async () => {
				const previousOwnerBalance = await synthetix.balanceOf(owner);

				// Approve account1 to act on our behalf for 10 SNX.
				await synthetix.approve(account1, toUnit('10'), { from: owner });

				// Assert that transferFrom works.
				await synthetix.transferFrom(owner, account2, toUnit('10'), {
					from: account1,
				});

				// Assert that account2 has 10 SNX and owner has 10 less SNX
				assert.bnEqual(await synthetix.balanceOf(account2), toUnit('10'));
				assert.bnEqual(await synthetix.balanceOf(owner), previousOwnerBalance.sub(toUnit('10')));

				// Assert that we can't transfer more even though there's a balance for owner.
				await assert.revert(
					synthetix.transferFrom(owner, account2, '1', {
						from: account1,
					})
				);
			});
		});

		describe('rates stale for transfers', () => {
			const value = toUnit('300');
			const ensureTransferReverts = async () => {
				await assert.revert(
					synthetix.transfer(account2, value, { from: account1 }),
					'A synth or SNX rate is invalid'
				);
				await assert.revert(
					synthetix.transferFrom(account2, account1, value, {
						from: account3,
					}),
					'A synth or SNX rate is invalid'
				);
			};

			beforeEach(async () => {
				// Give some SNX to account1 & account2
				await synthetix.transfer(account1, toUnit('10000'), {
					from: owner,
				});
				await synthetix.transfer(account2, toUnit('10000'), {
					from: owner,
				});

				// Ensure that we can do a successful transfer before rates go stale
				await synthetix.transfer(account2, value, { from: account1 });

				// approve account3 to transferFrom account2
				await synthetix.approve(account3, toUnit('10000'), { from: account2 });
				await synthetix.transferFrom(account2, account1, value, {
					from: account3,
				});
			});

			describe('when the user has a debt position', () => {
				beforeEach(async () => {
					// ensure the accounts have a debt position
					await Promise.all([
						synthetix.issueSynths(toUnit('1'), { from: account1 }),
						synthetix.issueSynths(toUnit('1'), { from: account2 }),
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

					await ensureTransferReverts();

					// the remainder of the synths have prices
					await exchangeRates.updateRates([sETH], ['100'].map(toUnit), timestamp, {
						from: oracle,
					});

					await ensureTransferReverts();

					// now give SNX rate
					await exchangeRates.updateRates([SNX], ['1'].map(toUnit), timestamp, {
						from: oracle,
					});

					// now SNX transfer should work
					await synthetix.transfer(account2, value, { from: account1 });
					await synthetix.transferFrom(account2, account1, value, {
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

					await ensureTransferReverts();

					// now give some synth rates
					await exchangeRates.updateRates([sAUD, sEUR], ['0.5', '1.25'].map(toUnit), timestamp, {
						from: oracle,
					});

					await ensureTransferReverts();

					// now give the remainder of synths rates
					await exchangeRates.updateRates([sETH], ['100'].map(toUnit), timestamp, {
						from: oracle,
					});

					// now SNX transfer should work
					await synthetix.transfer(account2, value, { from: account1 });
					await synthetix.transferFrom(account2, account1, value, {
						from: account3,
					});
				});
			});

			describe('when the user has no debt', () => {
				it('should allow transfer if the exchange rate for SNX is stale', async () => {
					// SNX transfer should work
					await synthetix.transfer(account2, value, { from: account1 });
					await synthetix.transferFrom(account2, account1, value, {
						from: account3,
					});
				});

				it('should allow transfer if the exchange rate for any synth is stale', async () => {
					// now SNX transfer should work
					await synthetix.transfer(account2, value, { from: account1 });
					await synthetix.transferFrom(account2, account1, value, {
						from: account3,
					});
				});
			});
		});

		describe('when the user holds SNX', () => {
			beforeEach(async () => {
				await synthetix.transfer(account1, toUnit('1000'), {
					from: owner,
				});
			});

			describe('and has an escrow entry', () => {
				beforeEach(async () => {
					// Setup escrow
					const escrowedSynthetixs = toUnit('30000');
					await synthetix.transfer(escrow.address, escrowedSynthetixs, {
						from: owner,
					});
				});

				it('should allow transfer of synthetix by default', async () => {
					await synthetix.transfer(account2, toUnit('100'), { from: account1 });
				});

				describe('when the user has a debt position (i.e. has issued)', () => {
					beforeEach(async () => {
						await synthetix.issueSynths(toUnit('10'), { from: account1 });
					});

					it('should not allow transfer of synthetix in escrow', async () => {
						// Ensure the transfer fails as all the synthetix are in escrow
						await assert.revert(
							synthetix.transfer(account2, toUnit('990'), { from: account1 }),
							'Cannot transfer staked or escrowed SNX'
						);
					});
				});
			});
		});

		it('should not be possible to transfer locked synthetix', async () => {
			const issuedSynthetixs = web3.utils.toBN('200000');
			await synthetix.transfer(account1, toUnit(issuedSynthetixs), {
				from: owner,
			});

			// Issue
			const amountIssued = toUnit('2000');
			await synthetix.issueSynths(amountIssued, { from: account1 });

			await assert.revert(
				synthetix.transfer(account2, toUnit(issuedSynthetixs), {
					from: account1,
				}),
				'Cannot transfer staked or escrowed SNX'
			);
		});

		it("should lock newly received synthetix if the user's collaterisation is too high", async () => {
			// Set sEUR for purposes of this test
			const timestamp1 = await currentTime();
			await exchangeRates.updateRates([sEUR], [toUnit('0.75')], timestamp1, { from: oracle });

			const issuedSynthetixs = web3.utils.toBN('200000');
			await synthetix.transfer(account1, toUnit(issuedSynthetixs), {
				from: owner,
			});
			await synthetix.transfer(account2, toUnit(issuedSynthetixs), {
				from: owner,
			});

			const maxIssuableSynths = await synthetix.maxIssuableSynths(account1);

			// Issue
			await synthetix.issueSynths(maxIssuableSynths, { from: account1 });

			// Exchange into sEUR
			await synthetix.exchange(sUSD, maxIssuableSynths, sEUR, { from: account1 });

			// Ensure that we can transfer in and out of the account successfully
			await synthetix.transfer(account1, toUnit('10000'), {
				from: account2,
			});
			await synthetix.transfer(account2, toUnit('10000'), {
				from: account1,
			});

			// Increase the value of sEUR relative to synthetix
			const timestamp2 = await currentTime();
			await exchangeRates.updateRates([sEUR], [toUnit('2.10')], timestamp2, { from: oracle });

			// Ensure that the new synthetix account1 receives cannot be transferred out.
			await synthetix.transfer(account1, toUnit('10000'), {
				from: account2,
			});
			await assert.revert(synthetix.transfer(account2, toUnit('10000'), { from: account1 }));
		});

		it('should unlock synthetix when collaterisation ratio changes', async () => {
			// prevent circuit breaker from firing by upping the threshold to factor 5
			await systemSettings.setPriceDeviationThresholdFactor(toUnit('5'), { from: owner });

			// Set sAUD for purposes of this test
			const timestamp1 = await currentTime();
			const aud2usdrate = toUnit('2');

			await exchangeRates.updateRates([sAUD], [aud2usdrate], timestamp1, { from: oracle });

			const issuedSynthetixs = web3.utils.toBN('200000');
			await synthetix.transfer(account1, toUnit(issuedSynthetixs), {
				from: owner,
			});

			// Issue
			const issuedSynths = await synthetix.maxIssuableSynths(account1);
			await synthetix.issueSynths(issuedSynths, { from: account1 });
			const remainingIssuable = (await synthetix.remainingIssuableSynths(account1))[0];

			assert.bnClose(remainingIssuable, '0');

			const transferable1 = await synthetix.transferableSynthetix(account1);
			assert.bnEqual(transferable1, '0');

			// Exchange into sAUD
			await synthetix.exchange(sUSD, issuedSynths, sAUD, { from: account1 });

			// Increase the value of sAUD relative to synthetix
			const timestamp2 = await currentTime();
			const newAUDExchangeRate = toUnit('1');
			await exchangeRates.updateRates([sAUD], [newAUDExchangeRate], timestamp2, { from: oracle });

			const transferable2 = await synthetix.transferableSynthetix(account1);
			assert.equal(transferable2.gt(toUnit('1000')), true);
		});

		describe('when the user has issued some sUSD and exchanged for other synths', () => {
			beforeEach(async () => {
				await synthetix.issueSynths(toUnit('100'), { from: owner });
				await synthetix.exchange(sUSD, toUnit('10'), sETH, { from: owner });
				await synthetix.exchange(sUSD, toUnit('10'), sAUD, { from: owner });
				await synthetix.exchange(sUSD, toUnit('10'), sEUR, { from: owner });
			});
			it('should transfer using the ERC20 transfer function @gasprofile', async () => {
				await synthetix.transfer(account1, toUnit('10'), { from: owner });

				assert.bnEqual(await synthetix.balanceOf(account1), toUnit('10'));
			});

			it('should transfer using the ERC20 transferFrom function @gasprofile', async () => {
				const previousOwnerBalance = await synthetix.balanceOf(owner);

				// Approve account1 to act on our behalf for 10 SNX.
				await synthetix.approve(account1, toUnit('10'), { from: owner });

				// Assert that transferFrom works.
				await synthetix.transferFrom(owner, account2, toUnit('10'), {
					from: account1,
				});

				// Assert that account2 has 10 SNX and owner has 10 less SNX
				assert.bnEqual(await synthetix.balanceOf(account2), toUnit('10'));
				assert.bnEqual(await synthetix.balanceOf(owner), previousOwnerBalance.sub(toUnit('10')));

				// Assert that we can't transfer more even though there's a balance for owner.
				await assert.revert(
					synthetix.transferFrom(owner, account2, '1', {
						from: account1,
					})
				);
			});
		});
	});

	describe('mint() - inflationary supply minting', async () => {
		// These tests are using values modeled from https://sips.synthetix.io/sips/sip-23
		// https://docs.google.com/spreadsheets/d/1a5r9aFP5bh6wGG4-HIW2MWPf4yMthZvesZOurnG-v_8/edit?ts=5deef2a7#gid=0
		const INITIAL_WEEKLY_SUPPLY = 75e6 / 52;

		const DAY = 86400;
		const WEEK = 604800;

		const INFLATION_START_DATE = inflationStartTimestampInSecs;

		describe('suspension conditions', () => {
			beforeEach(async () => {
				// ensure mint() can succeed by default
				const week234 = INFLATION_START_DATE + WEEK * 234;
				await fastForwardTo(new Date(week234 * 1000));
				await updateRatesWithDefaults({ exchangeRates, oracle });
			});
			['System', 'Issuance'].forEach(section => {
				describe(`when ${section} is suspended`, () => {
					beforeEach(async () => {
						await setStatus({ owner, systemStatus, section, suspend: true });
					});
					it('then calling mint() reverts', async () => {
						await assert.revert(synthetix.mint(), 'Operation prohibited');
					});
					describe(`when ${section} is resumed`, () => {
						beforeEach(async () => {
							await setStatus({ owner, systemStatus, section, suspend: false });
						});
						it('then calling mint() succeeds', async () => {
							await synthetix.mint();
						});
					});
				});
			});
		});
		it('should allow synthetix contract to mint inflationary decay for 234 weeks', async () => {
			// fast forward EVM to end of inflation supply decay at week 234
			const week234 = INFLATION_START_DATE + WEEK * 234;
			await fastForwardTo(new Date(week234 * 1000));
			await updateRatesWithDefaults({ exchangeRates, oracle });

			const existingSupply = await synthetix.totalSupply();
			const mintableSupply = await supplySchedule.mintableSupply();
			const mintableSupplyDecimal = parseFloat(fromUnit(mintableSupply));
			const currentRewardEscrowBalance = await synthetix.balanceOf(rewardEscrow.address);

			// Call mint on Synthetix
			await synthetix.mint();

			const newTotalSupply = await synthetix.totalSupply();
			const newTotalSupplyDecimal = parseFloat(fromUnit(newTotalSupply));
			const minterReward = await supplySchedule.minterReward();

			const expectedEscrowBalance = currentRewardEscrowBalance
				.add(mintableSupply)
				.sub(minterReward);

			// Here we are only checking to 2 decimal places from the excel model referenced above
			// as the precise rounding is not exact but has no effect on the end result to 6 decimals.
			const expectedSupplyToMint = 160387922.86;
			const expectedNewTotalSupply = 260387922.86;
			assert.equal(mintableSupplyDecimal.toFixed(2), expectedSupplyToMint);
			assert.equal(newTotalSupplyDecimal.toFixed(2), expectedNewTotalSupply);

			assert.bnEqual(newTotalSupply, existingSupply.add(mintableSupply));
			assert.bnEqual(await synthetix.balanceOf(rewardEscrow.address), expectedEscrowBalance);
		});

		it('should allow synthetix contract to mint 2 weeks of supply and minus minterReward', async () => {
			// Issue
			const supplyToMint = toUnit(INITIAL_WEEKLY_SUPPLY * 2);

			// fast forward EVM to Week 3 in of the inflationary supply
			const weekThree = INFLATION_START_DATE + WEEK * 2 + DAY;
			await fastForwardTo(new Date(weekThree * 1000));
			await updateRatesWithDefaults({ exchangeRates, oracle });

			const existingSupply = await synthetix.totalSupply();
			const mintableSupply = await supplySchedule.mintableSupply();
			const mintableSupplyDecimal = parseFloat(fromUnit(mintableSupply));
			const currentRewardEscrowBalance = await synthetix.balanceOf(rewardEscrow.address);

			// call mint on Synthetix
			await synthetix.mint();

			const newTotalSupply = await synthetix.totalSupply();
			const newTotalSupplyDecimal = parseFloat(fromUnit(newTotalSupply));

			const minterReward = await supplySchedule.minterReward();
			const expectedEscrowBalance = currentRewardEscrowBalance
				.add(mintableSupply)
				.sub(minterReward);

			// Here we are only checking to 2 decimal places from the excel model referenced above
			const expectedSupplyToMintDecimal = parseFloat(fromUnit(supplyToMint));
			const expectedNewTotalSupply = existingSupply.add(supplyToMint);
			const expectedNewTotalSupplyDecimal = parseFloat(fromUnit(expectedNewTotalSupply));
			assert.equal(mintableSupplyDecimal.toFixed(2), expectedSupplyToMintDecimal.toFixed(2));
			assert.equal(newTotalSupplyDecimal.toFixed(2), expectedNewTotalSupplyDecimal.toFixed(2));

			assert.bnEqual(newTotalSupply, existingSupply.add(mintableSupply));
			assert.bnEqual(await synthetix.balanceOf(rewardEscrow.address), expectedEscrowBalance);
		});

		it('should allow synthetix contract to mint the same supply for 39 weeks into the inflation prior to decay', async () => {
			// 39 weeks mimics the inflationary supply minted on mainnet
			const expectedTotalSupply = toUnit(1e8 + INITIAL_WEEKLY_SUPPLY * 39);
			const expectedSupplyToMint = toUnit(INITIAL_WEEKLY_SUPPLY * 39);

			// fast forward EVM to Week 2 in Year 3 schedule starting at UNIX 1583971200+
			const weekThirtyNine = INFLATION_START_DATE + WEEK * 39 + DAY;
			await fastForwardTo(new Date(weekThirtyNine * 1000));
			await updateRatesWithDefaults({ exchangeRates, oracle });

			const existingTotalSupply = await synthetix.totalSupply();
			const currentRewardEscrowBalance = await synthetix.balanceOf(rewardEscrow.address);
			const mintableSupply = await supplySchedule.mintableSupply();

			// call mint on Synthetix
			await synthetix.mint();

			const newTotalSupply = await synthetix.totalSupply();
			const minterReward = await supplySchedule.minterReward();
			const expectedEscrowBalance = currentRewardEscrowBalance
				.add(expectedSupplyToMint)
				.sub(minterReward);

			// The precision is slightly off using 18 wei. Matches mainnet.
			assert.bnClose(newTotalSupply, expectedTotalSupply, 27);
			assert.bnClose(mintableSupply, expectedSupplyToMint, 27);

			assert.bnClose(newTotalSupply, existingTotalSupply.add(expectedSupplyToMint), 27);
			assert.bnClose(await synthetix.balanceOf(rewardEscrow.address), expectedEscrowBalance, 27);
		});

		it('should allow synthetix contract to mint 2 weeks into Terminal Inflation', async () => {
			// fast forward EVM to week 236
			const september142023 = INFLATION_START_DATE + 236 * WEEK + DAY;
			await fastForwardTo(new Date(september142023 * 1000));
			await updateRatesWithDefaults({ exchangeRates, oracle });

			const existingTotalSupply = await synthetix.totalSupply();
			const mintableSupply = await supplySchedule.mintableSupply();

			// call mint on Synthetix
			await synthetix.mint();

			const newTotalSupply = await synthetix.totalSupply();

			const expectedTotalSupply = toUnit('260638356.052421715910204590');
			const expectedSupplyToMint = expectedTotalSupply.sub(existingTotalSupply);

			assert.bnEqual(newTotalSupply, existingTotalSupply.add(expectedSupplyToMint));
			assert.bnEqual(newTotalSupply, expectedTotalSupply);
			assert.bnEqual(mintableSupply, expectedSupplyToMint);
		});

		it('should allow synthetix contract to mint Terminal Inflation to 2030', async () => {
			// fast forward EVM to week 236
			const week573 = INFLATION_START_DATE + 572 * WEEK + DAY;
			await fastForwardTo(new Date(week573 * 1000));
			await updateRatesWithDefaults({ exchangeRates, oracle });

			const existingTotalSupply = await synthetix.totalSupply();
			const mintableSupply = await supplySchedule.mintableSupply();

			// call mint on Synthetix
			await synthetix.mint();

			const newTotalSupply = await synthetix.totalSupply();

			const expectedTotalSupply = toUnit('306320971.934765774167963072');
			const expectedSupplyToMint = expectedTotalSupply.sub(existingTotalSupply);

			assert.bnEqual(newTotalSupply, existingTotalSupply.add(expectedSupplyToMint));
			assert.bnEqual(newTotalSupply, expectedTotalSupply);
			assert.bnEqual(mintableSupply, expectedSupplyToMint);
		});

		it('should be able to mint again after another 7 days period', async () => {
			// fast forward EVM to Week 3 in Year 2 schedule starting at UNIX 1553040000+
			const weekThree = INFLATION_START_DATE + 2 * WEEK + 1 * DAY;
			await fastForwardTo(new Date(weekThree * 1000));
			await updateRatesWithDefaults({ exchangeRates, oracle });

			let existingTotalSupply = await synthetix.totalSupply();
			let mintableSupply = await supplySchedule.mintableSupply();

			// call mint on Synthetix
			await synthetix.mint();

			let newTotalSupply = await synthetix.totalSupply();
			assert.bnEqual(newTotalSupply, existingTotalSupply.add(mintableSupply));

			// fast forward EVM to Week 4
			const weekFour = weekThree + 1 * WEEK + 1 * DAY;
			await fastForwardTo(new Date(weekFour * 1000));
			await updateRatesWithDefaults({ exchangeRates, oracle });

			existingTotalSupply = await synthetix.totalSupply();
			mintableSupply = await supplySchedule.mintableSupply();

			// call mint on Synthetix
			await synthetix.mint();

			newTotalSupply = await synthetix.totalSupply();
			assert.bnEqual(newTotalSupply, existingTotalSupply.add(mintableSupply));
		});

		it('should revert when trying to mint again within the 7 days period', async () => {
			// fast forward EVM to Week 3 of inflation
			const weekThree = INFLATION_START_DATE + 2 * WEEK + DAY;
			await fastForwardTo(new Date(weekThree * 1000));
			await updateRatesWithDefaults({ exchangeRates, oracle });

			const existingTotalSupply = await synthetix.totalSupply();
			const mintableSupply = await supplySchedule.mintableSupply();

			// call mint on Synthetix
			await synthetix.mint();

			const newTotalSupply = await synthetix.totalSupply();
			assert.bnEqual(newTotalSupply, existingTotalSupply.add(mintableSupply));

			const weekFour = weekThree + DAY * 1;
			await fastForwardTo(new Date(weekFour * 1000));

			// should revert if try to mint again within 7 day period / mintable supply is 0
			await assert.revert(synthetix.mint(), 'No supply is mintable');
		});
	});
});
