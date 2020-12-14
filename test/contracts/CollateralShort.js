'use strict';

const { artifacts, contract, web3 } = require('@nomiclabs/buidler');

const { assert, addSnapshotBeforeRestoreAfterEach } = require('./common');

const BN = require('bn.js');

const { fastForward, getEthBalance, toUnit, fromUnit, currentTime } = require('../utils')();

const { setupAllContracts, setupContract } = require('./setup');

const { ensureOnlyExpectedMutativeFunctions, setStatus } = require('./helpers');

const {
	toBytes32,
	constants: { ZERO_ADDRESS },
} = require('../..');

const CollateralManager = artifacts.require(`CollateralManager`);
const CollateralState = artifacts.require(`CollateralState`);
const CollateralManagerState = artifacts.require('CollateralManagerState');

contract('CollateralShort @gas-skip @ovm-skip', async accounts => {
	const YEAR = 31556926;

	const sUSD = toBytes32('sUSD');
	const sETH = toBytes32('sETH');
	const sBTC = toBytes32('sBTC');

	const [deployerAccount, owner, oracle, , account1, account2] = accounts;

	let short,
		state,
		managerState,
		feePool,
		exchangeRates,
		addressResolver,
		sUSDSynth,
		sBTCSynth,
		sETHSynth,
		systemStatus,
		synths,
		manager,
		issuer,
		debtCache;

	let tx, loan, id;

	const getid = async tx => {
		const event = tx.logs.find(log => log.event === 'LoanCreated');
		return event.args.id;
	};

	const fastForwardAndUpdateRates = async seconds => {
		await fastForward(seconds);
		await updateRatesWithDefaults();
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

	const issuesETHToAccount = async (issueAmount, receiver) => {
		await sETHSynth.issue(receiver, issueAmount, { from: owner });
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

	const setupShort = async () => {
		synths = ['sUSD', 'sBTC', 'sETH'];
		({
			SystemStatus: systemStatus,
			ExchangeRates: exchangeRates,
			SynthsUSD: sUSDSynth,
			SynthsBTC: sBTCSynth,
			SynthsETH: sETHSynth,
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

		const maxDebt = toUnit(10000000);
		const liqPen = toUnit(0.1);

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

		state = await CollateralState.new(owner, ZERO_ADDRESS, { from: deployerAccount });

		short = await deployShort({
			state: state.address,
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
			[toBytes32('CollateralShort'), toBytes32('CollateralManager')],
			[short.address, manager.address],
			{
				from: owner,
			}
		);

		await short.rebuildCache();
		await short.setCurrencies();

		await state.setAssociatedContract(short.address, { from: owner });

		await feePool.rebuildCache();
		await manager.rebuildCache();
		await issuer.rebuildCache();
		await debtCache.rebuildCache();

		await sUSDSynth.approve(short.address, toUnit(100000), { from: account1 });

		await manager.addCollateral(short.address, { from: owner });
		await manager.addShortableSynth(sBTCSynth.address, { from: owner });
		await manager.addShortableSynth(sETHSynth.address, { from: owner });
	};

	before(async () => {
		await setupShort();
	});

	addSnapshotBeforeRestoreAfterEach();

	beforeEach(async () => {
		await updateRatesWithDefaults();

		await issuesUSDToAccount(toUnit(100000), owner);
		await issuesBTCtoAccount(toUnit(0.5), owner);
		await issuesETHToAccount(toUnit(2), owner);

		await debtCache.takeDebtSnapshot();
	});

	it('should set constructor params on deployment', async () => {
		assert.equal(await short.state(), state.address);
		assert.equal(await short.owner(), owner);
		assert.equal(await short.resolver(), addressResolver.address);
		assert.equal(await short.collateralKey(), sUSD);
		assert.equal(await short.synths(0), toBytes32('SynthsBTC'));
		assert.equal(await short.synths(1), toBytes32('SynthsETH'));
		assert.bnEqual(await short.minCratio(), toUnit(1.5));
		assert.equal(await short.underlyingContract(), sUSDSynth.address);
	});

	it('should ensure only expected functions are mutative', async () => {
		ensureOnlyExpectedMutativeFunctions({
			abi: short.abi,
			ignoreParents: ['Owned', 'Pausable', 'MixinResolver', 'Proxy', 'Collateral'],
			expected: ['open', 'close', 'deposit', 'repay', 'withdraw', 'liquidate', 'draw'],
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

	describe('opening shorts', async () => {
		describe('should open a btc short', async () => {
			const oneBTC = toUnit(1);
			const susdCollateral = toUnit(15000);

			beforeEach(async () => {
				await issuesUSDToAccount(susdCollateral, account1);

				tx = await short.open(susdCollateral, oneBTC, sBTC, { from: account1 });

				id = await getid(tx);

				loan = await state.getLoan(account1, id);
			});

			it('should emit the event properly', async () => {
				assert.eventEqual(tx, 'LoanCreated', {
					account: account1,
					id: id,
					amount: oneBTC,
					collateral: susdCollateral,
					currency: sBTC,
				});
			});

			it('should create the short correctly', async () => {
				assert.equal(loan.account, account1);
				assert.equal(loan.collateral, susdCollateral.toString());
				assert.equal(loan.currency, sBTC);
				assert.equal(loan.short, true);
				assert.equal(loan.amount, oneBTC.toString());
				assert.equal(loan.accruedInterest, toUnit(0));
			});

			it('should correclty issue the right balance to the shorter', async () => {
				const sUSDProceeds = toUnit(10000);

				assert.bnEqual(await sUSDSynth.balanceOf(account1), sUSDProceeds);
			});

			it('should tell the manager about the short', async () => {
				assert.bnEqual(await manager.short(sBTC), oneBTC);
			});
		});

		describe('should open an eth short', async () => {
			const oneETH = toUnit(1);
			const susdCollateral = toUnit(1000);

			beforeEach(async () => {
				await issuesUSDToAccount(susdCollateral, account1);

				tx = await short.open(susdCollateral, oneETH, sETH, { from: account1 });

				id = await getid(tx);

				loan = await state.getLoan(account1, id);
			});

			it('should emit the event properly', async () => {
				assert.eventEqual(tx, 'LoanCreated', {
					account: account1,
					id: id,
					amount: oneETH,
					collateral: susdCollateral,
					currency: sETH,
				});
			});

			it('should create the short correctly', async () => {
				assert.equal(loan.account, account1);
				assert.equal(loan.collateral, susdCollateral.toString());
				assert.equal(loan.currency, sETH);
				assert.equal(loan.short, true);
				assert.equal(loan.amount, oneETH.toString());
				assert.equal(loan.accruedInterest, toUnit(0));
			});

			it('should correclty issue the right balance to the shorter', async () => {
				const sUSDProceeds = toUnit(100);

				assert.bnEqual(await sUSDSynth.balanceOf(account1), sUSDProceeds);
			});

			it('should tell the manager about the short', async () => {
				assert.bnEqual(await manager.short(sETH), oneETH);
			});
		});
	});

	describe('Drawing shorts', async () => {
		const oneETH = toUnit(1);
		const susdCollateral = toUnit(1000);

		beforeEach(async () => {
			await issuesUSDToAccount(susdCollateral, account1);

			tx = await short.open(susdCollateral, oneETH, sETH, { from: account1 });

			id = await getid(tx);

			await short.draw(id, toUnit(5), { from: account1 });
		});

		it('should update the loan', async () => {
			loan = await state.getLoan(account1, id);
			assert.equal(loan.amount, toUnit(6).toString());
		});

		it('should transfer the proceeds to the user', async () => {
			assert.bnEqual(await sUSDSynth.balanceOf(account1), toUnit(600));
		});

		it('should not let them draw too much', async () => {
			await assert.revert(
				short.draw(id, toUnit(8), { from: account1 }),
				'Drawing this much would put the loan under minimum collateralisation'
			);
		});
	});

	describe('Accrue Interest', async () => {
		beforeEach(async () => {});

		it('should correctly determine the interest on a short', async () => {
			const oneBTC = toUnit(1);
			const susdCollateral = toUnit(15000);

			await issuesUSDToAccount(susdCollateral, account1);

			tx = await short.open(susdCollateral, oneBTC, sBTC, { from: account1 });
			id = await getid(tx);

			// after a year we should have accrued about 33%.

			await fastForwardAndUpdateRates(YEAR);

			// deposit some collateral to trigger the interest accrual.

			tx = await short.deposit(account1, id, toUnit(1), { from: account1 });

			loan = await state.getLoan(account1, id);

			const interest = Math.round(parseFloat(fromUnit(loan.accruedInterest)) * 10000) / 10000;

			assert.equal(interest, 0.3333);
		});
	});
});
