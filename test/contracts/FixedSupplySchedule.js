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

	const fixedWeeklySupply = toUnit('50000');
	const supplyEnd = new BN(5);

	const DAY = 60 * 60 * 24;
	const WEEK = 604800;

	let addressResolver, fixedSupplySchedule;

	addSnapshotBeforeRestoreAfterEach(); // ensure EVM timestamp resets to inflationStartDate

	beforeEach(async () => {
		// ({
		// 	AddressResolver: addressResolver,
		// 	FixedSupplySchedule: fixedSupplySchedule,
		// } = await setupAllContracts({
		// 	accounts,
		// 	contracts: ['AddressResolver', 'FixedSupplySchedule'],
		// }));
		addressResolver = await setupContract({ accounts, contract: 'AddressResolver' });

		fixedSupplySchedule = await setupContract({ accounts, contract: 'FixedSupplySchedule' });

		await addressResolver.importAddresses([toBytes32('Synthetix')], [synthetix], {
			from: owner,
		});

		await fixedSupplySchedule.setResolverAndSyncCache(addressResolver.address, { from: owner });
	});

	it('only expected functions should be mutative', () => {
		ensureOnlyExpectedMutativeFunctions({
			abi: fixedSupplySchedule.abi,
			ignoreParents: ['Owned', 'MixinResolver'],
			expected: ['recordMintEvent', 'setMinterReward'],
		});
	});

	it('should set constructor params on deployment', async () => {
		// constructor(address _owner, address _resolver, uint _inflationStartDate, uint _lastMintEvent, uint _weekCounter, ...
		// ...uint _mintPeriodDuration, uint _mintBuffer, uint _fixedWeeklySupply, uint _supplyEnd, uint _minterReward)
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
				zero,
				zero,
				fixedWeeklySupply,
				supplyEnd,
				toUnit('50'),
			],
		});

		assert.equal(await instance.owner(), account1);
		assert.bnEqual(await instance.inflationStartDate(), inflationStartDate);
		assert.bnEqual(await instance.lastMintEvent(), 0);
		assert.bnEqual(await instance.weekCounter(), 0);
		assert.bnEqual(await instance.mintPeriodDuration(), WEEK);
		assert.bnEqual(await instance.mintBuffer(), DAY);
		assert.bnEqual(await instance.fixedWeeklySupply(), toUnit('50000'));
		assert.bnEqual(await instance.supplyEnd(), 5);
		assert.bnEqual(await instance.minterReward(), toUnit('50'));
	});

	describe('functions and modifiers', async () => {
		// it('should allow only Synthetix to call recordMintEvent', async () => {
		// 	await onlyGivenAddressCanInvoke({
		// 		fnc: fixedSupplySchedule.recordMintEvent,
		// 		args: [toUnit('1')],
		// 		// address: synthetix,
		// 		accounts,
		// 		reason: 'SupplySchedule: Only the synthetix contract can perform this action',
		// 	});
		// });

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
				weekOne = (await fixedSupplySchedule.inflationStartDate()).toNumber() + 3600 + 1 * DAY; // 1 day and 60 mins within first week of Inflation supply > Inflation supply as 1 day buffer is added to lastMintEvent = (await fixedSupplySchedule.inflationStartDate()).add(new BN()) + 3600 + 1 * DAY; // 1 day and 60 mins within first week of Inflation supply > Inflation supply as 1 day buffer is added to lastMintEvent
			});

			async function checkMintedValues(
				mintedSupply = new BN(0),
				weeksIssued,
				instance = fixedSupplySchedule
			) {
				const weekCounterBefore = await instance.weekCounter();
				// call updateMintValues to mimic synthetix issuing tokens
				const transaction = await instance.recordMintEvent(mintedSupply, {
					from: synthetix,
				});

				const weekCounterAfter = weekCounterBefore.add(new BN(weeksIssued));
				const lastMintEvent = await instance.lastMintEvent();

				assert.bnEqual(await instance.weekCounter(), weekCounterAfter);

				// lastMintEvent is updated to number of weeks after inflation start date + 1 DAY buffer
				assert.ok(
					lastMintEvent.toNumber() ===
						(await instance.inflationStartDate()).toNumber() + weekCounterAfter * WEEK + 1 * DAY
				);

				// check event emitted has correct amounts of supply
				assert.eventEqual(transaction, 'SupplyMinted', {
					supplyMinted: mintedSupply,
					numberOfWeeksIssued: new BN(weeksIssued),
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
				const expectedIssuance = fixedWeeklySupply;
				const inWeekTwo = weekOne + WEEK;
				// fast forward EVM to Week 2
				await fastForwardTo(new Date(inWeekTwo * 1000));

				assert.bnEqual(await fixedSupplySchedule.mintableSupply(), expectedIssuance);
			});

			it('should calculate the full mintable supply after week 5 if no minitng was done', async () => {
				const expectedIssuance = fixedWeeklySupply.mul(new BN(4));
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

				assert.bnEqual(await fixedSupplySchedule.mintableSupply(), fixedWeeklySupply);
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
				const expectedIssuance = fixedWeeklySupply.mul(new BN(2));
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
					const expectedIssuance = fixedWeeklySupply.mul(new BN(1));
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
					const expectedIssuance = fixedWeeklySupply.mul(new BN(2));
					await fastForwardTo(new Date(withinWeekFour * 1000));

					// fake minting 1 week again
					await checkMintedValues(expectedIssuance, 2);
				});
			});

			describe('setting weekCounter and lastMintEvent on fixedSupplySchedule to end of week 4', async () => {
				let instance, lastMintEvent;
				beforeEach(async () => {
					// constructor(address _owner, address _resolver, uint _inflationStartDate, uint _lastMintEvent, uint _weekCounter, ...
					// ...uint _mintPeriodDuration, uint _mintBuffer, uint _fixedWeeklySupply, uint _supplyEnd, uint _minterReward)
					lastMintEvent = weekOne + 4 * WEEK; // Set it to the beginning of the 5th week
					const weekCounter = 4; // last week
					instance = await setupContract({
						accounts,
						contract: 'FixedSupplySchedule',
						args: [
							owner,
							addressResolver.address,
							0,
							lastMintEvent,
							weekCounter,
							0,
							0,
							fixedWeeklySupply,
							supplyEnd,
							toUnit('50'),
						],
					});

					// setup new instance
					await instance.setResolverAndSyncCache(addressResolver.address, { from: owner });
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
					// constructor(address _owner, address _resolver, uint _inflationStartDate, uint _lastMintEvent, uint _weekCounter, ...
					// ...uint _mintPeriodDuration, uint _mintBuffer, uint _fixedWeeklySupply, uint _supplyEnd, uint _minterReward)
					const zeroWeeklySuppy = 0;
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
							zeroWeeklySuppy,
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
		});
	});
});
