'use strict';

const { hexToAscii } = require('web3-utils');

const { artifacts } = require('@nomiclabs/buidler');

const { assert } = require('./common');

const { currentTime, fastForward, toUnit } = require('../utils')();

const { convertToAggregatorPrice } = require('./helpers');

const {
	defaults: { RATE_STALE_PERIOD },
} = require('../..');

const MockAggregator = artifacts.require('MockAggregator');
const MockFlagsInterface = artifacts.require('MockFlagsInterface');

module.exports = {
	whenRateStalePeriodExpires(cb) {
		describe('when the rate stale period expires', () => {
			beforeEach(async () => {
				await fastForward(RATE_STALE_PERIOD);
			});
			cb();
		});
	},
	whenTimeIsMovedForwardBy({ seconds }, cb) {
		describe(`when time is moved forward by ${seconds}s`, () => {
			beforeEach(async () => {
				await fastForward(seconds);
			});
			cb();
		});
	},
	whenAggregatorAdded({ currencyKey }, cb) {
		describe(`when populated with an aggregator for ${hexToAscii(currencyKey)}`, () => {
			beforeEach(async () => {
				this.aggregators = this.aggregators || {};
				this.aggregator = await MockAggregator.new();
				this.aggregators[currencyKey] = this.aggregator; // store for later
				await this.instance.addAggregator(currencyKey, this.aggregator.address, {
					from: this.owner,
				});
			});
			cb();
		});
	},
	whenAggregatorHasRate({ currencyKey, rate }, cb) {
		describe(`when the aggregator has a rate for ${hexToAscii(currencyKey)}`, () => {
			beforeEach(async () => {
				await this.aggregator.setLatestAnswer(convertToAggregatorPrice(rate), await currentTime());
			});
			cb();
		});
	},
	whenAggregatorFlagged({ currencyKey }, cb) {
		describe(`when the flag contract is set for the ${hexToAscii(currencyKey)} aggregator`, () => {
			beforeEach(async () => {
				this.flags = await MockFlagsInterface.new();
				await this.instance.setAggregatorWarningFlags(this.flags.address);
				await this.flags.flagAggregator(this.aggregators[currencyKey].address);
			});
			cb();
		});
	},

	thenRateIsStale({ currencyKey }) {
		it(`then the ${hexToAscii(currencyKey)} rate is stale`, async () => {
			assert.ok(await this.instance.rateIsStale(currencyKey));
		});
	},
	thenRateNotStale({ currencyKey }) {
		it(`then the ${hexToAscii(currencyKey)} rate is not stale`, async () => {
			assert.notOk(await this.instance.rateIsStale(currencyKey));
		});
	},
	thenRateInvalid({ currencyKey }) {
		it(`then the ${hexToAscii(currencyKey)} rate is invalid`, async () => {
			assert.ok(await this.instance.rateIsInvalid(currencyKey));
		});
	},
	thenRateValid({ currencyKey }) {
		it(`then the ${hexToAscii(currencyKey)} rate is valid`, async () => {
			assert.notOk(await this.instance.rateIsInvalid(currencyKey));
		});
	},
	thenRateSet({ currencyKey, rate }) {
		it(`then the ${hexToAscii(currencyKey)} rate is correct`, async () => {
			assert.bnEqual(await this.instance.rateForCurrency(currencyKey), toUnit(rate));
		});
	},
};
