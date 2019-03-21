const SupplySchedule = artifacts.require('SupplySchedule');
const { currentTime, bnClose, divideDecimal, fastForwardTo } = require('../utils/testUtils');
const BN = require('bn.js');

contract.only('SupplySchedule', async function(accounts) {
	const DAY = 86400;
	const WEEK = 604800;
	const YEAR = 31556926;

	const [deployerAccount, owner, account1, synthetix] = accounts;

	let supplySchedule;

	beforeEach(async function() {
		// Save ourselves from having to await deployed() in every single test.
		// We do this in a beforeEach instead of before to ensure we isolate
		// contract interfaces to prevent test bleed.
		supplySchedule = await SupplySchedule.deployed();
		await supplySchedule.setSynthetix(synthetix, { from: owner });
	});

	it('should set constructor params on deployment', async function() {
		// constructor(address _owner) //
		const instance = await SupplySchedule.new(account1, {
			from: deployerAccount,
		});

		assert.equal(await instance.owner(), account1);
	});

	describe('linking synthetix', async function() {
		it('should have set synthetix', async function() {
			const synthetixAddress = await supplySchedule.synthetix();
			assert.equal(synthetixAddress, synthetix);
		});
	});

	describe('functions and modifiers', async function() {
		it('should calculate weeks to mint and round down to full week', async function() {
			const expectedResult = web3.utils.toBN(0);
			const secondsSinceLastWeek = 300; // 604,800 seconds in 7 day week

			assert.bnEqual(
				await supplySchedule._numWeeksRoundedDown(secondsSinceLastWeek),
				expectedResult
			);
		});

		it('should calculate 1 weeks to mint and round down to full week', async function() {
			const expectedWeeks = web3.utils.toBN(1);
			const secondsSinceLastWeek = WEEK * 1.5; // 604,800 seconds in 7 day week

			assert.bnEqual(
				await supplySchedule._numWeeksRoundedDown(secondsSinceLastWeek),
				expectedWeeks
			);
		});

		it('should calculate 1 weeks to mint and round down to full week given 678767', async function() {
			const expectedWeeks = web3.utils.toBN(1);
			const secondsSinceLastWeek = 678767; // 604,800 seconds in 7 day week

			assert.bnEqual(
				await supplySchedule._numWeeksRoundedDown(secondsSinceLastWeek),
				expectedWeeks
			);
		});

		it('should calculate 2 weeks to mint and round down to full week given 2.5 weeks', async function() {
			const expectedWeeks = web3.utils.toBN(2);
			const secondsSinceLastWeek = WEEK * 2.5;

			assert.bnEqual(
				await supplySchedule._numWeeksRoundedDown(secondsSinceLastWeek),
				expectedWeeks
			);
		});

		describe('mintable supply', async function() {
			const firstYearSupply = 75000000;
			const weeklyIssuance = divideDecimal(firstYearSupply, 52);
			const weekOne = 1552435220; // first week Year 2 schedule

			it('should calculate the mintable supply as 0 for 1st week in year 2 - 75M supply', async function() {
				const expectedIssuance = web3.utils.toBN(0);
				// fast forward EVM to Week 1 in Year 2 schedule starting at UNIX 1552435200+
				await fastForwardTo(new Date(weekOne * 1000));

				assert.bnEqual(await supplySchedule.mintableSupply(), expectedIssuance);
			});

			it('should calculate the mintable supply for one weeks in year 2 in week 2 - 75M supply', async function() {
				const expectedIssuance = divideDecimal(firstYearSupply, 52);
				const weekTwo = weekOne + WEEK;
				// fast forward EVM to Week 2 in Year 2 schedule starting at UNIX 1552435200+
				await fastForwardTo(new Date(weekTwo * 1000));

				assert.bnEqual(await supplySchedule.mintableSupply(), expectedIssuance);
			});

			it('should calculate the mintable supply for two weeks in year 2 in week 3 - 75M supply', async function() {
				const expectedIssuance = divideDecimal(firstYearSupply, 52 / 2);
				const weekThree = weekOne + 2 * WEEK;
				// fast forward EVM to within Week 3 in Year 2 schedule starting at UNIX 1552435200+
				await fastForwardTo(new Date(weekThree * 1000));

				// bnClose as 52 /3 weeks results in a recursive number that is rounded
				assert.bnEqual(await supplySchedule.mintableSupply(), expectedIssuance);
			});

			it('should calculate the mintable supply for three weeks in year 2 in week 4 - 75M supply', async function() {
				const expectedIssuance = weeklyIssuance.mul(new BN(3));
				const weekThree = weekOne + 3 * WEEK;
				// fast forward EVM to within Week 3 in Year 2 schedule starting at UNIX 1552435200+
				await fastForwardTo(new Date(weekThree * 1000));

				// bnClose as 52 / 3 weeks results in a recursive number that is rounded
				assert.bnClose(await supplySchedule.mintableSupply(), expectedIssuance);
			});

			it('should update the Year 2 schedule for 1 week after minting', async function() {
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

			it('should calculate mintable supply of 1 week after minting', async function() {
				// fast forward EVM to Week 2 in Year 2 schedule starting at UNIX 1552435200+
				const weekTwo = weekOne + 1 * WEEK;
				await fastForwardTo(new Date(weekTwo * 1000));

				const mintedSupply = await supplySchedule.mintableSupply();
				const now = await currentTime();
				await supplySchedule.updateMintValues({from: synthetix});

				const schedule = await supplySchedule.schedules(1);
				const lastMintEvent = await supplySchedule.lastMintEvent();

				assert.bnEqual(schedule.totalSupplyMinted, mintedSupply);
				assert.ok(lastMintEvent.toNumber() >= now); // lastMintEvent is updated to >= now

				const weekThree = weekTwo + WEEK + 1 * DAY; // Sometime within week two
				// // Expect only 1 week is mintable after first week minted
				const expectedIssuance = divideDecimal(firstYearSupply, 52);
				await fastForwardTo(new Date(weekThree * 1000));

				assert.bnEqual(await supplySchedule.mintableSupply(), expectedIssuance);
			});
		});
	});
});
