'use strict';

const { artifacts, contract, web3 } = require('@nomiclabs/buidler');

const { assert, addSnapshotBeforeRestoreAfterEach } = require('./common');

const BN = require('bn.js');

const {
	fastForward,
	getEthBalance,
	toUnit,
	fromUnit,
	toUnitFromBN,
	multiplyDecimal,
	currentTime,
} = require('../utils')();

const { mockGenericContractFnc, mockToken, setupAllContracts, setupContract } = require('./setup');

const {
	issueSynthsToUser,
	ensureOnlyExpectedMutativeFunctions,
	onlyGivenAddressCanInvoke,
	setStatus,
} = require('./helpers');

const {
	toBytes32,
	constants: { ZERO_ADDRESS },
} = require('../..');

const CollateralManager = artifacts.require(`CollateralManager`);
const CollateralState = artifacts.require(`CollateralState`);
const CollateralManagerState = artifacts.require('CollateralManagerState');

contract('CollateralManager', async accounts => {
	const [deployerAccount, owner, oracle, , account1, account2] = accounts;

	const sETH = toBytes32('sETH');
	const sUSD = toBytes32('sUSD');
	const sBTC = toBytes32('sBTC');

	const deployEthCollateral = async ({
		proxy,
		mcState,
		owner,
		manager,
		resolver,
		collatKey,
		synths,
		minColat,
		intRate,
		liqPen,
	}) => {
		return setupContract({
			accounts,
			contract: 'CollateralEth',
			args: [
				proxy,
				mcState,
				owner,
				manager,
				resolver,
				collatKey,
				synths,
				minColat,
				intRate,
				liqPen,
			],
		});
	};

	const deployErc20Collateral = async ({
		proxy,
		mcState,
		owner,
		manager,
		resolver,
		collatKey,
		synths,
		minColat,
		intRate,
		liqPen,
		underCon,
	}) => {
		return setupContract({
			accounts,
			contract: 'CollateralErc20',
			args: [
				proxy,
				mcState,
				owner,
				manager,
				resolver,
				collatKey,
				synths,
				minColat,
				intRate,
				liqPen,
				underCon,
			],
		});
	};

	let ceth,
		mcstate,
		stateShort,
		mcshort,
		mcstateErc20,
		cerc20,
		proxy,
		renBTC,
		tokenState,
		manager,
		managerState,
		addressResolver,
		issuer,
		systemStatus,
		exchangeRates,
		feePool,
		sUSDSynth,
		sETHSynth,
		sBTCSynth,
		synths,
		debtCache,
		synthetix;

	const issueRenBTCtoAccount = async (issueAmount, receiver) => {
		await renBTC.transfer(receiver, issueAmount, { from: owner });
	};

	const issuesUSDToAccount = async (issueAmount, receiver) => {
		await sUSDSynth.issue(receiver, issueAmount, {
			from: owner,
		});
	};

	const issuesETHToAccount = async (issueAmount, receiver) => {
		await sETHSynth.issue(receiver, issueAmount, { from: owner });
	};

	const issuesBTCToAccount = async (issueAmount, receiver) => {
		await sBTCSynth.issue(receiver, issueAmount, { from: owner });
	};

	const setupManager = async () => {
		synths = ['sUSD', 'sBTC', 'sETH'];
		({
			Synthetix: synthetix,
			SystemStatus: systemStatus,
			ExchangeRates: exchangeRates,
			SynthsUSD: sUSDSynth,
			SynthsETH: sETHSynth,
			SynthsBTC: sBTCSynth,
			FeePool: feePool,
			AddressResolver: addressResolver,
			Issuer: issuer,
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
			],
		}));

		managerState = await CollateralManagerState.new(owner, ZERO_ADDRESS, { from: deployerAccount });

		manager = await CollateralManager.new(managerState.address, owner, addressResolver.address, {
			from: deployerAccount,
		});

		await managerState.setAssociatedContract(manager.address, { from: owner });

		mcstate = await CollateralState.new(owner, ZERO_ADDRESS, { from: deployerAccount });

		ceth = await deployEthCollateral({
			proxy: ZERO_ADDRESS,
			mcState: mcstate.address,
			owner: owner,
			manager: manager.address,
			resolver: addressResolver.address,
			collatKey: sETH,
			synths: [toBytes32('SynthsUSD'), toBytes32('SynthsETH')],
			minColat: toUnit(1.5),
			// 5% / 31536000 (seconds in common year)
			intRate: 1585489599,
			liqPen: toUnit(0.1),
		});

		mcstateErc20 = await CollateralState.new(owner, ZERO_ADDRESS, { from: deployerAccount });

		const ProxyERC20 = artifacts.require(`ProxyERC20`);
		const TokenState = artifacts.require(`TokenState`);

		// the owner is the associated contract, so we can simulate
		proxy = await ProxyERC20.new(owner, {
			from: deployerAccount,
		});
		tokenState = await TokenState.new(owner, ZERO_ADDRESS, { from: deployerAccount });

		const PublicEST = artifacts.require('PublicEST');

		renBTC = await PublicEST.new(
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

		// Issue ren and set allowance
		await issueRenBTCtoAccount(toUnit(100), account1);

		cerc20 = await deployErc20Collateral({
			proxy: ZERO_ADDRESS,
			mcState: mcstateErc20.address,
			owner: owner,
			manager: manager.address,
			resolver: addressResolver.address,
			collatKey: sBTC,
			synths: [toBytes32('SynthsUSD'), toBytes32('SynthsBTC')],
			minColat: toUnit(1.5),
			// 5% / 31536000 (seconds in common year)
			intRate: 1585489599,
			liqPen: toUnit(0.1),
			underCon: renBTC.address,
		});

		await addressResolver.importAddresses(
			[toBytes32('CollateralEth'), toBytes32('CollateralErc20'), toBytes32('CollateralManager')],
			[ceth.address, cerc20.address, manager.address],
			{
				from: owner,
			}
		);

		await mcstate.addCurrency(sUSD, { from: owner });
		await mcstateErc20.addCurrency(sUSD, { from: owner });
		await mcstate.addCurrency(sETH, { from: owner });
		await mcstateErc20.addCurrency(sBTC, { from: owner });

		await mcstate.setAssociatedContract(ceth.address, { from: owner });
		await mcstateErc20.setAssociatedContract(cerc20.address, { from: owner });

		await issuer.setResolverAndSyncCache(addressResolver.address, { from: owner });
		await ceth.setResolverAndSyncCache(addressResolver.address, { from: owner });
		await cerc20.setResolverAndSyncCache(addressResolver.address, { from: owner });
		await debtCache.setResolverAndSyncCache(addressResolver.address, { from: owner });
		await feePool.setResolverAndSyncCache(addressResolver.address, { from: owner });
		await manager.setResolverAndSyncCache(addressResolver.address, { from: owner });

		await manager.addCollateral(ceth.address, { from: owner });
		await manager.addCollateral(cerc20.address, { from: owner });

		await manager.addSynth(sUSDSynth.address, { from: owner });
		await manager.addSynth(sETHSynth.address, { from: owner });
		await manager.addSynth(sBTCSynth.address, { from: owner });

		await renBTC.approve(cerc20.address, toUnit(100), { from: account1 });
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

	const fastForwardAndUpdateRates = async seconds => {
		await fastForward(seconds);
		await updateRatesWithDefaults();
	};

	before(async () => {
		await setupManager();
	});

	addSnapshotBeforeRestoreAfterEach();

	beforeEach(async () => {
		await updateRatesWithDefaults();

		await issuesUSDToAccount(toUnit(1000), owner);
		await issuesETHToAccount(toUnit(10), owner);
		await issuesBTCToAccount(toUnit(0.1), owner);
		await debtCache.takeDebtSnapshot();
	});

	it('should access its dependencies via the address resolver', async () => {
		assert.equal(await addressResolver.getAddress(toBytes32('SynthsUSD')), sUSDSynth.address);
		assert.equal(await addressResolver.getAddress(toBytes32('FeePool')), feePool.address);
		assert.equal(
			await addressResolver.getAddress(toBytes32('ExchangeRates')),
			exchangeRates.address
		);
	});

	it('should add the collaterals during construction', async () => {
		assert.isTrue(await manager.collateralByAddress(ceth.address));
		assert.isTrue(await manager.collateralByAddress(cerc20.address));
	});

	describe('Collaterals', async () => {
		describe('revert conditions', async () => {
			it('should revert if the caller is not the owner', async () => {
				await assert.revert(
					manager.addCollateral(ZERO_ADDRESS, { from: account1 }),
					'Only the contract owner may perform this action'
				);
			});
		});

		describe('when a new collateral is added', async () => {
			beforeEach(async () => {
				await manager.addCollateral(ZERO_ADDRESS, { from: owner });
			});

			it('should add the collateral', async () => {
				assert.isTrue(await manager.collateralByAddress(ZERO_ADDRESS));
			});
		});

		describe('retreiving collateral by address', async () => {
			it('if a collateral is in the manager, it should return true', async () => {
				assert.isTrue(await manager.collateralByAddress(ceth.address));
			});

			it('if a collateral is in the manager, it should return false', async () => {
				assert.isFalse(await manager.collateralByAddress(ZERO_ADDRESS));
			});
		});
	});

	it('should track issued synths', async () => {
		await ceth.open(toUnit(100), sUSD, { value: toUnit(2), from: account1 });

		assert.bnEqual(await manager.long(sUSD), toUnit(100));

		await ceth.open(toUnit(1), sETH, { value: toUnit(2), from: account1 });

		assert.bnEqual(await manager.long(sETH), toUnit(1));
	});

	it('should track MC total issued synths properly', async () => {
		await ceth.open(toUnit(100), sUSD, { value: toUnit(2), from: account1 });
		await ceth.open(toUnit(1), sETH, { value: toUnit(2), from: account1 });
		await cerc20.open(toUnit(1), toUnit(100), sUSD, { from: account1 });
		await cerc20.open(toUnit(1), toUnit(0.01), sBTC, { from: account1 });

		assert.bnEqual(await manager.totalLong(), toUnit(400));
	});

	it('should get scaled utilisation correctly', async () => {
		await sUSDSynth.issue(owner, toUnit(500));
		await sETHSynth.issue(owner, toUnit(5));
		await sBTCSynth.issue(owner, toUnit(0.1));
		await debtCache.takeDebtSnapshot();

		await ceth.open(toUnit(100), sUSD, { value: toUnit(2), from: account1 });
		await ceth.open(toUnit(1), sETH, { value: toUnit(2), from: account1 });
		await cerc20.open(toUnit(1), toUnit(0.01), sBTC, { from: account1 });

		const utilisation = await manager.getScaledUtilisation();
	});

	it('should correctly determine the total debt issued in sUSD', async () => {
		await sUSDSynth.issue(owner, toUnit(500));
		await sETHSynth.issue(owner, toUnit(5));
		await debtCache.takeDebtSnapshot();

		await ceth.open(toUnit(100), sUSD, { value: toUnit(2), from: account1 });
		await ceth.open(toUnit(1), sETH, { value: toUnit(2), from: account1 });
		await cerc20.open(toUnit(1), toUnit(0.01), sBTC, { from: account1 });

		const total = await manager.totalLong();

		assert.bnEqual(total, toUnit(300));
	});
});
