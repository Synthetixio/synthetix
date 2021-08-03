'use strict';

const { artifacts, contract, web3 } = require('hardhat');

const { assert, addSnapshotBeforeRestoreAfterEach } = require('./common');

const PublicEST8Decimals = artifacts.require('PublicEST8Decimals');

const { toUnit, currentTime } = require('../utils')();

const { setupAllContracts, setupContract } = require('./setup');

const {
	toBytes32,
	constants: { ZERO_ADDRESS },
} = require('../..');

let CollateralManager;
let CollateralState;
let CollateralManagerState;
let ProxyERC20;
let TokenState;

contract('CollateralEth', async accounts => {
	const sUSD = toBytes32('sUSD');
	const sETH = toBytes32('sETH');
	const sBTC = toBytes32('sBTC');

	const oneRenBTC = web3.utils.toBN('100000000');
	const oneThousandsUSD = toUnit(1000);
	const fiveThousandsUSD = toUnit(5000);

	let tx;
	let loan;
	let id;
	let proxy, tokenState;

	const [deployerAccount, owner, oracle, , account1] = accounts;

	let cerc20,
		state,
		managerState,
		feePool,
		exchangeRates,
		addressResolver,
		sUSDSynth,
		sBTCSynth,
		renBTC,
		synths,
		manager,
		issuer,
		util,
		debtCache;

	const getid = tx => {
		const event = tx.logs.find(log => log.event === 'LoanCreated');
		return event.args.id;
	};

	const issuesUSDToAccount = async (issueAmount, receiver) => {
		// Set up the depositor with an amount of synths to deposit.
		await sUSDSynth.issue(receiver, issueAmount, {
			from: owner,
		});
	};

	const issuesBTCtoAccount = async (issueAmount, receiver) => {
		await sBTCSynth.issue(receiver, issueAmount, { from: owner });
	};

	const issueRenBTCtoAccount = async (issueAmount, receiver) => {
		await renBTC.transfer(receiver, issueAmount, { from: owner });
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

	const deployCollateral = async ({
		state,
		owner,
		manager,
		resolver,
		collatKey,
		minColat,
		minSize,
		underCon,
		decimals,
	}) => {
		return setupContract({
			accounts,
			contract: 'CollateralErc20',
			args: [state, owner, manager, resolver, collatKey, minColat, minSize, underCon, decimals],
		});
	};

	const setupMultiCollateral = async () => {
		synths = ['sUSD', 'sBTC'];
		({
			ExchangeRates: exchangeRates,
			SynthsUSD: sUSDSynth,
			SynthsBTC: sBTCSynth,
			FeePool: feePool,
			AddressResolver: addressResolver,
			Issuer: issuer,
			CollateralUtil: util,
			DebtCache: debtCache,
		} = await setupAllContracts({
			accounts,
			synths,
			contracts: [
				'Synthetix',
				'FeePool',
				'AddressResolver',
				'ExchangeRates',
				'SystemStatus',
				'Issuer',
				'DebtCache',
				'Exchanger',
				'CollateralUtil',
			],
		}));

		managerState = await CollateralManagerState.new(owner, ZERO_ADDRESS, { from: deployerAccount });

		const maxDebt = toUnit(10000000);

		manager = await CollateralManager.new(
			managerState.address,
			owner,
			addressResolver.address,
			maxDebt,
			0,
			0,
			{
				from: deployerAccount,
			}
		);

		await managerState.setAssociatedContract(manager.address, { from: owner });

		state = await CollateralState.new(owner, ZERO_ADDRESS, { from: deployerAccount });

		// the owner is the associated contract, so we can simulate
		proxy = await ProxyERC20.new(owner, {
			from: deployerAccount,
		});
		tokenState = await TokenState.new(owner, ZERO_ADDRESS, { from: deployerAccount });

		renBTC = await PublicEST8Decimals.new(
			proxy.address,
			tokenState.address,
			'Some Token',
			'TOKEN',
			toUnit('1000'),
			owner,
			{
				from: deployerAccount,
			}
		);

		await tokenState.setAssociatedContract(owner, { from: owner });
		await tokenState.setBalanceOf(owner, toUnit('1000'), { from: owner });
		await tokenState.setAssociatedContract(renBTC.address, { from: owner });

		await proxy.setTarget(renBTC.address, { from: owner });

		cerc20 = await deployCollateral({
			state: state.address,
			owner: owner,
			manager: manager.address,
			resolver: addressResolver.address,
			collatKey: sBTC,
			minColat: toUnit(1.5),
			minSize: toUnit(0.1),
			underCon: renBTC.address,
			decimals: 8,
		});

		await state.setAssociatedContract(cerc20.address, { from: owner });

		await addressResolver.importAddresses(
			[toBytes32('CollateralErc20'), toBytes32('CollateralManager')],
			[cerc20.address, manager.address],
			{
				from: owner,
			}
		);

		await feePool.rebuildCache();
		await manager.rebuildCache();
		await issuer.rebuildCache();
		await debtCache.rebuildCache();

		await manager.addCollaterals([cerc20.address], { from: owner });

		await cerc20.addSynths(
			['SynthsUSD', 'SynthsBTC'].map(toBytes32),
			['sUSD', 'sBTC'].map(toBytes32),
			{ from: owner }
		);

		await manager.addSynths(
			['SynthsUSD', 'SynthsBTC'].map(toBytes32),
			['sUSD', 'sBTC'].map(toBytes32),
			{ from: owner }
		);
		// rebuild the cache to add the synths we need.
		await manager.rebuildCache();

		// Issue ren and set allowance
		await issueRenBTCtoAccount(100 * 1e8, account1);
		await renBTC.approve(cerc20.address, 100 * 1e8, { from: account1 });
	};

	before(async () => {
		CollateralManager = artifacts.require(`CollateralManager`);
		CollateralManagerState = artifacts.require('CollateralManagerState');
		CollateralState = artifacts.require(`CollateralState`);
		ProxyERC20 = artifacts.require(`ProxyERC20`);
		TokenState = artifacts.require(`TokenState`);

		await setupMultiCollateral();
	});

	addSnapshotBeforeRestoreAfterEach();

	beforeEach(async () => {
		await updateRatesWithDefaults();

		await issuesUSDToAccount(toUnit(1000), owner);
		await issuesBTCtoAccount(toUnit(10), owner);

		await debtCache.takeDebtSnapshot();
	});

	describe('liquidation amount test', async () => {
		let amountToLiquidate;
		let minCratio;
		let collateralKey;

		/**
		 * r = target issuance ratio
		 * D = debt balance in sUSD
		 * V = Collateral VALUE in sUSD
		 * P = liquidation penalty
		 * Calculates amount of sUSD = (D - V * r) / (1 - (1 + P) * r)
		 *
		 * To go back to another synth, remember to do effective value
		 */

		beforeEach(async () => {
			tx = await cerc20.open(oneRenBTC, fiveThousandsUSD, sUSD, {
				from: account1,
			});

			id = getid(tx);
			loan = await state.getLoan(account1, id);
			minCratio = await cerc20.minCratio();
			collateralKey = await cerc20.collateralKey();
		});

		it('when we start at 200%, we can take a 25% reduction in collateral prices', async () => {
			await exchangeRates.updateRates([sBTC], ['7500'].map(toUnit), await currentTime(), {
				from: oracle,
			});

			amountToLiquidate = await util.liquidationAmount(loan, minCratio, collateralKey);

			assert.bnEqual(amountToLiquidate, toUnit(0));
		});

		it('when we start at 200%, a price shock of 30% in the collateral requires 25% of the loan to be liquidated', async () => {
			await exchangeRates.updateRates([sBTC], ['7000'].map(toUnit), await currentTime(), {
				from: oracle,
			});

			amountToLiquidate = await util.liquidationAmount(loan, minCratio, collateralKey);

			assert.bnClose(amountToLiquidate, toUnit(1250), '10000');
		});

		it('when we start at 200%, a price shock of 40% in the collateral requires 75% of the loan to be liquidated', async () => {
			await exchangeRates.updateRates([sBTC], ['6000'].map(toUnit), await currentTime(), {
				from: oracle,
			});

			amountToLiquidate = await util.liquidationAmount(loan, minCratio, collateralKey);

			assert.bnClose(amountToLiquidate, toUnit(3750), '10000');
		});

		it('when we start at 200%, a price shock of 45% in the collateral requires 100% of the loan to be liquidated', async () => {
			await exchangeRates.updateRates([sBTC], ['5500'].map(toUnit), await currentTime(), {
				from: oracle,
			});

			amountToLiquidate = await util.liquidationAmount(loan, minCratio, collateralKey);

			assert.bnClose(amountToLiquidate, toUnit(5000), '10000');
		});
	});

	describe('collateral redeemed test', async () => {
		let collateralRedeemed;
		let collateralKey;

		beforeEach(async () => {
			collateralKey = await cerc20.collateralKey();
		});

		it('when BTC is @ $10000 and we are liquidating 1000 sUSD, then redeem 0.11 BTC', async () => {
			collateralRedeemed = await util.collateralRedeemed(sUSD, oneThousandsUSD, collateralKey);

			assert.bnEqual(collateralRedeemed, toUnit(0.11));
		});

		it('when BTC is @ $20000 and we are liquidating 1000 sUSD, then redeem 0.055 BTC', async () => {
			await exchangeRates.updateRates([sBTC], ['20000'].map(toUnit), await currentTime(), {
				from: oracle,
			});

			collateralRedeemed = await util.collateralRedeemed(sUSD, oneThousandsUSD, collateralKey);

			assert.bnEqual(collateralRedeemed, toUnit(0.055));
		});

		it('when BTC is @ $7000 and we are liquidating 2500 sUSD, then redeem 0.36666 ETH', async () => {
			await exchangeRates.updateRates([sBTC], ['7000'].map(toUnit), await currentTime(), {
				from: oracle,
			});

			collateralRedeemed = await util.collateralRedeemed(sUSD, toUnit(2500), collateralKey);

			assert.bnClose(collateralRedeemed, toUnit(0.392857142857142857), '100');
		});

		it('regardless of BTC price, we liquidate 1.1 * amount when doing sETH', async () => {
			collateralRedeemed = await util.collateralRedeemed(sBTC, toUnit(1), collateralKey);

			assert.bnEqual(collateralRedeemed, toUnit(1.1));

			await exchangeRates.updateRates([sBTC], ['1000'].map(toUnit), await currentTime(), {
				from: oracle,
			});

			collateralRedeemed = await util.collateralRedeemed(sBTC, toUnit(1), collateralKey);

			assert.bnEqual(collateralRedeemed, toUnit(1.1));
		});
	});
});
