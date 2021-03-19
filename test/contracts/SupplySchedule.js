'use strict';

const { contract, web3 } = require('hardhat');

const { assert, addSnapshotBeforeRestoreAfterEach } = require('./common');

const { setupContract } = require('./setup');

const {
	constants: { inflationStartTimestampInSecs, ZERO_ADDRESS },
} = require('../..');

const {
	toUnit,
	divideDecimal,
	fastForwardTo,
	multiplyDecimal,
	powerToDecimal,
} = require('../utils')();

const { onlyGivenAddressCanInvoke, ensureOnlyExpectedMutativeFunctions } = require('./helpers');

const BN = require('bn.js');

contract('SupplySchedule', async accounts => {
	const initialWeeklySupply = divideDecimal(75000000, 52); // 75,000,000 / 52 weeks
	const inflationStartDate = inflationStartTimestampInSecs;

	const [, owner, synthetix, account1, account2] = accounts;

	let supplySchedule, synthetixProxy, decayRate;

	function getDecaySupplyForWeekNumber(initialAmount, weekNumber) {
		const effectiveRate = powerToDecimal(toUnit(1).sub(decayRate), weekNumber);

		const supplyForWeek = multiplyDecimal(effectiveRate, initialAmount);
		return supplyForWeek;
	}

	addSnapshotBeforeRestoreAfterEach(); // ensure EVM timestamp resets to inflationStartDate

	beforeEach(async () => {
		supplySchedule = await setupContract({ accounts, contract: 'SupplySchedule' });

		synthetixProxy = await setupContract({ accounts, contract: 'ProxyERC20' });

		await supplySchedule.setSynthetixProxy(synthetixProxy.address, { from: owner });
		await synthetixProxy.setTarget(synthetix, { from: owner });

		decayRate = await supplySchedule.DECAY_RATE();
	});

	it('only expected functions should be mutative', () => {
		ensureOnlyExpectedMutativeFunctions({
			abi: supplySchedule.abi,
			ignoreParents: ['Owned'],
			expected: ['recordMintEvent', 'setMinterReward', 'setSynthetixProxy'],
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

		const weeklyIssuance = divideDecimal(75e6, 52);
		assert.equal(await instance.owner(), account1);
		assert.bnEqual(await instance.lastMintEvent(), 0);
		assert.bnEqual(await instance.weekCounter(), 0);
		assert.bnEqual(await instance.INITIAL_WEEKLY_SUPPLY(), weeklyIssuance);
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

		describe('exponential decay supply with initial weekly supply of 1.44m', async () => {
			it('check calculating week 1 of inflation decay is valid', async () => {
				const decay = multiplyDecimal(decayRate, initialWeeklySupply);

				const expectedIssuance = initialWeeklySupply.sub(decay);

				// check expectedIssuance of week 1 is same as getDecaySupplyForWeekNumber
				// bnClose as decimal multiplication has rounding
				assert.bnClose(expectedIssuance, getDecaySupplyForWeekNumber(initialWeeklySupply, 1));

				// bnClose as tokenDecaySupply is calculated using the decayRate (rounding down)
				// and not subtraction from initialWeeklySupply.
				assert.bnClose(await supplySchedule.tokenDecaySupplyForWeek(1), expectedIssuance);
			});
			it('should calculate Week 2 Supply of inflation decay from initial weekly supply', async () => {
				const expectedIssuance = getDecaySupplyForWeekNumber(initialWeeklySupply, 2);

				assert.bnEqual(await supplySchedule.tokenDecaySupplyForWeek(2), expectedIssuance);
			});
			it('should calculate Week 3 Supply of inflation decay from initial weekly supply', async () => {
				const expectedIssuance = getDecaySupplyForWeekNumber(initialWeeklySupply, 2);

				const supply = await supplySchedule.tokenDecaySupplyForWeek(2);
				assert.bnEqual(supply, expectedIssuance);
			});
			it('should calculate Week 10 Supply of inflation decay from initial weekly supply', async () => {
				const expectedIssuance = getDecaySupplyForWeekNumber(initialWeeklySupply, 10);

				assert.bnEqual(await supplySchedule.tokenDecaySupplyForWeek(10), expectedIssuance);
			});
			it('should calculate Week 11 Supply of inflation decay from initial weekly supply', async () => {
				const expectedIssuance = getDecaySupplyForWeekNumber(initialWeeklySupply, 11);

				assert.bnEqual(await supplySchedule.tokenDecaySupplyForWeek(11), expectedIssuance);
			});
			it('should calculate last Week 195 Supply of inflation decay from initial weekly supply', async () => {
				const expectedIssuance = getDecaySupplyForWeekNumber(initialWeeklySupply, 195);

				const supply = await supplySchedule.tokenDecaySupplyForWeek(195);
				assert.bnEqual(supply, expectedIssuance);
			});
		});

		describe('terminal inflation supply with initial total supply of 1,000,000', async () => {
			let weeklySupplyRate;

			// Calculate the compound supply for numberOfPeriods (weeks) and initial principal
			// as supply at the beginning of the periods.
			function getCompoundSupply(principal, weeklyRate, numberOfPeriods) {
				// calcualte effective compound rate for number of weeks to 18 decimals precision
				const effectiveRate = powerToDecimal(toUnit(1).add(weeklyRate), numberOfPeriods);

				// supply = P * ( (1 + weeklyRate)^weeks) - 1)
				return multiplyDecimal(effectiveRate.sub(toUnit(1)), principal);
			}

			beforeEach(async () => {
				const terminalAnnualSupplyRate = await supplySchedule.TERMINAL_SUPPLY_RATE_ANNUAL();
				weeklySupplyRate = terminalAnnualSupplyRate.div(new BN(52));
			});

			// check initalAmount * weeklySupplyRate for 1 week is expected amount
			it('should calculate weekly supply for 1 week at 1.25pa% with 1m principal', async () => {
				const intialAmount = 1e6; // 1,000,000
				const expectedAmount = multiplyDecimal(intialAmount, weeklySupplyRate); // 12,500

				assert.bnEqual(
					await supplySchedule.terminalInflationSupply(intialAmount, 1),
					expectedAmount
				);
			});
			it('should calculate compounded weekly supply for 2 weeks at 1.25pa%', async () => {
				const intialAmount = toUnit(1e6); // 1,000,000
				const expectedAmount = getCompoundSupply(intialAmount, weeklySupplyRate, 2);
				const result = await supplySchedule.terminalInflationSupply(intialAmount, 2);

				assert.bnClose(result, expectedAmount);
			});
			it('should calculate compounded weekly supply for 4 weeks at 1.25pa%', async () => {
				const intialAmount = toUnit(1e6); // 1,000,000
				const expectedAmount = getCompoundSupply(intialAmount, weeklySupplyRate, 4);
				const result = await supplySchedule.terminalInflationSupply(intialAmount, 4);

				assert.bnEqual(result, expectedAmount);
			});
			it('should calculate compounded weekly supply with principal 10m for 10 weeks at 1.25pa%', async () => {
				const intialAmount = toUnit(10e6); // 10,000,000
				const expectedAmount = getCompoundSupply(intialAmount, weeklySupplyRate, 10);
				const result = await supplySchedule.terminalInflationSupply(intialAmount, 10);

				assert.bnEqual(result, expectedAmount);
			});
			it('should calculate compounded weekly supply with principal 260,387,945 for 1 week at 1.25pa%', async () => {
				const initialAmount = toUnit(260387945); // 260,387,945
				const expectedAmount = getCompoundSupply(initialAmount, weeklySupplyRate, 1);

				// check compound supply for 1 week is correct
				assert.bnEqual(expectedAmount, multiplyDecimal(initialAmount, weeklySupplyRate)); // ~125,187

				const result = await supplySchedule.terminalInflationSupply(initialAmount, 1);

				assert.bnEqual(result, expectedAmount);
			});
			it('should calculate compounded weekly supply with principal 260,387,945 for 2 weeks at 1.25pa%', async () => {
				const initialAmount = toUnit(260387945); // 260,387,945
				const expectedAmount = getCompoundSupply(initialAmount, weeklySupplyRate, 2);

				const result = await supplySchedule.terminalInflationSupply(initialAmount, 2);

				assert.bnEqual(result, expectedAmount);
			});
			it('should calculate compounded weekly supply with principal 260,387,945 for 10 weeks at 1.25pa%', async () => {
				const initialAmount = toUnit(260387945); // 260,387,945
				const expectedAmount = getCompoundSupply(initialAmount, weeklySupplyRate, 10);

				const result = await supplySchedule.terminalInflationSupply(initialAmount, 10);

				assert.bnEqual(result, expectedAmount);
			});
			it('should calculate compounded weekly supply with principal 260,387,945 for 100 weeks at 1.25pa%', async () => {
				const initialAmount = toUnit(260387945); // 260,387,945
				const expectedAmount = getCompoundSupply(initialAmount, weeklySupplyRate, 100);

				const result = await supplySchedule.terminalInflationSupply(initialAmount, 100);

				assert.bnEqual(result, expectedAmount);
			});
		});

		describe('mintable supply', async () => {
			const DAY = 60 * 60 * 24;
			const WEEK = 604800;
			const weekOne = inflationStartDate + 3600 + 1 * DAY; // 1 day and 60 mins within first week of Inflation supply > Inflation supply as 1 day buffer is added to lastMintEvent

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

			it('should calculate the mintable supply as 0 within 1st week in year 2 ', async () => {
				const expectedIssuance = web3.utils.toBN(0);
				// fast forward EVM to Week 1 in Year 2 schedule starting at UNIX 1552435200+
				await fastForwardTo(new Date(weekOne * 1000));

				assert.bnEqual(await supplySchedule.mintableSupply(), expectedIssuance);
			});

			it('should calculate the mintable supply for 1 weeks in year 2 in week 2 - 75M supply', async () => {
				const expectedIssuance = initialWeeklySupply;
				const inWeekTwo = weekOne + WEEK;
				// fast forward EVM to Week 2 in Year 2 schedule starting at UNIX 1552435200+
				await fastForwardTo(new Date(inWeekTwo * 1000));

				assert.bnEqual(await supplySchedule.mintableSupply(), expectedIssuance);
			});

			it('should calculate the mintable supply for 2 weeks in year 2 in week 3 - 75M supply', async () => {
				const expectedIssuance = initialWeeklySupply.mul(new BN(2));

				const inWeekThree = weekOne + 2 * WEEK;
				// fast forward EVM to within Week 3 in Year 2 schedule starting at UNIX 1552435200+
				await fastForwardTo(new Date(inWeekThree * 1000));

				assert.bnEqual(await supplySchedule.mintableSupply(), expectedIssuance);
			});

			it('should calculate the mintable supply for 3 weeks in year 2 in week 4 - 75M supply', async () => {
				const expectedIssuance = initialWeeklySupply.mul(new BN(3));
				const inWeekFour = weekOne + 3 * WEEK;
				// fast forward EVM to within Week 4 in Year 2 schedule starting at UNIX 1552435200+
				await fastForwardTo(new Date(inWeekFour * 1000));

				assert.bnEqual(await supplySchedule.mintableSupply(), expectedIssuance);
			});

			it('should calculate the mintable supply for 39 weeks without decay in Year 2 - 75M supply', async () => {
				const expectedIssuance = initialWeeklySupply.mul(new BN(39));

				const weekFourty = weekOne + 39 * WEEK;
				// fast forward EVM to within Week 40 starting at UNIX 1552435200+
				await fastForwardTo(new Date(weekFourty * 1000));

				// bnClose as weeklyIssuance.mul(new BN(3)) rounding
				assert.bnClose(await supplySchedule.mintableSupply(), expectedIssuance);
			});
			it('should calculate the mintable supply for 39 weeks without decay, 1 week with decay in week 41', async () => {
				// add 39 weeks of inflationary supply
				let expectedIssuance = initialWeeklySupply.mul(new BN(39));

				// add Week 40 of decay supply
				expectedIssuance = expectedIssuance.add(
					getDecaySupplyForWeekNumber(initialWeeklySupply, 1)
				);

				const weekFourtyOne = weekOne + 40 * WEEK;

				// fast forward EVM to within Week 41 schedule starting at UNIX 1552435200+
				await fastForwardTo(new Date(weekFourtyOne * 1000));

				assert.bnClose(await supplySchedule.mintableSupply(), expectedIssuance);
			});
			it('should calculate the mintable supply for 39 weeks without decay, 2 weeks with decay in week 42', async () => {
				// add 39 weeks of inflationary supply
				let expectedIssuance = initialWeeklySupply.mul(new BN(39));

				// add Week 40 & 41 of decay supply
				const week40Supply = getDecaySupplyForWeekNumber(initialWeeklySupply, 1);
				const week41Supply = getDecaySupplyForWeekNumber(initialWeeklySupply, 2);
				expectedIssuance = expectedIssuance.add(week40Supply).add(week41Supply);

				const weekFourtyTwo = weekOne + 41 * WEEK;

				// fast forward EVM to within Week 41 schedule starting at UNIX 1552435200+
				await fastForwardTo(new Date(weekFourtyTwo * 1000));

				assert.bnClose(await supplySchedule.mintableSupply(), expectedIssuance);
			});

			it('should calculate mintable supply of 1x week after minting', async () => {
				// fast forward EVM to Week 2 after UNIX 1552435200+
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
				// fast forward EVM to Week 2 in Year 2 schedule starting at UNIX 1552435200+
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

			describe('setting weekCounter and lastMintEvent on supplySchedule to week 39', async () => {
				let instance, lastMintEvent;
				beforeEach(async () => {
					// constructor(address _owner, uint _lastMintEvent, uint _currentWeek) //
					lastMintEvent = 1575552876; // Thursday, 5 December 2019 13:34:36
					const weekCounter = 39; // latest week
					instance = await setupContract({
						accounts,
						contract: 'SupplySchedule',
						args: [owner, lastMintEvent, weekCounter],
					});

					// setup new instance
					await instance.setSynthetixProxy(synthetixProxy.address, { from: owner });
					await synthetixProxy.setTarget(synthetix, { from: owner });
				});

				it('should calculate week 40 as week 1 of decay ', async () => {
					const decay = multiplyDecimal(decayRate, initialWeeklySupply);

					const expectedIssuance = initialWeeklySupply.sub(decay);

					// fast forward EVM by 1 WEEK to inside Week 41
					const inWeek41 = lastMintEvent + 1 * WEEK + 500;
					await fastForwardTo(new Date(inWeek41 * 1000));

					// Mint the first week of supply
					const mintableSupply = await instance.mintableSupply();

					assert.bnClose(expectedIssuance, mintableSupply);

					// call recordMintEvent
					await checkMintedValues(mintableSupply, 1, instance);
				});
				it('should calculate week 41 as week 2 of decay ', async () => {
					const weeks = 2;

					let expectedIssuance = new BN();
					for (let i = 1; i <= weeks; i++) {
						expectedIssuance = expectedIssuance.add(
							getDecaySupplyForWeekNumber(initialWeeklySupply, new BN(i))
						);
					}

					// fast forward EVM by 2 WEEK to inside Week 41
					const inWeek42 = lastMintEvent + 2 * WEEK + 500;
					await fastForwardTo(new Date(inWeek42 * 1000));

					// Mint the first week of supply
					const mintableSupply = await instance.mintableSupply();

					assert.bnClose(expectedIssuance, mintableSupply);

					// call recordMintEvent
					await checkMintedValues(mintableSupply, weeks, instance);
				});
				it('should calculate week 45 as week 6 of decay ', async () => {
					const weeks = 6;

					let expectedIssuance = new BN();
					for (let i = 1; i <= weeks; i++) {
						expectedIssuance = expectedIssuance.add(
							getDecaySupplyForWeekNumber(initialWeeklySupply, i)
						);
					}

					// fast forward EVM by 6 WEEK to inside Week 45
					const inWeek42 = lastMintEvent + 6 * WEEK + 500;
					await fastForwardTo(new Date(inWeek42 * 1000));

					// Mint the first week of supply
					const mintableSupply = await instance.mintableSupply();

					assert.bnClose(expectedIssuance, mintableSupply);

					// call recordMintEvent
					await checkMintedValues(mintableSupply, weeks, instance);
				});
			});

			describe('setting weekCounter and lastMintEvent on supplySchedule to week 233', async () => {
				let instance, lastMintEvent;
				beforeEach(async () => {
					// constructor(address _owner, uint _lastMintEvent, uint _currentWeek) //
					lastMintEvent = inflationStartDate + 233 * WEEK; // 2019-03-06 + 233 weeks = 23 August 2023 00:00:00
					const weekCounter = 233; // latest week
					instance = await setupContract({
						accounts,
						contract: 'SupplySchedule',
						args: [owner, lastMintEvent, weekCounter],
					});

					// setup new instance
					await instance.setSynthetixProxy(synthetixProxy.address, { from: owner });
					await synthetixProxy.setTarget(synthetix, { from: owner });
				});

				it('should calculate week 234 as last week of decay (195th) ', async () => {
					const numberOfWeeks = 1;
					const expectedIssuance = getDecaySupplyForWeekNumber(initialWeeklySupply, 195);

					// fast forward EVM by 1 WEEK to inside Week 234
					const inWeek234 = lastMintEvent + numberOfWeeks * WEEK + 500;
					await fastForwardTo(new Date(inWeek234 * 1000));

					// Mint the first week of supply
					const mintableSupply = await instance.mintableSupply();

					assert.bnClose(expectedIssuance, mintableSupply);

					// call recordMintEvent
					await checkMintedValues(mintableSupply, numberOfWeeks, instance);
				});
			});
		});
	});
});
