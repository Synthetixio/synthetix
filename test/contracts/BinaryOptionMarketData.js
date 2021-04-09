'use strict';

const { contract } = require('hardhat');
const { assert } = require('./common');
const { setupContract, setupAllContracts } = require('./setup');
const { currentTime, toUnit } = require('../utils')();
const { toBytes32 } = require('../..');

contract('BinaryOptionMarketData @gas-skip', accounts => {
	let market, setupTime, dataContract;

	before(async () => {
		const { AddressResolver: addressResolver } = await setupAllContracts({
			accounts,
			synths: ['sUSD'],
			contracts: [
				'BinaryOptionMarketManager',
				'BinaryOptionMarketMastercopy',
				'AddressResolver',
				'ExchangeRates',
				'FeePool',
				'Synthetix',
			],
		});

		setupTime = await currentTime();
		market = await setupContract({
			accounts,
			contract: 'TestableBinaryOptionMarket',
			args: [
				accounts[0], // manager
				accounts[1], // creator
				addressResolver.address,
				[toUnit(2), toUnit(0.05)], // Capital requirement, skew limit
				toBytes32('sAUD'), // oracle key
				toUnit(1), // strike price
				true,
				[setupTime + 100, setupTime + 200, setupTime + 300], // bidding end, maturity, expiry
				[toUnit(3), toUnit(4)], // long bid, short bid
				[toUnit(0.01), toUnit(0.02), toUnit(0.03)], // pool, creator, refund fees
			],
		});
		await market.rebuildCache();

		dataContract = await setupContract({
			accounts,
			contract: 'BinaryOptionMarketData',
			args: [],
		});
	});

	describe('Data contract reports market data properly', () => {
		it('Market parameters', async () => {
			const params = await dataContract.getMarketParameters(market.address);

			assert.equal(params.creator, await market.creator());

			const options = await market.options();
			assert.equal(params.options.long, options.long);
			assert.equal(params.options.short, options.short);

			const times = await market.times();
			assert.equal(params.times.biddingEnd, times.biddingEnd);
			assert.equal(params.times.maturity, times.maturity);
			assert.equal(params.times.expiry, times.expiry);

			const oracleDetails = await market.oracleDetails();
			assert.equal(params.oracleDetails.key, oracleDetails.key);
			assert.equal(params.oracleDetails.strikePrice, oracleDetails.strikePrice);
			assert.equal(params.oracleDetails.finalPrice, oracleDetails.finalPrice);

			const fees = await market.fees();
			assert.equal(params.fees.poolFee, fees.poolFee);
			assert.equal(params.fees.creatorFee, fees.creatorFee);
			assert.equal(params.fees.refundFee, fees.refundFee);

			const creatorLimits = await market.creatorLimits();
			assert.equal(params.creatorLimits.capitalRequirement, creatorLimits.capitalRequirement);
			assert.equal(params.creatorLimits.skewLimit, creatorLimits.skewLimit);
		});

		it('Market data', async () => {
			const data = await dataContract.getMarketData(market.address);

			const oraclePriceAndTimestamp = await market.oraclePriceAndTimestamp();
			assert.equal(data.oraclePriceAndTimestamp.price, oraclePriceAndTimestamp.price);
			assert.equal(data.oraclePriceAndTimestamp.updatedAt, oraclePriceAndTimestamp.updatedAt);

			const prices = await market.prices();
			assert.bnEqual(data.prices.long, prices.long);
			assert.bnEqual(data.prices.short, prices.short);

			assert.bnEqual(data.deposits.deposited, await market.deposited());
			assert.bnEqual(data.deposits.exercisableDeposits, await market.exercisableDeposits());

			assert.equal(data.resolution.resolved, await market.resolved());
			assert.equal(data.resolution.canResolve, await market.canResolve());

			assert.equal(data.phase, await market.phase());
			assert.equal(data.result, await market.result());

			const totalBids = await market.totalBids();
			assert.equal(data.totalBids.long, totalBids.long);
			assert.equal(data.totalBids.short, totalBids.short);

			const totalClaimableSupplies = await market.totalClaimableSupplies();
			assert.equal(data.totalClaimableSupplies.long, totalClaimableSupplies.long);
			assert.equal(data.totalClaimableSupplies.short, totalClaimableSupplies.short);

			const totalSupplies = await market.totalSupplies();
			assert.equal(data.totalSupplies.long, totalSupplies.long);
			assert.equal(data.totalSupplies.short, totalSupplies.short);
		});

		it('Account data', async () => {
			let data = await dataContract.getAccountMarketData(market.address, accounts[1]);

			const bids = await market.bidsOf(accounts[1]);
			assert.bnNotEqual(bids.long, toUnit(0));
			assert.bnNotEqual(bids.short, toUnit(0));
			assert.bnEqual(bids.long, data.bids.long);
			assert.bnEqual(bids.short, data.bids.short);

			const claimable = await market.claimableBalancesOf(accounts[1]);
			assert.bnNotEqual(claimable.long, toUnit(0));
			assert.bnNotEqual(claimable.short, toUnit(0));
			assert.bnEqual(claimable.long, data.claimable.long);
			assert.bnEqual(claimable.short, data.claimable.short);

			// Force a claim to set balances to nonzero values, and refresh the data.
			await market.forceClaim(accounts[1]);
			data = await dataContract.getAccountMarketData(market.address, accounts[1]);

			const balances = await market.balancesOf(accounts[1]);
			assert.bnNotEqual(balances.long, toUnit(0));
			assert.bnNotEqual(balances.short, toUnit(0));
			assert.bnEqual(balances.long, data.balances.long);
			assert.bnEqual(balances.short, data.balances.short);
		});
	});
});
