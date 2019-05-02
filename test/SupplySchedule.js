const SupplySchedule = artifacts.require('SupplySchedule');
const { toUnit, currentTime, divideDecimal, fastForwardTo } = require('../utils/testUtils');
const BN = require('bn.js');

contract('SupplySchedule', async accounts => {
	const DAY = 86400;
	const WEEK = 604800;
	const YEAR = 31536000;

	const [deployerAccount, owner, account1, synthetix] = accounts;

	let supplySchedule;

	beforeEach(async () => {
		// Save ourselves from having to await deployed() in every single test.
		// We do this in a beforeEach instead of before to ensure we isolate
		// contract interfaces to prevent test bleed.
		supplySchedule = await SupplySchedule.deployed();
		await supplySchedule.setSynthetix(synthetix, { from: owner });
	});

	it('should set constructor params on deployment', async () => {
		// constructor(address _owner) //
		const instance = await SupplySchedule.new(account1, {
			from: deployerAccount,
		});

		assert.equal(await instance.owner(), account1);
	});

	describe('linking synthetix', async () => {
		it('should have set synthetix', async () => {
			const synthetixAddress = await supplySchedule.synthetix();
			assert.equal(synthetixAddress, synthetix);
		});
	});

	describe('functions and modifiers', async () => {
		it('should calculate weeks to mint and round down to full week', async () => {
			const expectedResult = web3.utils.toBN(0);
			const secondsSinceLastWeek = 300; // 604,800 seconds in 7 day week

			assert.bnEqual(
				await supplySchedule._numWeeksRoundedDown(secondsSinceLastWeek),
				expectedResult
			);
		});

		it('should calculate 1 weeks to mint and round down to full week', async () => {
			const expectedWeeks = web3.utils.toBN(1);
			const secondsSinceLastWeek = WEEK * 1.5; // 604,800 seconds in 7 day week

			assert.bnEqual(
				await supplySchedule._numWeeksRoundedDown(secondsSinceLastWeek),
				expectedWeeks
			);
		});

		it('should calculate 1 weeks to mint and round down to full week given 678767', async () => {
			const expectedWeeks = web3.utils.toBN(1);
			const secondsSinceLastWeek = 678767; // 604,800 seconds in 7 day week

			assert.bnEqual(
				await supplySchedule._numWeeksRoundedDown(secondsSinceLastWeek),
				expectedWeeks
			);
		});

		it('should calculate 2 weeks to mint and round down to full week given 2.5 weeks', async () => {
			const expectedWeeks = web3.utils.toBN(2);
			const secondsSinceLastWeek = WEEK * 2.5;

			assert.bnEqual(
				await supplySchedule._numWeeksRoundedDown(secondsSinceLastWeek),
				expectedWeeks
			);
		});

		it('should allow owner to update the minter reward amount', async () => {
			const existingReward = await supplySchedule.minterReward();
			const newReward = existingReward.add(toUnit('100'));

			const minterRewardUpdatedEvent = await supplySchedule.setMinterReward(newReward, {
				from: owner,
			});

			assert.eventEqual(minterRewardUpdatedEvent, 'MinterRewardUpdated', {
				newRewardAmount: newReward,
			});

			assert.bnEqual(await supplySchedule.minterReward(), newReward);
		});

		it('should disallow a non-owner from setting the  minter reward amount', async () => {
			await assert.revert(
				supplySchedule.setMinterReward(toUnit('0'), {
					from: account1,
				})
			);
		});

		describe('mintable supply', async () => {
			const supplySchedules = {
				secondYearSupply: 75000000,
				thirdYearSupply: 37500000,
				fourthYearSupply: 18750000,
				fifthYearSupply: 9375000,
				sixthYearSupply: 4687500,
			};

			const YEAR_TWO_START = 1551830400;
			const weeklyIssuance = divideDecimal(supplySchedules.secondYearSupply, 52);
			const weekOne = 1551830420; // first week Year 2 schedule

			async function checkMintedValues(index, previousAmount, currentAmount = new BN(0)) {
				const scheduleBefore = await supplySchedule.schedules(index);
				const lastYearScheduleBefore = await supplySchedule.schedules(index - 1);
				const now = await currentTime();

				await supplySchedule.updateMintValues({ from: synthetix });

				const currentSchedule = await supplySchedule.schedules(index);
				const lastMintEvent = await supplySchedule.lastMintEvent();

				if (previousAmount) {
					const lastYearSchedule = await supplySchedule.schedules(index - 1);
					assert.bnEqual(
						lastYearSchedule.totalSupplyMinted,
						lastYearScheduleBefore.totalSupplyMinted.add(previousAmount)
					);
				}

				assert.bnEqual(
					currentSchedule.totalSupplyMinted,
					scheduleBefore.totalSupplyMinted.add(currentAmount)
				);
				assert.ok(lastMintEvent.toNumber() >= now); // lastMintEvent is updated to >= now
			}

			it('should calculate the mintable supply as 0 for 1st week in year 2 - 75M supply', async () => {
				const expectedIssuance = web3.utils.toBN(0);
				// fast forward EVM to Week 1 in Year 2 schedule starting at UNIX 1552435200+
				await fastForwardTo(new Date(weekOne * 1000));

				assert.bnEqual(await supplySchedule.mintableSupply(), expectedIssuance);
			});

			it('should calculate the mintable supply for one weeks in year 2 in week 2 - 75M supply', async () => {
				const expectedIssuance = divideDecimal(supplySchedules.secondYearSupply, 52);
				const weekTwo = weekOne + WEEK;
				// fast forward EVM to Week 2 in Year 2 schedule starting at UNIX 1552435200+
				await fastForwardTo(new Date(weekTwo * 1000));

				assert.bnEqual(await supplySchedule.mintableSupply(), expectedIssuance);
			});

			it('should calculate the mintable supply for two weeks in year 2 in week 3 - 75M supply', async () => {
				const expectedIssuance = divideDecimal(supplySchedules.secondYearSupply, 52 / 2);
				const weekThree = weekOne + 2 * WEEK;
				// fast forward EVM to within Week 3 in Year 2 schedule starting at UNIX 1552435200+
				await fastForwardTo(new Date(weekThree * 1000));

				// bnClose as 52 /3 weeks results in a recursive number that is rounded
				assert.bnEqual(await supplySchedule.mintableSupply(), expectedIssuance);
			});

			it('should calculate the mintable supply for three weeks in year 2 in week 4 - 75M supply', async () => {
				const expectedIssuance = weeklyIssuance.mul(new BN(3));
				const weekThree = weekOne + 3 * WEEK;
				// fast forward EVM to within Week 3 in Year 2 schedule starting at UNIX 1552435200+
				await fastForwardTo(new Date(weekThree * 1000));

				// bnClose as 52 / 3 weeks results in a recursive number that is rounded
				assert.bnClose(await supplySchedule.mintableSupply(), expectedIssuance);
			});

			it('should calculate the mintable supply for 49 weeks in year 2 in week 50 - 75M supply', async () => {
				const supply = supplySchedules.secondYearSupply.toString();
				const expectedIssuance = toUnit(supply).sub(weeklyIssuance.mul(new BN(3))); // 52 - 3 = 49 weeks

				const weekFifty = weekOne + 49 * WEEK;
				// fast forward EVM to within Week 50 in Year 2 schedule starting at UNIX 1552435200+
				await fastForwardTo(new Date(weekFifty * 1000));

				// bnClose as weeklyIssuance.mul(new BN(3)) rounding
				assert.bnClose(await supplySchedule.mintableSupply(), expectedIssuance);
			});

			it('should calculate the mintable supply for 50 weeks in year 2 in week 51 - 75M supply', async () => {
				const supply = supplySchedules.secondYearSupply.toString();
				const expectedIssuance = toUnit(supply).sub(weeklyIssuance.mul(new BN(2))); // 52 - 2 = 50 weeks

				const weekFifty = weekOne + 50 * WEEK;
				// fast forward EVM to within Week 50 in Year 2 schedule starting at UNIX 1552435200+
				await fastForwardTo(new Date(weekFifty * 1000));

				assert.bnClose(await supplySchedule.mintableSupply(), expectedIssuance);
			});

			it('should calculate the unminted supply for previous year in year 3 week 1', async () => {
				const expectedIssuance = toUnit(supplySchedules.secondYearSupply.toString());
				const yearThreeStart = YEAR_TWO_START + YEAR; // UNIX 1583971200

				// fast forward EVM to Year 3 schedule starting at UNIX 1583971200+
				// No previous minting in Year 2
				await fastForwardTo(new Date(yearThreeStart * 1000));

				assert.bnEqual(await supplySchedule.mintableSupply(), expectedIssuance);
				await checkMintedValues(2, expectedIssuance);
			});

			it('should calculate the unminted supply for previous year in year 4 week 1', async () => {
				const expectedIssuance = toUnit(supplySchedules.thirdYearSupply.toString());
				const yearFourStart = YEAR_TWO_START + 2 * YEAR; // UNIX 1615507200

				// fast forward EVM to Year 4 schedule starting at UNIX 1615507200+
				// No previous minting in Year 3
				await fastForwardTo(new Date(yearFourStart * 1000));

				assert.bnEqual(await supplySchedule.mintableSupply(), expectedIssuance);
				await checkMintedValues(3, expectedIssuance);
			});

			it('should calculate the unminted supply for previous year in year 5 week 1', async () => {
				const expectedIssuance = toUnit(supplySchedules.fourthYearSupply.toString());
				const yearFiveStart = YEAR_TWO_START + 3 * YEAR; // UNIX 1647043200

				// fast forward EVM to Year 5 schedule starting at UNIX 1647043200+
				// No previous minting in Year 4
				await fastForwardTo(new Date(yearFiveStart * 1000));

				assert.bnEqual(await supplySchedule.mintableSupply(), expectedIssuance);
				await checkMintedValues(4, expectedIssuance);
			});

			it('should calculate the unminted supply for previous year in year 6 week 1', async () => {
				const expectedIssuance = toUnit(supplySchedules.fifthYearSupply.toString());
				const yearSixStart = YEAR_TWO_START + 4 * YEAR; // UNIX 1678579200

				// fast forward EVM to Year 6 schedule starting at UNIX 1678579200+
				// No previous minting in Year 5
				await fastForwardTo(new Date(yearSixStart * 1000));

				assert.bnEqual(await supplySchedule.mintableSupply(), expectedIssuance);
				await checkMintedValues(5, expectedIssuance);
			});

			it('should calculate the unminted supply for previous year in year 7 week 1', async () => {
				const expectedIssuance = toUnit(supplySchedules.sixthYearSupply.toString());
				const yearSevenStart = YEAR_TWO_START + 5 * YEAR; // UNIX 1710115200

				// fast forward EVM to Year 7 schedule starting at UNIX 1710115200+
				// No previous minting in Year 6
				await fastForwardTo(new Date(yearSevenStart * 1000));

				assert.bnEqual(await supplySchedule.mintableSupply(), expectedIssuance);
				await checkMintedValues(6, expectedIssuance);
			});

			it('should calculate the unminted supply for year 6 at end of Year 7 period', async () => {
				const expectedIssuance = toUnit(supplySchedules.sixthYearSupply.toString());
				const yearSevenEnd = YEAR_TWO_START + 5 * YEAR + 52 * WEEK - 1; // UNIX 1710115200

				// fast forward EVM to End of Year 7 schedule starting at UNIX 1710115200+
				// No previous minting in Year 6
				await fastForwardTo(new Date(yearSevenEnd * 1000));

				assert.bnEqual(await supplySchedule.mintableSupply(), expectedIssuance);
				await checkMintedValues(6, expectedIssuance);
			});

			it('should calculate the unminted supply for previous year 6 in year 7 week 3', async () => {
				const expectedIssuance = toUnit(supplySchedules.sixthYearSupply.toString());
				const yearSevenStart = YEAR_TWO_START + 5 * YEAR + 3 * WEEK; // UNIX 1711929600

				// fast forward EVM to Week 3, Year 7 schedule starting at UNIX 1710115200+
				await fastForwardTo(new Date(yearSevenStart * 1000));

				// Expect Year 6 to be mintable and no supply in Year 7
				assert.bnEqual(await supplySchedule.mintableSupply(), expectedIssuance);
				await checkMintedValues(6, expectedIssuance);
			});

			it('should update the Year 2 schedule for 1 week after minting', async () => {
				// fast forward EVM to Week 1 in Year 2 schedule starting at UNIX 1552435200+
				const weekTwo = weekOne + 1 * WEEK;
				await fastForwardTo(new Date(weekTwo * 1000));

				const mintedSupply = await supplySchedule.mintableSupply();
				const now = await currentTime();
				await supplySchedule.updateMintValues({ from: synthetix });

				const schedule = await supplySchedule.schedules(1);
				const lastMintEvent = await supplySchedule.lastMintEvent();

				assert.bnEqual(schedule.totalSupplyMinted, mintedSupply);
				assert.ok(lastMintEvent.toNumber() >= now); // lastMintEvent is updated to >= now
			});

			it('should calculate mintable supply of 1 week after minting', async () => {
				// fast forward EVM to Week 2 in Year 2 schedule starting at UNIX 1552435200+
				const weekTwo = weekOne + 1 * WEEK;
				await fastForwardTo(new Date(weekTwo * 1000));

				const mintedSupply = await supplySchedule.mintableSupply();
				const now = await currentTime();
				await supplySchedule.updateMintValues({ from: synthetix });

				const schedule = await supplySchedule.schedules(1);
				const lastMintEvent = await supplySchedule.lastMintEvent();

				assert.bnEqual(schedule.totalSupplyMinted, mintedSupply);
				assert.ok(lastMintEvent.toNumber() >= now); // lastMintEvent is updated to >= now

				const weekThree = weekTwo + WEEK + 1 * DAY; // Sometime within week two
				// // Expect only 1 week is mintable after first week minted
				const expectedIssuance = divideDecimal(supplySchedules.secondYearSupply, 52);
				await fastForwardTo(new Date(weekThree * 1000));

				assert.bnEqual(await supplySchedule.mintableSupply(), expectedIssuance);
			});

			it('should calculate mintable supply of 2 weeks if 2+ weeks passed, after minting', async () => {
				// fast forward EVM to Week 2 in Year 2 schedule starting at UNIX 1552435200+
				const weekTwo = weekOne + 1 * WEEK;
				await fastForwardTo(new Date(weekTwo * 1000));

				// Mint the first week of supply
				const mintedSupply = await supplySchedule.mintableSupply();
				const now = await currentTime();
				await supplySchedule.updateMintValues({ from: synthetix });

				const schedule = await supplySchedule.schedules(1);
				const lastMintEvent = await supplySchedule.lastMintEvent();

				assert.bnEqual(schedule.totalSupplyMinted, mintedSupply);
				assert.ok(lastMintEvent.toNumber() >= now); // lastMintEvent is updated to >= now

				// fast forward 2 weeks to within week 4
				const weekFour = weekTwo + 2 * WEEK + 1 * DAY; // Sometime within week four
				// // Expect 2 week is mintable after first week minted
				const expectedIssuance = divideDecimal(supplySchedules.secondYearSupply, 52 / 2);
				await fastForwardTo(new Date(weekFour * 1000));

				assert.bnEqual(await supplySchedule.mintableSupply(), expectedIssuance);
			});

			it('should calculate mintable supply of 4 weeks if 4+ weeks passed, after minting', async () => {
				// fast forward EVM to Week 2 in Year 2 schedule starting at UNIX 1552435200+
				const weekTwo = weekOne + 1 * WEEK;
				await fastForwardTo(new Date(weekTwo * 1000));

				// Mint the first week of supply
				const mintedSupply = await supplySchedule.mintableSupply();
				const now = await currentTime();
				await supplySchedule.updateMintValues({ from: synthetix });

				const schedule = await supplySchedule.schedules(1);
				const lastMintEvent = await supplySchedule.lastMintEvent();

				assert.bnEqual(schedule.totalSupplyMinted, mintedSupply);
				assert.ok(lastMintEvent.toNumber() >= now); // lastMintEvent is updated to >= now

				// fast forward 4 weeks to within week 6
				const weekSix = weekTwo + 4 * WEEK + 1 * DAY; // Sometime within week six
				// // Expect 4 week is mintable after first week minted
				const expectedIssuance = divideDecimal(supplySchedules.secondYearSupply, 52 / 4);
				await fastForwardTo(new Date(weekSix * 1000));

				assert.bnEqual(await supplySchedule.mintableSupply(), expectedIssuance);
			});

			describe('mintable supply at the Year 2 / Year 3 cross over', async () => {
				const weekTwo = weekOne + 1 * WEEK;

				beforeEach(async () => {
					// Save ourselves from having to fast forward to the end of the year
					// We do this in a beforeEach instead of before to ensure we isolate
					// contract interfaces to prevent test bleed.

					// fast forward EVM to Week 2 in Year 2 schedule starting at UNIX 1552435200+
					await fastForwardTo(new Date(weekTwo * 1000));

					// Mint the first week of supply
					const mintedSupply = await supplySchedule.mintableSupply();
					const now = await currentTime();

					await supplySchedule.updateMintValues({ from: synthetix });

					const schedule = await supplySchedule.schedules(1);
					const lastMintEvent = await supplySchedule.lastMintEvent();

					assert.bnEqual(schedule.totalSupplyMinted, mintedSupply);
					assert.ok(lastMintEvent.toNumber() >= now); // lastMintEvent is updated to >= now
				});

				it('should calculate mintable supply of 49 weeks in week 51, after minting in week 2', async () => {
					const supply = supplySchedules.secondYearSupply.toString();

					// fast forward 49 weeks to within week 51
					const weekFiftyOne = weekTwo + 49 * WEEK + 1 * DAY; // Sometime within week 51
					// // Expect 49 week is mintable after first week minted
					const expectedIssuance = toUnit(supply).sub(weeklyIssuance.mul(new BN(3))); // 52 - 3 = 49 weeks
					await fastForwardTo(new Date(weekFiftyOne * 1000));

					assert.bnClose(await supplySchedule.mintableSupply(), expectedIssuance);

					// Update the supply minted
					const mintedSupply = await supplySchedule.mintableSupply();
					const now = await currentTime();

					await supplySchedule.updateMintValues({ from: synthetix });

					const schedule = await supplySchedule.schedules(1);
					const lastMintEvent = await supplySchedule.lastMintEvent();

					assert.bnEqual(schedule.totalSupplyMinted, mintedSupply.add(weeklyIssuance));
					assert.ok(lastMintEvent.toNumber() >= now); // lastMintEvent is updated to >= now
				});

				it('should calculate mintable supply of 2 weeks from end of Year 2, in Year 3 week 1', async () => {
					const supplyYearTwo = supplySchedules.secondYearSupply.toString();

					// fast forward 49 weeks to within week 51
					const weekFiftyOne = weekTwo + 49 * WEEK + 1 * DAY; // Sometime within week 51
					// // Expect 49 week is mintable after first week minted
					let expectedIssuance = toUnit(supplyYearTwo).sub(weeklyIssuance.mul(new BN(3))); // 52 - 3 = 49 weeks
					await fastForwardTo(new Date(weekFiftyOne * 1000));

					assert.bnClose(await supplySchedule.mintableSupply(), expectedIssuance);

					// Update the supply minted
					const mintedSupply = await supplySchedule.mintableSupply();
					const now = await currentTime();
					await supplySchedule.updateMintValues({ from: synthetix });

					let lastMintEvent;
					const schedule = await supplySchedule.schedules(1);
					lastMintEvent = await supplySchedule.lastMintEvent();

					assert.bnEqual(schedule.totalSupplyMinted, mintedSupply.add(weeklyIssuance));
					assert.ok(lastMintEvent.toNumber() >= now); // lastMintEvent is updated to >= now

					// fast forward 1 week to within week 1 in Year 3
					const weekFiftyThree = YEAR_TWO_START + 52 * WEEK + 1 * DAY; // Sometime within week 1, Year 3
					await fastForwardTo(new Date(weekFiftyThree * 1000));

					// Expect two weeks of Year 2 mintable - none from Year 3 schedule in week 1 of Year 3
					expectedIssuance = divideDecimal(supplySchedules.secondYearSupply, 52 / 2);

					assert.bnClose(await supplySchedule.mintableSupply(), expectedIssuance);

					// Update the supply minted again
					const blockTime = await currentTime();
					await supplySchedule.updateMintValues({ from: synthetix });

					// Get Year 2 schedule again
					const scheduleYear2 = await supplySchedule.schedules(1);
					const scheduleYear3 = await supplySchedule.schedules(2);
					lastMintEvent = await supplySchedule.lastMintEvent();

					// Check Year 2 schedule is fully minted & Year 3 schedule hasn't been updated
					// lastMintEvent is updated to >= now
					assert.ok(lastMintEvent.toNumber() >= blockTime);
					assert.bnEqual(scheduleYear2.totalSupply, scheduleYear2.totalSupplyMinted);

					// Check Year 3 schedule
					assert.bnEqual(scheduleYear3.totalSupplyMinted, toUnit('0'));
				});

				it('should calculate mintable supply of 2 weeks from end of Year 2 + 1 week from Year 3, in Year 3 week 2', async () => {
					const supplyYearTwo = supplySchedules.secondYearSupply.toString();

					// fast forward 49 weeks to within week 51
					const weekFiftyOne = weekTwo + 49 * WEEK + 1 * DAY; // Sometime within week 51
					// // Expect 49 week is mintable after first week minted
					const expectedIssuance = toUnit(supplyYearTwo).sub(weeklyIssuance.mul(new BN(3))); // 52 - 3 = 49 weeks
					await fastForwardTo(new Date(weekFiftyOne * 1000));

					assert.bnClose(await supplySchedule.mintableSupply(), expectedIssuance);

					// Update the supply minted
					const mintedSupply = await supplySchedule.mintableSupply();
					const now = await currentTime();
					await supplySchedule.updateMintValues({ from: synthetix });

					let lastMintEvent;
					const schedule = await supplySchedule.schedules(1);
					lastMintEvent = await supplySchedule.lastMintEvent();

					assert.bnEqual(schedule.totalSupplyMinted, mintedSupply.add(weeklyIssuance));
					assert.ok(lastMintEvent.toNumber() >= now); // lastMintEvent is updated to >= now

					// fast forward 2 weeks to within week 2 in Year 3
					const weekFiftyFour = YEAR_TWO_START + 53 * WEEK + 1 * DAY; // Sometime within week 2, Year 3
					await fastForwardTo(new Date(weekFiftyFour * 1000));

					// Expect two weeks of Year 2 mintable + one week from Year 3 schedule in week 2 of Year 3
					const expectedIssuanceFromYear2 = divideDecimal(supplySchedules.secondYearSupply, 52 / 2);
					const expectedIssuanceFromYear3 = divideDecimal(supplySchedules.thirdYearSupply, 52);

					assert.bnClose(
						await supplySchedule.mintableSupply(),
						expectedIssuanceFromYear2.add(expectedIssuanceFromYear3)
					);

					// Update the supply minted again
					const blockTime = await currentTime();
					await supplySchedule.updateMintValues({ from: synthetix });

					// Get Year 2 schedule again
					const scheduleYear2 = await supplySchedule.schedules(1);
					const scheduleYear3 = await supplySchedule.schedules(2);
					lastMintEvent = await supplySchedule.lastMintEvent();

					// Check Year 2 schedule is fully minted
					// lastMintEvent is updated to >= now
					assert.ok(lastMintEvent.toNumber() >= blockTime);
					assert.bnEqual(scheduleYear2.totalSupply, scheduleYear2.totalSupplyMinted);

					// Check Year 3 schedule
					assert.bnEqual(scheduleYear3.totalSupplyMinted, expectedIssuanceFromYear3);
				});
			});

			describe('Error handling', async () => {
				it('should revert when getCurrentSchedule and time is greater than Year 7 schedule', async () => {
					const yearSevenStart = YEAR_TWO_START + 6 * YEAR; // UNIX 1741651200

					// fast forward EVM to Year 8 schedule starting at UNIX 1741651200+
					await fastForwardTo(new Date(yearSevenStart * 1000));

					await assert.revert(supplySchedule.getCurrentSchedule());
				});
				it('should return 0 mintable when time is greater than Year 7 schedule', async () => {
					const yearSevenStart = YEAR_TWO_START + 6 * YEAR; // UNIX 1741651200

					// fast forward EVM to Year 8 schedule starting at UNIX 1741651200+
					await fastForwardTo(new Date(yearSevenStart * 1000));

					await assert.bnEqual(await supplySchedule.mintableSupply(), toUnit('0'));
					await assert.bnEqual(await supplySchedule.isMintable(), false);
				});
			});
		});
	});
});
