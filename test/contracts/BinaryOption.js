'use strict';

const { artifacts, contract, web3 } = require('@nomiclabs/buidler');
const { toBN } = web3.utils;

const { assert, addSnapshotBeforeRestoreAfterEach } = require('./common');
const { currentTime, fastForward, toUnit, fromUnit } = require('../utils')();

const BinaryOption = artifacts.require('BinaryOption');
const SafeDecimalMath = artifacts.require('SafeDecimalMath');

contract('BinaryOption', accounts => {
    const [market, bidder, recipient] = accounts;

    const biddingTime = 100;
    const initialBid = toUnit(5);
    const initialPrice = toUnit(0.5);

    let option;
    let creationTime;

    const deployOption = async ({endOfBidding, initialBidder, initialBid, initialPrice, from}) => {
        return await BinaryOption.new(endOfBidding, initialBidder, initialBid, initialPrice, { from });
    };

    const setupNewOption = async () => {
        creationTime = await currentTime();
        option = await deployOption({
            endOfBidding: creationTime + biddingTime,
            initialBidder: bidder,
            initialBid,
            initialPrice,
            market,
        });
    };

    before(async () => {
        BinaryOption.link(await SafeDecimalMath.new());
        await setupNewOption();
    });

    addSnapshotBeforeRestoreAfterEach();

    describe('Basic Parameters', () => {
        it('Bad constructor arguments revert', async () => {
            let localCreationTime = await currentTime();

            await assert.revert(deployOption({
                market,
                endOfBidding: localCreationTime - 10,
                initialBidder: bidder,
                initialBid,
                initialPrice,
                market,
            }), "Bidding period must end in the future.");


            localCreationTime = await currentTime();
            await assert.revert(deployOption({
                market,
                endOfBidding: localCreationTime + biddingTime,
                initialBidder: bidder,
                initialBid,
                initialPrice: toUnit(0),
                market,
            }), "Price out of range.");

            localCreationTime = await currentTime();
            await assert.revert(deployOption({
                market,
                endOfBidding: localCreationTime + biddingTime,
                initialBidder: bidder,
                initialBid,
                initialPrice: toUnit(1),
                market,
            }), "Price out of range.");
        });

        it('static parameters are set properly', async () => {
            assert.equal(await option.name(), "SNX Binary Option");
            assert.equal(await option.symbol(), "sOPT");
            assert.bnEqual(await option.decimals(), toBN(18));
            assert.equal(await option.market(), market)
            assert.bnEqual(await option.endOfBidding(), toBN(creationTime + biddingTime));
        });

        it('initial bid details are recorded properly', async () => {
            assert.bnEqual(await option.bidOf(bidder), initialBid);
            assert.bnEqual(await option.totalBids(), initialBid);
            assert.bnEqual(await option.price(), initialPrice);
        });
    });

    describe('Bids', () => {
        it('biddingEnded properly understands when bidding has ended.', async () => {
            assert.isFalse(await option.biddingEnded());
            await fastForward(biddingTime * 2);
            assert.isTrue(await option.biddingEnded());
        });

        it('Can place bids during bidding.', async () => {
            await option.bidUpdatePrice(bidder, toUnit(1), toUnit(0.25));
        });

        it('Cannot place bids after the end of the bidding phase.', async () => {
            await fastForward(biddingTime * 2);
            await assert.revert(option.bidUpdatePrice(bidder, toUnit(1), toUnit(0.25)),
            "Can't update the price after the end of bidding.");
        });

        it('Cannot place empty bids.', async () => {
            await assert.revert(option.bidUpdatePrice(bidder, toUnit(0), toUnit(0.25)),
            "Bids must be positive.");
        });

        it('Bids properly update totals and price.', async () => {
            // Existing bidder bids.
            const newBid = toUnit(1);
            let newPrice = toUnit(0.25);
            const newSupply = initialBid.add(newBid);
            await option.bidUpdatePrice(bidder, newBid, newPrice, { from: market });
            assert.bnEqual(await option.bidOf(bidder), newSupply);
            assert.bnEqual(await option.totalBids(), newSupply);
            assert.bnEqual(await option.balanceOf(bidder), toUnit(0));
            assert.bnEqual(await option.totalSupply(), toUnit(0));
            assert.bnEqual(await option.price(), newPrice);

            // New bidder bids.
            newPrice = toUnit(0.75);
            await option.bidUpdatePrice(recipient, newBid, newPrice, { from: market });
            assert.bnEqual(await option.bidOf(recipient), newBid);
            assert.bnEqual(await option.totalBids(), newSupply.add(newBid));
            assert.bnEqual(await option.balanceOf(recipient), toUnit(0));
            assert.bnEqual(await option.totalSupply(), toUnit(0));
            assert.bnEqual(await option.price(), newPrice);
        });

        it('Bids cannot be sent other than from the market.', async () => {
            const newBid = toUnit(1);
            let newPrice = toUnit(0.25);
            await assert.revert(option.bidUpdatePrice(bidder, newBid, newPrice, { from: bidder }),
            "Only the market can update prices.");
        });

        it("Bid prices must be within the unit interval.", async () => {
            await assert.revert(option.bidUpdatePrice(bidder, toUnit(1), toUnit(0), { from: market }),
                "Price out of range");
            await assert.revert(option.bidUpdatePrice(bidder, toUnit(1), toUnit(1), { from: market }),
                "Price out of range");
        });
    });

    describe('Refunds', () => {
        it('Can process refunds during bidding.', async () => {
            await option.bidUpdatePrice(bidder, toUnit(1), toUnit(0.25));
            await option.refundUpdatePrice(bidder, toUnit(1), toUnit(0.25));
        });

        it('Cannot process empty refunds.', async () => {
            await option.bidUpdatePrice(bidder, toUnit(1), toUnit(0.25));
            await assert.revert(option.refundUpdatePrice(bidder, toUnit(0), toUnit(0.25)),
            "Refunds must be positive.");
        });

        it("Rejects refunds larger than the wallet's bid balance." , async () => {
            await option.bidUpdatePrice(recipient, toUnit(1), toUnit(0.25));
            await assert.revert(option.refundUpdatePrice(recipient, toUnit(2), toUnit(0.25)),
            "SafeMath: subtraction overflow");
        });

        it('Cannot place refunds after the end of the bidding phase.', async () => {
            await fastForward(biddingTime * 2);
            await assert.revert(option.bidUpdatePrice(bidder, toUnit(1), toUnit(0.25)),
            "Can't update the price after the end of bidding.");
        });

        it('Refunds properly update totals and price.', async () => {
            // Partial refund.
            const refund = toUnit(1);
            let newPrice = toUnit(0.25);
            const newSupply = initialBid.sub(refund);
            await option.refundUpdatePrice(bidder, refund, newPrice, { from: market });
            assert.bnEqual(await option.bidOf(bidder), newSupply);
            assert.bnEqual(await option.totalBids(), newSupply);
            assert.bnEqual(await option.balanceOf(bidder), toUnit(0));
            assert.bnEqual(await option.totalSupply(), toUnit(0));
            assert.bnEqual(await option.price(), newPrice);

            // Refund remaining funds.
            newPrice = toUnit(0.75);
            await option.refundUpdatePrice(bidder, newSupply, newPrice, { from: market });
            assert.bnEqual(await option.bidOf(bidder), toBN(0));
            assert.bnEqual(await option.totalBids(), toBN(0));
            assert.bnEqual(await option.balanceOf(bidder), toBN(0));
            assert.bnEqual(await option.totalSupply(), toBN(0));
            assert.bnEqual(await option.price(), newPrice);
        });

        it('Refunds cannot be sent other than from the market.', async () => {
            const refund = toUnit(1);
            let newPrice = toUnit(0.25);
            await assert.revert(option.refundUpdatePrice(bidder, refund, newPrice, { from: bidder }),
            "Only the market can update prices.");
        });

        it("Refund prices must be within the unit interval.", async () => {
            await option.bidUpdatePrice(bidder, toUnit(1), toUnit(0.5), { from: market });
            await assert.revert(option.refundUpdatePrice(bidder, toUnit(1), toUnit(0), { from: market }),
                "Price out of range.");
            await assert.revert(option.refundUpdatePrice(bidder, toUnit(1), toUnit(1), { from: market }),
                "Price out of range.");
        });
    });

    describe('Price Updates', () => {
        it('Price updates are treated correctly', async () => {
            await option.updatePrice(toUnit(0.25), { from: market });
            assert.bnEqual(await option.price(), toUnit(0.25));
        });

        it('Cannot update the price after the end of the bidding phase.', async () => {
            await fastForward(biddingTime * 2);
            await assert.revert(option.updatePrice(toUnit(0.25)),
            "Can't update the price after the end of bidding.");
        });

        it("Price updates cannot be sent other than from the market.", async () => {
            await assert.revert(option.updatePrice(toUnit(0.25), { from: bidder }),
            "Only the market can update prices.");
        });

        it("Price updates must be within the unit interval", async () => {
            await assert.revert(option.updatePrice(toUnit(0), { from: market }),
                "Price out of range");
            await assert.revert(option.updatePrice(toUnit(1), { from: market }),
                "Price out of range");
        });
    });

    describe('Claiming Options', () => {
        it("Options can't be claimed until after the end of bidding.", async () => {
            await assert.revert(option.claimOptions({ from: bidder }), "Can only claim options after the end of bidding.");
        });

        it("Options can be claimed after the end of bidding.", async () => {
            await fastForward(biddingTime * 2);
            const optionsOwed = await option.optionsOwedTo(bidder);
            await option.claimOptions({ from: bidder });
            assert.bnEqual(await option.balanceOf(bidder), optionsOwed);
        });

        it("Claiming options properly updates totals and price.", async () => {
            await fastForward(biddingTime * 2);

            const claimable = initialBid.mul(toBN(2));

            assert.bnEqual(await option.bidOf(bidder), initialBid);
            assert.bnEqual(await option.totalBids(), initialBid);
            assert.bnEqual(await option.optionsOwedTo(bidder), claimable);
            assert.bnEqual(await option.totalOptionsOwed(), claimable);
            assert.bnEqual(await option.balanceOf(bidder), toBN(0));
            assert.bnEqual(await option.totalSupply(), toBN(0));

            await option.claimOptions({ from: bidder });

            assert.bnEqual(await option.bidOf(bidder), toBN(0));
            assert.bnEqual(await option.totalBids(), toBN(0));
            assert.bnEqual(await option.optionsOwedTo(bidder), toBN(0));
            assert.bnEqual(await option.totalOptionsOwed(), toBN(0));
            assert.bnEqual(await option.balanceOf(bidder), claimable);
            assert.bnEqual(await option.totalSupply(), claimable);
        });

        it("Claiming options correctly emits Transfer event.", async () => {
            await fastForward(biddingTime * 2);
            const tx = await option.claimOptions({ from: bidder });
            const log = tx.logs[0];

            // Check that the minting transfer event is emitted properly.
            assert.equal(log.event, "Transfer");
            assert.equal(log.args.from, "0x" + "0".repeat(40));
            assert.equal(log.args.to, bidder);
            assert.bnEqual(log.args.value, initialBid.mul(toBN(2)));
        });

        it("Options owed is correctly computed before and after bidding.", async () => {
            const owed = initialBid.mul(toBN(2));

            assert.bnEqual(await option.optionsOwedTo(bidder), owed);
            assert.bnEqual(await option.totalOptionsOwed(), owed);
        });

    });

    describe('Transfers', () => {
        it('Cannot transfer tokens during bidding.', async () => {
            await assert.revert(option.transfer(recipient, toUnit(1), { from: bidder }),
            "Can only transfer after the end of bidding.")

            await option.approve(recipient, toUnit(10), { from: bidder });
            await assert.revert(option.transferFrom(bidder, recipient, toUnit(1), { from: recipient }),
            "Can only transfer after the end of bidding.");
        });

        it('Can transfer tokens after the end of bidding.', async () => {
            await fastForward(biddingTime * 2);
            await option.claimOptions({ from: bidder });
            option.transfer(recipient, toUnit(1), { from: bidder });
        });

        it('Transfers properly update balances', async () => {
            // Transfer partial quantity.
            await fastForward(biddingTime * 2);
            const claimableOptions = await option.optionsOwedTo(bidder);
            const half = claimableOptions.div(toBN(2));
            await option.claimOptions({from: bidder});
            await option.transfer(recipient, half, { from: bidder });

            // Check that balances have updated properly.
            assert.bnEqual(await option.balanceOf(bidder), initialBid);
            assert.bnEqual(await option.balanceOf(recipient), initialBid);

            // Transfer full balance.
            await option.transfer(bidder, half, { from: recipient });

            assert.bnEqual(await option.balanceOf(bidder), initialBid.mul(toBN(2)));
            assert.bnEqual(await option.balanceOf(recipient), toUnit(0));
            assert.bnEqual(await option.totalSupply(), initialBid.mul(toBN(2)));
        });

        it('Transfers properly emit events', async () => {
            // Transfer partial quantity.
            await fastForward(biddingTime * 2);
            await option.claimOptions({from: bidder});
            let tx = await option.transfer(recipient, toUnit(2.5), { from: bidder });

            // Check that event is emitted properly.
            let log = tx.logs[0];
            assert.equal(log.event, "Transfer");
            assert.equal(log.args.from, bidder);
            assert.equal(log.args.to, recipient);
            assert.bnEqual(log.args.value, toUnit(2.5));
        });

        it('Approvals properly update allowance values', async () => {
            await option.approve(recipient, toUnit(10), { from: bidder });
            assert.bnEqual(await option.allowance(bidder, recipient), toUnit(10));
        });

        it('Approvals properly emit events', async () => {
            const tx = await option.approve(recipient, toUnit(10), { from: bidder });

            let log = tx.logs[0];
            assert.equal(log.event, "Approval");
            assert.equal(log.args.owner, bidder);
            assert.equal(log.args.spender, recipient);
            assert.bnEqual(log.args.value, toUnit(10));
        });

        it('Cannot transferFrom tokens during bidding.', async () => {
            await option.approve(recipient, toUnit(10), { from: bidder });
            await assert.revert(option.transferFrom(bidder, recipient, toUnit(1), { from: recipient }),
            "Can only transfer after the end of bidding.")

            await option.approve(recipient, toUnit(10), { from: bidder });
            await assert.revert(option.transferFrom(bidder, recipient, toUnit(1), { from: recipient }),
            "Can only transfer after the end of bidding.");
        });

        it('Can transferFrom tokens after the end of bidding.', async () => {
            await fastForward(biddingTime * 2);
            await option.claimOptions({ from: bidder });

            await option.approve(recipient, toUnit(10), { from: bidder });
            await option.transferFrom(bidder, recipient, toUnit(1), { from: recipient });
        });

        it('transferFrom properly updates balances', async () => {
            // Transfer partial quantity.
            await fastForward(biddingTime * 2);
            const claimableOptions = await option.optionsOwedTo(bidder);
            const half = claimableOptions.div(toBN(2));
            await option.claimOptions({from: bidder});

            await option.approve(recipient, toUnit(100), { from: bidder });
            await option.transferFrom(bidder, recipient, half, { from: recipient });

            // Check that balances have updated properly.
            assert.bnEqual(await option.balanceOf(bidder), initialBid);
            assert.bnEqual(await option.balanceOf(recipient), initialBid);

            // Transfer full balance.
            await option.transferFrom(bidder, recipient, half, { from: recipient });

            assert.bnEqual(await option.balanceOf(bidder), toUnit(0));
            assert.bnEqual(await option.balanceOf(recipient), initialBid.mul(toBN(2)));
            assert.bnEqual(await option.totalSupply(), initialBid.mul(toBN(2)));
        });

        it('transferFrom properly emits events', async () => {
            // Transfer partial quantity.
            await fastForward(biddingTime * 2);
            await option.claimOptions({ from: bidder });
            await option.approve(recipient, toUnit(100), { from: bidder });
            let tx = await option.transferFrom(bidder, recipient, toUnit(2.5), { from: recipient });

            // Check that event is emitted properly.
            let log = tx.logs[0];
            assert.equal(log.event, "Transfer");
            assert.equal(log.args.from, bidder);
            assert.equal(log.args.to, recipient);
            assert.bnEqual(log.args.value, toUnit(2.5));
        });
    });
});
