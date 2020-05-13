'use strict';

const { artifacts, contract, web3 } = require('@nomiclabs/buidler');
const { toBN } = web3.utils;

const { assert, addSnapshotBeforeRestoreAfterEach } = require('./common');
const { currentTime, fastForward, toUnit, fromUnit } = require('../utils')();

const MockBinaryOptionMarket = artifacts.require('MockBinaryOptionMarket');
const BinaryOption = artifacts.require('BinaryOption');

contract('BinaryOption', accounts => {
    const [market, bidder, recipient] = accounts;

    const biddingTime = 100;
    const initialBid = toUnit(5);

    let mockMarket;
    let mockedOption;
    let option;
    let creationTime;

    const deployOption = async ({endOfBidding, initialBidder, initialBid, from}) => {
        return await BinaryOption.new(endOfBidding, initialBidder, initialBid, { from });
    };

    const setupOption = async () => {
        mockMarket = await MockBinaryOptionMarket.new();
        await mockMarket.setSenderPrice(toUnit(0.5));
        creationTime = await currentTime();
        const tx = await mockMarket.deployOption(
            creationTime + biddingTime,
            bidder,
            initialBid,
        );
        mockedOption = await BinaryOption.at(tx.logs[0].args.newAddress);
        option = await deployOption({
            endOfBidding: creationTime + biddingTime,
            initialBidder: bidder,
            initialBid,
            market,
        });
    };

    before(async () => {
        await setupOption();
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
                market,
            }), "Bidding period must end in the future.");
        });

        it('Static parameters are set properly', async () => {
            assert.equal(await option.name(), "SNX Binary Option");
            assert.equal(await option.symbol(), "sOPT");
            assert.bnEqual(await option.decimals(), toBN(18));
            assert.equal(await option.market(), market);
            assert.bnEqual(await option.endOfBidding(), toBN(creationTime + biddingTime));
        });

        it('Initial bid details are recorded properly', async () => {
            assert.bnEqual(await option.bidOf(bidder), initialBid);
            assert.bnEqual(await option.totalBids(), initialBid);
        });

        it('Bidding ends properly.', async () => {
            assert.isFalse(await option.biddingEnded());
            await fastForward(biddingTime * 2);
            assert.isTrue(await option.biddingEnded());
        });
    });

    describe('Bids', () => {
        it('biddingEnded properly understands when bidding has ended.', async () => {
            assert.isFalse(await option.biddingEnded());
            await fastForward(biddingTime * 2);
            assert.isTrue(await option.biddingEnded());
        });

        it('Can place bids during bidding.', async () => {
            await option.bid(bidder, toUnit(1));
        });

        it('Cannot place bids after the end of the bidding phase.', async () => {
            await fastForward(biddingTime * 2);
            await assert.revert(option.bid(bidder, toUnit(1)),
            "Bidding must be active.");
        });

        it('Cannot place empty bids.', async () => {
            await assert.revert(option.bid(bidder, toUnit(0)),
            "Bids must be nonzero.");
        });

        it('Bids properly update totals.', async () => {
            // Existing bidder bids.
            const newBid = toUnit(1);
            const newSupply = initialBid.add(newBid);
            await option.bid(bidder, newBid, { from: market });
            assert.bnEqual(await option.bidOf(bidder), newSupply);
            assert.bnEqual(await option.totalBids(), newSupply);
            assert.bnEqual(await option.balanceOf(bidder), toUnit(0));
            assert.bnEqual(await option.totalSupply(), toUnit(0));

            // New bidder bids.
            await option.bid(recipient, newBid, { from: market });
            assert.bnEqual(await option.bidOf(recipient), newBid);
            assert.bnEqual(await option.totalBids(), newSupply.add(newBid));
            assert.bnEqual(await option.balanceOf(recipient), toUnit(0));
            assert.bnEqual(await option.totalSupply(), toUnit(0));
        });

        it('Bids cannot be sent other than from the market.', async () => {
            await assert.revert(option.bid(bidder, toUnit(1), { from: bidder }),
            "Permitted only for the market.");
        });
    });

    describe('Refunds', () => {
        it('Can process refunds during bidding.', async () => {
            await option.bid(bidder, toUnit(1));
            await option.refund(bidder, toUnit(1));
        });

        it('Cannot process empty refunds.', async () => {
            await option.bid(bidder, toUnit(1));
            await assert.revert(option.refund(bidder, toUnit(0)),
            "Refunds must be nonzero.");
        });

        it("Rejects refunds larger than the wallet's bid balance." , async () => {
            await option.bid(recipient, toUnit(1));
            await assert.revert(option.refund(recipient, toUnit(2)),
            "SafeMath: subtraction overflow");
        });

        it('Cannot place refunds after the end of the bidding phase.', async () => {
            await fastForward(biddingTime * 2);
            await assert.revert(option.bid(bidder, toUnit(1)),
            "Bidding must be active.");
        });

        it('Refunds properly update totals and price.', async () => {
            // Partial refund.
            const refund = toUnit(1);
            const newSupply = initialBid.sub(refund);
            await option.refund(bidder, refund, { from: market });
            assert.bnEqual(await option.bidOf(bidder), newSupply);
            assert.bnEqual(await option.totalBids(), newSupply);
            assert.bnEqual(await option.balanceOf(bidder), toUnit(0));
            assert.bnEqual(await option.totalSupply(), toUnit(0));

            // Refund remaining funds.
            await option.refund(bidder, newSupply, { from: market });
            assert.bnEqual(await option.bidOf(bidder), toBN(0));
            assert.bnEqual(await option.totalBids(), toBN(0));
            assert.bnEqual(await option.balanceOf(bidder), toBN(0));
            assert.bnEqual(await option.totalSupply(), toBN(0));
        });

        it('Refunds cannot be sent other than from the market.', async () => {
            const refund = toUnit(1);
            await assert.revert(option.refund(bidder, refund, { from: bidder }),
            "Permitted only for the market.");
        });
    });

    describe('Claiming Options', () => {
        it("Options can't be claimed until after the end of bidding.", async () => {
            await assert.revert(mockedOption.claimOptions({ from: bidder }), "Bidding must be complete.");
        });

        it("Options can be claimed after the end of bidding.", async () => {
            await fastForward(biddingTime * 2);
            const optionsOwed = await mockedOption.optionsOwedTo(bidder);
            await mockedOption.claimOptions({ from: bidder });
            assert.bnEqual(await mockedOption.balanceOf(bidder), optionsOwed);
        });

        it("Claiming options properly updates totals.", async () => {
            await fastForward(biddingTime * 2);

            const claimable = initialBid.mul(toBN(2));

            assert.bnEqual(await mockedOption.bidOf(bidder), initialBid);
            assert.bnEqual(await mockedOption.totalBids(), initialBid);
            assert.bnEqual(await mockedOption.optionsOwedTo(bidder), claimable);
            assert.bnEqual(await mockedOption.totalOptionsOwed(), claimable);
            assert.bnEqual(await mockedOption.balanceOf(bidder), toBN(0));
            assert.bnEqual(await mockedOption.totalSupply(), toBN(0));

            await mockedOption.claimOptions({ from: bidder });

            assert.bnEqual(await mockedOption.bidOf(bidder), toBN(0));
            assert.bnEqual(await mockedOption.totalBids(), toBN(0));
            assert.bnEqual(await mockedOption.optionsOwedTo(bidder), toBN(0));
            assert.bnEqual(await mockedOption.totalOptionsOwed(), toBN(0));
            assert.bnEqual(await mockedOption.balanceOf(bidder), claimable);
            assert.bnEqual(await mockedOption.totalSupply(), claimable);
        });

        it("Claiming options correctly emits Transfer event.", async () => {
            await fastForward(biddingTime * 2);
            const tx = await mockedOption.claimOptions({ from: bidder });
            const log = tx.logs[0];

            // Check that the minting transfer event is emitted properly.
            assert.equal(log.event, "Transfer");
            assert.equal(log.args.from, "0x" + "0".repeat(40));
            assert.equal(log.args.to, bidder);
            assert.bnEqual(log.args.value, initialBid.mul(toBN(2)));
        });

        it("Options owed is correctly computed.", async () => {
            const owed = initialBid.mul(toBN(2));

            assert.bnEqual(await mockedOption.optionsOwedTo(bidder), owed);
            assert.bnEqual(await mockedOption.totalOptionsOwed(), owed);
        });

        it("Price is reported from the market correctly.", async () => {
            assert.bnEqual(await mockedOption.price(), toUnit(0.5));
            await mockMarket.setSenderPrice(toUnit(0.25));
            assert.bnEqual(await mockedOption.price(), toUnit(0.25));
        });

    });

    describe('Transfers', () => {
        it('Cannot transfer tokens during bidding.', async () => {
            await assert.revert(mockedOption.transfer(recipient, toUnit(1), { from: bidder }),
            "Bidding must be complete.")
        });

        it('Can transfer tokens after the end of bidding.', async () => {
            await fastForward(biddingTime * 2);
            await mockedOption.claimOptions({ from: bidder });
            await mockedOption.transfer(recipient, toUnit(1), { from: bidder });
        });

        it('Transfers properly update balances', async () => {
            // Transfer partial quantity.
            await fastForward(biddingTime * 2);
            const claimableOptions = await mockedOption.optionsOwedTo(bidder);
            const half = claimableOptions.div(toBN(2));
            await mockedOption.claimOptions({from: bidder});
            await mockedOption.transfer(recipient, half, { from: bidder });

            // Check that balances have updated properly.
            assert.bnEqual(await mockedOption.balanceOf(bidder), initialBid);
            assert.bnEqual(await mockedOption.balanceOf(recipient), initialBid);

            // Transfer full balance.
            await mockedOption.transfer(bidder, half, { from: recipient });

            assert.bnEqual(await mockedOption.balanceOf(bidder), initialBid.mul(toBN(2)));
            assert.bnEqual(await mockedOption.balanceOf(recipient), toUnit(0));
            assert.bnEqual(await mockedOption.totalSupply(), initialBid.mul(toBN(2)));
        });

        it('Transfers properly emit events', async () => {
            // Transfer partial quantity.
            await fastForward(biddingTime * 2);
            await mockedOption.claimOptions({from: bidder});
            let tx = await mockedOption.transfer(recipient, toUnit(2.5), { from: bidder });

            // Check that event is emitted properly.
            let log = tx.logs[0];
            assert.equal(log.event, "Transfer");
            assert.equal(log.args.from, bidder);
            assert.equal(log.args.to, recipient);
            assert.bnEqual(log.args.value, toUnit(2.5));
        });

        it('Cannot transfer on insufficient balance', async () => {
            await fastForward(biddingTime * 2);
            await mockedOption.claimOptions({ from: bidder });
            await assert.revert(mockedOption.transfer(recipient, toUnit(1000), { from: bidder }), "Insufficient balance.");
        });

        it('Approvals properly update allowance values', async () => {
            await mockedOption.approve(recipient, toUnit(10), { from: bidder });
            assert.bnEqual(await mockedOption.allowance(bidder, recipient), toUnit(10));
        });

        it('Approvals properly emit events', async () => {
            const tx = await mockedOption.approve(recipient, toUnit(10), { from: bidder });

            let log = tx.logs[0];
            assert.equal(log.event, "Approval");
            assert.equal(log.args.owner, bidder);
            assert.equal(log.args.spender, recipient);
            assert.bnEqual(log.args.value, toUnit(10));
        });

        it('Cannot transferFrom tokens during bidding.', async () => {
            await mockedOption.approve(recipient, toUnit(10), { from: bidder });
            await assert.revert(mockedOption.transferFrom(bidder, recipient, toUnit(1), { from: recipient }),
            "Bidding must be complete.")
        });

        it('Can transferFrom tokens after the end of bidding.', async () => {
            await fastForward(biddingTime * 2);
            await mockedOption.claimOptions({ from: bidder });

            await mockedOption.approve(recipient, toUnit(10), { from: bidder });
            await mockedOption.transferFrom(bidder, recipient, toUnit(1), { from: recipient });
        });

        it('transferFrom properly updates balances', async () => {
            // Transfer partial quantity.
            await fastForward(biddingTime * 2);
            const claimableOptions = await mockedOption.optionsOwedTo(bidder);
            const half = claimableOptions.div(toBN(2));
            await mockedOption.claimOptions({from: bidder});

            await mockedOption.approve(recipient, toUnit(100), { from: bidder });
            await mockedOption.transferFrom(bidder, recipient, half, { from: recipient });

            // Check that balances have updated properly.
            assert.bnEqual(await mockedOption.balanceOf(bidder), initialBid);
            assert.bnEqual(await mockedOption.balanceOf(recipient), initialBid);

            // Transfer full balance.
            await mockedOption.transferFrom(bidder, recipient, half, { from: recipient });

            assert.bnEqual(await mockedOption.balanceOf(bidder), toUnit(0));
            assert.bnEqual(await mockedOption.balanceOf(recipient), initialBid.mul(toBN(2)));
            assert.bnEqual(await mockedOption.totalSupply(), initialBid.mul(toBN(2)));
        });

        it('Cannot transferFrom on insufficient balance', async () => {
            await fastForward(biddingTime * 2);
            await mockedOption.claimOptions({ from: bidder });

            await mockedOption.approve(recipient, toUnit(1000), { from: bidder });
            await assert.revert(mockedOption.transferFrom(bidder, recipient, toUnit(1000), { from: recipient }), "Insufficient balance.");
        });

        it('Cannot transferFrom on insufficient allowance', async () => {
            await fastForward(biddingTime * 2);
            await mockedOption.claimOptions({ from: bidder });

            await mockedOption.approve(recipient, toUnit(0.1), { from: bidder });
            await assert.revert(mockedOption.transferFrom(bidder, recipient, toUnit(1), { from: recipient }), "Insufficient allowance.");
        });

        it('transferFrom properly emits events', async () => {
            // Transfer partial quantity.
            await fastForward(biddingTime * 2);
            await mockedOption.claimOptions({ from: bidder });
            await mockedOption.approve(recipient, toUnit(100), { from: bidder });
            let tx = await mockedOption.transferFrom(bidder, recipient, toUnit(2.5), { from: recipient });

            // Check that event is emitted properly.
            let log = tx.logs[0];
            assert.equal(log.event, "Transfer");
            assert.equal(log.args.from, bidder);
            assert.equal(log.args.to, recipient);
            assert.bnEqual(log.args.value, toUnit(2.5));
        });
    });
});
