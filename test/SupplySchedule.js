const SupplySchedule = artifacts.require('SupplySchedule');

const { multiplyDecimal, divideDecimal, fastForwardTo } = require('../utils/testUtils');

contract('SupplySchedule', async function(accounts) {
	const SECOND = 1000;
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
		it('should calculate weeks to mint and roundup to full week', async function() {
			const expectedResult = web3.utils.toBN(1);
			const secondsSinceLastWeek = 300; // 604,800 seconds in 7 day week

			assert.bnEqual(await supplySchedule._numWeeksRoundedUp(secondsSinceLastWeek), expectedResult);
		});

		it('should calculate 2 weeks to mint and roundup to full week', async function() {
			const expectedWeeks = web3.utils.toBN(2);
			const secondsSinceLastWeek = 604800 * 1.5; // 604,800 seconds in 7 day week

			assert.bnEqual(await supplySchedule._numWeeksRoundedUp(secondsSinceLastWeek), expectedWeeks);
		});

		it('should calculate 2 weeks to mint and roundup to full week given 678767', async function() {
			const expectedWeeks = web3.utils.toBN(2);
			const secondsSinceLastWeek = 678767; // 604,800 seconds in 7 day week

			assert.bnEqual(await supplySchedule._numWeeksRoundedUp(secondsSinceLastWeek), expectedWeeks);
		});

		describe('mintable supply', async function() {
			const weeklyIssuance = divideDecimal(75000000, 52);

			it('should calculate the mintable supply for one week in year 2 - 75M supply', async function() {
				const expectedIssuance = weeklyIssuance;

				// fast forward EVM to Week 1 in Year 2 schedule starting at UNIX 1552435200+
				await fastForwardTo(new Date(1552435220 * 1000));

				assert.bnEqual(await supplySchedule.mintableSupply(), expectedIssuance);
			});

			it('should calculate the mintable supply for two week in year 2 - 75M supply', async function() {
				const expectedIssuance = multiplyDecimal(weeklyIssuance, 2);
				console.log(expectedIssuance.toString());
				// fast forward EVM to Week 1 in Year 2 schedule starting at UNIX 1552435200+
				// await fastForwardTo(new Date(1552435220 * 1000));
			
				// assert.bnEqual(await supplySchedule.mintableSupply(), expectedIssuance);
			});
		});
	});
});
