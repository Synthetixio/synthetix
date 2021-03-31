'use strict';

const { artifacts } = require('hardhat');

const { toBytes32 } = require('../..');

const { getEventByName, prepareSmocks } = require('./helpers');

const TestableMinimalProxyFactory = artifacts.require('TestableMinimalProxyFactory');
const VirtualSynth = artifacts.require('VirtualSynth');

// note: cannot use fat-arrow here otherwise this function will be bound to this outer context
module.exports = function({ accounts }) {
	beforeEach(async () => {
		({ mocks: this.mocks, resolver: this.resolver } = await prepareSmocks({
			owner: accounts[1],
			contracts: ['Synth', 'Exchanger'],
			accounts: accounts.slice(10), // mock using accounts after the first few
		}));
		this.minimalProxyDeployer = await TestableMinimalProxyFactory.new();
		this.baseVirtualSynth = await VirtualSynth.new();
	});

	return {
		// note: use fat-arrow to persist context rather
		whenInstantiatedAsBase: cb => {
			describe('when instantiated as base contract', () => {
				beforeEach(async () => {
					this.instance = await VirtualSynth.new();
				});
				cb();
			});
		},
		whenInstantiatedAsProxy: ({ amount, user, synth = 'sETH' }, cb) => {
			describe(`when instantiated as proxy for user ${user.slice(0, 7)}`, () => {
				beforeEach(async () => {
					const deployTx = await this.minimalProxyDeployer.cloneAsMinimalProxy(
						this.baseVirtualSynth.address,
						'Could not create new vSynth'
					);

					this.instance = await VirtualSynth.at(
						getEventByName({ tx: deployTx, name: 'CloneDeployed' }).args.clone
					);
					await this.instance.initialize(
						this.mocks.Synth.address,
						this.resolver.address,
						user,
						amount,
						toBytes32(synth)
					);
				});
				cb();
			});
		},
		whenMockedSynthBalance: ({ balanceOf }, cb) => {
			describe(`when the synth has been mocked to show balance for the vSynth as ${balanceOf}`, () => {
				beforeEach(async () => {
					this.mocks.Synth.smocked.balanceOf.will.return.with(acc =>
						acc === this.instance.address ? balanceOf : '0'
					);
				});
				cb();
			});
		},
		whenUserTransfersAwayTokens: ({ amount, from, to }, cb) => {
			describe(`when the user transfers away ${amount} of their vSynths`, () => {
				beforeEach(async () => {
					await this.instance.transfer(to || this.instance.address, amount.toString(), {
						from,
					});
				});
				cb();
			});
		},
		whenMockedSettlementOwing: ({ reclaim = 0, rebate = 0, numEntries = 1 }, cb) => {
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
		whenSettlementCalled: ({ user }, cb) => {
			describe(`when settlement is invoked for user ${user.slice(0, 7)}`, () => {
				beforeEach(async () => {
					// here we simulate how a settlement works with respect to a user's balance
					// Note: this does not account for multiple users - it settles for any account given the exact same way

					const [reclaim, rebate, numEntries] = this.mocks.Exchanger.smocked.settlementOwing.will
						.returnValue || [0, 0, 1];

					// now show the balanceOf the vSynth shows the amount after settlement
					let balanceOf = +this.mocks.Synth.smocked.balanceOf.will.returnValue(
						this.instance.address
					);

					this.mocks.Exchanger.smocked.settle.will.return.with(() => {
						// update the balanceOf the underlying synth due to settlement
						balanceOf = reclaim > 0 ? balanceOf - reclaim : balanceOf + rebate;
						// ensure settlementOwing now shows nothing
						this.mocks.Exchanger.smocked.settlementOwing.will.return.with([0, 0, 0]);
						// return what was settled
						return [reclaim, rebate, numEntries];
					});

					this.mocks.Synth.smocked.transfer.will.return.with((to, amount) => {
						// ensure the vSynths settlement reduces how much balance
						balanceOf = balanceOf - amount;
						return true;
					});

					// use a closure to ensure the balance returned at time of request is the updated one
					this.mocks.Synth.smocked.balanceOf.will.return.with(() => balanceOf);

					this.txn = await this.instance.settle(user);
				});
				cb();
			});
		},
		whenMockedWithMaxSecsLeft: ({ maxSecsLeft = '0' }, cb) => {
			describe(`when mocked with ${maxSecsLeft} for settlement `, () => {
				beforeEach(async () => {
					this.mocks.Exchanger.smocked.maxSecsLeftInWaitingPeriod.will.return.with(
						maxSecsLeft.toString()
					);
				});
				cb();
			});
		},
	};
};
