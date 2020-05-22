'use strict';

const { artifacts, contract, web3 } = require('@nomiclabs/buidler');
const { toBN } = web3.utils;

const { assert, addSnapshotBeforeRestoreAfterEach } = require('./common');
const { currentTime, fastForward, toUnit, fromUnit } = require('../utils')();

const MockBinaryOptionMarket = artifacts.require('MockBinaryOptionMarket');
const BinaryOption = artifacts.require('BinaryOption');

contract('BinaryOption', accounts => {
    const [account, bidder, recipient] = accounts;

    const biddingTime = 100;
    const initialBid = toUnit(5);

    let creationTime,
        market,
        option;

    before(async () => {
        market = await MockBinaryOptionMarket.new();
        await market.setSenderPrice(toUnit(0.5));
        creationTime = await currentTime();
        await market.deployOption(
            bidder,
            initialBid,
        );
        option = await BinaryOption.at(await market.binaryOption());
    });

    addSnapshotBeforeRestoreAfterEach();

    describe('Basic Parameters', () => {
        it('Static parameters are set properly', async () => {
            assert.equal(await option.name(), "SNX Binary Option");
            assert.equal(await option.symbol(), "sOPT");
            assert.bnEqual(await option.decimals(), toBN(18));
            assert.equal(await option.market(), market.address);
        });

        it('Initial bid details are recorded properly', async () => {
            assert.bnEqual(await option.bidOf(bidder), initialBid);
            assert.bnEqual(await option.totalBids(), initialBid);
        });
    });

    describe('Bids', () => {
        it('Can place bids during bidding.', async () => {
            await market.bid(bidder, toUnit(1));
            assert.bnEqual(await option.bidOf(bidder), initialBid.add(toUnit(1)));
        });

        it('Zero bids are idempotent.', async () => {
            await market.bid(bidder, toUnit(0));
            assert.bnEqual(await option.bidOf(bidder), initialBid);
        });

        it('Bids properly update totals.', async () => {
            // Existing bidder bids.
            const newBid = toUnit(1);
            const newSupply = initialBid.add(newBid);

            await market.bid(bidder, newBid);
            assert.bnEqual(await option.bidOf(bidder), newSupply);
            assert.bnEqual(await option.totalBids(), newSupply);
            assert.bnEqual(await option.balanceOf(bidder), toUnit(0));
            assert.bnEqual(await option.totalSupply(), toUnit(0));
            assert.bnEqual(await option.totalClaimable(), newSupply.mul(toBN(2)));
            assert.bnEqual(await option.totalExercisable(), newSupply.mul(toBN(2)));

            // New bidder bids.
            await market.bid(recipient, newBid);
            assert.bnEqual(await option.bidOf(recipient), newBid);
            assert.bnEqual(await option.totalBids(), newSupply.add(newBid));
            assert.bnEqual(await option.balanceOf(recipient), toUnit(0));
            assert.bnEqual(await option.totalSupply(), toUnit(0));
            assert.bnEqual(await option.totalClaimable(), newSupply.add(newBid).mul(toBN(2)));
            assert.bnEqual(await option.totalExercisable(), newSupply.add(newBid).mul(toBN(2)));
        });

        it('Bids cannot be sent other than from the market.', async () => {
            await assert.revert(option.bid(bidder, toUnit(1), { from: bidder }),
              "Permitted only for the market.");
        });
    });

    describe('Refunds', () => {
        it('Can process refunds during bidding.', async () => {
            await market.bid(bidder, toUnit(1));
            await market.refund(bidder, toUnit(1));
            assert.bnEqual(await option.bidOf(bidder), initialBid);
        });

        it('Zero refunds are idempotent.', async () => {
            await market.refund(bidder, toUnit(0));
            assert.bnEqual(await option.bidOf(bidder), initialBid);
        });

        it("Rejects refunds larger than the wallet's bid balance." , async () => {
            await market.bid(recipient, toUnit(1));
            await assert.revert(market.refund(recipient, toUnit(2)),
              "SafeMath: subtraction overflow");
        });

        it('Refunds properly update totals and price.', async () => {
            // Partial refund.
            const refund = toUnit(1);
            const newSupply = initialBid.sub(refund);
            await market.refund(bidder, refund);
            assert.bnEqual(await option.bidOf(bidder), newSupply);
            assert.bnEqual(await option.totalBids(), newSupply);
            assert.bnEqual(await option.balanceOf(bidder), toUnit(0));
            assert.bnEqual(await option.totalSupply(), toUnit(0));
            assert.bnEqual(await option.totalClaimable(), newSupply.mul(toBN(2)));
            assert.bnEqual(await option.totalExercisable(), newSupply.mul(toBN(2)));

            // Refund remaining funds.
            await market.refund(bidder, newSupply);
            assert.bnEqual(await option.bidOf(bidder), toBN(0));
            assert.bnEqual(await option.totalBids(), toBN(0));
            assert.bnEqual(await option.balanceOf(bidder), toBN(0));
            assert.bnEqual(await option.totalSupply(), toBN(0));
            assert.bnEqual(await option.totalClaimable(), toBN(0));
            assert.bnEqual(await option.totalExercisable(), toBN(0));
        });

        it('Refunds cannot be sent other than from the market.', async () => {
            const refund = toUnit(1);
            await assert.revert(option.refund(bidder, refund, { from: bidder }),
              "Permitted only for the market.");
        });
    });

    describe('Claiming Options', () => {
        it("Options can be claimed.", async () => {
            await fastForward(biddingTime * 2);

            const optionsOwed = await option.claimableBy(bidder);
            await market.claimOptions({ from: bidder });
            assert.bnEqual(await option.balanceOf(bidder), optionsOwed);

            await market.claimOptions({ from: account });
            assert.bnEqual(await option.balanceOf(account), toBN(0));
        });

        it("Options can only be claimed from the market.", async () => {
            await fastForward(biddingTime * 2);
            await assert.revert(option.claim(bidder, { from: bidder }), "Permitted only for the market.");
        });

        it("Claiming options properly updates totals.", async () => {
            await fastForward(biddingTime * 2);

            await market.bid(recipient, initialBid);

            const halfClaimable = initialBid.mul(toBN(2));
            const claimable = initialBid.mul(toBN(4));

            assert.bnEqual(await option.bidOf(bidder), initialBid);
            assert.bnEqual(await option.totalBids(), halfClaimable);
            assert.bnEqual(await option.claimableBy(bidder), halfClaimable);
            assert.bnEqual(await option.claimableBy(recipient), halfClaimable);
            assert.bnEqual(await option.totalClaimable(), claimable);
            assert.bnEqual(await option.balanceOf(bidder), toBN(0));
            assert.bnEqual(await option.balanceOf(recipient), toBN(0));
            assert.bnEqual(await option.totalSupply(), toBN(0));
            assert.bnEqual(await option.totalClaimable(), claimable);
            assert.bnEqual(await option.totalExercisable(), claimable);

            await market.claimOptions({ from: bidder });

            assert.bnEqual(await option.bidOf(bidder), toBN(0));
            assert.bnEqual(await option.totalBids(), initialBid);
            assert.bnEqual(await option.claimableBy(bidder), toBN(0));
            assert.bnEqual(await option.claimableBy(recipient), halfClaimable);
            assert.bnEqual(await option.totalClaimable(), halfClaimable);
            assert.bnEqual(await option.balanceOf(bidder), halfClaimable);
            assert.bnEqual(await option.balanceOf(recipient), toBN(0));
            assert.bnEqual(await option.totalSupply(), halfClaimable);
            assert.bnEqual(await option.totalClaimable(), halfClaimable);
            assert.bnEqual(await option.totalExercisable(), claimable);
        });

        it("Claiming options correctly emits events.", async () => {
            await fastForward(biddingTime * 2);
            const tx = await market.claimOptions({ from: bidder });
            const logs = BinaryOption.decodeLogs(tx.receipt.rawLogs);

            let log = logs[0];
            assert.equal(log.event, "Transfer");
            assert.equal(log.args.from, "0x" + "0".repeat(40));
            assert.equal(log.args.to, bidder);
            assert.bnEqual(log.args.value, initialBid.mul(toBN(2)));

            log = logs[1];
            assert.equal(log.event, "Issued");
            assert.equal(log.args.account, bidder);
            assert.bnEqual(log.args.value, initialBid.mul(toBN(2)));
        });

        it('Claims operate correctly if options have been transferred into an account already.', async () => {
            await market.bid(recipient, initialBid);
            await fastForward(biddingTime * 2);
            await market.claimOptions({ from: recipient });
            option.transfer(bidder, initialBid.mul(toBN(2)), { from: recipient });
            await market.claimOptions({ from: bidder });
            assert.bnEqual(await option.balanceOf(bidder), initialBid.mul(toBN(4)));
        });

        it("Options owed is correctly computed.", async () => {
            const owed = initialBid.mul(toBN(2));

            assert.bnEqual(await option.claimableBy(bidder), owed);
            assert.bnEqual(await option.totalClaimable(), owed);
        });

        it("Price is reported from the market correctly.", async () => {
            assert.bnEqual(await option.price(), toUnit(0.5));
            await market.setSenderPrice(toUnit(0.25));
            assert.bnEqual(await option.price(), toUnit(0.25));
        });
    });

    describe('Transfers', () => {
        it('Can transfer tokens.', async () => {
            await fastForward(biddingTime * 2);
            await market.claimOptions({ from: bidder });
            await option.transfer(recipient, toUnit(1), { from: bidder });
        });

        it('Transfers properly update balances', async () => {
            // Transfer partial quantity.
            await fastForward(biddingTime * 2);
            const claimableOptions = await option.claimableBy(bidder);
            const half = claimableOptions.div(toBN(2));
            await market.claimOptions({from: bidder});
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
            await market.claimOptions({from: bidder});
            let tx = await option.transfer(recipient, toUnit(2.5), { from: bidder });

            // Check that event is emitted properly.
            let log = tx.logs[0];
            assert.equal(log.event, "Transfer");
            assert.equal(log.args.from, bidder);
            assert.equal(log.args.to, recipient);
            assert.bnEqual(log.args.value, toUnit(2.5));
        });

        it('Cannot transfer on insufficient balance', async () => {
            await fastForward(biddingTime * 2);
            await market.claimOptions({ from: bidder });
            await assert.revert(option.transfer(recipient, toUnit(1000), { from: bidder }), "Insufficient balance.");
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

        it('Can transferFrom tokens.', async () => {
            await fastForward(biddingTime * 2);
            await market.claimOptions({ from: bidder });

            await option.approve(recipient, toUnit(10), { from: bidder });
            await option.transferFrom(bidder, recipient, toUnit(1), { from: recipient });
        });

        it('transferFrom properly updates balances', async () => {
            // Transfer partial quantity.
            await fastForward(biddingTime * 2);
            const claimableOptions = await option.claimableBy(bidder);
            const half = claimableOptions.div(toBN(2));
            await market.claimOptions({from: bidder});

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

        it('Cannot transferFrom on insufficient balance', async () => {
            await fastForward(biddingTime * 2);
            await market.claimOptions({ from: bidder });

            await option.approve(recipient, toUnit(1000), { from: bidder });
            await assert.revert(option.transferFrom(bidder, recipient, toUnit(1000), { from: recipient }), "Insufficient balance.");
        });

        it('Cannot transferFrom on insufficient allowance', async () => {
            await fastForward(biddingTime * 2);
            await market.claimOptions({ from: bidder });

            await option.approve(recipient, toUnit(0.1), { from: bidder });
            await assert.revert(option.transferFrom(bidder, recipient, toUnit(1), { from: recipient }), "Insufficient allowance.");
        });

        it('transferFrom properly emits events', async () => {
            // Transfer partial quantity.
            await fastForward(biddingTime * 2);
            await market.claimOptions({ from: bidder });
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

    describe('Exercising Options', () => {
        it('Exercising options updates balances properly', async () => {
            await fastForward(biddingTime * 2);

            await market.bid(recipient, initialBid);

            const optionsOwed = await option.claimableBy(bidder);
            await market.claimOptions({ from: bidder });
            const totalSupply = await option.totalSupply();
            const totalClaimable = await option.totalClaimable();
            const totalExercisable = await option.totalExercisable();

            await market.exerciseOptions({ from: bidder });

            assert.bnEqual(await option.balanceOf(bidder), toBN(0));
            assert.bnEqual(await option.totalSupply(), totalSupply.sub(optionsOwed));
            assert.bnEqual(await option.totalClaimable(), totalClaimable);
            assert.bnEqual(await option.totalExercisable(), totalExercisable.sub(optionsOwed));
        });

        it('Exercising options with no balance does nothing.', async () => {
            await fastForward(biddingTime * 2);
            const totalSupply = await option.totalSupply();
            await market.claimOptions({ from: account });
            const tx = await market.exerciseOptions({ from: account });
            assert.bnEqual(await option.balanceOf(account), toBN(0));
            assert.bnEqual(await option.totalSupply(), totalSupply);
            assert.equal(tx.logs.length, 0);
            assert.equal(tx.receipt.rawLogs.length, 0);
        });

        it('Exercising options emits the proper events.', async () => {
            await fastForward(biddingTime * 2);
            const optionsOwed = await option.claimableBy(bidder);
            await market.claimOptions({ from: bidder });
            const tx = await market.exerciseOptions({ from: bidder });

            const logs = BinaryOption.decodeLogs(tx.receipt.rawLogs);
            assert.equal(logs[0].event, "Transfer");
            assert.equal(logs[0].args.from, bidder);
            assert.equal(logs[0].args.to, "0x" + "0".repeat(40));
            assert.bnEqual(logs[0].args.value, optionsOwed);
            assert.equal(logs[1].event, "Burned");
            assert.equal(logs[1].args.account, bidder);
            assert.bnEqual(logs[1].args.value, optionsOwed);
        });
    });

    describe('Destruction', () => {
        it('Binary option can be destroyed', async () => {
            const address = option.address;
            await market.destroyOption(bidder);
            assert.equal(await web3.eth.getCode(address), '0x')
        });

        it('Binary option can only be destroyed by its parent', async () => {
            await assert.revert(option.selfDestruct(bidder, { from: bidder }),
              "Permitted only for the market.");
        });
    });
});
