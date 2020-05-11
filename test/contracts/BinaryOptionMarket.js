'use strict';

const { artifacts, contract, web3 } = require('@nomiclabs/buidler');
const { toBN } = web3.utils;

const { assert, addSnapshotBeforeRestoreAfterEach } = require('./common');
const { currentTime, fastForward, toUnit, fromUnit } = require('../utils')();

const BinaryOptionMarket = artifacts.require('BinaryOptionMarket');
const TestableBinaryOptionMarket = artifacts.require('TestableBinaryOptionMarket');
const BinaryOption = artifacts.require('BinaryOption');
const SafeDecimalMath = artifacts.require('SafeDecimalMath');

contract('BinaryOptionMarket', accounts => {
    const [initialBidder, newBidder] = accounts;

    const biddingTime = 100;
    const timeToMaturity = 200;
    const initialLongBid = toUnit(10);
    const initialShortBid = toUnit(5);
    const initialTargetPrice = toUnit(100);
    const initialPoolFee = toUnit(0.008);
    const initialCreatorFee = toUnit(0.002);
    const initialRefundFee = toUnit(0.02)
    const totalInitialFee = initialPoolFee.add(initialCreatorFee);

    let market;
    let creationTime;

    const deployMarket = async ({endOfBidding, maturity,
        targetPrice, longBid, shortBid, poolFee, creatorFee, refundFee, creator}) => {
        return await TestableBinaryOptionMarket.new(endOfBidding, maturity, targetPrice, longBid, shortBid, poolFee, creatorFee, refundFee, {from: creator});
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
                refundFee: initialRefundFee,
                creator: initialBidder,
            }
        )
    }

    before(async () => {
        const math = await SafeDecimalMath.new();
        BinaryOptionMarket.link(math);
        TestableBinaryOptionMarket.link(math);
        await setupNewMarket();
    })

    addSnapshotBeforeRestoreAfterEach();

    const mulDecRound = (x, y) => {
        let result = x.mul(y).div(toUnit(0.1));
        if (result.mod(toBN(10)).gte(toBN(5))) {
            result = result.add(toBN(10));
        }
        return result.div(toBN(10));
    }

    const divDecRound = (x, y) => {
        let result = x.mul(toUnit(10)).div(y);
        if (result.mod(toBN(10)).gte(toBN(5))) {
            result = result.add(toBN(10));
        }
        return result.div(toBN(10));
    }

    // All inputs should be BNs.
    const computePrices = (longs, shorts, fee) => {
        const totalOptions = mulDecRound(longs.add(shorts), toUnit(1).sub(fee));
        return { long: divDecRound(longs, totalOptions), short: divDecRound(shorts, totalOptions) };
    };

    describe('Basic parameters', () => {
        it('static parameters are set properly', async () => {
            assert.bnEqual(await market.endOfBidding(), toBN(creationTime + biddingTime));
            assert.bnEqual(await market.maturity(), toBN(creationTime + timeToMaturity));
            assert.bnEqual(await market.targetPrice(), initialTargetPrice);
            assert.bnEqual(await market.poolFee(), initialPoolFee);
            assert.bnEqual(await market.creatorFee(), initialCreatorFee);
            assert.bnEqual(await market.debt(), initialLongBid.add(initialShortBid));
        });

        it('BinaryOption instances are set up properly.', async () => {
            const long = await BinaryOption.at(await market.longOption());
            const short = await BinaryOption.at(await market.shortOption());
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
                refundFee: initialRefundFee,
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
                refundFee: initialRefundFee,
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
                refundFee: initialRefundFee,
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
                refundFee: initialRefundFee,
                creator: initialBidder,
            }),
            "Fee must be less than 100%.");

            // Refund fee more than 100%
            localCreationTime = await currentTime();
            await assert.revert(deployMarket({
                endOfBidding: localCreationTime + 100,
                maturity: localCreationTime + 200,
                targetPrice: initialTargetPrice,
                longBid: initialLongBid,
                shortBid: initialShortBid,
                poolFee: initialPoolFee,
                creatorFee: initialCreatorFee,
                refundFee: toUnit(1.01),
                creator: initialBidder,
            }),
            "Refund fee must be no greater than 100%.");


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
                refundFee: initialRefundFee,
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
                refundFee: initialRefundFee,
                creator: initialBidder,
            }),
            "Option price out of range.");
        });
    });

    describe('Prices', () => {
        it('computePrices is correct with zero fee.', async () => {
            let localCreationTime = await currentTime();
            const localMarket = await deployMarket({
                endOfBidding: localCreationTime + 100,
                maturity: localCreationTime + 200,
                targetPrice: initialTargetPrice,
                longBid: initialLongBid,
                shortBid: initialShortBid,
                poolFee: toUnit(0),
                creatorFee: toUnit(0),
                refundFee: initialRefundFee,
                creator: initialBidder,
            });

            const supplies = [
                { supply: [toUnit(0), toUnit(1)], prices: [toUnit(0), toUnit(1)] },
                { supply: [toUnit(1), toUnit(0)], prices: [toUnit(1), toUnit(0)] },
                { supply: [toUnit(1), toUnit(1)], prices: [toUnit(0.5), toUnit(0.5)] },
                { supply: [toUnit(10000), toUnit(10000)], prices: [toUnit(0.5), toUnit(0.5)] },
                { supply: [toUnit(3), toUnit(1)], prices: [toUnit(0.75), toUnit(0.25)] },
                { supply: [toUnit(15), toUnit(30)], prices: [divDecRound(toUnit(1), toUnit(3)), divDecRound(toUnit(2), toUnit(3))] },
                { supply: [toUnit(7.7), toUnit(17)], prices: (o => [o.long, o.short])(computePrices(toUnit(7.7), toUnit(17), toBN(0))) },
            ];

            for (let v of supplies) {
                await localMarket.setDebt(v.supply[0].add(v.supply[1]));
                const prices = await localMarket.computePrices(v.supply[0], v.supply[1]);
                assert.bnEqual(prices[0], v.prices[0]);
                assert.bnEqual(prices[1], v.prices[1]);
                assert.bnEqual(prices[0].add(prices[1]), toUnit(1));
            }
        });

        it('computePrices is correct with positive fee.', async () => {
            const pairs = [
                [toUnit(0), toUnit(1)],
                [toUnit(1), toUnit(0)],
                [toUnit(1), toUnit(1)],
                [toUnit(10000), toUnit(10000)],
                [toUnit(3), toUnit(1)],
                [toUnit(15), toUnit(30)],
                [toUnit(7.7), toUnit(17)],
            ];

            for (let p of pairs) {
                await market.setDebt(p[0].add(p[1]));
                const prices = await market.computePrices(p[0], p[1]);
                const expectedPrices = computePrices(p[0], p[1], totalInitialFee);
                assert.bnClose(prices[0], expectedPrices.long, 1);
                assert.bnClose(prices[1], expectedPrices.short, 1);
                assert.bnClose(prices[0].add(prices[1]), divDecRound(toUnit(1), toUnit(1).sub(totalInitialFee)), 1);
            }
        });

        it('Current prices are correct with positive fee.', async () => {
            const long = await BinaryOption.at(await market.longOption());
            const short = await BinaryOption.at(await market.shortOption());

            let currentPrices = await market.prices()
            let expectedPrices = computePrices(await long.totalBids(), await short.totalBids(), totalInitialFee);

            assert.bnClose(currentPrices[0], expectedPrices.long, 1);
            assert.bnClose(currentPrices[1], expectedPrices.short, 1);
        });
    });

    describe('Phases', () => {
        it('Can proceed through the phases properly.', async () => {
            assert.isFalse(await market.biddingEnded());
            assert.isFalse(await market.matured());
            assert.bnEqual(await market.currentPhase(), toBN(0));

            await fastForward(biddingTime + 1);

            assert.isTrue(await market.biddingEnded());
            assert.isFalse(await market.matured());
            assert.bnEqual(await market.currentPhase(), toBN(1));

            await fastForward(timeToMaturity + 1);

            assert.isTrue(await market.biddingEnded());
            assert.isTrue(await market.matured());
            assert.bnEqual(await market.currentPhase(), toBN(2));
        });
    });

    describe('Bids', () => {
        it('Can place long bids properly.', async () => {
            const initialDebt = await market.debt();
            await market.bidLong(initialLongBid, { from: newBidder });
            const long = await BinaryOption.at(await market.longOption());
            assert.bnEqual(await long.totalBids(), initialLongBid.mul(toBN(2)));
            assert.bnEqual(await long.bidOf(newBidder), initialLongBid);
            let bids = await market.bidsOf(newBidder);
            assert.bnEqual(bids.long, initialLongBid);
            assert.bnEqual(bids.short, toBN(0));
            let totalBids = await market.totalBids();
            assert.bnEqual(totalBids.long, initialLongBid.mul(toBN(2)));
            assert.bnEqual(totalBids.short, initialShortBid);
            assert.bnEqual(await market.debt(), initialDebt.add(initialLongBid));
        });

        it('Can place short bids properly.', async () => {
            const initialDebt = await market.debt();
            await market.bidShort(initialShortBid, { from: newBidder });
            const short = await BinaryOption.at(await market.shortOption());
            assert.bnEqual(await short.totalBids(), initialShortBid.mul(toBN(2)));
            assert.bnEqual(await short.bidOf(newBidder), initialShortBid);
            let bids = await market.bidsOf(newBidder);
            assert.bnEqual(bids.long, toBN(0));
            assert.bnEqual(bids.short, initialShortBid);
            let totalBids = await market.totalBids();
            assert.bnEqual(totalBids.long, initialLongBid);
            assert.bnEqual(totalBids.short, initialShortBid.mul(toBN(2)));
            assert.bnEqual(await market.debt(), initialDebt.add(initialShortBid));
        });

        it('Can place both long and short bids at once.', async () => {
            const initialDebt = await market.debt();
            await market.bidLong(initialLongBid, { from: newBidder });
            await market.bidShort(initialShortBid, { from: newBidder });
            const long = await BinaryOption.at(await market.longOption());
            const short = await BinaryOption.at(await market.shortOption());
            assert.bnEqual(await long.totalBids(), initialLongBid.mul(toBN(2)));
            assert.bnEqual(await long.bidOf(newBidder), initialLongBid);
            assert.bnEqual(await short.totalBids(), initialShortBid.mul(toBN(2)));
            assert.bnEqual(await short.bidOf(newBidder), initialShortBid);
            let bids = await market.bidsOf(newBidder);
            assert.bnEqual(bids.long, initialLongBid);
            assert.bnEqual(bids.short, initialShortBid);
            let totalBids = await market.totalBids();
            assert.bnEqual(totalBids.long, initialLongBid.mul(toBN(2)));
            assert.bnEqual(totalBids.short, initialShortBid.mul(toBN(2)));
            assert.bnEqual(await market.debt(), initialDebt.add(initialShortBid).add(initialLongBid));
        });

        it('Cannot bid past the end of bidding.', async () => {
            await fastForward(biddingTime + 1);
            await assert.revert(market.bidLong(100), "Bidding must be active.");
            await assert.revert(market.bidShort(100), "Bidding must be active.");
        });

        it('Bids properly affect prices.', async () => {
            const long = await BinaryOption.at(await market.longOption());
            const short = await BinaryOption.at(await market.shortOption());

            let currentPrices = await market.prices()
            let expectedPrices = computePrices(await long.totalBids(), await short.totalBids(), totalInitialFee);

            assert.bnClose(currentPrices[0], expectedPrices.long, 1);
            assert.bnClose(currentPrices[1], expectedPrices.short, 1);

            await market.bidShort(initialShortBid);

            currentPrices = await market.prices()
            const halfWithFee = divDecRound(toUnit(1), mulDecRound(toUnit(2), toUnit(1).sub(totalInitialFee)));
            assert.bnClose(currentPrices[0], halfWithFee, 1);
            assert.bnClose(currentPrices[1], halfWithFee, 1);

            await market.bidLong(initialLongBid);

            currentPrices = await market.prices()
            assert.bnClose(currentPrices[0], expectedPrices.long, 1);
            assert.bnClose(currentPrices[1], expectedPrices.short, 1);
        });
    })

    describe('Refunds', () => {
        it('Can refund bids properly with zero fee.', async () => {
            assert.isTrue(false);
        });

        it('Can refund bids properly with positive fee.', async () => {
            assert.isTrue(false);
        });

        it('Can refund bids properly with positive fee.', async () => {
            assert.isTrue(false);
        });

        it('Refunds will fail if too large.', async () => {
            // Larger than total supply
            // Smaller than total supply but larger than balance.
            assert.isTrue(false);
        });

        it('Refunds properly affect prices.', async () => {
            assert.isTrue(false);
        });

        it('Cannot refund past the end of bidding.', async () => {
            assert.isTrue(false);
        });
    });
});