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

const SafeDecimalMath = artifacts.require('SafeDecimalMath');
const MultiCollateralManager = artifacts.require(`MultiCollateralManager`);
const MultiCollateralState = artifacts.require(`MultiCollateralState`);

contract('MultiCollateralManager', async accounts => {
	const [deployerAccount, owner, oracle, , account1, account2] = accounts;

	const sETH = toBytes32('sETH');
	const sUSD = toBytes32('sUSD');
	const sBTC = toBytes32('sBTC');

	const deployCollateral = async ({
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
			contract: 'MultiCollateralEth',
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
			contract: 'MultiCollateralErc20',
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

	let mceth,
		mcstate,
		stateShort,
		mcshort,
		mcstateErc20,
		mcerc20,
		proxy,
		renBTC,
		tokenState,
		manager,
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

		const math = await SafeDecimalMath.new();
		MultiCollateralManager.link(math);

		manager = await MultiCollateralManager.new(owner, addressResolver.address, [sUSD, sETH, sBTC], {
			from: deployerAccount,
		});

		mcstate = await MultiCollateralState.new(owner, ZERO_ADDRESS, { from: deployerAccount });

		mceth = await deployCollateral({
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

		mcstateErc20 = await MultiCollateralState.new(owner, ZERO_ADDRESS, { from: deployerAccount });

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

		mcerc20 = await deployErc20Collateral({
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

		stateShort = await MultiCollateralState.new(owner, ZERO_ADDRESS, { from: deployerAccount });
		mcshort = await deployErc20Collateral({
			proxy: account1,
			mcState: stateShort.address,
			owner: owner,
			manager: manager.address,
			resolver: addressResolver.address,
			collatKey: sUSD,
			synths: [toBytes32('SynthsBTC'), toBytes32('SynthsETH')],
			minColat: toUnit(1.5),
			// 5% / 31536000 (seconds in common year)
			intRate: 1585489599,
			liqPen: toUnit(0.1),
			underCon: sUSDSynth.address,
		});

		await manager.addCollateral(mceth.address, { from: owner });
		await manager.addCollateral(mcerc20.address, { from: owner });
		await manager.addCollateral(mcshort.address, { from: owner });

		await addressResolver.importAddresses(
			[
				toBytes32('Issuer'),
				toBytes32('MultiCollateralEth'),
				toBytes32('MultiCollateralErc20'),
				toBytes32('MultiCollateralShort'),
				toBytes32('MultiCollateralManager'),
			],
			[issuer.address, mceth.address, mcerc20.address, mcshort.address, manager.address],
			{
				from: owner,
			}
		);

		await mcstate.setAssociatedContract(mceth.address, { from: owner });
		await mcstateErc20.setAssociatedContract(mcerc20.address, { from: owner });
		await stateShort.setAssociatedContract(mcshort.address, { from: owner });

		await issuer.setResolverAndSyncCache(addressResolver.address, { from: owner });

		await mceth.setResolverAndSyncCache(addressResolver.address, { from: owner });
		await mcerc20.setResolverAndSyncCache(addressResolver.address, { from: owner });
		await mcshort.setResolverAndSyncCache(addressResolver.address, { from: owner });

		await debtCache.setResolverAndSyncCache(addressResolver.address, { from: owner });

		await feePool.setResolverAndSyncCache(addressResolver.address, { from: owner });

		await mcstate.addCurrency(sUSD, { from: owner });
		await mcstateErc20.addCurrency(sUSD, { from: owner });

		await mcstate.addCurrency(sETH, { from: owner });
		await mcstateErc20.addCurrency(sBTC, { from: owner });

		await stateShort.addCurrency(sETH, { from: owner });

		await manager.setResolverAndSyncCache(addressResolver.address, { from: owner });

		await renBTC.approve(mcerc20.address, toUnit(100), { from: account1 });
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
	});

	xit('should access its dependencies via the address resolver', async () => {
		assert.equal(await addressResolver.getAddress(toBytes32('SynthsUSD')), sUSDSynth.address);
		assert.equal(await addressResolver.getAddress(toBytes32('FeePool')), feePool.address);
		assert.equal(
			await addressResolver.getAddress(toBytes32('ExchangeRates')),
			exchangeRates.address
		);
	});

	it('should add the collaterals during construction', async () => {
		assert.equal(await manager.collaterals(0), mceth.address);
		assert.equal(await manager.collaterals(1), mcerc20.address);
		assert.equal(await manager.collaterals(2), mcshort.address);
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
				assert.equal(await manager.collaterals(3), ZERO_ADDRESS);
			});
		});

		describe('retreiving collateral by address', async () => {
			it('if a collateral is in the manager, it should return true', async () => {
				assert.isTrue(await manager.collateralByAddress(mceth.address));
			});

			it('if a collateral is in the manager, it should return false', async () => {
				assert.isFalse(await manager.collateralByAddress(ZERO_ADDRESS));
			});
		});
	});

	it('should track issued synths', async () => {
		await mceth.openEthLoan(toUnit(100), sUSD, { value: toUnit(2), from: account1 });

		assert.bnEqual(await manager.issuedSynths(sUSD), toUnit(100));

		await mceth.openEthLoan(toUnit(1), sETH, { value: toUnit(2), from: account1 });

		assert.bnEqual(await manager.issuedSynths(sETH), toUnit(1));
	});

	it('should track MC total issued synths properly', async () => {
		await mceth.openEthLoan(toUnit(100), sUSD, { value: toUnit(2), from: account1 });
		await mceth.openEthLoan(toUnit(1), sETH, { value: toUnit(2), from: account1 });
		await mcerc20.openErc20Loan(toUnit(1), toUnit(100), sUSD, { from: account1 });
		await mcerc20.openErc20Loan(toUnit(1), toUnit(0.01), sBTC, { from: account1 });

		assert.bnEqual(await manager.totalIssuedSynths(), toUnit(400));
	});

	it('should get the borrow rate correctly', async () => {
		await sUSDSynth.issue(owner, toUnit(500));
		await sETHSynth.issue(owner, toUnit(5));
		await sBTCSynth.issue(owner, toUnit(0.1));
		await debtCache.takeDebtSnapshot();

		await mceth.openEthLoan(toUnit(100), sUSD, { value: toUnit(2), from: account1 });
		await mceth.openEthLoan(toUnit(1), sETH, { value: toUnit(2), from: account1 });
		await mcerc20.openErc20Loan(toUnit(1), toUnit(0.01), sBTC, { from: account1 });

		// await debtCache.takeDebtSnapshot();

		const rate = await manager.getBorrowRate();

		console.log('Borrow rate: ' + fromUnit(rate));
	});

	it('should correctly determine the total debt issued in sUSD', async () => {
		await sUSDSynth.issue(owner, toUnit(500));
		await sETHSynth.issue(owner, toUnit(5));
		await debtCache.takeDebtSnapshot();

		await mceth.openEthLoan(toUnit(100), sUSD, { value: toUnit(2), from: account1 });
		await mceth.openEthLoan(toUnit(1), sETH, { value: toUnit(2), from: account1 });
		await mcerc20.openErc20Loan(toUnit(1), toUnit(0.01), sBTC, { from: account1 });

		const x = await manager.totalIssuedSynths();

		console.log(fromUnit(x));
	});
});
