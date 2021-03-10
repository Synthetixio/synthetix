'use strict';

const { artifacts, contract, web3 } = require('hardhat');
const { toBN } = web3.utils;

const { assert, addSnapshotBeforeRestoreAfterEach } = require('./common');
const { fastForward, toUnit } = require('../utils')();

const { ensureOnlyExpectedMutativeFunctions, onlyGivenAddressCanInvoke } = require('./helpers');

let MockBinaryOptionMarket;
let BinaryOption;

const ZERO_ADDRESS = '0x' + '0'.repeat(40);

contract('BinaryOption @gas-skip @ovm-skip', accounts => {
	const [account, bidder, recipient] = accounts;

	const biddingTime = 100;
	const initialBid = toUnit(5);

	let market, option;

	before(async () => {
		MockBinaryOptionMarket = artifacts.require('MockBinaryOptionMarket');
		BinaryOption = artifacts.require('BinaryOption');

		market = await MockBinaryOptionMarket.new();
		await Promise.all([
			market.setSenderPrice(toUnit(0.5)),
			market.setDeposited(initialBid.mul(toBN(2))), // Simulate a bid on the other side of the market.
			market.deployOption(bidder, initialBid),
		]);
		option = await BinaryOption.at(await market.binaryOption());
	});

	addSnapshotBeforeRestoreAfterEach();

	async function assertAllPromises(promises, expected, assertion, assertionName) {
		if (promises.length !== expected.length) {
			throw new Error('Promise and expected result arrays differ in length.');
		}

		const nameString = assertionName ? `'${assertionName}' ` : '';
		const results = await Promise.all(promises);
		results.forEach((r, i) =>
			assertion(r, expected[i], `Assertion ${nameString}at index ${i} failed.`)
		);
	}

	async function assertAllBnEqual(promises, expected) {
		return assertAllPromises(promises, expected, assert.bnEqual, 'bnEqual');
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
					'expire',
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

		it('Bids less than one cent fail.', async () => {
			await assert.revert(market.bid(recipient, toUnit(0.0099)), 'Balance < $0.01');
		});

		it('Bids properly update totals.', async () => {
			// Existing bidder bids.
			const newBid = toUnit(1);
			let newSupply = initialBid.add(newBid);
			let newClaimable = newSupply.mul(toBN(2));
			await market.bid(bidder, newBid);

			await assertAllBnEqual(
				[
					option.bidOf(bidder),
					option.totalBids(),
					option.balanceOf(bidder),
					option.totalSupply(),
					option.totalClaimableSupply(),
				],
				[newSupply, newSupply, toUnit(0), toUnit(0), newClaimable]
			);

			// New bidder bids.
			newSupply = newSupply.add(newBid);
			newClaimable = newSupply.mul(toBN(2));
			await market.bid(recipient, newBid);

			await assertAllBnEqual(
				[
					option.bidOf(recipient),
					option.totalBids(),
					option.balanceOf(recipient),
					option.totalSupply(),
					option.totalClaimableSupply(),
				],
				[newBid, newSupply, toUnit(0), toUnit(0), newClaimable]
			);
		});

		it('Bids cannot be sent other than from the market.', async () => {
			await onlyGivenAddressCanInvoke({
				fnc: option.bid,
				args: [bidder, toUnit(1)],
				accounts,
				skipPassCheck: true,
				reason: 'Only market allowed',
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

		it('Refunds resulting in a balance less than one cent fail.', async () => {
			await assert.revert(market.refund(bidder, initialBid.sub(toUnit(0.0099))), 'Balance < $0.01');
		});

		it('Refunds properly update totals and price.', async () => {
			// Partial refund.
			const refund = toUnit(1);
			const newSupply = initialBid.sub(refund);
			const newClaimable = newSupply.mul(toBN(2));

			await market.refund(bidder, refund);
			await assertAllBnEqual(
				[
					option.bidOf(bidder),
					option.totalBids(),
					option.balanceOf(bidder),
					option.totalSupply(),
					option.totalClaimableSupply(),
				],
				[newSupply, newSupply, toBN(0), toBN(0), newClaimable]
			);

			// Refund remaining funds.
			await market.refund(bidder, newSupply);
			await assertAllBnEqual(
				[
					option.bidOf(bidder),
					option.totalBids(),
					option.balanceOf(bidder),
					option.totalSupply(),
					option.totalClaimableSupply(),
				],
				[toBN(0), toBN(0), toBN(0), toBN(0), toBN(0)]
			);
		});

		it('Refunds cannot be sent other than from the market.', async () => {
			await onlyGivenAddressCanInvoke({
				fnc: option.refund,
				args: [bidder, toUnit(1)],
				accounts,
				skipPassCheck: true,
				reason: 'Only market allowed',
			});
		});
	});

	describe('Claiming Options', () => {
		it('Options can be claimed.', async () => {
			await fastForward(biddingTime * 2);

			const optionsOwed = await option.claimableBalanceOf(bidder);
			await market.claimOptions({ from: bidder });
			assert.bnEqual(await option.balanceOf(bidder), optionsOwed);

			// Ensure that users with no bids can't claim anything.
			await market.claimOptions({ from: account });
			assert.bnEqual(await option.balanceOf(account), toBN(0));
		});

		it('Options can only be claimed from the market.', async () => {
			const { price, _deposited } = await market.senderPriceAndExercisableDeposits();

			await onlyGivenAddressCanInvoke({
				fnc: option.claim,
				args: [bidder, price, _deposited],
				accounts,
				skipPassCheck: true,
				reason: 'Only market allowed',
			});
		});

		it('Claiming options properly updates totals.', async () => {
			await fastForward(biddingTime * 2);

			await market.bid(recipient, initialBid);
			// And we will assume some mysterious other person bid on the other side to keep the price balanced.
			await market.setDeposited(initialBid.mul(toBN(4)));

			const halfClaimable = initialBid.mul(toBN(2));
			const claimable = initialBid.mul(toBN(4));

			await assertAllBnEqual(
				[
					option.bidOf(bidder),
					option.totalBids(),
					option.claimableBalanceOf(bidder),
					option.claimableBalanceOf(recipient),
					option.totalClaimableSupply(),
					option.balanceOf(bidder),
					option.balanceOf(recipient),
					option.totalSupply(),
				],
				[
					initialBid,
					initialBid.mul(toBN(2)),
					halfClaimable,
					halfClaimable,
					claimable,
					toBN(0),
					toBN(0),
					toBN(0),
				]
			);

			await market.claimOptions({ from: bidder });

			await assertAllBnEqual(
				[
					option.bidOf(bidder),
					option.totalBids(),
					option.claimableBalanceOf(bidder),
					option.claimableBalanceOf(recipient),
					option.totalClaimableSupply(),
					option.balanceOf(bidder),
					option.balanceOf(recipient),
					option.totalSupply(),
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
				]
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

			await assertAllBnEqual(
				[option.claimableBalanceOf(bidder), option.totalClaimableSupply()],
				[owed, owed]
			);
		});

		it('No options are owed if the supply is zero.', async () => {
			await market.setDeposited(toBN(0));

			await assertAllBnEqual(
				[option.claimableBalanceOf(bidder), option.totalClaimableSupply()],
				[toBN(0), toBN(0)]
			);
		});

		it('Options claimable properly handles subtracted rounding dust for the last claimant.', async () => {
			const dust = toBN(10);

			// Two bidders
			await market.bid(recipient, initialBid);

			// Subtract a bit of rounding dust from the total deposits.
			const depositedMinusDust = initialBid.mul(toBN(4)).sub(dust);
			await market.setDeposited(depositedMinusDust);

			// Total claimable equals the deposited quantity.
			assert.bnEqual(await option.totalClaimableSupply(), depositedMinusDust);

			// The recipient can claim their full quantity.
			assert.bnEqual(await option.claimableBalanceOf(recipient), initialBid.mul(toBN(2)));
			await market.claimOptions({ from: recipient });

			// But the last bidder eats the loss due to dust.
			assert.bnEqual(await option.totalClaimableSupply(), initialBid.mul(toBN(2)).sub(dust));
			assert.bnEqual(await option.claimableBalanceOf(bidder), initialBid.mul(toBN(2)).sub(dust));

			await market.claimOptions({ from: bidder });
			assert.bnEqual(await option.totalClaimableSupply(), toBN(0));
			assert.bnEqual(await option.balanceOf(bidder), initialBid.mul(toBN(2)).sub(dust));
		});

		it('Options claimable properly handles subtracted rounding dust if previous claimants exercise first.', async () => {
			const dust = toBN(10);

			// Two bidders
			await market.bid(recipient, initialBid);

			// Subtract a bit of rounding dust from the total deposits.
			const depositedMinusDust = initialBid.mul(toBN(4)).sub(dust);
			await market.setDeposited(depositedMinusDust);

			// Total claimable equals the deposited quantity.
			assert.bnEqual(await option.totalClaimableSupply(), depositedMinusDust);

			// The recipient can claim their full quantity.
			assert.bnEqual(await option.claimableBalanceOf(recipient), initialBid.mul(toBN(2)));
			await market.claimOptions({ from: recipient });
			await market.exerciseOptions({ from: recipient });

			// But the last bidder eats the loss due to dust.
			assert.bnEqual(await option.totalClaimableSupply(), initialBid.mul(toBN(2)).sub(dust));
			assert.bnEqual(await option.claimableBalanceOf(bidder), initialBid.mul(toBN(2)).sub(dust));

			await market.claimOptions({ from: bidder });
			assert.bnEqual(await option.totalClaimableSupply(), toBN(0));
			assert.bnEqual(await option.balanceOf(bidder), initialBid.mul(toBN(2)).sub(dust));
		});

		it('Options claimable properly handles added rounding dust for the last claimant.', async () => {
			const dust = toBN(10);

			// Two bidders
			await market.bid(recipient, initialBid);

			// Add a bit of rounding dust from the total deposits.
			const depositedPlusDust = initialBid.mul(toBN(4)).add(dust);
			await market.setDeposited(depositedPlusDust);

			// Total claimable equals the deposited quantity.
			assert.bnEqual(await option.totalClaimableSupply(), depositedPlusDust);

			// The recipient can claim their full quantity.
			assert.bnEqual(await option.claimableBalanceOf(recipient), initialBid.mul(toBN(2)));
			await market.claimOptions({ from: recipient });
			await market.exerciseOptions({ from: recipient });

			// But the last bidder gets the extra dust.
			assert.bnEqual(await option.totalClaimableSupply(), initialBid.mul(toBN(2)).add(dust));
			assert.bnEqual(await option.claimableBalanceOf(bidder), initialBid.mul(toBN(2)).add(dust));

			await market.claimOptions({ from: bidder });
			assert.bnEqual(await option.totalClaimableSupply(), toBN(0));
			assert.bnEqual(await option.balanceOf(bidder), initialBid.mul(toBN(2)).add(dust));
		});

		it('Option claiming fails when claimable balance is higher than the remaining supply.', async () => {
			// Two bidders
			await market.bid(recipient, toUnit(0.5));
			// Ensure there's insufficient balance.
			await market.setDeposited(toUnit(1));
			await assert.revert(option.claimableBalanceOf(bidder), 'supply < claimable');
			await assert.revert(market.claimOptions({ from: bidder }), 'supply < claimable');
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
			const claimableOptions = await option.claimableBalanceOf(bidder);
			const half = claimableOptions.div(toBN(2));
			await market.claimOptions({ from: bidder });
			await option.transfer(recipient, half, { from: bidder });

			// Check that balances have updated properly.
			await assertAllBnEqual(
				[option.balanceOf(bidder), option.balanceOf(recipient)],
				[initialBid, initialBid]
			);

			// Transfer full balance.
			await option.transfer(bidder, half, { from: recipient });
			await assertAllBnEqual(
				[option.balanceOf(bidder), option.balanceOf(recipient), option.totalSupply()],
				[initialBid.mul(toBN(2)), toBN(0), initialBid.mul(toBN(2))]
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
				'Insufficient balance'
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
			const claimableOptions = await option.claimableBalanceOf(bidder);
			const half = claimableOptions.div(toBN(2));
			await market.claimOptions({ from: bidder });

			await option.approve(recipient, toUnit(100), { from: bidder });
			await option.transferFrom(bidder, recipient, half, { from: recipient });

			// Check that balances have updated properly.
			await assertAllBnEqual(
				[option.balanceOf(bidder), option.balanceOf(recipient)],
				[initialBid, initialBid]
			);

			// Transfer full balance.
			await option.transferFrom(bidder, recipient, half, { from: recipient });
			await assertAllBnEqual(
				[option.balanceOf(bidder), option.balanceOf(recipient), option.totalSupply()],
				[toBN(0), initialBid.mul(toBN(2)), initialBid.mul(toBN(2))]
			);
		});

		it('Cannot transferFrom on insufficient balance', async () => {
			await fastForward(biddingTime * 2);
			await market.claimOptions({ from: bidder });

			await option.approve(recipient, toUnit(1000), { from: bidder });
			await assert.revert(
				option.transferFrom(bidder, recipient, toUnit(1000), { from: recipient }),
				'Insufficient balance'
			);
		});

		it('Cannot transferFrom on insufficient allowance', async () => {
			await fastForward(biddingTime * 2);
			await market.claimOptions({ from: bidder });

			await option.approve(recipient, toUnit(0.1), { from: bidder });
			await assert.revert(
				option.transferFrom(bidder, recipient, toUnit(1), { from: recipient }),
				'Insufficient allowance'
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

		it('Transfers and approvals cannot go to invalid addresses.', async () => {
			await assert.revert(option.transfer(ZERO_ADDRESS, toBN(0)), 'Invalid address');
			await assert.revert(
				option.transferFrom(ZERO_ADDRESS, ZERO_ADDRESS, toBN(0)),
				'Invalid address'
			);
			await assert.revert(option.approve(ZERO_ADDRESS, toBN(100)));
		});
	});

	describe('Exercising Options', () => {
		it('Exercising options updates balances properly', async () => {
			await fastForward(biddingTime * 2);

			await market.bid(recipient, initialBid);
			// And we will assume some mysterious other person bid on the other side to keep the price balanced.
			await market.setDeposited(initialBid.mul(toBN(4)));

			const optionsOwed = await option.claimableBalanceOf(bidder);
			await market.claimOptions({ from: bidder });
			const [totalSupply, totalClaimable] = await Promise.all([
				option.totalSupply(),
				option.totalClaimableSupply(),
			]);

			await market.exerciseOptions({ from: bidder });
			await assertAllBnEqual(
				[option.balanceOf(bidder), option.totalSupply(), option.totalClaimableSupply()],
				[toBN(0), totalSupply.sub(optionsOwed), totalClaimable]
			);
		});

		it('Exercising options with no balance does nothing.', async () => {
			await fastForward(biddingTime * 2);
			const totalSupply = await option.totalSupply();
			await market.claimOptions({ from: account });
			const tx = await market.exerciseOptions({ from: account });
			assertAllBnEqual([option.balanceOf(account), option.totalSupply()], [toBN(0), totalSupply]);
			assert.equal(tx.logs.length, 0);
			assert.equal(tx.receipt.rawLogs.length, 0);
		});

		it('Exercising options emits the proper events.', async () => {
			await fastForward(biddingTime * 2);
			const optionsOwed = await option.claimableBalanceOf(bidder);
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
				reason: 'Only market allowed',
			});
		});
	});

	describe('Destruction', () => {
		it('Binary option can be destroyed', async () => {
			const address = option.address;
			await market.expireOption(bidder);
			assert.equal(await web3.eth.getCode(address), '0x');
		});

		it('Binary option can only be destroyed by its parent market', async () => {
			await onlyGivenAddressCanInvoke({
				fnc: option.expire,
				args: [bidder],
				accounts,
				skipPassCheck: true,
				reason: 'Only market allowed',
			});
		});
	});
});
