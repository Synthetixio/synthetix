'use strict';

const { contract, web3 } = require('@nomiclabs/buidler');

const { assert, addSnapshotBeforeRestoreAfterEach } = require('./common');

const { setupContract } = require('./setup');

const { toBytes32 } = require('../..');

const { toUnit, fastForwardTo } = require('../utils')();

const { onlyGivenAddressCanInvoke, ensureOnlyExpectedMutativeFunctions } = require('./helpers');

const BN = require('bn.js');

contract('FixedSupplySchedule', async accounts => {
	const [, owner, synthetix, account1] = accounts;

	const fixedPeriodicSupply = toUnit('50000');
	const supplyEnd = new BN(5);

	const DAY = 60 * 60 * 24;
	const WEEK = 604800;

	let addressResolver, fixedSupplySchedule;

	addSnapshotBeforeRestoreAfterEach(); // ensure EVM timestamp resets to inflationStartDate

	beforeEach(async () => {
		addressResolver = await setupContract({ accounts, contract: 'AddressResolver' });

		fixedSupplySchedule = await setupContract({
			accounts,
			contract: 'FixedSupplySchedule',
			cache: { AddressResolver: addressResolver },
		});

		await addressResolver.importAddresses([toBytes32('Synthetix')], [synthetix], {
			from: owner,
		});

		await fixedSupplySchedule.rebuildCache();
	});

	it('only expected functions should be mutative', () => {
		ensureOnlyExpectedMutativeFunctions({
			abi: fixedSupplySchedule.abi,
			ignoreParents: ['Owned', 'MixinResolver'],
			expected: ['recordMintEvent', 'setMinterReward'],
		});
	});

	it('should set constructor params on deployment', async () => {
		// constructor(address _owner, address _resolver, uint _inflationStartDate, uint _lastMintEvent, uint _mintPeriodCounter, ...
		// ...uint _mintPeriodDuration, uint _mintBuffer, uint _fixedPeriodicSupply, uint _supplyEnd, uint _minterReward)
		const zero = 0;
		const inflationStartDate = 1600698810;
		const instance = await setupContract({
			accounts,
			contract: 'FixedSupplySchedule',
			args: [
				account1,
				addressResolver.address,
				inflationStartDate,
				zero,
				zero,
				WEEK * 2,
				DAY * 2,
				fixedPeriodicSupply,
				supplyEnd,
				toUnit('50'),
			],
		});

		assert.equal(await instance.owner(), account1);
		assert.bnEqual(await instance.inflationStartDate(), inflationStartDate);
		assert.bnEqual(await instance.lastMintEvent(), 0);
		assert.bnEqual(await instance.mintPeriodCounter(), 0);
		assert.bnEqual(await instance.mintPeriodDuration(), WEEK * 2);
		assert.bnEqual(await instance.mintBuffer(), DAY * 2);
		assert.bnEqual(await instance.fixedPeriodicSupply(), toUnit('50000'));
		assert.bnEqual(await instance.supplyEnd(), 5);
		assert.bnEqual(await instance.minterReward(), toUnit('50'));
	});

	it('revert if mintBuffer > mintPeriodDuration', async () => {
		await assert.revert(
			setupContract({
				accounts,
				contract: 'FixedSupplySchedule',
				args: [
					account1,
					addressResolver.address,
					0,
					0,
					0,
					DAY,
					WEEK,
					fixedPeriodicSupply,
					supplyEnd,
					toUnit('50'),
				],
			}),
			"Buffer can't be greater than period"
		);
	});

	it('revert if mintEvent is set before the inflation starts', async () => {
		await assert.revert(
			setupContract({
				accounts,
				contract: 'FixedSupplySchedule',
				args: [
					account1,
					addressResolver.address,
					1600690001,
					1600690000,
					0,
					0,
					0,
					fixedPeriodicSupply,
					supplyEnd,
					toUnit('201'),
				],
			}),
			"Mint event can't happen before inflation starts"
		);
	});

	it('revert if mintEvent is set before the inflation starts', async () => {
		await assert.revert(
			setupContract({
				accounts,
				contract: 'FixedSupplySchedule',
				args: [
					account1,
					addressResolver.address,
					1600690000,
					1600690001,
					0,
					0,
					0,
					fixedPeriodicSupply,
					supplyEnd,
					toUnit('201'),
				],
			}),
			'At least a mint event has already occurred'
		);
	});

	it('revert if minter reward is greater than the max allowed', async () => {
		await assert.revert(
			setupContract({
				accounts,
				contract: 'FixedSupplySchedule',
				args: [
					account1,
					addressResolver.address,
					0,
					0,
					0,
					0,
					0,
					fixedPeriodicSupply,
					supplyEnd,
					toUnit('201'),
				],
			}),
			"Reward can't exceed max minter reward"
		);
	});

	describe('functions and modifiers', async () => {
		it('should allow only Synthetix to call recordMintEvent', async () => {
			await onlyGivenAddressCanInvoke({
				fnc: fixedSupplySchedule.recordMintEvent,
				args: [toUnit('1')],
				address: synthetix,
				accounts,
				reason: 'SupplySchedule: Only the synthetix contract can perform this action',
			});
		});

		it('should allow owner to update the minter reward amount', async () => {
			const existingReward = await fixedSupplySchedule.minterReward();
			const newReward = existingReward.sub(toUnit('10'));

			const minterRewardUpdatedEvent = await fixedSupplySchedule.setMinterReward(newReward, {
				from: owner,
			});

			assert.eventEqual(minterRewardUpdatedEvent, 'MinterRewardUpdated', {
				newRewardAmount: newReward,
			});

			assert.bnEqual(await fixedSupplySchedule.minterReward(), newReward);
		});

		it('should disallow setting minter reward above the max value', async () => {
			const maxRewardPlusOne = (await fixedSupplySchedule.MAX_MINTER_REWARD()).add(new BN(1));

			await assert.revert(
				fixedSupplySchedule.setMinterReward(maxRewardPlusOne, {
					from: owner,
				}),
				"Reward can't exceed max minter reward"
			);
		});

		it('should disallow a non-owner from setting the minter reward amount', async () => {
			await onlyGivenAddressCanInvoke({
				fnc: fixedSupplySchedule.setMinterReward,
				args: ['0'],
				address: owner,
				accounts,
			});
		});

		describe('mintable supply', async () => {
			let weekOne;
			beforeEach(async () => {
				weekOne = (await fixedSupplySchedule.inflationStartDate()).toNumber() + 3600 + 1 * DAY; // 1 day and 60 mins within first week of Inflation supply > Inflation supply as 1 day buffer is added to lastMintEvent
			});

			async function checkMintedValues(
				mintedSupply = new BN(0),
				weeksIssued,
				instance = fixedSupplySchedule
			) {
				const mintPeriodCounterBefore = await instance.mintPeriodCounter();
				// call updateMintValues to mimic synthetix issuing tokens
				const transaction = await instance.recordMintEvent(mintedSupply, {
					from: synthetix,
				});

				const mintPeriodCounterAfter = mintPeriodCounterBefore.add(new BN(weeksIssued));
				const lastMintEvent = await instance.lastMintEvent();

				assert.bnEqual(await instance.mintPeriodCounter(), mintPeriodCounterAfter);

				// lastMintEvent is updated to number of weeks after inflation start date + 1 DAY buffer
				assert.ok(
					lastMintEvent.toNumber() ===
						(await instance.inflationStartDate()).toNumber() +
							mintPeriodCounterAfter * WEEK +
							1 * DAY
				);

				// check event emitted has correct amounts of supply
				assert.eventEqual(transaction, 'SupplyMinted', {
					supplyMinted: mintedSupply,
					numberOfPeriodsIssued: new BN(weeksIssued),
					lastMintEvent: lastMintEvent,
				});
			}

			it('should calculate the mintable supply as 0 for week 1', async () => {
				const expectedIssuance = web3.utils.toBN(0);
				// fast forward EVM to Week 2
				await fastForwardTo(new Date(weekOne * 1000));

				assert.bnEqual(await fixedSupplySchedule.mintableSupply(), expectedIssuance);
			});

			it('should calculate the mintable supply for week 2', async () => {
				const expectedIssuance = fixedPeriodicSupply;
				const inWeekTwo = weekOne + WEEK;
				// fast forward EVM to Week 2
				await fastForwardTo(new Date(inWeekTwo * 1000));

				assert.bnEqual(await fixedSupplySchedule.mintableSupply(), expectedIssuance);
			});

			it('should calculate the full mintable supply after week 5 if no minting was done', async () => {
				const expectedIssuance = fixedPeriodicSupply.mul(new BN(4));
				const inWeekEight = weekOne + 7 * WEEK;
				// fast forward EVM to Week 8
				await fastForwardTo(new Date(inWeekEight * 1000));

				assert.bnEqual(await fixedSupplySchedule.mintableSupply(), expectedIssuance);
			});

			it('should calculate mintable supply of 1x week after minting', async () => {
				// fast forward EVM to Week
				const weekTwo = weekOne + 1 * WEEK;
				await fastForwardTo(new Date(weekTwo * 1000));

				const mintableSupply = await fixedSupplySchedule.mintableSupply();

				// fake updateMintValues
				await checkMintedValues(mintableSupply, 1);

				// Fast forward to week 2
				const weekThree = weekTwo + WEEK + 1 * DAY;
				// Expect only 1 extra week is mintable after first week minted

				await fastForwardTo(new Date(weekThree * 1000));

				assert.bnEqual(await fixedSupplySchedule.mintableSupply(), fixedPeriodicSupply);
			});

			it('should calculate mintable supply of 2 weeks if 2+ weeks passed, after minting', async () => {
				// fast forward EVM to Week 2
				const weekTwo = weekOne + 1 * WEEK;
				await fastForwardTo(new Date(weekTwo * 1000));

				// Mint the first week of supply
				const mintableSupply = await fixedSupplySchedule.mintableSupply();

				// fake updateMintValues
				await checkMintedValues(mintableSupply, 1);

				// fast forward 2 weeks to within week 4
				const weekFour = weekTwo + 2 * WEEK + 1 * DAY; // Sometime within week four
				// // Expect 2 week is mintable after first week minted
				const expectedIssuance = fixedPeriodicSupply.mul(new BN(2));
				await fastForwardTo(new Date(weekFour * 1000));

				// fake minting 2 weeks again
				await checkMintedValues(expectedIssuance, 2);
			});

			describe('rounding down lastMintEvent to number of weeks issued since inflation start date', async () => {
				it('should have 0 mintable supply, only after 1 day, if minting was 5 days late', async () => {
					// fast forward EVM to Week 2 in
					const weekTwoAndFiveDays = weekOne + 1 * WEEK + 5 * DAY;
					await fastForwardTo(new Date(weekTwoAndFiveDays * 1000));

					// Mint the first week of supply
					const mintableSupply = await fixedSupplySchedule.mintableSupply();

					// fake updateMintValues
					await checkMintedValues(mintableSupply, 1);

					// fast forward +1 day, should not be able to mint again
					const weekTwoAndSixDays = weekTwoAndFiveDays + 1 * DAY; // Sometime within week two

					// Expect no supply is mintable as still within weekTwo
					await fastForwardTo(new Date(weekTwoAndSixDays * 1000));

					assert.bnEqual(await fixedSupplySchedule.mintableSupply(), new BN(0));
				});
				it('should be 1 week of mintable supply, after 2+ days, if minting was 5 days late', async () => {
					// fast forward EVM to Week 2 in
					const weekTwoAndFiveDays = weekOne + 1 * WEEK + 5 * DAY;
					await fastForwardTo(new Date(weekTwoAndFiveDays * 1000));

					// Mint the first week of supply
					const mintableSupply = await fixedSupplySchedule.mintableSupply();

					// fake updateMintValues
					await checkMintedValues(mintableSupply, 1);

					// fast forward +2 days, should be able to mint again
					const weekThree = weekTwoAndFiveDays + 2 * DAY; // Sometime within week three

					// Expect 1 week is mintable after first week minted
					const expectedIssuance = fixedPeriodicSupply.mul(new BN(1));
					await fastForwardTo(new Date(weekThree * 1000));

					// fake minting 1 week again
					await checkMintedValues(expectedIssuance, 1);
				});
				it('should calculate 2 weeks of mintable supply after 1 week and 2+ days, if minting was 5 days late in week 2', async () => {
					// fast forward EVM to Week 2 but not whole week 2
					const weekTwoAndFiveDays = weekOne + 1 * WEEK + 5 * DAY;
					await fastForwardTo(new Date(weekTwoAndFiveDays * 1000));

					// Mint the first week of supply
					const mintableSupply = await fixedSupplySchedule.mintableSupply();

					// fake updateMintValues
					await checkMintedValues(mintableSupply, 1);

					// fast forward 1 week and +2 days, should be able to mint again
					const withinWeekFour = weekTwoAndFiveDays + 1 * WEEK + 2 * DAY; // Sometime within week three

					// Expect 1 week is mintable after first week minted
					const expectedIssuance = fixedPeriodicSupply.mul(new BN(2));
					await fastForwardTo(new Date(withinWeekFour * 1000));

					// fake minting 1 week again
					await checkMintedValues(expectedIssuance, 2);
				});
			});

			describe('setting mintPeriodCounter and lastMintEvent on fixedSupplySchedule to end of week 4', async () => {
				let instance, lastMintEvent;
				beforeEach(async () => {
					// constructor(address _owner, address _resolver, uint _inflationStartDate, uint _lastMintEvent, uint _mintPeriodCounter, ...
					// ...uint _mintPeriodDuration, uint _mintBuffer, uint _fixedPeriodicSupply, uint _supplyEnd, uint _minterReward)
					lastMintEvent = weekOne + 4 * WEEK; // Set it to the beginning of the 5th week
					const mintPeriodCounter = 4; // last week
					instance = await setupContract({
						accounts,
						contract: 'FixedSupplySchedule',
						args: [
							owner,
							addressResolver.address,
							0,
							lastMintEvent,
							mintPeriodCounter,
							0,
							0,
							fixedPeriodicSupply,
							supplyEnd,
							toUnit('50'),
						],
					});

					// setup new instance
					await instance.rebuildCache();
				});

				it('should calculate week 5 as the end of the supply program', async () => {
					const expectedIssuance = new BN(0);

					// fast forward EVM by 1 WEEK to inside Week 6
					const inWeek6 = lastMintEvent + 1 * WEEK + 500;
					await fastForwardTo(new Date(inWeek6 * 1000));

					// Mint the first week after the one that ends the supply
					const mintableSupply = await instance.mintableSupply();

					assert.bnEqual(expectedIssuance, mintableSupply);

					// call recordMintEvent
					await checkMintedValues(mintableSupply, 1, instance);
				});
			});

			describe('deploy a 0 supply schedule', async () => {
				let zeroSupplySchedule;
				beforeEach(async () => {
					const zeroSupply = 0;
					zeroSupplySchedule = await setupContract({
						accounts,
						contract: 'FixedSupplySchedule',
						args: [
							owner,
							addressResolver.address,
							0,
							0,
							0,
							0,
							0,
							zeroSupply,
							supplyEnd,
							toUnit('50'),
						],
					});
				});

				it('should calculate the total mintable supply as 0 at any given point', async () => {
					const expectedIssuance = new BN(0);
					const inWeekEight = weekOne + 7 * WEEK;
					// fast forward EVM to Week 8
					await fastForwardTo(new Date(inWeekEight * 1000));
					assert.bnEqual(await zeroSupplySchedule.mintableSupply(), expectedIssuance);
				});
			});

			describe('deploy a daily supply schedule', async () => {
				let dailySupplySchedule;
				let dayOne;
				const dailySupply = toUnit('1000');
				beforeEach(async () => {
					dailySupplySchedule = await setupContract({
						accounts,
						contract: 'FixedSupplySchedule',
						args: [
							owner,
							addressResolver.address,
							0,
							0,
							0,
							DAY, // daily issuance period
							3600, // 1 hour buffer
							dailySupply,
							8, // 7 periods
							toUnit('50'),
						],
					});
					dayOne = (await dailySupplySchedule.inflationStartDate()).toNumber() + 3600 + 60; // + 1 hour + 1 min
				});

				it('should calculate the mintable supply as 0 for day 1', async () => {
					const expectedIssuance = web3.utils.toBN(0);
					// fast forward EVM to day 2
					await fastForwardTo(new Date(dayOne * 1000));

					assert.bnEqual(await dailySupplySchedule.mintableSupply(), expectedIssuance);
				});

				it('should calculate the mintable supply for day 2', async () => {
					const expectedIssuance = dailySupply;
					const inDayTwo = dayOne + DAY;
					// fast forward EVM to Day 2
					await fastForwardTo(new Date(inDayTwo * 1000));

					assert.bnEqual(await dailySupplySchedule.mintableSupply(), expectedIssuance);
				});

				it('should calculate the full mintable supply after day 7 if no minting performed so far', async () => {
					const expectedIssuance = dailySupply.mul(new BN(7));
					const inDayEight = dayOne + 7 * DAY;
					// fast forward EVM to Day 8
					await fastForwardTo(new Date(inDayEight * 1000));

					assert.bnEqual(await dailySupplySchedule.mintableSupply(), expectedIssuance);
				});
			});
		});
	});
});
