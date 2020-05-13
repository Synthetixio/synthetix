'use strict';

const { artifacts, contract, web3 } = require('@nomiclabs/buidler');
const { toBN } = web3.utils;

const { assert, addSnapshotBeforeRestoreAfterEach } = require('./common');
const { currentTime, fastForward, toUnit, fromUnit } = require('../utils')();

const TestableBinaryOptionMarket = artifacts.require('TestableBinaryOptionMarket');
const MockBinaryOptionMarketFactory = artifacts.require('MockBinaryOptionMarketFactory');
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

    let mockFactory;
    let market;
    let mockedMarket;
    let creationTime;

    const deployMarket = async ({endOfBidding, maturity,
        targetPrice, longBid, shortBid, poolFee, creatorFee, refundFee, creator}) => {
        return await TestableBinaryOptionMarket.new(endOfBidding, maturity, targetPrice, longBid, shortBid, poolFee, creatorFee, refundFee, {from: creator});
    };

    const setupNewMarket = async () => {
        mockFactory = await MockBinaryOptionMarketFactory.new();
        creationTime = await currentTime();

        const tx = await mockFactory.createBinaryOptionMarket(
            creationTime + biddingTime,
            creationTime + timeToMaturity,
            initialTargetPrice, initialLongBid, initialShortBid,
            initialPoolFee, initialCreatorFee, initialRefundFee);
        mockedMarket = await TestableBinaryOptionMarket.at(tx.logs[0].args.newAddress);

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
        TestableBinaryOptionMarket.link(math);
        MockBinaryOptionMarketFactory.link(math);
        await setupNewMarket();
    });

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
    const computePrices = (longs, shorts, debt, fee) => {
        const totalOptions = mulDecRound(debt, toUnit(1).sub(fee));
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
            assert.bnEqual(await market.factory(), initialBidder);
        });

        it('BinaryOption instances are set up properly.', async () => {
            const long = await BinaryOption.at(await market.longOption());
            const short = await BinaryOption.at(await market.shortOption());
            const prices = computePrices(initialLongBid, initialShortBid, initialLongBid.add(initialShortBid), totalInitialFee);

            assert.bnEqual(await long.totalBids(), initialLongBid);
            assert.bnEqual(await short.totalBids(), initialShortBid);
            assert.bnEqual(await long.bidOf(initialBidder), initialLongBid);
            assert.bnEqual(await short.bidOf(initialBidder), initialShortBid);
            assert.equal(await long.endOfBidding(), creationTime + biddingTime);
            assert.equal(await short.endOfBidding(), creationTime + biddingTime);
            assert.bnEqual(await market.longPrice(), prices.long);
            assert.bnEqual(await market.shortPrice(), prices.short);
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
            "Option prices must be nonzero.");

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
            "Option prices must be nonzero.");
        });
    });

    describe('Prices', () => {
        it('updatePrices is correct with zero fee.', async () => {
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
                { supply: [toUnit(0.1), toUnit(0.9)], prices: [toUnit(0.1), toUnit(0.9)] },
                { supply: [toUnit(0.9), toUnit(0.1)], prices: [toUnit(0.9), toUnit(0.1)] },
                { supply: [toUnit(1), toUnit(1)], prices: [toUnit(0.5), toUnit(0.5)] },
                { supply: [toUnit(10000), toUnit(10000)], prices: [toUnit(0.5), toUnit(0.5)] },
                { supply: [toUnit(3), toUnit(1)], prices: [toUnit(0.75), toUnit(0.25)] },
                { supply: [toUnit(15), toUnit(30)], prices: [divDecRound(toUnit(1), toUnit(3)), divDecRound(toUnit(2), toUnit(3))] },
                { supply: [toUnit(7.7), toUnit(17)], prices: (o => [o.long, o.short])(computePrices(toUnit(7.7), toUnit(17), toUnit(7.7+17), toBN(0))) },
            ];

            for (let v of supplies) {
                await localMarket.updatePrices(v.supply[0], v.supply[1], v.supply[0].add(v.supply[1]));
                const prices = await localMarket.prices();
                assert.bnEqual(prices[0], v.prices[0]);
                assert.bnEqual(prices[1], v.prices[1]);
                assert.bnEqual(await localMarket.longPrice(), v.prices[0]);
                assert.bnEqual(await localMarket.shortPrice(), v.prices[1]);
                assert.bnEqual(prices[0].add(prices[1]), toUnit(1));
            }
        });

        it('updatePrices is correct with positive fee.', async () => {
            const pairs = [
                [toUnit(0.1), toUnit(0.9)],
                [toUnit(0.9), toUnit(0.1)],
                [toUnit(1), toUnit(1)],
                [toUnit(10000), toUnit(10000)],
                [toUnit(3), toUnit(1)],
                [toUnit(15), toUnit(30)],
                [toUnit(7.7), toUnit(17)],
            ];

            for (let p of pairs) {
                await market.updatePrices(p[0], p[1], p[0].add(p[1]));
                const prices = await market.prices();
                const expectedPrices = computePrices(p[0], p[1], p[0].add(p[1]), totalInitialFee);
                assert.bnClose(prices[0], expectedPrices.long, 1);
                assert.bnClose(prices[1], expectedPrices.short, 1);
                assert.bnClose(await market.longPrice(), expectedPrices.long, 1);
                assert.bnClose(await market.shortPrice(), expectedPrices.short, 1);
                assert.bnClose(prices[0].add(prices[1]), divDecRound(toUnit(1), toUnit(1).sub(totalInitialFee)), 1);
            }
        });

        it('updatePrices emits the correct event.', async () => {
            const tx = await market.updatePrices(toUnit(1), toUnit(1), toUnit(2));
            const log = tx.logs[0];
            const expectedPrices = computePrices(toUnit(1), toUnit(1), toUnit(2), totalInitialFee);

            assert.equal(log.event, "PricesUpdated");
            assert.bnEqual(log.args.longPrice, expectedPrices.long);
            assert.bnEqual(log.args.shortPrice, expectedPrices.short);
        });

        it('Update prices is correct with higher total debt than sum of bids.', async () => {
            await market.updatePrices(toUnit(1), toUnit(1), toUnit(4));
            const price = divDecRound(toUnit(0.25), toUnit(1).sub(totalInitialFee));
            assert.bnClose(await market.longPrice(), price, 1);
            assert.bnClose(await market.shortPrice(), price, 1);
        });

        it('Current prices are correct with positive fee.', async () => {
            const long = await BinaryOption.at(await market.longOption());
            const short = await BinaryOption.at(await market.shortOption());

            let currentPrices = await market.prices();
            let expectedPrices = computePrices(await long.totalBids(), await short.totalBids(), await market.debt(), totalInitialFee);

            assert.bnClose(currentPrices[0], expectedPrices.long, 1);
            assert.bnClose(currentPrices[1], expectedPrices.short, 1);
        });

        it('senderPrice cannot be invoked except by options.', async () => {
            await assert.revert(market.senderPrice(), "Message sender is not an option of this market.");
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
            const initialDebt = await mockedMarket.debt();

            await mockedMarket.bidLong(initialLongBid, { from: newBidder });

            const long = await BinaryOption.at(await mockedMarket.longOption());
            assert.bnEqual(await long.totalBids(), initialLongBid.mul(toBN(2)));
            assert.bnEqual(await long.bidOf(newBidder), initialLongBid);

            let bids = await mockedMarket.bidsOf(newBidder);
            assert.bnEqual(bids.long, initialLongBid);
            assert.bnEqual(bids.short, toBN(0));

            let totalBids = await mockedMarket.totalBids();
            assert.bnEqual(totalBids.long, initialLongBid.mul(toBN(2)));
            assert.bnEqual(totalBids.short, initialShortBid);
            assert.bnEqual(await mockedMarket.debt(), initialDebt.add(initialLongBid));
        });

        it('Can place short bids properly.', async () => {
            const initialDebt = await mockedMarket.debt();

            await mockedMarket.bidShort(initialShortBid, { from: newBidder });

            const short = await BinaryOption.at(await mockedMarket.shortOption());
            assert.bnEqual(await short.totalBids(), initialShortBid.mul(toBN(2)));
            assert.bnEqual(await short.bidOf(newBidder), initialShortBid);

            let bids = await mockedMarket.bidsOf(newBidder);
            assert.bnEqual(bids.long, toBN(0));
            assert.bnEqual(bids.short, initialShortBid);

            let totalBids = await mockedMarket.totalBids();
            assert.bnEqual(totalBids.long, initialLongBid);
            assert.bnEqual(totalBids.short, initialShortBid.mul(toBN(2)));
            assert.bnEqual(await mockedMarket.debt(), initialDebt.add(initialShortBid));
        });

        it('Can place both long and short bids at once.', async () => {
            const initialDebt = await mockedMarket.debt();

            await mockedMarket.bidLong(initialLongBid, { from: newBidder });
            await mockedMarket.bidShort(initialShortBid, { from: newBidder });

            const long = await BinaryOption.at(await mockedMarket.longOption());
            const short = await BinaryOption.at(await mockedMarket.shortOption());
            assert.bnEqual(await long.totalBids(), initialLongBid.mul(toBN(2)));
            assert.bnEqual(await long.bidOf(newBidder), initialLongBid);
            assert.bnEqual(await short.totalBids(), initialShortBid.mul(toBN(2)));
            assert.bnEqual(await short.bidOf(newBidder), initialShortBid);

            let bids = await mockedMarket.bidsOf(newBidder);
            assert.bnEqual(bids.long, initialLongBid);
            assert.bnEqual(bids.short, initialShortBid);

            let totalBids = await mockedMarket.totalBids();
            assert.bnEqual(totalBids.long, initialLongBid.mul(toBN(2)));
            assert.bnEqual(totalBids.short, initialShortBid.mul(toBN(2)));
            assert.bnEqual(await mockedMarket.debt(), initialDebt.add(initialShortBid).add(initialLongBid));
        });

        it('Cannot bid past the end of bidding.', async () => {
            await fastForward(biddingTime + 1);
            await assert.revert(mockedMarket.bidLong(100), "Bidding must be active.");
            await assert.revert(mockedMarket.bidShort(100), "Bidding must be active.");
        });

        it('Bids properly affect prices.', async () => {
            const long = await BinaryOption.at(await mockedMarket.longOption());
            const short = await BinaryOption.at(await mockedMarket.shortOption());

            let currentPrices = await mockedMarket.prices()
            let expectedPrices = computePrices(await long.totalBids(), await short.totalBids(), await mockedMarket.debt(), totalInitialFee);

            assert.bnClose(currentPrices[0], expectedPrices.long, 1);
            assert.bnClose(currentPrices[1], expectedPrices.short, 1);

            await mockedMarket.bidShort(initialShortBid);

            currentPrices = await mockedMarket.prices()
            const halfWithFee = divDecRound(toUnit(1), mulDecRound(toUnit(2), toUnit(1).sub(totalInitialFee)));
            assert.bnClose(currentPrices[0], halfWithFee, 1);
            assert.bnClose(currentPrices[1], halfWithFee, 1);

            await mockedMarket.bidLong(initialLongBid);

            currentPrices = await mockedMarket.prices()
            assert.bnClose(currentPrices[0], expectedPrices.long, 1);
            assert.bnClose(currentPrices[1], expectedPrices.short, 1);
        });

        it('Bids properly emit events.', async () => {
            let tx = await mockedMarket.bidLong(initialLongBid, { from: newBidder });
            let currentPrices = await mockedMarket.prices();

            assert.equal(tx.logs[0].event, "LongBid");
            assert.equal(tx.logs[0].args.bidder, newBidder);
            assert.bnEqual(tx.logs[0].args.bid, initialLongBid);k

            assert.equal(tx.logs[1].event, "PricesUpdated");
            assert.bnEqual(tx.logs[1].args.longPrice, currentPrices[0]);
            assert.bnEqual(tx.logs[1].args.shortPrice, currentPrices[1]);

            tx = await mockedMarket.bidShort(initialShortBid, { from: newBidder });
            currentPrices = await mockedMarket.prices();

            assert.equal(tx.logs[0].event, "ShortBid");
            assert.equal(tx.logs[0].args.bidder, newBidder);
            assert.bnEqual(tx.logs[0].args.bid, initialShortBid);

            assert.equal(tx.logs[1].event, "PricesUpdated");
            assert.bnEqual(tx.logs[1].args.longPrice, currentPrices[0]);
            assert.bnEqual(tx.logs[1].args.shortPrice, currentPrices[1]);
        });
    })

    describe('Refunds', () => {
        it('Can refund bids properly with zero fee.', async () => {
            const localMockFactory = await MockBinaryOptionMarketFactory.new();

            let localCreationTime = await currentTime();
            const tx = await localMockFactory.createBinaryOptionMarket(
                localCreationTime + 100,
                localCreationTime + 200,
                initialTargetPrice, initialLongBid, initialShortBid,
                initialPoolFee, initialCreatorFee, toUnit(0));
            const localMarket = await TestableBinaryOptionMarket.at(tx.logs[0].args.newAddress);

            const initialDebt = await localMarket.debt();
            await localMarket.bidLong(initialLongBid, { from: newBidder });
            await localMarket.bidShort(initialShortBid, { from: newBidder });

            const long = await BinaryOption.at(await localMarket.longOption());
            const short = await BinaryOption.at(await localMarket.shortOption());

            assert.bnEqual(await long.totalBids(), initialLongBid.mul(toBN(2)));
            assert.bnEqual(await long.bidOf(newBidder), initialLongBid);
            assert.bnEqual(await short.totalBids(), initialShortBid.mul(toBN(2)));
            assert.bnEqual(await short.bidOf(newBidder), initialShortBid);
            assert.bnEqual(await localMarket.debt(), initialDebt.mul(toBN(2)));

            await localMarket.refundLong(initialLongBid, { from: newBidder });
            await localMarket.refundShort(initialShortBid, { from: newBidder });

            assert.bnEqual(await long.totalBids(), initialLongBid);
            assert.bnEqual(await long.bidOf(newBidder), toUnit(0));
            assert.bnEqual(await short.totalBids(), initialShortBid);
            assert.bnEqual(await short.bidOf(newBidder), toUnit(0));
            assert.bnEqual(await localMarket.debt(), initialDebt);
        });

        it('Can refund bids properly with positive fee.', async () => {
            const initialDebt = await mockedMarket.debt();
            await mockedMarket.bidLong(initialLongBid, { from: newBidder });
            await mockedMarket.bidShort(initialShortBid, { from: newBidder });

            const long = await BinaryOption.at(await mockedMarket.longOption());
            const short = await BinaryOption.at(await mockedMarket.shortOption());

            assert.bnEqual(await long.totalBids(), initialLongBid.mul(toBN(2)));
            assert.bnEqual(await long.bidOf(newBidder), initialLongBid);
            assert.bnEqual(await short.totalBids(), initialShortBid.mul(toBN(2)));
            assert.bnEqual(await short.bidOf(newBidder), initialShortBid);
            assert.bnEqual(await mockedMarket.debt(), initialDebt.mul(toBN(2)));

            await mockedMarket.refundLong(initialLongBid, { from: newBidder });
            await mockedMarket.refundShort(initialShortBid, { from: newBidder });

            assert.bnEqual(await long.totalBids(), initialLongBid);
            assert.bnEqual(await long.bidOf(newBidder), toUnit(0));
            assert.bnEqual(await short.totalBids(), initialShortBid);
            assert.bnEqual(await short.bidOf(newBidder), toUnit(0));

            const fee = mulDecRound(initialLongBid.add(initialShortBid), initialRefundFee);
            // The fee is retained in the total debt.
            assert.bnEqual(await mockedMarket.debt(), initialDebt.add(fee));
        });

        it('Refunds will fail if too large.', async () => {
            // Refund with no bids.
            await assert.revert(mockedMarket.refundLong(toUnit(1), { from: newBidder }), "SafeMath: subtraction overflow");
            await assert.revert(mockedMarket.refundShort(toUnit(1), { from: newBidder }), "SafeMath: subtraction overflow");

            await mockedMarket.bidLong(initialLongBid, { from: newBidder });
            await mockedMarket.bidShort(initialShortBid, { from: newBidder });

            // Refund larger than total supply.
            const totalSupply = await mockedMarket.debt();
            await assert.revert(mockedMarket.refundLong(totalSupply, { from: newBidder }), "SafeMath: subtraction overflow");
            await assert.revert(mockedMarket.refundShort(totalSupply, { from: newBidder }), "SafeMath: subtraction overflow");

            // Smaller than total supply but larger than balance.
            await assert.revert(mockedMarket.refundLong(initialLongBid.add(toBN(1)), { from: newBidder }), "SafeMath: subtraction overflow");
            await assert.revert(mockedMarket.refundShort(initialShortBid.add(toBN(1)), { from: newBidder }), "SafeMath: subtraction overflow");
        });

        it('Refunds properly affect prices.', async () => {
            await mockedMarket.bidShort(initialShortBid, { from: newBidder });
            await mockedMarket.bidLong(initialLongBid, { from: newBidder });
            await mockedMarket.refundShort(initialShortBid, { from: newBidder });
            await mockedMarket.refundLong(initialLongBid, { from: newBidder });

            const debt = mulDecRound(initialLongBid.add(initialShortBid), toUnit(1).add(initialRefundFee));
            let expectedPrices = computePrices(initialLongBid, initialShortBid, debt, totalInitialFee);
            const currentPrices = await mockedMarket.prices()

            assert.bnClose(currentPrices[0], expectedPrices.long, 1);
            assert.bnClose(currentPrices[1], expectedPrices.short, 1);
        });

        it('Cannot refund past the end of bidding.', async () => {
            await mockedMarket.bidLong(initialLongBid, { from: newBidder });
            await mockedMarket.bidShort(initialShortBid, { from: newBidder });

            await fastForward(biddingTime + 1);

            await assert.revert(mockedMarket.refundLong(initialLongBid, { from: newBidder }), "Bidding must be active.");
            await assert.revert(mockedMarket.refundShort(initialShortBid, { from: newBidder }), "Bidding must be active.");
        });

        it('Refunds properly emit events.', async () => {
            await mockedMarket.bidLong(initialLongBid, { from: newBidder });
            await mockedMarket.bidShort(initialShortBid, { from: newBidder });

            const longFee = mulDecRound(initialLongBid, initialRefundFee);
            const shortFee = mulDecRound(initialShortBid, initialRefundFee);

            let tx = await mockedMarket.refundLong(initialLongBid, { from: newBidder });
            let currentPrices = await mockedMarket.prices();

            assert.equal(tx.logs[0].event, "LongRefund");
            assert.equal(tx.logs[0].args.refunder, newBidder);
            assert.bnEqual(tx.logs[0].args.refund, initialLongBid.sub(longFee));
            assert.bnEqual(tx.logs[0].args.fee, longFee);

            assert.equal(tx.logs[1].event, "PricesUpdated");
            assert.bnEqual(tx.logs[1].args.longPrice, currentPrices[0]);
            assert.bnEqual(tx.logs[1].args.shortPrice, currentPrices[1]);

            tx = await mockedMarket.refundShort(initialShortBid, { from: newBidder });
            currentPrices = await mockedMarket.prices();

            assert.equal(tx.logs[0].event, "ShortRefund");
            assert.equal(tx.logs[0].args.refunder, newBidder);
            assert.bnEqual(tx.logs[0].args.refund, initialShortBid.sub(shortFee));
            assert.bnEqual(tx.logs[0].args.fee, shortFee);

            assert.equal(tx.logs[1].event, "PricesUpdated");
            assert.bnEqual(tx.logs[1].args.longPrice, currentPrices[0]);
            assert.bnEqual(tx.logs[1].args.shortPrice, currentPrices[1]);
        });
    });
});