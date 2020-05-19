'use strict';

const { artifacts, contract, web3 } = require('@nomiclabs/buidler');
const { toBN } = web3.utils;

const { assert, addSnapshotBeforeRestoreAfterEach } = require('./common');
const { toUnit, currentTime } = require('../utils')();
const { toBytes32 } = require('../..');
const { setupAllContracts } = require('./setup');

const BinaryOptionMarket = artifacts.require('BinaryOptionMarket');

contract('BinaryOptionMarketFactory', accounts => {
    const [initialCreator, factoryOwner, bidder, dummy] = accounts;

    const sUSDQty = toUnit(10000);

    const maturityWindow = toBN(60 * 61);

    const initialPoolFee = toUnit(0.008);
    const initialCreatorFee = toUnit(0.002);
    const initialRefundFee = toUnit(0.02)

    let factory,
        exchangeRates,
        addressResolver,
        sUSDSynth;

    const sAUDKey = toBytes32("sAUD");

    const createMarket = async (fac, endOfBidding, maturity, oracleKey, targetPrice, longBid, shortBid, creator) => {
        const tx = await fac.createMarket(endOfBidding, maturity, oracleKey, targetPrice, longBid, shortBid, { from: creator });
        return BinaryOptionMarket.at(tx.logs[1].args.market);
    }

    const mulDecRound = (x, y) => {
        let result = x.mul(y).div(toUnit(0.1));
        if (result.mod(toBN(10)).gte(toBN(5))) {
            result = result.add(toBN(10));
        }
        return result.div(toBN(10));
    }

    before(async () => {
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

        await sUSDSynth.issue(initialCreator, sUSDQty);
        await sUSDSynth.approve(factory.address, sUSDQty, { from: initialCreator });
    });

    addSnapshotBeforeRestoreAfterEach();

    describe('Basic parameters', () => {
        it('Static parameters are set properly', async () => {
            assert.bnEqual(await factory.oracleMaturityWindow(), maturityWindow);
            assert.bnEqual(await factory.poolFee(), initialPoolFee);
            assert.bnEqual(await factory.creatorFee(), initialCreatorFee);
            assert.bnEqual(await factory.refundFee(), initialRefundFee);
            assert.bnEqual(await factory.totalDeposited(), toBN(0));
            assert.equal(await factory.resolver(), addressResolver.address);
            assert.equal(await factory.owner(), factoryOwner);
        });

        it('Set pool fee', async () => {
            const newFee = toUnit(0.5);
            const tx = await factory.setPoolFee(newFee, { from: factoryOwner });
            assert.bnEqual(await factory.poolFee(), newFee);
            const log = tx.logs[0];
            assert.equal(log.event, "PoolFeeChanged");
            assert.bnEqual(log.args.fee, newFee);
        });

        it("Pool fee can't be set too high", async () => {
            const newFee = toUnit(1);
            await assert.revert(factory.setPoolFee(newFee, { from: factoryOwner }), "Total fee must be less than 100%.");
        });

        it("Only the owner can set the pool fee", async () => {
            await assert.revert(factory.setPoolFee(toUnit(0.5), { from: initialCreator }), "Only the contract owner may perform this action");
        });

        it('Set creator fee', async () => {
            const newFee = toUnit(0.5);
            const tx = await factory.setCreatorFee(newFee, { from: factoryOwner });
            assert.bnEqual(await factory.creatorFee(), newFee);
            const log = tx.logs[0];
            assert.equal(log.event, "CreatorFeeChanged");
            assert.bnEqual(log.args.fee, newFee);
        });

        it("Creator fee can't be set too high", async () => {
            const newFee = toUnit(1);
            await assert.revert(factory.setCreatorFee(newFee, { from: factoryOwner }), "Total fee must be less than 100%.");
        });

        it("Only the owner can set the creator fee", async () => {
            await assert.revert(factory.setCreatorFee(toUnit(0.5), { from: initialCreator }), "Only the contract owner may perform this action");
        });

        it('Set refund fee', async () => {
            const newFee = toUnit(1);
            const tx = await factory.setRefundFee(newFee, { from: factoryOwner });
            assert.bnEqual(await factory.refundFee(), newFee);
            const log = tx.logs[0];
            assert.equal(log.event, "RefundFeeChanged");
            assert.bnEqual(log.args.fee, newFee);
        });

        it("Only the owner can set the refund fee", async () => {
            await assert.revert(factory.setRefundFee(toUnit(0.5), { from: initialCreator }), "Only the contract owner may perform this action");
        });

        it("Refund fee can't be set too high", async () => {
            const newFee = toUnit(1.01);
            await assert.revert(factory.setRefundFee(newFee, { from: factoryOwner }), "Refund fee must be no greater than 100%.");
        });

        it('Set oracle maturity window', async () => {
            const tx = await factory.setOracleMaturityWindow(100, { from: factoryOwner });
            assert.bnEqual(await factory.oracleMaturityWindow(), toBN(100));
            const log = tx.logs[0];
            assert.equal(log.event, "OracleMaturityWindowChanged");
            assert.bnEqual(log.args.duration, toBN(100));
        });

        it("Only the owner can set the oracle maturity window", async () => {
            await assert.revert(factory.setOracleMaturityWindow(100, { from: initialCreator }), "Only the contract owner may perform this action");
        });
    });

    describe('Market creation', () => {
        it('Can create a market', async () => {
            const now = await currentTime();

            const result = await factory.createMarket(
                now + 100, now + 200,
                sAUDKey, toUnit(1),
                toUnit(2), toUnit(3),
                { from: initialCreator });

            let log = result.logs[0];
            assert.equal(log.event, 'OwnerChanged');
            assert.equal(log.args.newOwner, factory.address);

            log = result.logs[1];
            assert.equal(log.event, 'BinaryOptionMarketCreated');
            assert.equal(log.args.creator, initialCreator);

            const market = await BinaryOptionMarket.at(log.args.market);

            assert.bnEqual(await market.endOfBidding(), toBN(now + 100));
            assert.bnEqual(await market.maturity(), toBN(now + 200));
            assert.bnEqual(await market.targetOraclePrice(), toUnit(1));
            assert.bnEqual(await market.oracleMaturityWindow(), maturityWindow);
            assert.equal(await market.creator(), initialCreator);
            assert.equal(await market.owner(), factory.address);
            assert.equal(await market.resolver(), addressResolver.address);
            assert.equal(await market.oracleKey(), sAUDKey);

            const bids = await market.totalBids();
            assert.bnEqual(bids[0], toUnit(2));
            assert.bnEqual(bids[1], toUnit(3));
            assert.bnEqual(await market.deposited(), toUnit(5));
            assert.bnEqual(await factory.totalDeposited(), toUnit(5));

            assert.bnEqual(await market.poolFee(), initialPoolFee);
            assert.bnEqual(await market.creatorFee(), initialCreatorFee);
            assert.bnEqual(await market.refundFee(), initialRefundFee);

            assert.bnEqual(await factory.numActiveMarkets(), toBN(1));
            assert.bnEqual(await factory.activeMarkets(0), market.address);
        });

        it('Cannot create a market without sufficient capital to cover the initial bids.', async () => {
            const now = await currentTime();
            await assert.revert(
                factory.createMarket(
                    now + 100, now + 200,
                    sAUDKey, toUnit(1),
                    toUnit(2), toUnit(3),
                    { from: dummy }),
                'SafeMath: subtraction overflow'
            );

            await sUSDSynth.issue(dummy, sUSDQty);

            await assert.revert(
                factory.createMarket(
                    now + 100, now + 200,
                    sAUDKey, toUnit(1),
                    toUnit(2), toUnit(3),
                    { from: dummy }),
                'SafeMath: subtraction overflow'
            );

            await sUSDSynth.approve(factory.address, sUSDQty, { from: dummy });

            await factory.createMarket(
                now + 100, now + 200,
                sAUDKey, toUnit(1),
                toUnit(2), toUnit(3),
                { from: dummy });
        });
    });

    describe('Debt management', () => {
        it('Only active markets can modify the total debt.', async () => {
            await assert.revert(factory.incrementTotalDeposited(toUnit(2), { from: factoryOwner }), "Permitted only for active markets.");
            await assert.revert(factory.decrementTotalDeposited(toUnit(1), { from: factoryOwner }), "Permitted only for active markets.");
        });

        it('Creating a market affects total debt properly.', async () => {
            const now = await currentTime();
            await createMarket(factory, now + 100, now + 200, sAUDKey, toUnit(1), toUnit(2), toUnit(3), initialCreator);
            assert.bnEqual(await factory.totalDeposited(), toUnit(5));
        });

        it('Bidding affects total debt properly.', async () => {
            const now = await currentTime();
            const market = await createMarket(factory, now + 100, now + 200, sAUDKey, toUnit(1), toUnit(2), toUnit(3), initialCreator);
            const initialDebt = await factory.totalDeposited();

            await sUSDSynth.issue(bidder, sUSDQty);
            await sUSDSynth.approve(market.address, sUSDQty, { from: bidder });

            await market.bidLong(toUnit(1), { from: bidder });
            assert.bnEqual(await factory.totalDeposited(), initialDebt.add(toUnit(1)));

            await market.bidShort(toUnit(2), { from: bidder });
            assert.bnEqual(await factory.totalDeposited(), initialDebt.add(toUnit(3)));
        });

        it('Refunds affect total debt properly.', async () => {
            const now = await currentTime();
            const market = await createMarket(factory, now + 100, now + 200, sAUDKey, toUnit(1), toUnit(2), toUnit(3), initialCreator);
            const initialDebt = await factory.totalDeposited();

            await sUSDSynth.issue(bidder, sUSDQty);
            await sUSDSynth.approve(market.address, sUSDQty, { from: bidder });

            await market.bidLong(toUnit(1), { from: bidder });
            await market.bidShort(toUnit(2), { from: bidder });
            assert.bnEqual(await factory.totalDeposited(), initialDebt.add(toUnit(3)));

            await market.refundLong(toUnit(0.5), { from: bidder });
            await market.refundShort(toUnit(1), { from: bidder });
            const refundFeeRetained = mulDecRound(toUnit(1.5), initialRefundFee);
            assert.bnEqual(await factory.totalDeposited(), initialDebt.add(toUnit(1.5)).add(refundFeeRetained));
        });
    });
});
