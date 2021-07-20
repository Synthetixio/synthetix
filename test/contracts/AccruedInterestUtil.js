'use strict';

const { artifacts, contract } = require('hardhat');

const { assert, addSnapshotBeforeRestoreAfterEach } = require('./common');

const { fastForward, toUnit, currentTime } = require('../utils')();

const { setupAllContracts, setupContract } = require('./setup');

const {
	toBytes32,
	constants: { ZERO_ADDRESS },
} = require('../..');

let CollateralManager;
let CollateralState;
let CollateralManagerState;

contract('AccruedInterestUtil', async accounts => {
	const YEAR = 31556926;

	const sUSD = toBytes32('sUSD');
	const sETH = toBytes32('sETH');
	const sBTC = toBytes32('sBTC');

	const [deployerAccount, owner, oracle, , account1] = accounts;

	let short,
		state,
		managerState,
		feePool,
		exchangeRates,
		addressResolver,
		sUSDSynth,
		sBTCSynth,
		sETHSynth,
		iBTCSynth,
		iETHSynth,
		synths,
		manager,
		issuer,
		debtCache,
		accruedInterestUtil;

	let tx, id;

	const getid = tx => {
		const event = tx.logs.find(log => log.event === 'LoanCreated');
		return event.args.id;
	};

	const fastForwardAndUpdateRates = async seconds => {
		await fastForward(seconds);
		await updateRatesWithDefaults();
	};

	const issue = async (synth, issueAmount, receiver) => {
		await synth.issue(receiver, issueAmount, { from: owner });
	};

	const updateRatesWithDefaults = async () => {
		const timestamp = await currentTime();

		await exchangeRates.updateRates([sETH], ['100'].map(toUnit), timestamp, {
			from: oracle,
		});

		const sBTC = toBytes32('sBTC');

		await exchangeRates.updateRates([sBTC], ['10000'].map(toUnit), timestamp, {
			from: oracle,
		});
	};

	const deployShort = async ({ state, owner, manager, resolver, collatKey, minColat, minSize }) => {
		return setupContract({
			accounts,
			contract: 'CollateralShort',
			args: [state, owner, manager, resolver, collatKey, minColat, minSize],
		});
	};

	const setupShort = async () => {
		synths = ['sUSD', 'sBTC', 'sETH', 'iBTC', 'iETH'];
		({
			ExchangeRates: exchangeRates,
			SynthsUSD: sUSDSynth,
			SynthsBTC: sBTCSynth,
			SynthsETH: sETHSynth,
			SynthiBTC: iBTCSynth,
			SynthiETH: iETHSynth,
			FeePool: feePool,
			AddressResolver: addressResolver,
			Issuer: issuer,
			DebtCache: debtCache,
			AccruedInterestUtil: accruedInterestUtil,
		} = await setupAllContracts({
			accounts,
			synths,
			contracts: [
				'Synthetix',
				'FeePool',
				'AddressResolver',
				'Exchanger',
				'ExchangeRates',
				'SystemStatus',
				'Issuer',
				'DebtCache',
				'AccruedInterestUtil',
			],
		}));

		managerState = await CollateralManagerState.new(owner, ZERO_ADDRESS, { from: deployerAccount });

		const maxDebt = toUnit(10000000);

		manager = await CollateralManager.new(
			managerState.address,
			owner,
			addressResolver.address,
			maxDebt,
			// 5% / 31536000 (seconds in common year)
			1585489599,
			0,
			{
				from: deployerAccount,
			}
		);

		await managerState.setAssociatedContract(manager.address, { from: owner });

		state = await CollateralState.new(owner, ZERO_ADDRESS, { from: deployerAccount });

		short = await deployShort({
			state: state.address,
			owner: owner,
			manager: manager.address,
			resolver: addressResolver.address,
			collatKey: sUSD,
			minColat: toUnit(1.2),
			minSize: toUnit(0.1),
		});

		await state.setAssociatedContract(short.address, { from: owner });

		await addressResolver.importAddresses(
			[toBytes32('CollateralShort'), toBytes32('CollateralManager')],
			[short.address, manager.address],
			{
				from: owner,
			}
		);

		await feePool.rebuildCache();
		await manager.rebuildCache();
		await issuer.rebuildCache();
		await debtCache.rebuildCache();

		await manager.addCollaterals([short.address], { from: owner });

		await short.addSynths(
			['SynthsBTC', 'SynthsETH'].map(toBytes32),
			['sBTC', 'sETH'].map(toBytes32),
			{ from: owner }
		);

		await manager.addShortableSynths(
			[
				[toBytes32('SynthsBTC'), toBytes32('SynthiBTC')],
				[toBytes32('SynthsETH'), toBytes32('SynthiETH')],
			],
			['sBTC', 'sETH'].map(toBytes32),
			{
				from: owner,
			}
		);

		await sUSDSynth.approve(short.address, toUnit(100000), { from: account1 });
	};

	before(async () => {
		CollateralManager = artifacts.require(`CollateralManager`);
		CollateralState = artifacts.require(`CollateralState`);
		CollateralManagerState = artifacts.require('CollateralManagerState');

		await setupShort();
	});

	addSnapshotBeforeRestoreAfterEach();

	beforeEach(async () => {
		await updateRatesWithDefaults();

		await issue(sUSDSynth, toUnit(100000), owner);
		await issue(sBTCSynth, toUnit(1), owner);
		await issue(sETHSynth, toUnit(1), owner);
		await issue(iBTCSynth, toUnit(1), owner);
		await issue(iETHSynth, toUnit(1), owner);

		// The market is balanced between long and short.

		await debtCache.takeDebtSnapshot();
	});

	describe('Read the accrued interest rate', async () => {
		it('should correctly determine the interest on a short', async () => {
			const oneBTC = toUnit(1);
			const susdCollateral = toUnit(15000);

			await issue(sUSDSynth, susdCollateral, account1);

			tx = await short.open(susdCollateral, oneBTC, sBTC, { from: account1 });
			id = getid(tx);

			// after a year we should have accrued 33%.
			await fastForwardAndUpdateRates(YEAR);

			assert.bnClose(
				await accruedInterestUtil.getAccruedInterest(account1, id, short.address),
				toUnit(0.33333333),
				33333333333
			);
		});
	});
});
