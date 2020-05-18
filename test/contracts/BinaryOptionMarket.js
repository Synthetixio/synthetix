'use strict';

const { artifacts, contract, web3 } = require('@nomiclabs/buidler');
const { toBN } = web3.utils;

const { assert, addSnapshotBeforeRestoreAfterEach } = require('./common');
const { currentTime, fastForward, toUnit } = require('../utils')();
const { toBytes32 } = require('../..');
const { setupAllContracts, setupContract } = require('./setup');

const TestableBinaryOptionMarket = artifacts.require('TestableBinaryOptionMarket');
const BinaryOptionMarket = artifacts.require('BinaryOptionMarket');
const BinaryOption = artifacts.require('BinaryOption');
const SafeDecimalMath = artifacts.require('SafeDecimalMath');

contract('BinaryOptionMarket', accounts => {
    const [initialBidder, newBidder, pauper] = accounts;

    const sUSDQty = toUnit(10000);

    const oneDay = 60 * 60 * 24
    const maturityWindow = 15 * 60;
    const biddingTime = oneDay;
    const timeToMaturity = oneDay * 7;
    const initialLongBid = toUnit(10);
    const initialShortBid = toUnit(5);
    const initialTargetPrice = toUnit(100);
    const initialPoolFee = toUnit(0.008);
    const initialCreatorFee = toUnit(0.002);
    const initialRefundFee = toUnit(0.02)
    const totalInitialFee = initialPoolFee.add(initialCreatorFee);
    const sAUDKey = toBytes32("sAUD");

    let creationTime;

    let factory,
        market,
        exchangeRates,
        addressResolver,
        sUSDSynth;

    const Result = {
        Unresolved: toBN(0),
        Long: toBN(1),
        Short: toBN(2),
    };

    const deployMarket = async ({resolver, endOfBidding, maturity,
        oracleKey, targetPrice, longBid, shortBid, poolFee, creatorFee, refundFee, creator}) => {
            return setupContract({
                accounts,
                contract: 'TestableBinaryOptionMarket',
                args: [
                    resolver,
                    endOfBidding,
                    maturity,
                    oracleKey,
                    targetPrice,
                    creator,
                    longBid, shortBid,
                    poolFee, creatorFee, refundFee,
                ]
            });
    };

    const setupNewMarket = async () => {
        ({
            BinaryOptionMarketFactory: factory,
            AddressResolver: addressResolver,
            ExchangeRates: exchangeRates,
            SynthsUSD: sUSDSynth,
        } = await setupAllContracts({
            accounts,
            synths: ['sUSD'],
            contracts: [
                'BinaryOptionMarketFactory',
                'AddressResolver',
                'ExchangeRates',
            ],
        }));

        await sUSDSynth.issue(initialBidder, sUSDQty);
        await sUSDSynth.approve(factory.address, sUSDQty, { from: initialBidder });
        await sUSDSynth.issue(newBidder, sUSDQty);
        await sUSDSynth.approve(factory.address, sUSDQty, { from: newBidder });

        creationTime = await currentTime();
        const tx = await factory.createMarket(
            creationTime + biddingTime,
            creationTime + timeToMaturity,
            sAUDKey,
            initialTargetPrice,
            initialLongBid, initialShortBid,
            { from: initialBidder }
        );

        market = await BinaryOptionMarket.at(tx.logs[1].args.market);

        await sUSDSynth.approve(market.address, sUSDQty, { from: initialBidder });
        await sUSDSynth.approve(market.address, sUSDQty, { from: newBidder });
    };

    before(async () => {
        TestableBinaryOptionMarket.link(await SafeDecimalMath.new());
        await setupNewMarket();
    });

    addSnapshotBeforeRestoreAfterEach();

    const mulDecRound = (x, y) => {
        let result = x.mul(y).div(toUnit(0.1));
        if (result.mod(toBN(10)).gte(toBN(5))) {
            result = result.add(toBN(10));
        }
        return result.div(toBN(10));
    };

    const divDecRound = (x, y) => {
        let result = x.mul(toUnit(10)).div(y);
        if (result.mod(toBN(10)).gte(toBN(5))) {
            result = result.add(toBN(10));
        }
        return result.div(toBN(10));
    };

    // All inputs should be BNs.
    const computePrices = (longs, shorts, debt, fee) => {
        const totalOptions = mulDecRound(debt, toUnit(1).sub(fee));
        return { long: divDecRound(longs, totalOptions), short: divDecRound(shorts, totalOptions) };
    };

    describe('Basic parameters', () => {
        it('static parameters are set properly', async () => {
            assert.bnEqual(await market.endOfBidding(), toBN(creationTime + biddingTime));
            assert.bnEqual(await market.maturity(), toBN(creationTime + timeToMaturity));
            assert.bnEqual(await market.targetOraclePrice(), initialTargetPrice);
            assert.bnEqual(await market.poolFee(), initialPoolFee);
            assert.bnEqual(await market.creatorFee(), initialCreatorFee);
            assert.bnEqual(await market.debt(), initialLongBid.add(initialShortBid));
            assert.equal(await market.factory(), factory.address);
            assert.equal(await market.creator(), initialBidder);
            assert.equal(await market.exchangeRates(), exchangeRates.address);
        });

        it('BinaryOption instances are set up properly.', async () => {
            const long = await BinaryOption.at(await market.longOption());
            const short = await BinaryOption.at(await market.shortOption());
            const prices = computePrices(initialLongBid, initialShortBid, initialLongBid.add(initialShortBid), totalInitialFee);

            assert.bnEqual(await long.totalBids(), initialLongBid);
            assert.bnEqual(await short.totalBids(), initialShortBid);
            assert.bnEqual(await long.bidOf(initialBidder), initialLongBid);
            assert.bnEqual(await short.bidOf(initialBidder), initialShortBid);
            assert.bnEqual(await market.longPrice(), prices.long);
            assert.bnEqual(await market.shortPrice(), prices.short);
        });

        it('Bad constructor parameters revert.', async () => {
            // end of bidding in the past
            let localCreationTime = await currentTime();
            await assert.revert(deployMarket({
                resolver: addressResolver.address,
                endOfBidding: localCreationTime - 1,
                maturity: localCreationTime + 200,
                oracleKey: sAUDKey,
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
                resolver: addressResolver.address,
                endOfBidding: localCreationTime + 100,
                maturity: localCreationTime + 99,
                oracleKey: sAUDKey,
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
                resolver: addressResolver.address,
                endOfBidding: localCreationTime + 100,
                maturity: localCreationTime + 200,
                oracleKey: sAUDKey,
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
                resolver: addressResolver.address,
                endOfBidding: localCreationTime + 100,
                maturity: localCreationTime + 200,
                oracleKey: sAUDKey,
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
                resolver: addressResolver.address,
                endOfBidding: localCreationTime + 100,
                maturity: localCreationTime + 200,
                oracleKey: sAUDKey,
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
                resolver: addressResolver.address,
                endOfBidding: localCreationTime + 100,
                maturity: localCreationTime + 200,
                oracleKey: sAUDKey,
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
                resolver: addressResolver.address,
                endOfBidding: localCreationTime + 100,
                maturity: localCreationTime + 200,
                oracleKey: sAUDKey,
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
                resolver: addressResolver.address,
                endOfBidding: localCreationTime + 100,
                maturity: localCreationTime + 200,
                oracleKey: sAUDKey,
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
            let localCreationTime = await currentTime();
            const localMarket = await deployMarket({
                resolver: addressResolver.address,
                endOfBidding: localCreationTime + 100,
                maturity: localCreationTime + 200,
                oracleKey: sAUDKey,
                targetPrice: initialTargetPrice,
                longBid: initialLongBid,
                shortBid: initialShortBid,
                poolFee: initialPoolFee,
                creatorFee: initialCreatorFee,
                refundFee: initialRefundFee,
                creator: initialBidder,
            });

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
                await localMarket.updatePrices(p[0], p[1], p[0].add(p[1]));
                const prices = await localMarket.prices();
                const expectedPrices = computePrices(p[0], p[1], p[0].add(p[1]), totalInitialFee);
                assert.bnClose(prices[0], expectedPrices.long, 1);
                assert.bnClose(prices[1], expectedPrices.short, 1);
                assert.bnClose(await localMarket.longPrice(), expectedPrices.long, 1);
                assert.bnClose(await localMarket.shortPrice(), expectedPrices.short, 1);
                assert.bnClose(prices[0].add(prices[1]), divDecRound(toUnit(1), toUnit(1).sub(totalInitialFee)), 1);
            }
        });

        it('updatePrices emits the correct event.', async () => {
            let localCreationTime = await currentTime();
            const localMarket = await deployMarket({
                resolver: addressResolver.address,
                endOfBidding: localCreationTime + 100,
                maturity: localCreationTime + 200,
                oracleKey: sAUDKey,
                targetPrice: initialTargetPrice,
                longBid: initialLongBid,
                shortBid: initialShortBid,
                poolFee: initialPoolFee,
                creatorFee: initialCreatorFee,
                refundFee: initialRefundFee,
                creator: initialBidder,
            });

            const tx = await localMarket.updatePrices(toUnit(1), toUnit(1), toUnit(2));
            const log = tx.logs[0];
            const expectedPrices = computePrices(toUnit(1), toUnit(1), toUnit(2), totalInitialFee);

            assert.equal(log.event, "PricesUpdated");
            assert.bnEqual(log.args.longPrice, expectedPrices.long);
            assert.bnEqual(log.args.shortPrice, expectedPrices.short);
        });

        it('Update prices is correct with higher total debt than sum of bids.', async () => {
            let localCreationTime = await currentTime();
            const localMarket = await deployMarket({
                resolver: addressResolver.address,
                endOfBidding: localCreationTime + 100,
                maturity: localCreationTime + 200,
                oracleKey: sAUDKey,
                targetPrice: initialTargetPrice,
                longBid: initialLongBid,
                shortBid: initialShortBid,
                poolFee: initialPoolFee,
                creatorFee: initialCreatorFee,
                refundFee: initialRefundFee,
                creator: initialBidder,
            });

            await localMarket.updatePrices(toUnit(1), toUnit(1), toUnit(4));
            const price = divDecRound(toUnit(0.25), toUnit(1).sub(totalInitialFee));
            assert.bnClose(await localMarket.longPrice(), price, 1);
            assert.bnClose(await localMarket.shortPrice(), price, 1);
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

    describe('Maturity condition resolution', async () => {
        it('Current oracle price and timestamp are correct.', async () => {
            const now = await currentTime();
            const price = toUnit(0.7);
            await exchangeRates.updateRates([sAUDKey], [price], now, { from: await exchangeRates.oracle()});
            const result = await market.currentOraclePriceAndTimestamp();

            assert.bnEqual(result.price, price);
            assert.bnEqual(result.updatedAt, now);
        });

        it('Result is initially unresolved.', async () => {
            assert.isFalse(await market.resolved());
            assert.bnEqual(await market.result(), Result.Unresolved);
        });

        it('Result resolves correctly long.', async () => {
            await fastForward(timeToMaturity + 1);
            const now = await currentTime();
            const price = initialTargetPrice.add(toBN(1));
            await exchangeRates.updateRates([sAUDKey], [price], now, { from: await exchangeRates.oracle()});
            const tx = await market.resolve();
            assert.bnEqual(await market.result(), Result.Long);
            assert.isTrue(await market.resolved());
            assert.bnEqual(await market.finalOraclePrice(), price);

            const log = tx.logs[0];
            assert.equal(log.event, "MarketResolved");
            assert.bnEqual(log.args.result, Result.Long);
            assert.bnEqual(log.args.oraclePrice, price);
            assert.bnEqual(log.args.oracleTimestamp, now);
        });

        it('Result resolves correctly short.', async () => {
            await fastForward(timeToMaturity + 1);
            const now = await currentTime();
            const price = initialTargetPrice.sub(toBN(1));
            await exchangeRates.updateRates([sAUDKey], [price], now, { from: await exchangeRates.oracle()});
            const tx = await market.resolve();
            assert.isTrue(await market.resolved());
            assert.bnEqual(await market.result(), Result.Short);
            assert.bnEqual(await market.finalOraclePrice(), price);

            const log = tx.logs[0];
            assert.equal(log.event, "MarketResolved");
            assert.bnEqual(log.args.result, Result.Short);
            assert.bnEqual(log.args.oraclePrice, price);
            assert.bnEqual(log.args.oracleTimestamp, now);
        });

        it('A result equal to the target price resolves long.', async () => {
            await fastForward(timeToMaturity + 1);
            const now = await currentTime();
            const price = initialTargetPrice;
            await exchangeRates.updateRates([sAUDKey], [price], now, { from: await exchangeRates.oracle()});
            await market.resolve();
            assert.isTrue(await market.resolved());
            assert.bnEqual(await market.result(), Result.Long);
            assert.bnEqual(await market.finalOraclePrice(), price);
        });

        it('Resolution cannot occur before maturity.', async () => {
            assert.isFalse(await market.canResolve());
            await assert.revert(market.resolve(), "The maturity date has not been reached.");
        });

        it('Resolution can only occur once.', async () => {
            await fastForward(timeToMaturity + 1);
            const now = await currentTime();
            const price = initialTargetPrice;
            await exchangeRates.updateRates([sAUDKey], [price], now, { from: await exchangeRates.oracle()});
            assert.isTrue(await market.canResolve());
            await market.resolve();
            assert.isFalse(await market.canResolve());
            await assert.revert(market.resolve(), 'The market has already resolved.');
        });

        it('Resolution cannot occur if the price was last updated before the maturity window.', async () => {
            await fastForward(timeToMaturity + 1);
            const now = await currentTime();
            const price = initialTargetPrice;
            await exchangeRates.updateRates([sAUDKey], [price], now - (maturityWindow + 60), { from: await exchangeRates.oracle()});
            assert.isFalse(await market.canResolve());
            await assert.revert(market.resolve(), "The price was last updated before the maturity window.")
        });

        it('Resolution can occur if the price was updated within the maturity window but before maturity.', async () => {
            await fastForward(timeToMaturity + 1);
            const now = await currentTime();
            const price = initialTargetPrice;
            await exchangeRates.updateRates([sAUDKey], [price], now - (maturityWindow - 60), { from: await exchangeRates.oracle()});
            assert.isTrue(await market.canResolve());
            market.resolve();
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
            let expectedPrices = computePrices(await long.totalBids(), await short.totalBids(), await market.debt(), totalInitialFee);

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

        it('Bids properly emit events.', async () => {
            let tx = await market.bidLong(initialLongBid, { from: newBidder });
            let currentPrices = await market.prices();

            assert.equal(tx.logs[0].event, "LongBid");
            assert.equal(tx.logs[0].args.bidder, newBidder);
            assert.bnEqual(tx.logs[0].args.bid, initialLongBid);

            assert.equal(tx.logs[1].event, "PricesUpdated");
            assert.bnEqual(tx.logs[1].args.longPrice, currentPrices[0]);
            assert.bnEqual(tx.logs[1].args.shortPrice, currentPrices[1]);

            tx = await market.bidShort(initialShortBid, { from: newBidder });
            currentPrices = await market.prices();

            assert.equal(tx.logs[0].event, "ShortBid");
            assert.equal(tx.logs[0].args.bidder, newBidder);
            assert.bnEqual(tx.logs[0].args.bid, initialShortBid);

            assert.equal(tx.logs[1].event, "PricesUpdated");
            assert.bnEqual(tx.logs[1].args.longPrice, currentPrices[0]);
            assert.bnEqual(tx.logs[1].args.shortPrice, currentPrices[1]);
        });

        it('Bids withdraw the proper amount of sUSD', async () => {
            await market.bidLong(initialLongBid, { from: newBidder });
            await market.bidShort(initialShortBid, { from: newBidder });
            assert.bnEqual(await sUSDSynth.balanceOf(newBidder), sUSDQty.sub(initialLongBid.add(initialShortBid)));
        });

        it('Bids fail on insufficient sUSD balance.', async () => {
            await assert.revert(market.bidLong(initialLongBid, { from: pauper }), "SafeMath: subtraction overflow");
            await assert.revert(market.bidShort(initialShortBid, { from: pauper }), "SafeMath: subtraction overflow");
        });

        it('Bids fail on insufficient sUSD allowance.', async () => {
            await sUSDSynth.approve(market.address, toBN(0), { from: newBidder });
            await assert.revert(market.bidLong(initialLongBid, { from: newBidder }), "SafeMath: subtraction overflow");
            await assert.revert(market.bidShort(initialShortBid, { from: newBidder }), "SafeMath: subtraction overflow");
        });
    })

    describe('Refunds', () => {
        it('Can refund bids properly with zero fee.', async () => {
            const localFactory = await setupContract({
                accounts,
                contract: 'BinaryOptionMarketFactory',
                args: [initialBidder, addressResolver.address, toBN(0), toBN(0), toBN(0)],
            });
            await localFactory.setResolverAndSyncCache(addressResolver.address);
            await sUSDSynth.approve(localFactory.address, sUSDQty, { from: initialBidder });

            let localCreationTime = await currentTime();
            const tx = await localFactory.createMarket(
                localCreationTime + 100,
                localCreationTime + 200,
                sAUDKey,
                initialTargetPrice, initialLongBid, initialShortBid, { from: initialBidder });
            const localMarket = await TestableBinaryOptionMarket.at(tx.logs[1].args.market);
            await sUSDSynth.approve(localMarket.address, sUSDQty, { from: newBidder });

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
            const initialDebt = await market.debt();
            await market.bidLong(initialLongBid, { from: newBidder });
            await market.bidShort(initialShortBid, { from: newBidder });

            const long = await BinaryOption.at(await market.longOption());
            const short = await BinaryOption.at(await market.shortOption());

            assert.bnEqual(await long.totalBids(), initialLongBid.mul(toBN(2)));
            assert.bnEqual(await long.bidOf(newBidder), initialLongBid);
            assert.bnEqual(await short.totalBids(), initialShortBid.mul(toBN(2)));
            assert.bnEqual(await short.bidOf(newBidder), initialShortBid);
            assert.bnEqual(await market.debt(), initialDebt.mul(toBN(2)));

            await market.refundLong(initialLongBid, { from: newBidder });
            await market.refundShort(initialShortBid, { from: newBidder });

            assert.bnEqual(await long.totalBids(), initialLongBid);
            assert.bnEqual(await long.bidOf(newBidder), toUnit(0));
            assert.bnEqual(await short.totalBids(), initialShortBid);
            assert.bnEqual(await short.bidOf(newBidder), toUnit(0));

            const fee = mulDecRound(initialLongBid.add(initialShortBid), initialRefundFee);
            // The fee is retained in the total debt.
            assert.bnEqual(await market.debt(), initialDebt.add(fee));
        });

        it('Refunds will fail if too large.', async () => {
            // Refund with no bids.
            await assert.revert(market.refundLong(toUnit(1), { from: newBidder }), "SafeMath: subtraction overflow");
            await assert.revert(market.refundShort(toUnit(1), { from: newBidder }), "SafeMath: subtraction overflow");

            await market.bidLong(initialLongBid, { from: newBidder });
            await market.bidShort(initialShortBid, { from: newBidder });

            // Refund larger than total supply.
            const totalSupply = await market.debt();
            await assert.revert(market.refundLong(totalSupply, { from: newBidder }), "SafeMath: subtraction overflow");
            await assert.revert(market.refundShort(totalSupply, { from: newBidder }), "SafeMath: subtraction overflow");

            // Smaller than total supply but larger than balance.
            await assert.revert(market.refundLong(initialLongBid.add(toBN(1)), { from: newBidder }), "SafeMath: subtraction overflow");
            await assert.revert(market.refundShort(initialShortBid.add(toBN(1)), { from: newBidder }), "SafeMath: subtraction overflow");
        });

        it('Refunds properly affect prices.', async () => {
            await market.bidShort(initialShortBid, { from: newBidder });
            await market.bidLong(initialLongBid, { from: newBidder });
            await market.refundShort(initialShortBid, { from: newBidder });
            await market.refundLong(initialLongBid, { from: newBidder });

            const debt = mulDecRound(initialLongBid.add(initialShortBid), toUnit(1).add(initialRefundFee));
            let expectedPrices = computePrices(initialLongBid, initialShortBid, debt, totalInitialFee);
            const currentPrices = await market.prices()

            assert.bnClose(currentPrices[0], expectedPrices.long, 1);
            assert.bnClose(currentPrices[1], expectedPrices.short, 1);
        });

        it('Cannot refund past the end of bidding.', async () => {
            await market.bidLong(initialLongBid, { from: newBidder });
            await market.bidShort(initialShortBid, { from: newBidder });

            await fastForward(biddingTime + 1);

            await assert.revert(market.refundLong(initialLongBid, { from: newBidder }), "Bidding must be active.");
            await assert.revert(market.refundShort(initialShortBid, { from: newBidder }), "Bidding must be active.");
        });

        it('Refunds properly emit events.', async () => {
            await market.bidLong(initialLongBid, { from: newBidder });
            await market.bidShort(initialShortBid, { from: newBidder });

            const longFee = mulDecRound(initialLongBid, initialRefundFee);
            const shortFee = mulDecRound(initialShortBid, initialRefundFee);

            let tx = await market.refundLong(initialLongBid, { from: newBidder });
            let currentPrices = await market.prices();

            assert.equal(tx.logs[0].event, "LongRefund");
            assert.equal(tx.logs[0].args.refunder, newBidder);
            assert.bnEqual(tx.logs[0].args.refund, initialLongBid.sub(longFee));
            assert.bnEqual(tx.logs[0].args.fee, longFee);

            assert.equal(tx.logs[1].event, "PricesUpdated");
            assert.bnEqual(tx.logs[1].args.longPrice, currentPrices[0]);
            assert.bnEqual(tx.logs[1].args.shortPrice, currentPrices[1]);

            tx = await market.refundShort(initialShortBid, { from: newBidder });
            currentPrices = await market.prices();

            assert.equal(tx.logs[0].event, "ShortRefund");
            assert.equal(tx.logs[0].args.refunder, newBidder);
            assert.bnEqual(tx.logs[0].args.refund, initialShortBid.sub(shortFee));
            assert.bnEqual(tx.logs[0].args.fee, shortFee);

            assert.equal(tx.logs[1].event, "PricesUpdated");
            assert.bnEqual(tx.logs[1].args.longPrice, currentPrices[0]);
            assert.bnEqual(tx.logs[1].args.shortPrice, currentPrices[1]);
        });

        it('Refunds remit the proper amount of sUSD', async () => {
            await market.bidLong(initialLongBid, { from: newBidder });
            await market.bidShort(initialShortBid, { from: newBidder });
            await market.refundLong(initialLongBid, { from: newBidder });
            await market.refundShort(initialShortBid, { from: newBidder });

            const fee = mulDecRound(initialLongBid.add(initialShortBid), initialRefundFee);
            assert.bnEqual(await sUSDSynth.balanceOf(newBidder), sUSDQty.sub(fee));
        });
    });

    describe("Claiming Options", () => {
        it('Claims yield the proper balances.', async () => {
            await sUSDSynth.issue(pauper, sUSDQty);
            await sUSDSynth.approve(factory.address, sUSDQty, { from: pauper });
            await sUSDSynth.approve(market.address, sUSDQty, { from: pauper });

            await market.bidLong(initialLongBid, { from: newBidder });
            await market.bidShort(initialShortBid, { from: pauper });

            await fastForward(biddingTime * 2);

            const tx1 = await market.claimOptions({ from: newBidder });
            const tx2 = await market.claimOptions({ from: pauper });

            const long = await BinaryOption.at(await market.longOption());
            const short = await BinaryOption.at(await market.shortOption());

            const bids = await market.totalBids();
            const totalBids = bids[0].add(bids[1]);
            const prices = computePrices(initialLongBid, initialShortBid, totalBids, totalInitialFee);

            const longOptions = divDecRound(initialLongBid, prices.long);
            const shortOptions = divDecRound(initialShortBid, prices.short);

            assert.bnClose(await long.balanceOf(newBidder), longOptions, 1);
            assert.bnEqual(await short.balanceOf(newBidder), toBN(0));

            assert.bnEqual(await long.balanceOf(pauper), toBN(0));
            assert.bnClose(await short.balanceOf(pauper), shortOptions, 1);

            let logs = BinaryOption.decodeLogs(tx1.receipt.rawLogs);

            assert.equal(logs[0].address, long.address);
            assert.equal(logs[0].event, 'Transfer');
            assert.equal(logs[0].args.from, '0x' + '0'.repeat(40));
            assert.equal(logs[0].args.to, newBidder);
            assert.bnClose(logs[0].args.value, longOptions, 1);
            assert.equal(logs[1].address, long.address);
            assert.equal(logs[1].event, 'Issued');
            assert.equal(logs[1].args.account, newBidder);
            assert.bnClose(logs[1].args.value, longOptions, 1);

            logs = BinaryOption.decodeLogs(tx2.receipt.rawLogs);

            assert.equal(logs[0].address, short.address);
            assert.equal(logs[0].event, 'Transfer');
            assert.equal(logs[0].args.from, '0x' + '0'.repeat(40));
            assert.equal(logs[0].args.to, pauper);
            assert.bnClose(logs[0].args.value, shortOptions, 1);
            assert.equal(logs[1].address, short.address);
            assert.equal(logs[1].event, 'Issued');
            assert.equal(logs[1].args.account, pauper);
            assert.bnClose(logs[1].args.value, shortOptions, 1);
        });

        it('Can claim both sides simultaneously.', async () => {
            await market.bidLong(initialLongBid, { from: newBidder });
            await market.bidShort(initialShortBid, { from: newBidder });

            await fastForward(biddingTime * 2);

            const tx = await market.claimOptions({ from: newBidder });
            const long = await BinaryOption.at(await market.longOption());
            const short = await BinaryOption.at(await market.shortOption());

            const bids = await market.totalBids();
            const totalBids = bids[0].add(bids[1]);
            const prices = computePrices(initialLongBid, initialShortBid, totalBids, totalInitialFee);

            const longOptions = divDecRound(initialLongBid, prices.long);
            const shortOptions = divDecRound(initialShortBid, prices.short);

            assert.bnClose(await long.balanceOf(newBidder), longOptions, 1);
            assert.bnClose(await short.balanceOf(newBidder), shortOptions, 1);

            const logs = BinaryOption.decodeLogs(tx.receipt.rawLogs);

            assert.equal(logs[0].address, long.address);
            assert.equal(logs[0].event, 'Transfer');
            assert.equal(logs[0].args.from, '0x' + '0'.repeat(40));
            assert.equal(logs[0].args.to, newBidder);
            assert.bnClose(logs[0].args.value, longOptions, 1);
            assert.equal(logs[1].address, long.address);
            assert.equal(logs[1].event, 'Issued');
            assert.equal(logs[1].args.account, newBidder);
            assert.bnClose(logs[1].args.value, longOptions, 1);
            assert.equal(logs[2].address, short.address);
            assert.equal(logs[2].event, 'Transfer');
            assert.equal(logs[2].args.from, '0x' + '0'.repeat(40));
            assert.equal(logs[2].args.to, newBidder);
            assert.bnClose(logs[2].args.value, shortOptions, 1);
            assert.equal(logs[3].address, short.address);
            assert.equal(logs[3].event, 'Issued');
            assert.equal(logs[3].args.account, newBidder);
            assert.bnClose(logs[3].args.value, shortOptions, 1);
        });

        it('Cannot claim options during bidding.', async () => {
            await market.bidLong(initialLongBid, { from: newBidder });
            await market.bidShort(initialShortBid, { from: newBidder });
            await assert.revert(market.claimOptions({ from: newBidder }), "Bidding must be complete.");
        });
    });
});
