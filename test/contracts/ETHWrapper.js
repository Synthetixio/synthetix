'use strict';

const { artifacts, contract, web3 } = require('hardhat');

const { assert, addSnapshotBeforeRestoreAfterEach } = require('./common');

const ETHWrapper = artifacts.require('ETHWrapper');
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

const { mockToken, setupAllContracts } = require('./setup');

const {
	toBytes32,
	defaults: { ISSUANCE_RATIO, FEE_PERIOD_DURATION, TARGET_THRESHOLD },
} = require('../..');

contract('ETHWrapper', async accounts => {
	const YEAR = 31536000;
	const INTERACTION_DELAY = 300;

	const sUSD = toBytes32('sUSD');
	const sETH = toBytes32('sETH');
	const sBTC = toBytes32('sBTC');

	const oneRenBTC = web3.utils.toBN('100000000');
	const twoRenBTC = web3.utils.toBN('200000000');
	const fiveRenBTC = web3.utils.toBN('500000000');

	const onesUSD = toUnit(1);
	const tensUSD = toUnit(10);
	const oneHundredsUSD = toUnit(100);
	const oneThousandsUSD = toUnit(1000);
	const fiveThousandsUSD = toUnit(5000);

	let tx;
	let loan;
	let id;
	let proxy, tokenState;

	const [deployerAccount, owner, oracle, , account1, account2] = accounts;

	let cerc20,
		state,
		managerState,
		feePool,
		exchangeRates,
		addressResolver,
		sBTCSynth,
		renBTC,
		systemStatus,
		synths,
		manager,
		issuer,
		debtCache,
		FEE_ADDRESS,
		synthetix,
		sUSDSynth,
		sETHSynth,
		ethWrapper,
		timestamp;

	before(async () => {
		// Mock SNX, sUSD and sETH
		// [{ token: synthetix }, { token: sUSDSynth }, { token: sETHSynth }] = await Promise.all([
		// 	mockToken({ accounts, name: 'Synthetix', symbol: 'SNX' }),
		// 	mockToken({ accounts, synth: 'sUSD', name: 'Synthetic USD', symbol: 'sUSD' }),
		// 	mockToken({ accounts, synth: 'sETH', name: 'Synthetic ETH', symbol: 'sETH' }),
		// ]);

		synths = ['sUSD', 'sETH'];
		({
			SystemStatus: systemStatus,
			AddressResolver: addressResolver,
			Issuer: issuer,
			DebtCache: debtCache,
			ExchangeRates: exchangeRates,
			SynthsETH: sETHSynth,
			ETHWrapper: ethWrapper,
		} = await setupAllContracts({
			accounts,
			synths,
			contracts: [
				'Synthetix',
				'AddressResolver',
				'SystemStatus',
				'Issuer',
				'Depot',
				'ExchangeRates',
				'DebtCache',
				'ETHWrapper',
			],
		}));

		timestamp = await currentTime();

		await exchangeRates.updateRates([sETH], ['200'].map(toUnit), timestamp, { from: oracle });

		// set a 0.3% default exchange fee rate
		const exchangeFeeRate = toUnit('0.003');
		// await setExchangeFeeRateForSynths({
		// 	owner,
		// 	systemSettings,
		// 	synthKeys,
		// 	exchangeFeeRates: synthKeys.map(() => exchangeFeeRate),
		// });
		// await debtCache.takeDebtSnapshot();
	});

	addSnapshotBeforeRestoreAfterEach();

	describe('On deployment of Contract', async () => {
		let instance;
		beforeEach(async () => {
			instance = ethWrapper;
		});
	});

	describe('mint', async () => {
		describe('when eth sent is less than _amount', () => {
			it('then it reverts', async () => {
				await assert.revert(
					ethWrapper.mint('100'),
					'Not enough ETH sent to mint sETH. Please see the _amount'
				);
			});
		});
	});

	// it('should set constructor params on deployment', async () => {
	// sETHWrapper.link(await artifacts.require('SafeDecimalMath').new());
	// const instance = await sETHWrapper.new(
	// 	account1, // proxy
	// 	account2, // owner
	// 	addressResolver.address, // resolver
	// 	{
	// 		from: deployerAccount,
	// 	}
	// );
	// });
});
