'use strict';

const { artifacts, contract, web3 } = require('@nomiclabs/buidler');
const { toBN } = web3.utils;

const { assert, addSnapshotBeforeRestoreAfterEach } = require('./common');
const { toUnit, currentTime } = require('../utils')();

const TestableBinaryOptionMarketFactory = artifacts.require('TestableBinaryOptionMarketFactory');
const BinaryOptionMarket = artifacts.require('BinaryOptionMarket');
const SafeDecimalMath = artifacts.require('SafeDecimalMath');

contract('BinaryOptionMarketFactory', accounts => {
    const [initialCreator, dummyMarket] = accounts;

    const initialPoolFee = toUnit(0.008);
    const initialCreatorFee = toUnit(0.002);
    const initialRefundFee = toUnit(0.02)

    let factory;

    const deployFactory = async ({creator, poolFee, creatorFee, refundFee}) => {
        return await TestableBinaryOptionMarketFactory.new(creator, poolFee, creatorFee, refundFee);
    }

    const setupNewFactory = async () => {
        factory = await deployFactory({
            creator: initialCreator,
            poolFee: initialPoolFee,
            creatorFee: initialCreatorFee,
            refundFee: initialRefundFee,
        });
    }

    const createMarket = async (fac, endOfBidding, maturity, targetPrice, longBid, shortBid) => {
        const tx = fac.createMarket(endOfBidding, maturity, targetPrice, longBid, shortBid);
        return BinaryOptionMarket.at(tx.logs[0].args.market);
    }

    before(async () => {
        TestableBinaryOptionMarketFactory.link(await SafeDecimalMath.new());
        await setupNewFactory();
    });

    addSnapshotBeforeRestoreAfterEach();

    describe('Basic parameters', () => {
        it('Static parameters are set properly', async () => {
            assert.bnEqual(await factory.poolFee(), initialPoolFee);
            assert.bnEqual(await factory.creatorFee(), initialCreatorFee);
            assert.bnEqual(await factory.refundFee(), initialRefundFee);
        });

        it('Set pool fee', async () => {
            const newFee = toUnit(0.5);
            await factory.setPoolFee(newFee);
            assert.bnEqual(await factory.poolFee(), newFee);
        });

        it("Pool fee can't be set too high", async () => {
            const newFee = toUnit(1);
            await assert.revert(factory.setPoolFee(newFee), "Total fee must be less than 100%.");
        });

        it('Set creator fee', async () => {
            const newFee = toUnit(0.5);
            await factory.setCreatorFee(newFee);
            assert.bnEqual(await factory.creatorFee(), newFee);
        });

        it("Creator fee can't be set too high", async () => {
            const newFee = toUnit(1);
            await assert.revert(factory.setCreatorFee(newFee), "Total fee must be less than 100%.");
        });

        it('Set refund fee', async () => {
            const newFee = toUnit(1);
            await factory.setRefundFee(newFee);
            assert.bnEqual(await factory.refundFee(), newFee);
        });

        it("Refund fee can't be set too high", async () => {
            const newFee = toUnit(1.01);
            await assert.revert(factory.setRefundFee(newFee), "Refund fee must be no greater than 100%.");
        });
    });

    describe('Market creation', () => {
        it('Can create a market', async () => {
            const now = await currentTime();

            const result = await factory.createMarket(
                now + 100, now + 200,
                toUnit(1), toUnit(2), toUnit(3),
                { from: initialCreator })

            const log = result.logs[0];
            assert.equal(log.event, 'BinaryOptionMarketCreated');
            assert.equal(log.args.creator, initialCreator);

            const market = await BinaryOptionMarket.at(log.args.market);

            assert.bnEqual(await market.endOfBidding(), toBN(now + 100));
            assert.bnEqual(await market.maturity(), toBN(now + 200));
            assert.bnEqual(await market.targetPrice(), toUnit(1));

            const bids = await market.totalBids();
            assert.bnEqual(bids[0], toUnit(2));
            assert.bnEqual(bids[1], toUnit(3));
            assert.bnEqual(await market.totalDebt(), toUnit(5));

            assert.bnEqual(await market.poolFee(), initialPoolFee);
            assert.bnEqual(await market.creatorFee(), initialCreatorFee);
            assert.bnEqual(await market.refundFee(), initialRefundFee);

            assert.bnEqual(await factory.numActiveMarkets(), toBN(1));
            assert.bnEqual(await factory.activeMarkets(0), market.address);
        });
    });

    describe('Debt management', () => {
        it('Active markets can modify the total debt.', async () => {
            await factory.addMarket(dummyMarket);
            const initialDebt = await factory.totalDebt();

            await factory.incrementTotalDebt(toUnit(2), { from: dummyMarket });
            assert.bnEqual(await factory.totalDebt(), initialDebt.add(toUnit(2)));

            await factory.decrementTotalDebt(toUnit(1), { from: dummyMarket });
            assert.bnEqual(await factory.totalDebt(), initialDebt.add(toUnit(1)));
        });

        it('Only active markets can modify the total debt.', async () => {
            await assert.revert(factory.incrementTotalDebt(toUnit(2), { from: dummyMarket }), "Only active markets can alter the debt.");
            await assert.revert(factory.decrementTotalDebt(toUnit(1), { from: dummyMarket }), "Only active markets can alter the debt.");
        });
    });
});