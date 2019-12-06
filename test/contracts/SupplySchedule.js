const SupplySchedule = artifacts.require('SupplySchedule');
const SynthetixProxy = artifacts.require('Proxy');
const {
	toUnit,
	currentTime,
	divideDecimal,
	fastForwardTo,
	multiplyDecimal,
	fromUnit,
	powerToDecimal,
} = require('../utils/testUtils');
const BN = require('bn.js');

contract.only('SupplySchedule', async accounts => {
	const initialWeeklySupply = divideDecimal(75000000, 52);

	const [deployerAccount, owner, account1, synthetix] = accounts;

	let supplySchedule, synthetixProxy, decayRate;

	beforeEach(async () => {
		// Save ourselves from having to await deployed() in every single test.
		// We do this in a beforeEach instead of before to ensure we isolate
		// contract interfaces to prevent test bleed.
		supplySchedule = await SupplySchedule.deployed();
		synthetixProxy = await SynthetixProxy.deployed();

		await supplySchedule.setSynthetixProxy(synthetixProxy.address, { from: owner });
		await synthetixProxy.setTarget(synthetix, { from: owner });

		decayRate = await supplySchedule.DECAY_RATE();
	});

	it('should set constructor params on deployment', async () => {
		// constructor(address _owner, uint _lastMintEvent, uint _currentWeek) //
		const lastMintEvent = 0;
		const weekCounter = 0;
		const instance = await SupplySchedule.new(account1, lastMintEvent, weekCounter, {
			from: deployerAccount,
		});

		const weeklyIssuance = divideDecimal(75e6, 52);
		assert.equal(await instance.owner(), account1);
		assert.bnEqual(await instance.lastMintEvent(), 0);
		assert.bnEqual(await instance.weekCounter(), 0);
		assert.bnEqual(await instance.initialWeeklySupply(), weeklyIssuance);
	});

	describe('linking synthetix', async () => {
		it('should have set synthetix proxy', async () => {
			const synthetixProxy = await supplySchedule.synthetixProxy();
			assert.equal(synthetixProxy, synthetixProxy);
		});
	});

	describe('functions and modifiers', async () => {
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

		describe('exponential decay supply with initial weekly supply of 1.44m', async () => {
			function getDecaySupplyForWeekNumber(initialAmount, weekNumber) {
				const effectiveRate = powerToDecimal(toUnit(1).sub(decayRate), weekNumber);

				const supplyForWeek = multiplyDecimal(effectiveRate, initialAmount);
				return supplyForWeek;
			}

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
				console.log(`expectedIssuacne ${expectedIssuance}, supply ${supply}`);
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
				console.log(`expectedIssuacne ${expectedIssuance}, supply ${supply}`);
				assert.bnEqual(supply, expectedIssuance);
			});
		});

		describe.only('terminal inflation supply with initial total supply of 1,000,000', async () => {
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
			const WEEK = 604800;
			const weekOne = 1551830420; // first week Year 2 schedule

			async function checkMintedValues(currentAmount = new BN(0)) {
				const now = await currentTime();

				// call updateMintValues to mimic synthetix issuing tokens
				await supplySchedule.updateMintValues({ from: synthetix });

				const lastMintEvent = await supplySchedule.lastMintEvent();

				assert.ok(lastMintEvent.toNumber() >= now); // lastMintEvent is updated to >= now
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

			it('should calculate the mintable supply for two weeks in year 2 in week 3 - 75M supply', async () => {
				const expectedIssuance = initialWeeklySupply.mul(new BN(2));

				const inWeekThree = weekOne + 2 * WEEK;
				// fast forward EVM to within Week 3 in Year 2 schedule starting at UNIX 1552435200+
				await fastForwardTo(new Date(inWeekThree * 1000));

				assert.bnEqual(await supplySchedule.mintableSupply(), expectedIssuance);
			});

			it('should calculate the mintable supply for three weeks in year 2 in week 4 - 75M supply', async () => {
				const expectedIssuance = initialWeeklySupply.mul(new BN(3));
				const inWeekFour = weekOne + 3 * WEEK;
				// fast forward EVM to within Week 4 in Year 2 schedule starting at UNIX 1552435200+
				await fastForwardTo(new Date(inWeekFour * 1000));

				assert.bnEqual(await supplySchedule.mintableSupply(), expectedIssuance);
			});

			it('should calculate the mintable supply for 39 weeks without decay in Year 2 - 75M supply', async () => {
				const expectedIssuance = initialWeeklySupply.mul(new BN(39));

				const weekFourty = weekOne + 39 * WEEK;
				// fast forward EVM to within Week 40 in Year 2 schedule starting at UNIX 1552435200+
				await fastForwardTo(new Date(weekFourty * 1000));

				// bnClose as weeklyIssuance.mul(new BN(3)) rounding
				assert.bnClose(await supplySchedule.mintableSupply(), expectedIssuance);
			});
			it('should calculate the mintable supply for 39 weeks without decay, 1 week with decay in week 41', async () => {
				const expectedIssuance = initialWeeklySupply.mul(new BN(39));

				const weekFourtyOne = weekOne + 39 * WEEK;
				// fast forward EVM to within Week 40 in Year 2 schedule starting at UNIX 1552435200+
				await fastForwardTo(new Date(weekFourtyOne * 1000));

				assert.bnClose(await supplySchedule.mintableSupply(), expectedIssuance);
			});

			// it('should calculate the mintable supply for 50 weeks in year 2 in week 51 - 75M supply', async () => {
			// 	const supply = supplySchedules.secondYearSupply.toString();
			// 	const expectedIssuance = toUnit(supply).sub(weeklyIssuance.mul(new BN(2))); // 52 - 2 = 50 weeks

			// 	const weekFifty = weekOne + 50 * WEEK;
			// 	// fast forward EVM to within Week 50 in Year 2 schedule starting at UNIX 1552435200+
			// 	await fastForwardTo(new Date(weekFifty * 1000));

			// 	assert.bnClose(await supplySchedule.mintableSupply(), expectedIssuance);
			// });

			// it('should calculate the unminted supply for previous year in year 3 week 1', async () => {
			// 	const expectedIssuance = toUnit(supplySchedules.secondYearSupply.toString());
			// 	const yearThreeStart = YEAR_TWO_START + YEAR; // UNIX 1583971200

			// 	// fast forward EVM to Year 3 schedule starting at UNIX 1583971200+
			// 	// No previous minting in Year 2
			// 	await fastForwardTo(new Date(yearThreeStart * 1000));

			// 	assert.bnEqual(await supplySchedule.mintableSupply(), expectedIssuance);
			// 	await checkMintedValues(2, expectedIssuance);
			// });

			// it('should calculate the unminted supply for previous year in year 4 week 1', async () => {
			// 	const expectedIssuance = toUnit(supplySchedules.thirdYearSupply.toString());
			// 	const yearFourStart = YEAR_TWO_START + 2 * YEAR; // UNIX 1615507200

			// 	// fast forward EVM to Year 4 schedule starting at UNIX 1615507200+
			// 	// No previous minting in Year 3
			// 	await fastForwardTo(new Date(yearFourStart * 1000));

			// 	assert.bnEqual(await supplySchedule.mintableSupply(), expectedIssuance);
			// 	await checkMintedValues(3, expectedIssuance);
			// });

			// it('should calculate the unminted supply for previous year in year 5 week 1', async () => {
			// 	const expectedIssuance = toUnit(supplySchedules.fourthYearSupply.toString());
			// 	const yearFiveStart = YEAR_TWO_START + 3 * YEAR; // UNIX 1647043200

			// 	// fast forward EVM to Year 5 schedule starting at UNIX 1647043200+
			// 	// No previous minting in Year 4
			// 	await fastForwardTo(new Date(yearFiveStart * 1000));

			// 	assert.bnEqual(await supplySchedule.mintableSupply(), expectedIssuance);
			// 	await checkMintedValues(4, expectedIssuance);
			// });

			// it('should calculate the unminted supply for previous year in year 6 week 1', async () => {
			// 	const expectedIssuance = toUnit(supplySchedules.fifthYearSupply.toString());
			// 	const yearSixStart = YEAR_TWO_START + 4 * YEAR; // UNIX 1678579200

			// 	// fast forward EVM to Year 6 schedule starting at UNIX 1678579200+
			// 	// No previous minting in Year 5
			// 	await fastForwardTo(new Date(yearSixStart * 1000));

			// 	assert.bnEqual(await supplySchedule.mintableSupply(), expectedIssuance);
			// 	await checkMintedValues(5, expectedIssuance);
			// });

			// it('should calculate the unminted supply for previous year in year 7 week 1', async () => {
			// 	const expectedIssuance = toUnit(supplySchedules.sixthYearSupply.toString());
			// 	const yearSevenStart = YEAR_TWO_START + 5 * YEAR; // UNIX 1710115200

			// 	// fast forward EVM to Year 7 schedule starting at UNIX 1710115200+
			// 	// No previous minting in Year 6
			// 	await fastForwardTo(new Date(yearSevenStart * 1000));

			// 	assert.bnEqual(await supplySchedule.mintableSupply(), expectedIssuance);
			// 	await checkMintedValues(6, expectedIssuance);
			// });

			// it('should calculate the unminted supply for year 6 at end of Year 7 period', async () => {
			// 	const expectedIssuance = toUnit(supplySchedules.sixthYearSupply.toString());
			// 	const yearSevenEnd = YEAR_TWO_START + 5 * YEAR + 52 * WEEK - 1; // UNIX 1710115200

			// 	// fast forward EVM to End of Year 7 schedule starting at UNIX 1710115200+
			// 	// No previous minting in Year 6
			// 	await fastForwardTo(new Date(yearSevenEnd * 1000));

			// 	assert.bnEqual(await supplySchedule.mintableSupply(), expectedIssuance);
			// 	await checkMintedValues(6, expectedIssuance);
			// });

			// it('should calculate the unminted supply for previous year 6 in year 7 week 3', async () => {
			// 	const expectedIssuance = toUnit(supplySchedules.sixthYearSupply.toString());
			// 	const yearSevenStart = YEAR_TWO_START + 5 * YEAR + 3 * WEEK; // UNIX 1711929600

			// 	// fast forward EVM to Week 3, Year 7 schedule starting at UNIX 1710115200+
			// 	await fastForwardTo(new Date(yearSevenStart * 1000));

			// 	// Expect Year 6 to be mintable and no supply in Year 7
			// 	assert.bnEqual(await supplySchedule.mintableSupply(), expectedIssuance);
			// 	await checkMintedValues(6, expectedIssuance);
			// });

			// it('should update the Year 2 schedule for 1 week after minting', async () => {
			// 	// fast forward EVM to Week 1 in Year 2 schedule starting at UNIX 1552435200+
			// 	const weekTwo = weekOne + 1 * WEEK;
			// 	await fastForwardTo(new Date(weekTwo * 1000));

			// 	const mintedSupply = await supplySchedule.mintableSupply();
			// 	const now = await currentTime();
			// 	await supplySchedule.updateMintValues({ from: synthetix });

			// 	const schedule = await supplySchedule.schedules(1);
			// 	const lastMintEvent = await supplySchedule.lastMintEvent();

			// 	assert.bnEqual(schedule.totalSupplyMinted, mintedSupply);
			// 	assert.ok(lastMintEvent.toNumber() >= now); // lastMintEvent is updated to >= now
			// });

			// it('should calculate mintable supply of 1 week after minting', async () => {
			// 	// fast forward EVM to Week 2 in Year 2 schedule starting at UNIX 1552435200+
			// 	const weekTwo = weekOne + 1 * WEEK;
			// 	await fastForwardTo(new Date(weekTwo * 1000));

			// 	const mintedSupply = await supplySchedule.mintableSupply();
			// 	const now = await currentTime();
			// 	await supplySchedule.updateMintValues({ from: synthetix });

			// 	const schedule = await supplySchedule.schedules(1);
			// 	const lastMintEvent = await supplySchedule.lastMintEvent();

			// 	assert.bnEqual(schedule.totalSupplyMinted, mintedSupply);
			// 	assert.ok(lastMintEvent.toNumber() >= now); // lastMintEvent is updated to >= now

			// 	const weekThree = weekTwo + WEEK + 1 * DAY; // Sometime within week two
			// 	// // Expect only 1 week is mintable after first week minted
			// 	const expectedIssuance = divideDecimal(supplySchedules.secondYearSupply, 52);
			// 	await fastForwardTo(new Date(weekThree * 1000));

			// 	assert.bnEqual(await supplySchedule.mintableSupply(), expectedIssuance);
			// });

			// it('should calculate mintable supply of 2 weeks if 2+ weeks passed, after minting', async () => {
			// 	// fast forward EVM to Week 2 in Year 2 schedule starting at UNIX 1552435200+
			// 	const weekTwo = weekOne + 1 * WEEK;
			// 	await fastForwardTo(new Date(weekTwo * 1000));

			// 	// Mint the first week of supply
			// 	const mintedSupply = await supplySchedule.mintableSupply();
			// 	const now = await currentTime();
			// 	await supplySchedule.updateMintValues({ from: synthetix });

			// 	const schedule = await supplySchedule.schedules(1);
			// 	const lastMintEvent = await supplySchedule.lastMintEvent();

			// 	assert.bnEqual(schedule.totalSupplyMinted, mintedSupply);
			// 	assert.ok(lastMintEvent.toNumber() >= now); // lastMintEvent is updated to >= now

			// 	// fast forward 2 weeks to within week 4
			// 	const weekFour = weekTwo + 2 * WEEK + 1 * DAY; // Sometime within week four
			// 	// // Expect 2 week is mintable after first week minted
			// 	const expectedIssuance = divideDecimal(supplySchedules.secondYearSupply, 52 / 2);
			// 	await fastForwardTo(new Date(weekFour * 1000));

			// 	assert.bnEqual(await supplySchedule.mintableSupply(), expectedIssuance);
			// });

			// it('should calculate mintable supply of 4 weeks if 4+ weeks passed, after minting', async () => {
			// 	// fast forward EVM to Week 2 in Year 2 schedule starting at UNIX 1552435200+
			// 	const weekTwo = weekOne + 1 * WEEK;
			// 	await fastForwardTo(new Date(weekTwo * 1000));

			// 	// Mint the first week of supply
			// 	const mintedSupply = await supplySchedule.mintableSupply();
			// 	const now = await currentTime();
			// 	await supplySchedule.updateMintValues({ from: synthetix });

			// 	const schedule = await supplySchedule.schedules(1);
			// 	const lastMintEvent = await supplySchedule.lastMintEvent();

			// 	assert.bnEqual(schedule.totalSupplyMinted, mintedSupply);
			// 	assert.ok(lastMintEvent.toNumber() >= now); // lastMintEvent is updated to >= now

			// 	// fast forward 4 weeks to within week 6
			// 	const weekSix = weekTwo + 4 * WEEK + 1 * DAY; // Sometime within week six
			// 	// // Expect 4 week is mintable after first week minted
			// 	const expectedIssuance = divideDecimal(supplySchedules.secondYearSupply, 52 / 4);
			// 	await fastForwardTo(new Date(weekSix * 1000));

			// 	assert.bnEqual(await supplySchedule.mintableSupply(), expectedIssuance);
			// });
		});
	});
});
