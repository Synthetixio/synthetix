'use strict';

const { artifacts } = require('@nomiclabs/buidler');
const { smockit } = require('@eth-optimism/smock');
const { toBytes32 } = require('../..');

const VirtualSynth = artifacts.require('VirtualSynth');

module.exports = {
	whenInstantiated({ amount, owner }, cb) {
		describe('when instantiated', () => {
			beforeEach(async () => {
				this.instance = await VirtualSynth.new(
					this.mocks.Synth.address,
					this.resolver.address,
					owner,
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
};
