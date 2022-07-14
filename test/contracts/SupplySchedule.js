'use strict';

const { contract, web3 } = require('hardhat');

const { assert, addSnapshotBeforeRestoreAfterEach } = require('./common');

const { setupContract } = require('./setup');

const {
	constants: { inflationStartTimestampInSecs, ZERO_ADDRESS },
} = require('../..');

const { toUnit, fastForwardTo } = require('../utils')();

const { onlyGivenAddressCanInvoke, ensureOnlyExpectedMutativeFunctions } = require('./helpers');

const BN = require('bn.js');

contract('SupplySchedule', async accounts => {
	const initialWeeklySupply = toUnit(800000); // 800,000
	const inflationStartDate = inflationStartTimestampInSecs;

	const [, owner, synthetix, account1, account2] = accounts;

	let supplySchedule, synthetixProxy;

	addSnapshotBeforeRestoreAfterEach(); // ensure EVM timestamp resets to inflationStartDate

	beforeEach(async () => {
		supplySchedule = await setupContract({ accounts, contract: 'SupplySchedule' });

		synthetixProxy = await setupContract({
			accounts,
			contract: 'ProxySynthetix',
			source: 'ProxyERC20',
		});

		await supplySchedule.setSynthetixProxy(synthetixProxy.address, { from: owner });
		await synthetixProxy.setTarget(synthetix, { from: owner });
	});

	it('only expected functions should be mutative', () => {
		ensureOnlyExpectedMutativeFunctions({
			abi: supplySchedule.abi,
			ignoreParents: ['Owned'],
			expected: [
				'recordMintEvent',
				'setMinterReward',
				'setSynthetixProxy',
				'setInflationAmount',
				'setMaxInflationAmount',
			],
		});
	});

	it('should set constructor params on deployment', async () => {
		// constructor(address _owner, uint _lastMintEvent, uint _currentWeek) //
		const lastMintEvent = 0;
		const weekCounter = 0;
		const instance = await setupContract({
			accounts,
			contract: 'SupplySchedule',
			args: [account1, lastMintEvent, weekCounter],
		});

		assert.equal(await instance.owner(), account1);
		assert.bnEqual(await instance.lastMintEvent(), 0);
		assert.bnEqual(await instance.weekCounter(), 0);
		assert.bnEqual(await instance.inflationAmount(), 0);
	});

	describe('linking synthetix', async () => {
		it('should have set synthetix proxy', async () => {
			const synthetixProxy = await supplySchedule.synthetixProxy();
			assert.equal(synthetixProxy, synthetixProxy);
		});
		it('should revert when setting synthetix proxy to ZERO_ADDRESS', async () => {
			await assert.revert(supplySchedule.setSynthetixProxy(ZERO_ADDRESS, { from: owner }));
		});

		it('should emit an event when setting synthetix proxy', async () => {
			const txn = await supplySchedule.setSynthetixProxy(account2, { from: owner });

			assert.eventEqual(txn, 'SynthetixProxyUpdated', {
				newAddress: account2,
			});
		});

		it('should disallow a non-owner from setting the synthetix proxy', async () => {
			await onlyGivenAddressCanInvoke({
				fnc: supplySchedule.setSynthetixProxy,
				args: [account2],
				address: owner,
				accounts,
			});
		});
	});

	describe('functions and modifiers', async () => {
		it('should allow owner to update the minter reward amount', async () => {
			const existingReward = await supplySchedule.minterReward();
			const newReward = existingReward.sub(toUnit('10'));

			const minterRewardUpdatedEvent = await supplySchedule.setMinterReward(newReward, {
				from: owner,
			});

			assert.eventEqual(minterRewardUpdatedEvent, 'MinterRewardUpdated', {
				newRewardAmount: newReward,
			});

			assert.bnEqual(await supplySchedule.minterReward(), newReward);
		});

		it('should disallow a non-owner from setting the minter reward amount', async () => {
			await onlyGivenAddressCanInvoke({
				fnc: supplySchedule.setMinterReward,
				args: ['0'],
				address: owner,
				accounts,
			});
		});
		it('should disallow a non-owner from setting the inflation amount', async () => {
			await onlyGivenAddressCanInvoke({
				fnc: supplySchedule.setInflationAmount,
				args: ['0'],
				address: owner,
				accounts,
			});
		});
		it('should disallow a non-owner from setting the max inflation amount', async () => {
			await onlyGivenAddressCanInvoke({
				fnc: supplySchedule.setMaxInflationAmount,
				args: ['0'],
				address: owner,
				accounts,
			});
		});
		it('should allow setting inflaton amount <= max inflation amount', async () => {
			const inflationAmount = toUnit(10000);
			await supplySchedule.setInflationAmount(inflationAmount, { from: owner });
		});
		it('should revert when setting inflaton amount > max inflation amount', async () => {
			// get the max inflation amount
			const maxInflationAmount = await supplySchedule.maxInflationAmount();
			await assert.revert(
				supplySchedule.setInflationAmount(maxInflationAmount.add(new BN(10)), { from: owner }),
				'Amount above maximum inflation'
			);

			// update the max inflation amount lower and test failure
			const newMaxInflationAmount = toUnit(2e6);
			await supplySchedule.setMaxInflationAmount(newMaxInflationAmount, { from: owner });
			await assert.revert(
				supplySchedule.setInflationAmount(newMaxInflationAmount.add(new BN(10)), { from: owner }),
				'Amount above maximum inflation'
			);

			// update the max inflation amount higher and should pass with original maxInflationAmount
			const higherInflation = toUnit(4e6);
			await supplySchedule.setMaxInflationAmount(higherInflation, { from: owner });
			await supplySchedule.setInflationAmount(maxInflationAmount, { from: owner });
		});
		describe('Given inflation amount of 800,000 - mintable supply', async () => {
			beforeEach(async () => {
				await supplySchedule.setInflationAmount(initialWeeklySupply, { from: owner });
			});

			const DAY = 60 * 60 * 24;
			const WEEK = 604800;
			const weekOne = inflationStartDate + 7200 * 2 + 1 * DAY; // 1 day and 120 mins within first week of Inflation supply > Inflation supply as 1 day buffer is added to lastMintEvent

			async function checkMintedValues(
				mintedSupply = new BN(0),
				weeksIssued,
				instance = supplySchedule
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
					lastMintEvent.toNumber() === inflationStartDate + weekCounterAfter * WEEK + 1 * DAY
				);

				// check event emitted has correct amounts of supply
				assert.eventEqual(transaction, 'SupplyMinted', {
					supplyMinted: mintedSupply,
					numberOfWeeksIssued: new BN(weeksIssued),
					lastMintEvent: lastMintEvent,
				});
			}

			it('should calculate the mintable supply as 0 within 1st week of inflation start date', async () => {
				const expectedIssuance = web3.utils.toBN(0);
				// fast forward EVM to within Week 1 in schedule starting at UNIX 1644364800+
				await fastForwardTo(new Date(weekOne * 1000));

				assert.bnEqual(await supplySchedule.mintableSupply(), expectedIssuance);
			});

			it('should calculate the mintable supply for 1 week in week 2', async () => {
				const expectedIssuance = initialWeeklySupply;
				const inWeekTwo = weekOne + WEEK;
				// fast forward EVM to Week 2 in schedule starting at UNIX 1644364800+
				await fastForwardTo(new Date(inWeekTwo * 1000));

				assert.bnEqual(await supplySchedule.mintableSupply(), expectedIssuance);
			});
			it('should calculate the mintable supply for 2 weeks in in week 3', async () => {
				const expectedIssuance = initialWeeklySupply.mul(new BN(2));

				const inWeekThree = weekOne + 2 * WEEK;
				// fast forward EVM to within Week 3 in schedule starting at UNIX 1644364800+
				await fastForwardTo(new Date(inWeekThree * 1000));

				assert.bnEqual(await supplySchedule.mintableSupply(), expectedIssuance);
			});

			it('should calculate the mintable supply for 3 weeks in in week 4', async () => {
				const expectedIssuance = initialWeeklySupply.mul(new BN(3));
				const inWeekFour = weekOne + 3 * WEEK;
				// fast forward EVM to within Week 4 in schedule starting at UNIX 1644364800+
				await fastForwardTo(new Date(inWeekFour * 1000));

				assert.bnEqual(await supplySchedule.mintableSupply(), expectedIssuance);
			});

			it('should calculate mintable supply of 1x week after minting', async () => {
				// fast forward EVM to Week 2 after UNIX 1644364800+
				const weekTwo = weekOne + 1 * WEEK;
				await fastForwardTo(new Date(weekTwo * 1000));

				const mintableSupply = await supplySchedule.mintableSupply();

				// fake updateMintValues
				await checkMintedValues(mintableSupply, 1);

				// Fast forward to week 2
				const weekThree = weekTwo + WEEK + 1 * DAY;
				// Expect only 1 extra week is mintable after first week minted

				await fastForwardTo(new Date(weekThree * 1000));

				assert.bnEqual(await supplySchedule.mintableSupply(), initialWeeklySupply);
			});

			it('should calculate mintable supply of 2 weeks if 2+ weeks passed, after minting', async () => {
				// fast forward EVM to Week 2 in schedule starting at UNIX 1644364800+
				const weekTwo = weekOne + 1 * WEEK;
				await fastForwardTo(new Date(weekTwo * 1000));

				// Mint the first week of supply
				const mintableSupply = await supplySchedule.mintableSupply();

				// fake updateMintValues
				await checkMintedValues(mintableSupply, 1);

				// fast forward 2 weeks to within week 4
				const weekFour = weekTwo + 2 * WEEK + 1 * DAY; // Sometime within week four
				// // Expect 2 week is mintable after first week minted
				const expectedIssuance = initialWeeklySupply.mul(new BN(2));
				await fastForwardTo(new Date(weekFour * 1000));

				// fake minting 2 weeks again
				await checkMintedValues(expectedIssuance, 2);
			});

			describe('Setting new inflation amount', () => {
				const newWeeklySupply = toUnit('2000050');
				beforeEach(async () => {
					await supplySchedule.setInflationAmount(newWeeklySupply, { from: owner });
				});

				it('should calculate the new amount of inflation for one week', async () => {
					const expectedIssuance = newWeeklySupply;
					const inWeekTwo = weekOne + WEEK;
					// fast forward EVM to Week 2 in schedule starting at UNIX 1644364800+
					await fastForwardTo(new Date(inWeekTwo * 1000));

					assert.bnEqual(await supplySchedule.mintableSupply(), expectedIssuance);
				});

				it('should calculate the mintable supply for 2 weeks in in week 3', async () => {
					const expectedIssuance = newWeeklySupply.mul(new BN(2));

					const inWeekThree = weekOne + 2 * WEEK;
					// fast forward EVM to within Week 3 in schedule starting at UNIX 1644364800+
					await fastForwardTo(new Date(inWeekThree * 1000));

					assert.bnEqual(await supplySchedule.mintableSupply(), expectedIssuance);
				});
			});

			describe('rounding down lastMintEvent to number of weeks issued since inflation start date', async () => {
				it('should have 0 mintable supply, only after 1 day, if minting was 5 days late', async () => {
					// fast forward EVM to Week 2 in
					const weekTwoAndFiveDays = weekOne + 1 * WEEK + 5 * DAY;
					await fastForwardTo(new Date(weekTwoAndFiveDays * 1000));

					// Mint the first week of supply
					const mintableSupply = await supplySchedule.mintableSupply();

					// fake updateMintValues
					await checkMintedValues(mintableSupply, 1);

					// fast forward +1 day, should not be able to mint again
					const weekTwoAndSixDays = weekTwoAndFiveDays + 1 * DAY; // Sometime within week two

					// Expect no supply is mintable as still within weekTwo
					await fastForwardTo(new Date(weekTwoAndSixDays * 1000));

					assert.bnEqual(await supplySchedule.mintableSupply(), new BN(0));
				});
				it('should be 1 week of mintable supply, after 2+ days, if minting was 5 days late', async () => {
					// fast forward EVM to Week 2 in
					const weekTwoAndFiveDays = weekOne + 1 * WEEK + 5 * DAY;
					await fastForwardTo(new Date(weekTwoAndFiveDays * 1000));

					// Mint the first week of supply
					const mintableSupply = await supplySchedule.mintableSupply();

					// fake updateMintValues
					await checkMintedValues(mintableSupply, 1);

					// fast forward +2 days, should be able to mint again
					const weekThree = weekTwoAndFiveDays + 2 * DAY; // Sometime within week three

					// Expect 1 week is mintable after first week minted
					const expectedIssuance = initialWeeklySupply.mul(new BN(1));
					await fastForwardTo(new Date(weekThree * 1000));

					// fake minting 1 week again
					await checkMintedValues(expectedIssuance, 1);
				});
				it('should calculate 2 weeks of mintable supply after 1 week and 2+ days, if minting was 5 days late in week 2', async () => {
					// fast forward EVM to Week 2 but not whole week 2
					const weekTwoAndFiveDays = weekOne + 1 * WEEK + 5 * DAY;
					await fastForwardTo(new Date(weekTwoAndFiveDays * 1000));

					// Mint the first week of supply
					const mintableSupply = await supplySchedule.mintableSupply();

					// fake updateMintValues
					await checkMintedValues(mintableSupply, 1);

					// fast forward 1 week and +2 days, should be able to mint again
					const withinWeekFour = weekTwoAndFiveDays + 1 * WEEK + 2 * DAY; // Sometime within week three

					// Expect 1 week is mintable after first week minted
					const expectedIssuance = initialWeeklySupply.mul(new BN(2));
					await fastForwardTo(new Date(withinWeekFour * 1000));

					// fake minting 1 week again
					await checkMintedValues(expectedIssuance, 2);
				});
			});

			describe('setting weekCounter and lastMintEvent on supplySchedule', async () => {
				let instance, lastMintEvent;
				beforeEach(async () => {
					// constructor(address _owner, uint _lastMintEvent, uint _currentWeek) //
					lastMintEvent = 0; // No last mint event
					const weekCounter = 40; // latest week
					instance = await setupContract({
						accounts,
						contract: 'SupplySchedule',
						args: [owner, lastMintEvent, weekCounter],
					});

					// setup new instance
					await instance.setSynthetixProxy(synthetixProxy.address, { from: owner });
					await synthetixProxy.setTarget(synthetix, { from: owner });
					await instance.setInflationAmount(initialWeeklySupply, { from: owner });
				});

				it('should calculate 0 weeks of inflation from INFLATION_START_DATE', async () => {
					const expectedIssuance = new BN(0);

					const mintableSupply = await instance.mintableSupply();

					assert.bnEqual(expectedIssuance, mintableSupply);
				});
				it('should mint 2 weeks of inflation from INFLATION_START_DATE', async () => {
					const expectedIssuance = initialWeeklySupply.mul(new BN(2));

					// fast forward EVM by 2 WEEK
					const inWeek2 = inflationStartDate + 2 * WEEK + 5000;
					await fastForwardTo(new Date(inWeek2 * 1000));

					// Mint the first week of supply
					const mintableSupply = await instance.mintableSupply();

					assert.bnEqual(expectedIssuance, mintableSupply);

					// call recordMintEvent
					await checkMintedValues(mintableSupply, 2, instance);
				});
			});
		});
	});
});
