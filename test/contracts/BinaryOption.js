'use strict';

const { artifacts, contract, web3 } = require('@nomiclabs/buidler');
const { toBN } = web3.utils;

const { assert, addSnapshotBeforeRestoreAfterEach } = require('./common');
const { fastForward, toUnit } = require('../utils')();

const { ensureOnlyExpectedMutativeFunctions, onlyGivenAddressCanInvoke } = require('./helpers');

const MockBinaryOptionMarket = artifacts.require('MockBinaryOptionMarket');
const BinaryOption = artifacts.require('BinaryOption');

const ZERO_ADDRESS = '0x' + '0'.repeat(40);

contract('BinaryOption', accounts => {
	const [account, bidder, recipient] = accounts;

	const biddingTime = 100;
	const initialBid = toUnit(5);

	let market, option;

	before(async () => {
		market = await MockBinaryOptionMarket.new();
		await Promise.all([
			market.setSenderPrice(toUnit(0.5)),
			market.deployOption(bidder, initialBid),
		]);
		option = await BinaryOption.at(await market.binaryOption());
	});

	addSnapshotBeforeRestoreAfterEach();

	async function assertAllPromises(promises, expected, assertion) {
		if (promises.length !== expected.length) {
			throw new Error('Promise and expected result arrays differ in length.');
		}
		const results = await Promise.all(promises);
		results.forEach((r, i) => assertion(r, expected[i]));
	}

	describe('Basic Parameters', () => {
		it('Static parameters are set properly', async () => {
			assert.equal(await option.name(), 'SNX Binary Option');
			assert.equal(await option.symbol(), 'sOPT');
			assert.bnEqual(await option.decimals(), toBN(18));
			assert.equal(await option.market(), market.address);
		});

		it('Initial bid details are recorded properly', async () => {
			assert.bnEqual(await option.bidOf(bidder), initialBid);
			assert.bnEqual(await option.totalBids(), initialBid);
		});

		it('Only expected functions are mutative', async () => {
			ensureOnlyExpectedMutativeFunctions({
				abi: option.abi,
				expected: [
					'bid',
					'refund',
					'claim',
					'exercise',
					'selfDestruct',
					'transfer',
					'transferFrom',
					'approve',
				],
			});
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
			let newSupply = initialBid.add(newBid);
			let newClaimable = newSupply.mul(toBN(2));
			await market.bid(bidder, newBid);

			await assertAllPromises(
				[
					option.bidOf(bidder),
					option.totalBids(),
					option.balanceOf(bidder),
					option.totalSupply(),
					option.totalClaimable(),
					option.totalExercisable(),
				],
				[newSupply, newSupply, toUnit(0), toUnit(0), newClaimable, newClaimable],
				assert.bnEqual
			);

			// New bidder bids.
			await market.bid(recipient, newBid);
			newSupply = newSupply.add(newBid);
			newClaimable = newSupply.mul(toBN(2));

			await assertAllPromises(
				[
					option.bidOf(recipient),
					option.totalBids(),
					option.balanceOf(recipient),
					option.totalSupply(),
					option.totalClaimable(),
					option.totalExercisable(),
				],
				[newBid, newSupply, toUnit(0), toUnit(0), newClaimable, newClaimable],
				assert.bnEqual
			);
		});

		it('Bids cannot be sent other than from the market.', async () => {
			await onlyGivenAddressCanInvoke({
				fnc: option.bid,
				args: [bidder, toUnit(1)],
				accounts,
				skipPassCheck: true,
				reason: 'Permitted only for the market.',
			});
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

		it("Rejects refunds larger than the wallet's bid balance.", async () => {
			await market.bid(recipient, toUnit(1));
			await assert.revert(market.refund(recipient, toUnit(2)), 'SafeMath: subtraction overflow');
		});

		it('Refunds properly update totals and price.', async () => {
			// Partial refund.
			const refund = toUnit(1);
			const newSupply = initialBid.sub(refund);
			const newClaimable = newSupply.mul(toBN(2));

			await market.refund(bidder, refund);
			await assertAllPromises(
				[
					option.bidOf(bidder),
					option.totalBids(),
					option.balanceOf(bidder),
					option.totalSupply(),
					option.totalClaimable(),
					option.totalExercisable(),
				],
				[newSupply, newSupply, toBN(0), toBN(0), newClaimable, newClaimable],
				assert.bnEqual
			);

			// Refund remaining funds.
			await market.refund(bidder, newSupply);
			await assertAllPromises(
				[
					option.bidOf(bidder),
					option.totalBids(),
					option.balanceOf(bidder),
					option.totalSupply(),
					option.totalClaimable(),
					option.totalExercisable(),
				],
				[toBN(0), toBN(0), toBN(0), toBN(0), toBN(0), toBN(0)],
				assert.bnEqual
			);
		});

		it('Refunds cannot be sent other than from the market.', async () => {
			await onlyGivenAddressCanInvoke({
				fnc: option.refund,
				args: [bidder, toUnit(1)],
				accounts,
				skipPassCheck: true,
				reason: 'Permitted only for the market.',
			});
		});
	});

	describe('Claiming Options', () => {
		it('Options can be claimed.', async () => {
			await fastForward(biddingTime * 2);

			const optionsOwed = await option.claimableBy(bidder);
			await market.claimOptions({ from: bidder });
			assert.bnEqual(await option.balanceOf(bidder), optionsOwed);

			await market.claimOptions({ from: account });
			assert.bnEqual(await option.balanceOf(account), toBN(0));
		});

		it('Options can only be claimed from the market.', async () => {
			await onlyGivenAddressCanInvoke({
				fnc: option.claim,
				args: [bidder],
				accounts,
				skipPassCheck: true,
				reason: 'Permitted only for the market.',
			});
		});

		it('Claiming options properly updates totals.', async () => {
			await fastForward(biddingTime * 2);

			await market.bid(recipient, initialBid);

			const halfClaimable = initialBid.mul(toBN(2));
			const claimable = initialBid.mul(toBN(4));

			await assertAllPromises(
				[
					option.bidOf(bidder),
					option.totalBids(),
					option.claimableBy(bidder),
					option.claimableBy(recipient),
					option.totalClaimable(),
					option.balanceOf(bidder),
					option.balanceOf(recipient),
					option.totalSupply(),
					option.totalExercisable(),
				],
				[
					initialBid,
					halfClaimable,
					halfClaimable,
					halfClaimable,
					claimable,
					toBN(0),
					toBN(0),
					toBN(0),
					claimable,
				],
				assert.bnEqual
			);

			await market.claimOptions({ from: bidder });

			await assertAllPromises(
				[
					option.bidOf(bidder),
					option.totalBids(),
					option.claimableBy(bidder),
					option.claimableBy(recipient),
					option.totalClaimable(),
					option.balanceOf(bidder),
					option.balanceOf(recipient),
					option.totalSupply(),
					option.totalExercisable(),
				],
				[
					toBN(0),
					initialBid,
					toBN(0),
					halfClaimable,
					halfClaimable,
					halfClaimable,
					toBN(0),
					halfClaimable,
					claimable,
				],
				assert.bnEqual
			);
		});

		it('Claiming options correctly emits events.', async () => {
			await fastForward(biddingTime * 2);
			const tx = await market.claimOptions({ from: bidder });
			const logs = BinaryOption.decodeLogs(tx.receipt.rawLogs);

			assert.eventEqual(logs[0], 'Transfer', {
				from: ZERO_ADDRESS,
				to: bidder,
				value: initialBid.mul(toBN(2)),
			});

			assert.eventEqual(logs[1], 'Issued', {
				account: bidder,
				value: initialBid.mul(toBN(2)),
			});
		});

		it('Claims operate correctly if options have been transferred into an account already.', async () => {
			await market.bid(recipient, initialBid);
			await fastForward(biddingTime * 2);
			await market.claimOptions({ from: recipient });
			option.transfer(bidder, initialBid.mul(toBN(2)), { from: recipient });
			await market.claimOptions({ from: bidder });
			assert.bnEqual(await option.balanceOf(bidder), initialBid.mul(toBN(4)));
		});

		it('Options owed is correctly computed.', async () => {
			const owed = initialBid.mul(toBN(2));

			await assertAllPromises(
				[option.claimableBy(bidder), option.totalClaimable()],
				[owed, owed],
				assert.bnEqual
			);
		});

		it('Price is reported from the market correctly.', async () => {
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
			await market.claimOptions({ from: bidder });
			await option.transfer(recipient, half, { from: bidder });

			// Check that balances have updated properly.
			await assertAllPromises(
				[option.balanceOf(bidder), option.balanceOf(recipient)],
				[initialBid, initialBid],
				assert.bnEqual
			);

			// Transfer full balance.
			await option.transfer(bidder, half, { from: recipient });
			await assertAllPromises(
				[option.balanceOf(bidder), option.balanceOf(recipient), option.totalSupply()],
				[initialBid.mul(toBN(2)), toBN(0), initialBid.mul(toBN(2))],
				assert.bnEqual
			);
		});

		it('Transfers properly emit events', async () => {
			// Transfer partial quantity.
			await fastForward(biddingTime * 2);
			await market.claimOptions({ from: bidder });
			const tx = await option.transfer(recipient, toUnit(2.5), { from: bidder });

			assert.eventEqual(tx.logs[0], 'Transfer', {
				from: bidder,
				to: recipient,
				value: toUnit(2.5),
			});
		});

		it('Cannot transfer on insufficient balance', async () => {
			await fastForward(biddingTime * 2);
			await market.claimOptions({ from: bidder });
			await assert.revert(
				option.transfer(recipient, toUnit(1000), { from: bidder }),
				'Insufficient balance.'
			);
		});

		it('Approvals properly update allowance values', async () => {
			await option.approve(recipient, toUnit(10), { from: bidder });
			assert.bnEqual(await option.allowance(bidder, recipient), toUnit(10));
		});

		it('Approvals properly emit events', async () => {
			const tx = await option.approve(recipient, toUnit(10), { from: bidder });

			assert.eventEqual(tx.logs[0], 'Approval', {
				owner: bidder,
				spender: recipient,
				value: toUnit(10),
			});
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
			await market.claimOptions({ from: bidder });

			await option.approve(recipient, toUnit(100), { from: bidder });
			await option.transferFrom(bidder, recipient, half, { from: recipient });

			// Check that balances have updated properly.
			await assertAllPromises(
				[option.balanceOf(bidder), option.balanceOf(recipient)],
				[initialBid, initialBid],
				assert.bnEqual
			);

			// Transfer full balance.
			await option.transferFrom(bidder, recipient, half, { from: recipient });
			await assertAllPromises(
				[option.balanceOf(bidder), option.balanceOf(recipient), option.totalSupply()],
				[toBN(0), initialBid.mul(toBN(2)), initialBid.mul(toBN(2))],
				assert.bnEqual
			);
		});

		it('Cannot transferFrom on insufficient balance', async () => {
			await fastForward(biddingTime * 2);
			await market.claimOptions({ from: bidder });

			await option.approve(recipient, toUnit(1000), { from: bidder });
			await assert.revert(
				option.transferFrom(bidder, recipient, toUnit(1000), { from: recipient }),
				'Insufficient balance.'
			);
		});

		it('Cannot transferFrom on insufficient allowance', async () => {
			await fastForward(biddingTime * 2);
			await market.claimOptions({ from: bidder });

			await option.approve(recipient, toUnit(0.1), { from: bidder });
			await assert.revert(
				option.transferFrom(bidder, recipient, toUnit(1), { from: recipient }),
				'Insufficient allowance.'
			);
		});

		it('transferFrom properly emits events', async () => {
			// Transfer partial quantity.
			await fastForward(biddingTime * 2);
			await market.claimOptions({ from: bidder });
			await option.approve(recipient, toUnit(100), { from: bidder });
			const tx = await option.transferFrom(bidder, recipient, toUnit(2.5), { from: recipient });

			assert.eventEqual(tx.logs[0], 'Transfer', {
				from: bidder,
				to: recipient,
				value: toUnit(2.5),
			});
		});
	});

	describe('Exercising Options', () => {
		it('Exercising options updates balances properly', async () => {
			await fastForward(biddingTime * 2);

			await market.bid(recipient, initialBid);

			const optionsOwed = await option.claimableBy(bidder);
			await market.claimOptions({ from: bidder });
			const [totalSupply, totalClaimable, totalExercisable] = await Promise.all([
				option.totalSupply(),
				option.totalClaimable(),
				option.totalExercisable(),
			]);

			await market.exerciseOptions({ from: bidder });
			await assertAllPromises(
				[
					option.balanceOf(bidder),
					option.totalSupply(),
					option.totalClaimable(),
					option.totalExercisable(),
				],
				[toBN(0), totalSupply.sub(optionsOwed), totalClaimable, totalExercisable.sub(optionsOwed)],
				assert.bnEqual
			);
		});

		it('Exercising options with no balance does nothing.', async () => {
			await fastForward(biddingTime * 2);
			const totalSupply = await option.totalSupply();
			await market.claimOptions({ from: account });
			const tx = await market.exerciseOptions({ from: account });
			assertAllPromises(
				[option.balanceOf(account), option.totalSupply()],
				[toBN(0), totalSupply],
				assert.bnEqual
			);
			assert.equal(tx.logs.length, 0);
			assert.equal(tx.receipt.rawLogs.length, 0);
		});

		it('Exercising options emits the proper events.', async () => {
			await fastForward(biddingTime * 2);
			const optionsOwed = await option.claimableBy(bidder);
			await market.claimOptions({ from: bidder });
			const tx = await market.exerciseOptions({ from: bidder });

			const logs = BinaryOption.decodeLogs(tx.receipt.rawLogs);
			assert.eventEqual(logs[0], 'Transfer', {
				from: bidder,
				to: ZERO_ADDRESS,
				value: optionsOwed,
			});

			assert.eventEqual(logs[1], 'Burned', {
				account: bidder,
				value: optionsOwed,
			});
		});

		it('Options can only be exercised from the market.', async () => {
			await onlyGivenAddressCanInvoke({
				fnc: option.exercise,
				args: [bidder],
				accounts,
				skipPassCheck: true,
				reason: 'Permitted only for the market.',
			});
		});
	});

	describe('Destruction', () => {
		it('Binary option can be destroyed', async () => {
			const address = option.address;
			await market.destroyOption(bidder);
			assert.equal(await web3.eth.getCode(address), '0x');
		});

		it('Binary option can only be destroyed by its parent market', async () => {
			await onlyGivenAddressCanInvoke({
				fnc: option.selfDestruct,
				args: [bidder],
				accounts,
				skipPassCheck: true,
				reason: 'Permitted only for the market.',
			});
		});
	});
});
