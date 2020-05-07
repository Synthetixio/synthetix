'use strict';

const { artifacts, contract, web3 } = require('@nomiclabs/buidler');
const { toBN } = web3.utils;

const { assert, addSnapshotBeforeRestoreAfterEach } = require('./common');
const { currentTime, fastForward, toUnit, fromUnit } = require('../utils')();

const BinaryOptionMarket = artifacts.require('BinaryOptionMarket');
const BinaryOption = artifacts.require('BinaryOption');
const SafeDecimalMath = artifacts.require('SafeDecimalMath');

contract('BinaryOptionMarket', accounts => {
    const [initialBidder] = accounts;

    const biddingTime = 100;
    const timeToMaturity = 200;
    const initialLongBid = toUnit(10);
    const initialShortBid = toUnit(5);
    const initialTargetPrice = toUnit(100);
    const initialPoolFee = toUnit(0.008);
    const initialCreatorFee = toUnit(0.002);
    const totalInitialFee = initialPoolFee.add(initialCreatorFee);

    let market;
    let creationTime;

    const deployMarket = async ({endOfBidding, maturity,
        targetPrice, longBid, shortBid, poolFee, creatorFee, creator}) => {
        return await BinaryOptionMarket.new(endOfBidding, maturity, targetPrice, longBid, shortBid, poolFee, creatorFee, {from: creator});
    };

    const setupNewMarket = async () => {
        creationTime = await currentTime();
        market = await deployMarket(
            {
                endOfBidding: creationTime + biddingTime,
                maturity: creationTime + timeToMaturity,
                targetPrice: initialTargetPrice,
                longBid: initialLongBid,
                shortBid: initialShortBid,
                poolFee: initialPoolFee,
                creatorFee: initialCreatorFee,
                creator: initialBidder,
            }
        )
    }

    before(async () => {
        BinaryOptionMarket.link(await SafeDecimalMath.new());
        await setupNewMarket();
    })

    addSnapshotBeforeRestoreAfterEach();

    // All inputs should be BNs.
    const computePrices = (longs, shorts, fee) => {
        const totalOptions = longs.add(shorts).mul(toUnit(1).sub(fee)).div(toUnit(1));
        return { long: longs.mul(toUnit(1)).div(totalOptions), short: shorts.mul(toUnit(1)).div(totalOptions) }
    };

    describe.only('Basic parameters', () => {
        it('static parameters are set properly', async () => {
            assert.bnEqual(await market.endOfBidding(), toBN(creationTime + biddingTime));
            assert.bnEqual(await market.maturity(), toBN(creationTime + timeToMaturity));
            assert.bnEqual(await market.targetPrice(), initialTargetPrice);
            assert.bnEqual(await market.poolFee(), initialPoolFee);
            assert.bnEqual(await market.creatorFee(), initialCreatorFee);
            assert.bnEqual(await market.fee(), initialPoolFee.add(initialCreatorFee));
        });

        it('BinaryOption instances are set up properly.', async () => {
            const long = await BinaryOption.at(await market.long());
            const short = await BinaryOption.at(await market.short());
            const prices = computePrices(initialLongBid, initialShortBid, totalInitialFee);

            assert.bnEqual(await long.totalBids(), initialLongBid);
            assert.bnEqual(await short.totalBids(), initialShortBid);
            assert.bnEqual(await long.bidOf(initialBidder), initialLongBid);
            assert.bnEqual(await short.bidOf(initialBidder), initialShortBid);
            assert.equal(await long.endOfBidding(), creationTime + biddingTime);
            assert.equal(await short.endOfBidding(), creationTime + biddingTime);
            assert.bnEqual(await long.price(), prices.long);
            assert.bnEqual(await short.price(), prices.short);
        });

        it('Bad constructor parameters revert.', async () => {
            // end of bidding in the past
            let localCreationTime = await currentTime();
            await assert.revert(deployMarket({
                endOfBidding: localCreationTime - 1,
                maturity: localCreationTime + 200,
                targetPrice: initialTargetPrice,
                longBid: initialLongBid,
                shortBid: initialShortBid,
                poolFee: initialPoolFee,
                creatorFee: initialCreatorFee,
                creator: initialBidder,
            }),
            "End of bidding must be in the future.");

            // end of maturity before end of bidding.
            localCreationTime = await currentTime();
            await assert.revert(deployMarket({
                endOfBidding: localCreationTime + 100,
                maturity: localCreationTime + 99,
                targetPrice: initialTargetPrice,
                longBid: initialLongBid,
                shortBid: initialShortBid,
                poolFee: initialPoolFee,
                creatorFee: initialCreatorFee,
                creator: initialBidder,
            }),
            "Maturity must be after the end of bidding.");

            // nil target price
            localCreationTime = await currentTime();
            await assert.revert(deployMarket({
                endOfBidding: localCreationTime + 100,
                maturity: localCreationTime + 200,
                targetPrice: toBN(0),
                longBid: initialLongBid,
                shortBid: initialShortBid,
                poolFee: initialPoolFee,
                creatorFee: initialCreatorFee,
                creator: initialBidder,
            }),
            "The target price must be nonzero.");

            // total fee more than 100%
            localCreationTime = await currentTime();
            await assert.revert(deployMarket({
                endOfBidding: localCreationTime + 100,
                maturity: localCreationTime + 200,
                targetPrice: initialTargetPrice,
                longBid: initialLongBid,
                shortBid: initialShortBid,
                poolFee: toUnit(0.5),
                creatorFee: toUnit(0.5),
                creator: initialBidder,
            }),
            "Fee must be less than 100%.");

            // zero initial price on either side
            localCreationTime = await currentTime();
            await assert.revert(deployMarket({
                endOfBidding: localCreationTime + 100,
                maturity: localCreationTime + 200,
                targetPrice: initialTargetPrice,
                longBid: toUnit(0),
                shortBid: initialShortBid,
                poolFee: initialPoolFee,
                creatorFee: initialCreatorFee,
                creator: initialBidder,
            }),
            "Option price out of range.");

            localCreationTime = await currentTime();
            await assert.revert(deployMarket({
                endOfBidding: localCreationTime + 100,
                maturity: localCreationTime + 200,
                targetPrice: initialTargetPrice,
                longBid: initialLongBid,
                shortBid: toUnit(0),
                poolFee: initialPoolFee,
                creatorFee: initialCreatorFee,
                creator: initialBidder,
            }),
            "Option price out of range.");


        });
    });

    describe('Prices', () => {
        it('computePrices is correct with zero fee.', async () => {
            assert.isTrue(false);
        });

        it('computePrices is correct with positive fee.', async () => {
            assert.isTrue(false);
        });

        it('currentPrices is correct with zero fee.', async () => {
            assert.isTrue(false);
        });

        it('currentPrices is correct with positive fee.', async () => {
            assert.isTrue(false);
        });
    });

    describe('Phases', () => {
        it('Can proceed through the phases properly.', async () => {
            assert.isTrue(false);
        });
    });

    describe('Bids', () => {
        it('Can place long bids properly.', async () => {
            assert.isTrue(false);
        });

        it('Can place short bids properly.', async () => {
            assert.isTrue(false);
        });

        it('Can place both long and short bids at once.', async () => {
            assert.isTrue(false);
        });
    })

    describe('Refunds', () => {
        it('Can refund long bids properly.', async () => {
            assert.isTrue(false);
        });

        it('Can refund short bids properly.', async () => {
            assert.isTrue(false);
        });

        it('Can refund both long and short bids at once.', async () => {
            assert.isTrue(false);
        });
    });
});