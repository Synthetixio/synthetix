const fs = require('fs');
const path = require('path');
const { wrap } = require('../..');
const { contract, config, artifacts } = require('hardhat');
const { web3 } = require('hardhat');
const { toBN } = web3.utils;
const { toBytes32 } = require('../..');
const { assert } = require('../contracts/common');
const { toUnit, currentTime, fastForward } = require('../utils')();
const {
	connectContracts,
	ensureAccountHasEther,
	ensureAccountHassUSD,
	skipWaitingPeriod,
	simulateExchangeRates,
	takeDebtSnapshot,
	mockOptimismBridge,
	avoidStaleRates,
	resumeSystem,
} = require('./utils');

const Side = {
	Long: toBN(0),
	Short: toBN(1),
};

contract('Binary Options (prod tests)', accounts => {
	const [, user1] = accounts;

	let owner;

	let network, deploymentPath;

	let BinaryOptionMarketManager, ExchangeRates;
	let SynthsUSD;

	before('prepare', async function() {
		network = config.targetNetwork;
		const { getUsers, getPathToNetwork } = wrap({ network, fs, path });
		deploymentPath = config.deploymentPath || getPathToNetwork(network);
		console.log('Deployment path is:' + deploymentPath);
		owner = getUsers({ network, user: 'owner' }).address;

		if (config.useOvm) {
			return this.skip();
		}

		await avoidStaleRates({ network, deploymentPath });
		await takeDebtSnapshot({ network, deploymentPath });
		await resumeSystem({ owner, network, deploymentPath });

		if (config.patchFreshDeployment) {
			await simulateExchangeRates({ network, deploymentPath });
			await mockOptimismBridge({ network, deploymentPath });
		}

		({ SynthsUSD, BinaryOptionMarketManager, ExchangeRates } = await connectContracts({
			network,
			requests: [
				{ contractName: 'ExchangeRates' },
				{ contractName: 'SynthsUSD', abiName: 'Synth' },
				{ contractName: 'BinaryOptionMarketManager' },
			],
		}));

		await skipWaitingPeriod({ network });

		await ensureAccountHasEther({
			amount: toUnit('1'),
			account: owner,
			fromAccount: accounts[7],
			network,
			deploymentPath,
		});
		await ensureAccountHassUSD({
			amount: toUnit('1100'),
			account: user1,
			fromAccount: owner,
			network,
			deploymentPath,
		});
	});

	beforeEach('check debt snapshot', async () => {
		await takeDebtSnapshot({ network, deploymentPath });
	});

	describe('Creating a market', () => {
		let result;
		const expiryDuration = toBN(26 * 7 * 24 * 60 * 60);
		const sAUDKey = toBytes32('sAUD');
		let now;
		let binaryOptionMarket;

		it('produces expected event and pricesAfterBidOrRefund correctly computes the result of bids.', async () => {
			now = await currentTime();
			const amount = toUnit('1000');

			await SynthsUSD.approve(BinaryOptionMarketManager.address, amount, {
				from: user1,
			});

			result = await BinaryOptionMarketManager.createMarket(
				sAUDKey,
				toUnit(1),
				true,
				[now + 1000, now + 2000],
				[toUnit(500), toUnit(500)],
				{ from: user1 }
			);

			const BinaryOptionMarket = artifacts.require('BinaryOptionMarket');
			binaryOptionMarket = await BinaryOptionMarket.at(
				getEventByName({
					tx: result,
					name: 'MarketCreated',
				}).args.market
			);
			console.log('Binary Option Market loaded at:' + binaryOptionMarket.address);
			await skipWaitingPeriod({ network, deploymentPath });

			assert.eventEqual(getEventByName({ tx: result, name: 'MarketCreated' }), 'MarketCreated', {
				creator: user1,
				oracleKey: sAUDKey,
				strikePrice: toUnit(1),
				biddingEndDate: toBN(now + 1000),
				maturityDate: toBN(now + 2000),
				expiryDate: toBN(now + 2000).add(expiryDuration),
			});

			const longBid = toUnit(100);

			await SynthsUSD.approve(binaryOptionMarket.address, longBid, {
				from: user1,
			});

			// Long side
			const expectedPrices = await binaryOptionMarket.pricesAfterBidOrRefund(
				Side.Long,
				longBid,
				false
			);
			await binaryOptionMarket.bid(Side.Long, longBid, { from: user1 });
			const prices = await binaryOptionMarket.prices();
			assert.bnEqual(expectedPrices.long, prices.long);
			assert.bnEqual(expectedPrices.short, prices.short);

			// FIXME: Resulting in price is stale revert even though the rate is updated before the resolve market call
			const oracle = await ExchangeRates.oracle();
			await fastForward(expiryDuration + 2000);
			now = await currentTime();
			await ExchangeRates.updateRates([sAUDKey], [toUnit(1)], now, {
				from: oracle,
			});
			await BinaryOptionMarketManager.resolveMarket(binaryOptionMarket.address);
		});
	});
});

function getEventByName({ tx, name }) {
	return tx.logs.find(({ event }) => event === name);
}
