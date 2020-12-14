'use strict';

const { artifacts, contract } = require('@nomiclabs/buidler');

const { assert, addSnapshotBeforeRestoreAfterEach } = require('./common');

const { toUnit, currentTime, fromUnit } = require('../utils')();

const { setupAllContracts, setupContract } = require('./setup');

const { ensureOnlyExpectedMutativeFunctions } = require('./helpers');

const {
	toBytes32,
	constants: { ZERO_ADDRESS },
} = require('../..');

const CollateralManager = artifacts.require(`CollateralManager`);
const CollateralState = artifacts.require(`CollateralState`);
const CollateralManagerState = artifacts.require('CollateralManagerState');

contract('CollateralManager @gas-skip @ovm-skip', async accounts => {
	const [deployerAccount, owner, oracle, , account1] = accounts;

	const sETH = toBytes32('sETH');
	const sUSD = toBytes32('sUSD');
	const sBTC = toBytes32('sBTC');

	let ceth,
		mcstate,
		mcstateErc20,
		cerc20,
		proxy,
		renBTC,
		tokenState,
		manager,
		managerState,
		addressResolver,
		issuer,
		exchangeRates,
		feePool,
		sUSDSynth,
		sETHSynth,
		sBTCSynth,
		synths,
		maxDebt,
		liqPen,
		short,
		shortState,
		debtCache,
		tx,
		id;

	const getid = async tx => {
		const event = tx.logs.find(log => log.event === 'LoanCreated');
		return event.args.id;
	};

	const deployEthCollateral = async ({
		mcState,
		owner,
		manager,
		resolver,
		collatKey,
		synths,
		minColat,
		minSize,
	}) => {
		return setupContract({
			accounts,
			contract: 'CollateralEth',
			args: [mcState, owner, manager, resolver, collatKey, synths, minColat, minSize],
		});
	};

	const deployErc20Collateral = async ({
		mcState,
		owner,
		manager,
		resolver,
		collatKey,
		synths,
		minColat,
		minSize,
		underCon,
	}) => {
		return setupContract({
			accounts,
			contract: 'CollateralErc20',
			args: [mcState, owner, manager, resolver, collatKey, synths, minColat, minSize, underCon],
		});
	};

	const deployShort = async ({
		state,
		owner,
		manager,
		resolver,
		collatKey,
		synths,
		minColat,
		minSize,
		underCon,
	}) => {
		return setupContract({
			accounts,
			contract: 'CollateralShort',
			args: [state, owner, manager, resolver, collatKey, synths, minColat, minSize, underCon],
		});
	};

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

		maxDebt = toUnit(10000000);
		liqPen = toUnit(0.1);

		manager = await CollateralManager.new(
			managerState.address,
			owner,
			addressResolver.address,
			maxDebt,
			liqPen,
			// 5% / 31536000 (seconds in common year)
			1585489599,
			0,
			{
				from: deployerAccount,
			}
		);

		await managerState.setAssociatedContract(manager.address, { from: owner });

		mcstate = await CollateralState.new(owner, ZERO_ADDRESS, { from: deployerAccount });

		ceth = await deployEthCollateral({
			mcState: mcstate.address,
			owner: owner,
			manager: manager.address,
			resolver: addressResolver.address,
			collatKey: sETH,
			synths: [toBytes32('SynthsUSD'), toBytes32('SynthsETH')],
			minColat: toUnit(1.5),
			minSize: toUnit(1),
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
			mcState: mcstateErc20.address,
			owner: owner,
			manager: manager.address,
			resolver: addressResolver.address,
			collatKey: sBTC,
			synths: [toBytes32('SynthsUSD'), toBytes32('SynthsBTC')],
			minColat: toUnit(1.5),
			minSize: toUnit(0.1),
			underCon: renBTC.address,
		});

		shortState = await CollateralState.new(owner, ZERO_ADDRESS, { from: deployerAccount });

		short = await deployShort({
			state: shortState.address,
			owner: owner,
			manager: manager.address,
			resolver: addressResolver.address,
			collatKey: sUSD,
			synths: [toBytes32('SynthsBTC'), toBytes32('SynthsETH')],
			minColat: toUnit(1.5),
			minSize: toUnit(0.1),
			underCon: sUSDSynth.address,
		});

		await addressResolver.importAddresses(
			[
				toBytes32('CollateralEth'),
				toBytes32('CollateralErc20'),
				toBytes32('CollateralManager'),
				toBytes32('CollateralShort'),
			],
			[ceth.address, cerc20.address, manager.address, short.address],
			{
				from: owner,
			}
		);

		await mcstate.setAssociatedContract(ceth.address, { from: owner });
		await mcstateErc20.setAssociatedContract(cerc20.address, { from: owner });
		await shortState.setAssociatedContract(short.address, { from: owner });

		await issuer.rebuildCache();
		await ceth.rebuildCache();
		await cerc20.rebuildCache();
		await debtCache.rebuildCache();
		await feePool.rebuildCache();
		await manager.rebuildCache();
		await short.rebuildCache();

		await ceth.setCurrencies();
		await cerc20.setCurrencies();
		await short.setCurrencies();

		await manager.addCollateral(ceth.address, { from: owner });
		await manager.addCollateral(cerc20.address, { from: owner });
		await manager.addCollateral(short.address, { from: owner });

		await manager.addSynth(sUSDSynth.address, { from: owner });
		await manager.addSynth(sETHSynth.address, { from: owner });
		await manager.addSynth(sBTCSynth.address, { from: owner });

		await sUSDSynth.approve(short.address, toUnit(100000), { from: account1 });

		await manager.addShortableSynth(sBTCSynth.address, { from: owner });
		await manager.addShortableSynth(sETHSynth.address, { from: owner });

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

	it('should set constructor params on deployment', async () => {
		assert.equal(await manager.state(), managerState.address);
		assert.equal(await manager.owner(), owner);
		assert.equal(await manager.resolver(), addressResolver.address);
		assert.bnEqual(await manager.maxDebt(), maxDebt);
		assert.bnEqual(await manager.liquidationPenalty(), liqPen);
	});

	it('should ensure only expected functions are mutative', async () => {
		ensureOnlyExpectedMutativeFunctions({
			abi: manager.abi,
			ignoreParents: ['Owned', 'Pausable', 'MixinResolver', 'Proxy'],
			expected: [
				'setUtilisationMultiplier',
				'setMaxDebt',
				'setLiquidationPenalty',
				'setBaseBorrowRate',
				'setBaseShortRate',
				'addCollateral',
				'addSynth',
				'addShortableSynth',
				'updateBorrowRates',
				'updateShortRates',
				'incrementLongs',
				'decrementLongs',
				'incrementShorts',
				'decrementShorts',
			],
		});
	});

	it('should access its dependencies via the address resolver', async () => {
		assert.equal(await addressResolver.getAddress(toBytes32('SynthsUSD')), sUSDSynth.address);
		assert.equal(await addressResolver.getAddress(toBytes32('FeePool')), feePool.address);
		assert.equal(
			await addressResolver.getAddress(toBytes32('ExchangeRates')),
			exchangeRates.address
		);
	});

	describe('getting collaterals', async () => {
		it('should add the collaterals during construction', async () => {
			assert.isTrue(await manager.hasCollateral(ceth.address));
			assert.isTrue(await manager.hasCollateral(cerc20.address));
		});
	});

	describe('tracking synth balances across collaterals', async () => {
		beforeEach(async () => {
			tx = await ceth.open(toUnit(100), sUSD, { value: toUnit(2), from: account1 });
			await ceth.open(toUnit(1), sETH, { value: toUnit(2), from: account1 });
			await cerc20.open(toUnit(1), toUnit(100), sUSD, { from: account1 });
			await cerc20.open(toUnit(1), toUnit(0.01), sBTC, { from: account1 });

			id = await getid(tx);
		});

		it('should correctly get the total sUSD balance', async () => {
			assert.bnEqual(await manager.long(sUSD), toUnit(200));
		});

		it('should correctly get the total sETH balance', async () => {
			assert.bnEqual(await manager.long(sETH), toUnit(1));
		});

		it('should correctly get the total sBTC balance', async () => {
			assert.bnEqual(await manager.long(sBTC), toUnit(0.01));
		});

		it('should get the total balance in sUSD correctly', async () => {
			const total = await manager.totalLong();
			const debt = total.debt;

			assert.bnEqual(debt, toUnit(400));
		});

		it('should reduce the sUSD balance when a loan is closed', async () => {
			issuesUSDToAccount(toUnit(10), account1);
			await ceth.close(id, { from: account1 });

			assert.bnEqual(await manager.long(sUSD), toUnit(100));
		});

		it('should reduce the total balance in sUSD when a loan is closed', async () => {
			issuesUSDToAccount(toUnit(10), account1);
			await ceth.close(id, { from: account1 });

			const total = await manager.totalLong();
			const debt = total.debt;

			assert.bnEqual(debt, toUnit(300));
		});
	});

	describe('setting variables', async () => {
		describe('setUtilisationMultiplier', async () => {
			describe('revert condtions', async () => {
				it('should fail if not called by the owner', async () => {
					await assert.revert(
						manager.setUtilisationMultiplier(toUnit(1), { from: account1 }),
						'Only the contract owner may perform this action'
					);
				});
				it('should fail if the minimum is 0', async () => {
					await assert.revert(
						manager.setUtilisationMultiplier(toUnit(0), { from: owner }),
						'Must be greater than 0'
					);
				});
			});
			describe('when it succeeds', async () => {
				beforeEach(async () => {
					await manager.setUtilisationMultiplier(toUnit(2), { from: owner });
				});
				it('should update the utilisation multiplier', async () => {
					assert.bnEqual(await manager.utilisationMultiplier(), toUnit(2));
				});
			});
		});

		describe('setLiquidationPenalty', async () => {
			describe('revert condtions', async () => {
				it('should fail if not called by the owner', async () => {
					await assert.revert(
						manager.setLiquidationPenalty(toUnit(1), { from: account1 }),
						'Only the contract owner may perform this action'
					);
				});
				it('should fail if 0 is passed', async () => {
					await assert.revert(
						manager.setLiquidationPenalty(toUnit(0), { from: owner }),
						'Must be greater than 0'
					);
				});
			});
			describe('when it succeeds', async () => {
				beforeEach(async () => {
					await manager.setLiquidationPenalty(toUnit(0.2), { from: owner });
				});
				it('should update the liquidation penalty', async () => {
					assert.bnEqual(await manager.liquidationPenalty(), toUnit(0.2));
				});
			});
		});

		describe('setBaseBorrowRate', async () => {
			describe('revert condtions', async () => {
				it('should fail if not called by the owner', async () => {
					await assert.revert(
						manager.setBaseBorrowRate(toUnit(1), { from: account1 }),
						'Only the contract owner may perform this action'
					);
				});
			});
			describe('when it succeeds', async () => {
				beforeEach(async () => {
					await manager.setBaseBorrowRate(toUnit(2), { from: owner });
				});
				it('should update the base interest rate', async () => {
					assert.bnEqual(await manager.baseBorrowRate(), toUnit(2));
				});
				it('should allow the base interest rate to be  0', async () => {
					await manager.setBaseBorrowRate(toUnit(0), { from: owner });
					assert.bnEqual(await manager.baseBorrowRate(), toUnit(0));
				});
			});
		});
	});

	describe('adding collateral', async () => {
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
				assert.isTrue(await manager.hasCollateral(ZERO_ADDRESS));
			});
		});

		describe('retreiving collateral by address', async () => {
			it('if a collateral is in the manager, it should return true', async () => {
				assert.isTrue(await manager.hasCollateral(ceth.address));
			});

			it('if a collateral is not in the manager, it should return false', async () => {
				assert.isFalse(await manager.hasCollateral(ZERO_ADDRESS));
			});
		});
	});

	describe('adding synths', async () => {
		describe('revert conditions', async () => {
			it('should revert if the caller is not the owner', async () => {
				await assert.revert(
					manager.addSynth(ZERO_ADDRESS, { from: account1 }),
					'Only the contract owner may perform this action'
				);
			});
		});

		describe('when a new synth is added', async () => {
			beforeEach(async () => {
				await manager.addSynth(ZERO_ADDRESS, { from: owner });
			});

			it('should add the collateral', async () => {
				assert.isTrue(await manager.hasSynth(ZERO_ADDRESS));
			});
		});

		describe('retreiving synth by address', async () => {
			it('if a synth is in the manager, it should return true', async () => {
				assert.isTrue(await manager.hasSynth(sUSDSynth.address));
			});

			it('if a collateral is not in the manager, it should return false', async () => {
				assert.isFalse(await manager.hasSynth(ZERO_ADDRESS));
			});
		});
	});
});
