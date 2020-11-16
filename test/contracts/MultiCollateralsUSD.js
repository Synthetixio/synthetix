'use strict';

const { artifacts, contract, web3 } = require('@nomiclabs/buidler');

const { assert, addSnapshotBeforeRestoreAfterEach } = require('./common');

const MultiCollateralErc20 = artifacts.require('MultiCollateralErc20');

const BN = require('bn.js');

const {
	fastForward,
	getEthBalance,
	toUnit,
	fromUnit,
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

contract('MultiCollateralErc20', async accounts => {
	const MINUTE = 60;
	const DAY = 86400;
	const WEEK = 604800;
	const MONTH = 2629743;
	const YEAR = 31536000;

	const sUSD = toBytes32('sUSD');
	const sETH = toBytes32('sETH');
	const sBTC = toBytes32('sBTC');

	const ETH = toBytes32('sETH');
	const BTC = toBytes32('sBTC');

	const [deployerAccount, owner, oracle, , account1, account2] = accounts;

	let mcerc20,
		mcstate,
		synthetix,
		feePool,
		exchangeRates,
		addressResolver,
		sUSDSynth,
		sETHSynth,
		sBTCSynth,
		systemStatus,
		mintingFee,
		FEE_ADDRESS;

	const getLoanID = async tx => {
		const event = tx.logs.find(log => log.event === 'LoanCreated');
		return event.args.loanID;
	};

	const deployCollateral = async ({
		proxy,
		mcState,
		owner,
		resolver,
		collatKey,
		synths,
		minColat,
		intRate,
		liqPen,
		debtCeil,
		underlyingContract,
	}) => {
		return setupContract({
			accounts,
			contract: 'MultiCollateralErc20',
			args: [
				proxy,
				mcState,
				owner,
				resolver,
				collatKey,
				synths,
				minColat,
				intRate,
				liqPen,
				debtCeil,
				underlyingContract,
			],
		});
	};

	const setupMultiCollateral = async () => {
		[
			// { token: synthetix },
			{ token: sUSDSynth },
			// { token: sETHSynth },
			// { token: sBTCSynth },
		] = await Promise.all([
			// mockToken({ accounts, name: 'Synthetix', symbol: 'SNX' }),
			mockToken({ accounts, synth: 'sUSD', name: 'Synthetic USD', symbol: 'sUSD' }),
			// mockToken({ accounts, synth: 'sETH', name: 'Synthetic ETH', symbol: 'sETH' }),
			// mockToken({ accounts, synth: 'sBTC', name: 'Synthetic BTC', symbol: 'sBTC' }),
		]);

		({
			FeePool: feePool,
			AddressResolver: addressResolver,
			ExchangeRates: exchangeRates,
			SystemStatus: systemStatus,
			SynthsUSD: sUSDSynth,
			SynthsETH: sETHSynth,
			SynthsBTC: sBTCSynth,
		} = await setupAllContracts({
			accounts,
			synths: ['sUSD', 'sETH', 'sBTC'],
			contracts: ['FeePool', 'AddressResolver', 'ExchangeRates', 'SysyemStatus', 'Synthetix'],
		}));

		FEE_ADDRESS = await feePool.FEE_ADDRESS();
		// mintingFee = await multiCollateralEth.issueFeeRate();

		// mock a Issuer for the FeePool.onlyInternalContracts
		const mockIssuer = await setupContract({
			accounts,
			contract: 'GenericMock',
			mock: 'Issuer',
		});
		// instruct the mock Issuer synthsByAddress to return an address
		await mockGenericContractFnc({
			instance: mockIssuer,
			mock: 'Issuer',
			fncName: 'synthsByAddress',
			returns: [ZERO_ADDRESS],
		});

		const MultiCollateralState = artifacts.require(`MultiCollateralState`);
		mcstate = await MultiCollateralState.new(owner, ZERO_ADDRESS, { from: deployerAccount });

		mcerc20 = await deployCollateral({
			proxy: account1,
			mcState: mcstate.address,
			owner: owner,
			resolver: addressResolver.address,
			collatKey: toBytes32('sUSD'),
			synths: [toBytes32('SynthsBTC'), toBytes32('SynthsETH')],
			minColat: toUnit(1.5),
			// 5% / 31536000 (seconds in common year)
			intRate: 1585489599,
			liqPen: toUnit(0.1),
			debtCeil: toUnit(100000),
			underlyingContract: sUSDSynth.address,
		});

		await addressResolver.importAddresses(
			[toBytes32('Issuer'), toBytes32('MultiCollateralErc20')],
			[mockIssuer.address, mcerc20.address],
			{
				from: owner,
			}
		);

		await mcstate.addCurrency(sBTC, { from: owner });

		// Sync feePool with imported mockIssuer
		await feePool.setResolverAndSyncCache(addressResolver.address, { from: owner });

		await mcstate.setAssociatedContract(mcerc20.address, { from: owner });

		await mcerc20.setResolverAndSyncCache(addressResolver.address, { from: owner });

		await feePool.setResolverAndSyncCache(addressResolver.address, { from: owner });
	};

	const updateRatesWithDefaults = async () => {
		const timestamp = await currentTime();

		await exchangeRates.updateRates([ETH], ['100'].map(toUnit), timestamp, {
			from: oracle,
		});

		await exchangeRates.updateRates([BTC], ['10000'].map(toUnit), timestamp, {
			from: oracle,
		});
	};

	const fastForwardAndUpdateRates = async seconds => {
		await fastForward(seconds);
		await updateRatesWithDefaults();
	};

	before(async () => {
		await setupMultiCollateral();
	});

	addSnapshotBeforeRestoreAfterEach();

	beforeEach(async () => {
		await updateRatesWithDefaults();
	});

	it('should set constructor params on deployment', async () => {
		// assert.equal(await mcerc20.proxy(), account1);
		assert.equal(await mcerc20.multiCollateralState(), mcstate.address);
		assert.equal(await mcerc20.owner(), owner);
		assert.equal(await mcerc20.resolver(), addressResolver.address);
		assert.equal(await mcerc20.collateralKey(), toBytes32('sUSD'));
		assert.equal(await mcerc20.synths(sBTC), toBytes32('SynthsBTC'));
		assert.equal(await mcerc20.synths(sETH), toBytes32('SynthsETH'));
		assert.bnEqual(await mcerc20.minimumCollateralisation(), toUnit(1.5));
		assert.bnEqual(await mcerc20.baseInterestRate(), 1585489599);
		assert.bnEqual(await mcerc20.liquidationPenalty(), toUnit(0.1));
		assert.bnEqual(await mcerc20.debtCeiling(), toUnit(100000));
		// assert.equal(await mcerc20.underlying(), sUSDSynth.address);
	});

	it('should ensure only expected functions are mutative', async () => {
		ensureOnlyExpectedMutativeFunctions({
			abi: mcerc20.abi,
			ignoreParents: ['Owned', 'Pausable', 'MixinResolver', 'Proxy', 'MultiCollateral'],
			expected: [
				'openErc20Loan',
				'closeErc20Loan',
				'depositErc20Collateral',
				'repayErc20Loan',
				'withdrawErc20Collateral',
				'liquidateErc20Loan',
			],
		});
	});

	it('should access its dependencies via the address resolver', async () => {
		assert.equal(await addressResolver.getAddress(toBytes32('SynthsUSD')), sUSDSynth.address);
		assert.equal(await addressResolver.getAddress(toBytes32('SynthsBTC')), sBTCSynth.address);
		assert.equal(await addressResolver.getAddress(toBytes32('FeePool')), feePool.address);
		assert.equal(
			await addressResolver.getAddress(toBytes32('ExchangeRates')),
			exchangeRates.address
		);
	});

	describe('opening', async () => {
		describe('blocking conditions', async () => {});
		describe('stale rates', async () => {});
		describe('revert conditions', async () => {
			xit('should revert if the user has not approved the contract', async () => {
				await assert.revert(
					mcerc20.openErc20Loan(toUnit(100), toUnit(0.005), toBytes32('SynthsBTC'), true, {
						from: account1,
					}),
					'Allowance not high enough'
				);
			});

			xit('should revert if the user sends 0 collateral', async () => {
				await sUSDSynth.issue(account1, toUnit(100));
				await sUSDSynth.approve(mcerc20.address, toUnit(100), { from: account1 });
				await assert.revert(
					mcerc20.openErc20Loan(toUnit(0), toUnit(0.005), toBytes32('SynthsBTC'), true, {
						from: account1,
					}),
					'Not enough collateral to create a loan'
				);
			});
			xit('should revert if the user requests a shhort to large for the collateral provided', async () => {
				await sUSDSynth.issue(account1, toUnit(100));
				await sUSDSynth.approve(mcerc20.address, toUnit(100), { from: account1 });
				await assert.revert(
					mcerc20.openErc20Loan(toUnit(10), toUnit(0.005), toBytes32('SynthsBTC'), true, {
						from: account1,
					}),
					'Loan amount exceeds max borrowing power'
				);
			});
		});

		describe('when it works', async () => {
			let shortId;
			let shortTx;
			const shortAmount = toUnit(0.005);
			const shortCurrency = toBytes32('sBTC');
			const collateralAmount = toUnit(100);

			beforeEach(async () => {
				await sUSDSynth.issue(account1, toUnit(100));
				await sUSDSynth.approve(mcerc20.address, toUnit(100), { from: account1 });

				shortTx = await mcerc20.openErc20Loan(collateralAmount, shortAmount, shortCurrency, true, {
					from: account1,
				});
				shortId = await getLoanID(shortTx);
			});

			it('should emit the event', async () => {
				assert.eventEqual(shortTx, 'LoanCreated', {
					account: account1,
					loanID: shortId,
					amount: shortAmount,
					collateral: collateralAmount,
					currency: shortCurrency,
				});
			});

			xit('should denominate the position correclty', async () => {
				const short = await mcstate.getLoanNoId(account1, shortId);

				const bal = await sUSDSynth.balanceOf(account1);

				const contbal = await sUSDSynth.balanceOf(mcerc20.address);
			});

			xit('should issue the correct amount to the shorter', async () => {});

			xit('should transfer the collateral from the shorter to the contract', async () => {});
		});

		describe('closing', async () => {});

		describe('deposits', async () => {});

		describe('withdraws', async () => {});

		describe('repayments', async () => {});

		describe('liquidations', async () => {});
	});
});
