'use strict';

const { artifacts, contract, web3 } = require('hardhat');

const { assert, addSnapshotBeforeRestoreAfterEach } = require('./common');

const sETHWrapper = artifacts.require('sETHWrapper');
const FlexibleStorage = artifacts.require('FlexibleStorage');

const {
	currentTime,
	fastForward,
	toUnit,
	toPreciseUnit,
	fromUnit,
	multiplyDecimal,
} = require('../utils')();

const {
	ensureOnlyExpectedMutativeFunctions,
	onlyGivenAddressCanInvoke,
	setStatus,
	getDecodedLogs,
	decodedEventEqual,
	proxyThruTo,
	setExchangeFeeRateForSynths,
} = require('./helpers');

const { setupAllContracts } = require('./setup');

const {
	toBytes32,
	defaults: { ISSUANCE_RATIO, FEE_PERIOD_DURATION, TARGET_THRESHOLD },
} = require('../..');

contract('sETHWrapper', async accounts => {
	const [deployerAccount, owner, oracle, account1, account2] = accounts;

	// CURRENCIES
	const [sUSD, sAUD, SNX] = ['sUSD', 'sAUD', 'SNX'].map(toBytes32);

	let sETHWrapper, synths;

	before(async () => {
		synths = ['sUSD', 'sAUD'];
		({ sETHWrapper: sETHWrapper } = await setupAllContracts({
			accounts,
			synths,
			contracts: ['sETHWrapper'],
		}));
	});

	addSnapshotBeforeRestoreAfterEach();

	it('should set constructor params on deployment', async () => {
		sETHWrapper.link(await artifacts.require('SafeDecimalMath').new());
		const instance = await sETHWrapper.new(
			account1, // proxy
			account2, // owner
			addressResolver.address, // resolver
			{
				from: deployerAccount,
			}
		);
	});
});
