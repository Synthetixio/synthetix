'use strict';

const { artifacts } = require('@nomiclabs/buidler');

const { toBytes32 } = require('../..');

const VirtualSynth = artifacts.require('VirtualSynth');

module.exports = {
	whenInstantiated({ amount, user, synth = 'sETH' }, cb) {
		describe(`when instantiated for user ${user.slice(0, 7)}`, () => {
			beforeEach(async () => {
				this.mocks.Synth.smocked.currencyKey.will.return.with(toBytes32(synth));

				this.instance = await VirtualSynth.new(
					this.mocks.Synth.address,
					this.resolver.address,
					user,
					amount
				);
			});
			cb();
		});
	},
	whenMockedSynthBalance({ balanceOf }, cb) {
		describe(`when the synth has been mocked to show balance for the vSynth as ${balanceOf}`, () => {
			beforeEach(async () => {
				this.mocks.Synth.smocked.balanceOf.will.return.with(acc =>
					acc === this.instance.address ? balanceOf : '0'
				);
			});
			cb();
		});
	},
	whenUserTransfersAwayTokens({ amount, from }, cb) {
		describe(`when the user transfers away ${amount} of their vSynths`, () => {
			beforeEach(async () => {
				await this.instance.transfer(this.instance.address, amount.toString(), {
					from,
				});
			});
			cb();
		});
	},
	whenMockedSettlementOwing({ reclaim = 0, rebate = 0, numEntries = 1 }, cb) {
		describe(`when settlement owing shows a ${reclaim} reclaim, ${rebate} rebate and ${numEntries} numEntries`, () => {
			beforeEach(async () => {
				this.mocks.Exchanger.smocked.settlementOwing.will.return.with([
					reclaim,
					rebate,
					numEntries,
				]);
			});
			cb();
		});
	},
	whenSettlementCalled({ user }, cb) {
		describe(`when settlement is invoked for user ${user.slice(0, 7)}`, () => {
			beforeEach(async () => {
				// return with no reclaim or rebates (not used)
				this.mocks.Exchanger.smocked.settle.will.return.with([0, 0, 1]);
				this.mocks.Synth.smocked.transfer.will.return.with(true);
				await this.instance.settle(user);
			});
			cb();
		});
	},
};
