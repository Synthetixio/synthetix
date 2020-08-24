'use strict';

const { artifacts, contract, web3, legacy } = require('@nomiclabs/buidler');

const { assert, addSnapshotBeforeRestoreAfterEach } = require('./common');

const { currentTime, fastForward, toUnit, bytesToString } = require('../utils')();

const { onlyGivenAddressCanInvoke, convertToAggregatorPrice } = require('./helpers');

const { setupContract, setupAllContracts } = require('./setup');

const {
	toBytes32,
	constants: { ZERO_ADDRESS },
	defaults: { RATE_STALE_PERIOD },
} = require('../..');

const { toBN } = require('web3-utils');

const MockAggregator = artifacts.require('MockAggregator');

contract('Exchange Rates (integration tests)', async accounts => {
	const [deployerAccount, owner, , accountOne, accountTwo] = accounts;
	const [SNX, sJPY, sXTZ, sBNB, sUSD, sEUR, sAUD] = [
		'SNX',
		'sJPY',
		'sXTZ',
		'sBNB',
		'sUSD',
		'sEUR',
		'sAUD',
	].map(toBytes32);
	let instance;
	let systemSettings;
	// let aggregatorJPY;
	// let aggregatorXTZ;
	// let initialTime;
	// let timeSent;
	let resolver;
	let mockFlagsInterface;

	before(async () => {
		// initialTime = await currentTime();
		({
			ExchangeRates: instance,
			SystemSettings: systemSettings,
			AddressResolver: resolver,
		} = await setupAllContracts({
			accounts,
			contracts: ['ExchangeRates', 'SystemSettings', 'AddressResolver'],
		}));
	});

	addSnapshotBeforeRestoreAfterEach();

	describe('rateStalePeriod()', () => {
		describe('when rateStalePeriod is updated in SystemSettings', () => {
			const newRateStalePeriod = '100';
			beforeEach(async () => {
				systemSettings.setRateStalePeriod(newRateStalePeriod, { from: owner });
			});
			it('then the value can be read from ExchangeRates', async () => {
				assert.bnEqual(await instance.rateStalePeriod(), newRateStalePeriod);
			});
		});
	});

	xdescribe('flags...', () => {
		// create but don't connect up the mock flags interface yet
		// mockFlagsInterface = await artifacts.require('MockFlagsInterface').new();
		// when using real flags contract connection...
	});

	xdescribe('sip-78 check', () => {
		// ensure that setInversePricing invocation will reset iSynth price ...
	});
});
