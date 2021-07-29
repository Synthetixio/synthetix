'use strict';

const { artifacts, contract, web3 } = require('hardhat');

const { assert, addSnapshotBeforeRestoreAfterEach } = require('./common');

const BN = require('bn.js');

const PublicEST8Decimals = artifacts.require('PublicEST8Decimals');

const { fastForward, toUnit, currentTime } = require('../utils')();

const { setupAllContracts, setupContract } = require('./setup');

const { ensureOnlyExpectedMutativeFunctions, setStatus } = require('./helpers');

const {
	toBytes32,
	constants: { ZERO_ADDRESS },
} = require('../..');

let CollateralManager;
let CollateralManagerState;
let CollateralState;
let ProxyERC20;
let TokenState;

contract('CollateralErc20', async accounts => {
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
		sUSDSynth,
		sBTCSynth,
		renBTC,
		systemStatus,
		synths,
		manager,
		issuer,
		util,
		debtCache,
		FEE_ADDRESS;

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

	const fastForwardAndUpdateRates = async seconds => {
		await fastForward(seconds);
		await updateRatesWithDefaults();
	};

	const deployUtil = async ({ resolver }) => {
		return setupContract({
			accounts,
			contract: 'CollateralUtil',
			args: [resolver],
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
			SystemStatus: systemStatus,
			ExchangeRates: exchangeRates,
			SynthsUSD: sUSDSynth,
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
				'Exchanger',
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

		FEE_ADDRESS = await feePool.FEE_ADDRESS();

		state = await CollateralState.new(owner, ZERO_ADDRESS, { from: deployerAccount });

		util = await deployUtil({ resolver: addressResolver.address });

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
			[toBytes32('CollateralErc20'), toBytes32('CollateralManager'), toBytes32('CollateralUtil')],
			[cerc20.address, manager.address, util.address],
			{
				from: owner,
			}
		);

		await feePool.rebuildCache();
		await manager.rebuildCache();
		await issuer.rebuildCache();
		await debtCache.rebuildCache();
		await util.rebuildCache();

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

	it('should set constructor params on deployment', async () => {
		assert.equal(await cerc20.state(), state.address);
		assert.equal(await cerc20.owner(), owner);
		assert.equal(await cerc20.resolver(), addressResolver.address);
		assert.equal(await cerc20.collateralKey(), sBTC);
		assert.equal(await cerc20.synths(0), toBytes32('SynthsUSD'));
		assert.equal(await cerc20.synths(1), toBytes32('SynthsBTC'));
		assert.bnEqual(await cerc20.minCratio(), toUnit(1.5));
		assert.bnEqual(await cerc20.minCollateral(), toUnit(0.1));
		assert.equal(await cerc20.underlyingContract(), renBTC.address);
		assert.bnEqual(await cerc20.underlyingContractDecimals(), await renBTC.decimals());
	});

	it('should ensure only expected functions are mutative', async () => {
		ensureOnlyExpectedMutativeFunctions({
			abi: cerc20.abi,
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

	// PUBLIC VIEW TESTS
	describe('cratio test', async () => {
		describe('sUSD loans', async () => {
			beforeEach(async () => {
				tx = await cerc20.open(oneRenBTC, fiveThousandsUSD, sUSD, {
					from: account1,
				});

				id = getid(tx);
				loan = await state.getLoan(account1, id);
			});

			it('when we issue at 200%, our c ratio is 200%', async () => {
				const ratio = await cerc20.collateralRatio(loan);
				assert.bnEqual(ratio, toUnit(2));
			});

			it('when the price falls by 25% our c ratio is 150%', async () => {
				await exchangeRates.updateRates([sBTC], ['7500'].map(toUnit), await currentTime(), {
					from: oracle,
				});

				const ratio = await cerc20.collateralRatio(loan);
				assert.bnEqual(ratio, toUnit(1.5));
			});

			it('when the price increases by 100% our c ratio is 400%', async () => {
				await exchangeRates.updateRates([sBTC], ['20000'].map(toUnit), await currentTime(), {
					from: oracle,
				});

				const ratio = await cerc20.collateralRatio(loan);
				assert.bnEqual(ratio, toUnit(4));
			});

			it('when the price fallsby 50% our cratio is 100%', async () => {
				await exchangeRates.updateRates([sBTC], ['5000'].map(toUnit), await currentTime(), {
					from: oracle,
				});

				const ratio = await cerc20.collateralRatio(loan);
				assert.bnEqual(ratio, toUnit(1));
			});
		});
		describe('sBTC loans', async () => {
			beforeEach(async () => {
				tx = await cerc20.open(twoRenBTC, toUnit(1), sBTC, {
					from: account1,
				});

				id = getid(tx);
				loan = await state.getLoan(account1, id);
			});

			it('when we issue at 200%, our c ratio is 200%', async () => {
				const ratio = await cerc20.collateralRatio(loan);
				assert.bnEqual(ratio, toUnit(2));
			});

			it('price changes should not change the cratio', async () => {
				await exchangeRates.updateRates([sBTC], ['75'].map(toUnit), await currentTime(), {
					from: oracle,
				});

				const ratio = await cerc20.collateralRatio(loan);
				assert.bnEqual(ratio, toUnit(2));
			});
		});
	});

	describe('max loan test', async () => {
		it('should convert correctly', async () => {
			// $150 worth of btc should allow 100 sUSD to be issued.
			const sUSDAmount = await cerc20.maxLoan(toUnit(0.015), sUSD);

			assert.bnClose(sUSDAmount, toUnit(100), 100);

			// $150 worth of btc should allow $100 (1) of sETH to be issued.
			const sETHAmount = await cerc20.maxLoan(toUnit(0.015), sETH);

			assert.bnEqual(sETHAmount, toUnit(1));
		});
	});

	describe('scaling collateral test', async () => {
		it('should scale up 1e8 to 1e18 correctly', async () => {
			// Scaling up 1 renBTC to 18 decimals works.
			const scaledCollateral = await cerc20.scaleUpCollateral(oneRenBTC);

			assert.bnEqual(scaledCollateral, toUnit(1));
		});

		it('should scaled up 1.23456789 correctly', async () => {
			// Scaling up 1.2345678 renBTC to 8 decimals works.
			const bal = 123456789;
			const scaledCollateral = await cerc20.scaleUpCollateral(bal);

			assert.bnEqual(scaledCollateral, toUnit('1.23456789'));
		});

		it('should scale down 1e18 to 1e8 correctly', async () => {
			// Scaling down 1.2345678 renBTC to 8 decimals works.
			const scaledCollateral = await cerc20.scaleDownCollateral(toUnit('1'));

			assert.bnEqual(scaledCollateral, oneRenBTC);
		});

		it('should scale down 1.23456789 correctly', async () => {
			// Scaling down 1 renBTC to 8 decimals works.
			const scaledCollateral = await cerc20.scaleDownCollateral(toUnit('1.23456789'));

			assert.bnEqual(scaledCollateral, 123456789);
		});

		it('if more than 8 decimals come back, it truncates and does not round', async () => {
			// If we round, we might run out of ren in the contract.
			const scaledCollateral = await cerc20.scaleDownCollateral(toUnit('1.23456789999999999'));

			assert.bnEqual(scaledCollateral, 123456789);
		});
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

		// it('when we start at 150%, a 25% reduction in collateral requires', async () => {
		// 	tx = await cerc20.open(oneRenBTC, fiveThousandsUSD, sUSD, {
		// 		from: account1,
		// 	});

		// 	id = getid(tx);

		// 	await exchangeRates.updateRates([sBTC], ['7500'].map(toUnit), await currentTime(), {
		// 		from: oracle,
		// 	});

		// 	loan = await state.getLoan(account1, id);

		// amountToLiquidate = await util.liquidationAmount(loan, minCratio, collateralKey);

		// 	assert.bnClose(amountToLiquidate, toUnit(4687.5), 10000);
		// });

		// it('when we start at 150%, any reduction in collateral will make the position undercollateralised ', async () => {
		// 	tx = await cerc20.open(750000000, fiveThousandsUSD, sUSD, {
		// 		from: account1,
		// 	});

		// 	id = getid(tx);
		// 	loan = await state.getLoan(account1, id);

		// 	await exchangeRates.updateRates([sBTC], ['9000'].map(toUnit), await currentTime(), {
		// 		from: oracle,
		// 	});

		// amountToLiquidate = await util.liquidationAmount(loan, minCratio, collateralKey);

		// 	assert.bnClose(amountToLiquidate, toUnit(1875), 10000);
		// });
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

	// // SETTER TESTS

	describe('setting variables', async () => {
		describe('setMinCratio', async () => {
			describe('revert condtions', async () => {
				it('should fail if not called by the owner', async () => {
					await assert.revert(
						cerc20.setMinCratio(toUnit(1), { from: account1 }),
						'Only the contract owner may perform this action'
					);
				});
				it('should fail if the minimum is less than 1', async () => {
					await assert.revert(
						cerc20.setMinCratio(toUnit(0.99), { from: owner }),
						'Cratio must be above 1'
					);
				});
			});
			describe('when it succeeds', async () => {
				beforeEach(async () => {
					await cerc20.setMinCratio(toUnit(2), { from: owner });
				});
				it('should update the minCratio', async () => {
					assert.bnEqual(await cerc20.minCratio(), toUnit(2));
				});
			});
		});

		describe('setIssueFeeRate', async () => {
			describe('revert condtions', async () => {
				it('should fail if not called by the owner', async () => {
					await assert.revert(
						cerc20.setIssueFeeRate(toUnit(1), { from: account1 }),
						'Only the contract owner may perform this action'
					);
				});
			});
			describe('when it succeeds', async () => {
				beforeEach(async () => {
					await cerc20.setIssueFeeRate(toUnit(0.2), { from: owner });
				});
				it('should update the liquidation penalty', async () => {
					assert.bnEqual(await cerc20.issueFeeRate(), toUnit(0.2));
				});
				it('should allow the issue fee rate to be  0', async () => {
					await cerc20.setIssueFeeRate(toUnit(0), { from: owner });
					assert.bnEqual(await cerc20.issueFeeRate(), toUnit(0));
				});
			});
		});

		describe('setInteractionDelay', async () => {
			describe('revert condtions', async () => {
				it('should fail if not called by the owner', async () => {
					await assert.revert(
						cerc20.setInteractionDelay(toUnit(1), { from: account1 }),
						'Only the contract owner may perform this action'
					);
				});
				it('should fail if the owner passes to big of a value', async () => {
					await assert.revert(
						cerc20.setInteractionDelay(toUnit(3601), { from: owner }),
						'Max 1 hour'
					);
				});
			});
			describe('when it succeeds', async () => {
				beforeEach(async () => {
					await cerc20.setInteractionDelay(toUnit(50), { from: owner });
				});
				it('should update the interaction delay', async () => {
					assert.bnEqual(await cerc20.interactionDelay(), toUnit(50));
				});
			});
		});

		describe('setManager', async () => {
			describe('revert condtions', async () => {
				it('should fail if not called by the owner', async () => {
					await assert.revert(
						cerc20.setManager(ZERO_ADDRESS, { from: account1 }),
						'Only the contract owner may perform this action'
					);
				});
			});
			describe('when it succeeds', async () => {
				beforeEach(async () => {
					await cerc20.setManager(ZERO_ADDRESS, { from: owner });
				});
				it('should update the manager', async () => {
					assert.bnEqual(await cerc20.manager(), ZERO_ADDRESS);
				});
			});
		});

		describe('setCanOpenLoans', async () => {
			describe('revert condtions', async () => {
				it('should fail if not called by the owner', async () => {
					await assert.revert(
						cerc20.setCanOpenLoans(false, { from: account1 }),
						'Only the contract owner may perform this action'
					);
				});
			});
			describe('when it succeeds', async () => {
				beforeEach(async () => {
					await cerc20.setCanOpenLoans(false, { from: owner });
				});
				it('should update the manager', async () => {
					assert.isFalse(await cerc20.canOpenLoans());
				});
			});
		});
	});

	// // LOAN INTERACTIONS

	describe('opening', async () => {
		describe('potential blocking conditions', async () => {
			['System', 'Issuance'].forEach(section => {
				describe(`when ${section} is suspended`, () => {
					beforeEach(async () => {
						await setStatus({ owner, systemStatus, section, suspend: true });
					});
					it('then calling openLoan() reverts', async () => {
						await assert.revert(
							cerc20.open(oneRenBTC, onesUSD, sUSD, { from: account1 }),
							'Operation prohibited'
						);
					});
					describe(`when ${section} is resumed`, () => {
						beforeEach(async () => {
							await setStatus({ owner, systemStatus, section, suspend: false });
						});
						it('then calling openLoan() succeeds', async () => {
							await cerc20.open(oneRenBTC, onesUSD, sUSD, {
								from: account1,
							});
						});
					});
				});
			});
			describe('when rates have gone stale', () => {
				beforeEach(async () => {
					await fastForward((await exchangeRates.rateStalePeriod()).add(web3.utils.toBN('300')));
				});
				it('then calling openLoan() reverts', async () => {
					await assert.revert(
						cerc20.open(oneRenBTC, onesUSD, sUSD, { from: account1 }),
						'Invalid rate'
					);
				});
				describe('when BTC gets a rate', () => {
					beforeEach(async () => {
						await updateRatesWithDefaults();
					});
					it('then calling openLoan() succeeds', async () => {
						await cerc20.open(oneRenBTC, onesUSD, sUSD, { from: account1 });
					});
				});
			});
		});

		describe('revert conditions', async () => {
			it('should revert if they request a currency that is not supported', async () => {
				await assert.revert(
					cerc20.open(oneRenBTC, onesUSD, toBytes32('sJPY'), { from: account1 }),
					'Not allowed to issue'
				);
			});

			it('should revert if they send 0 collateral', async () => {
				await assert.revert(
					cerc20.open(toUnit(0), onesUSD, sUSD, { from: account1 }),
					'Not enough collateral'
				);
			});

			it('should revert if the requested loan exceeds borrowing power', async () => {
				await assert.revert(
					cerc20.open(oneRenBTC, toUnit(10000), sUSD, {
						from: account1,
					}),
					'Exceed max borrow power'
				);
			});
		});

		describe('should open a btc loan denominated in sUSD', async () => {
			const fiveHundredSUSD = toUnit(500);
			let issueFeeRate;
			let issueFee;

			beforeEach(async () => {
				tx = await cerc20.open(oneRenBTC, fiveHundredSUSD, sUSD, {
					from: account1,
				});

				id = getid(tx);

				loan = await state.getLoan(account1, id);

				issueFeeRate = new BN(await cerc20.issueFeeRate());
				issueFee = fiveHundredSUSD.mul(issueFeeRate);
			});

			it('should set the loan correctly', async () => {
				assert.equal(loan.account, account1);
				assert.equal(loan.collateral, toUnit(1).toString());
				assert.equal(loan.currency, sUSD);
				assert.equal(loan.amount, fiveHundredSUSD.toString());
				assert.equal(loan.accruedInterest, toUnit(0));
			});

			it('should issue the correct amount to the borrower', async () => {
				const expectedBal = fiveHundredSUSD.sub(issueFee);

				assert.bnEqual(await sUSDSynth.balanceOf(account1), expectedBal);
			});

			it('should issue the minting fee to the fee pool', async () => {
				const feePoolBalance = await sUSDSynth.balanceOf(FEE_ADDRESS);

				assert.equal(issueFee, feePoolBalance.toString());
			});

			it('should emit the event properly', async () => {
				assert.eventEqual(tx, 'LoanCreated', {
					account: account1,
					id: id,
					amount: fiveHundredSUSD,
					collateral: toUnit(1),
					currency: sUSD,
				});
			});
		});

		describe('should open a btc loan denominated in sBTC', async () => {
			let issueFeeRate;
			let issueFee;

			beforeEach(async () => {
				tx = await cerc20.open(fiveRenBTC, toUnit(2), sBTC, {
					from: account1,
				});

				id = getid(tx);

				loan = await state.getLoan(account1, id);

				issueFeeRate = await cerc20.issueFeeRate();
				issueFee = toUnit(2).mul(issueFeeRate);
			});

			it('should set the loan correctly', async () => {
				assert.equal(loan.account, account1);
				assert.equal(loan.collateral, toUnit(5).toString());
				assert.equal(loan.currency, sBTC);
				assert.equal(loan.amount, toUnit(2).toString());
				assert.equal(loan.accruedInterest, toUnit(0));
			});

			it('should issue the correct amount to the borrower', async () => {
				const expecetdBalance = toUnit(2).sub(issueFee);

				assert.bnEqual(await sBTCSynth.balanceOf(account1), expecetdBalance);
			});

			it('should issue the minting fee to the fee pool', async () => {
				const feePoolBalance = await sUSDSynth.balanceOf(FEE_ADDRESS);

				assert.equal(issueFee, feePoolBalance.toString());
			});

			it('should emit the event properly', async () => {
				assert.eventEqual(tx, 'LoanCreated', {
					account: account1,
					id: id,
					amount: toUnit(2),
					collateral: toUnit(5),
					currency: sBTC,
				});
			});
		});
	});

	describe('deposits', async () => {
		beforeEach(async () => {
			tx = await cerc20.open(twoRenBTC, oneHundredsUSD, sUSD, {
				from: account1,
			});

			id = getid(tx);

			await fastForwardAndUpdateRates(INTERACTION_DELAY);
		});

		describe('potential blocking conditions', async () => {
			['System', 'Issuance'].forEach(section => {
				describe(`when ${section} is suspended`, () => {
					beforeEach(async () => {
						await setStatus({ owner, systemStatus, section, suspend: true });
					});
					it('then calling depopsit() reverts', async () => {
						await assert.revert(
							cerc20.deposit(account1, id, oneRenBTC, { from: account1 }),
							'Operation prohibited'
						);
					});
					describe(`when ${section} is resumed`, () => {
						beforeEach(async () => {
							await setStatus({ owner, systemStatus, section, suspend: false });
						});
						it('then calling deposit() succeeds', async () => {
							await cerc20.deposit(account1, id, oneRenBTC, { from: account1 });
						});
					});
				});
			});
		});

		describe('revert conditions', async () => {
			it('should revert if they do not send any eth', async () => {
				await assert.revert(
					cerc20.deposit(account1, id, 0, { from: account1 }),
					'Deposit must be above 0'
				);
			});
		});

		describe('should allow deposits', async () => {
			beforeEach(async () => {
				await cerc20.deposit(account1, id, oneRenBTC, { from: account1 });
			});

			it('should increase the total collateral of the loan', async () => {
				loan = await state.getLoan(account1, id);

				assert.bnEqual(loan.collateral, toUnit(3));
			});
		});
	});

	describe('withdraws', async () => {
		let accountRenBalBefore;

		beforeEach(async () => {
			loan = await cerc20.open(twoRenBTC, oneHundredsUSD, sUSD, {
				from: account1,
			});

			id = getid(loan);

			await fastForwardAndUpdateRates(INTERACTION_DELAY);
		});

		describe('potential blocking conditions', async () => {
			['System', 'Issuance'].forEach(section => {
				describe(`when ${section} is suspended`, () => {
					beforeEach(async () => {
						await setStatus({ owner, systemStatus, section, suspend: true });
					});
					it('then calling depopsit() reverts', async () => {
						await assert.revert(
							cerc20.withdraw(id, oneRenBTC, { from: account1 }),
							'Operation prohibited'
						);
					});
					describe(`when ${section} is resumed`, () => {
						beforeEach(async () => {
							await setStatus({ owner, systemStatus, section, suspend: false });
						});
						it('then calling deposit() succeeds', async () => {
							await cerc20.withdraw(id, oneRenBTC, { from: account1 });
						});
					});
				});
			});
		});

		describe('revert conditions', async () => {
			it('should revert if the withdraw would put them under minimum collateralisation', async () => {
				await assert.revert(cerc20.withdraw(id, twoRenBTC, { from: account1 }), 'Cratio too low');
			});

			it('should revert if they try to withdraw all the collateral', async () => {
				await assert.revert(cerc20.withdraw(id, twoRenBTC, { from: account1 }), 'Cratio too low');
			});

			it('should revert if the sender is not borrower', async () => {
				await issuesBTCtoAccount(oneRenBTC, account2);
				await renBTC.approve(cerc20.address, oneRenBTC, { from: account2 });

				await assert.revert(cerc20.withdraw(id, oneRenBTC, { from: account2 }));
			});
		});

		describe('should allow withdraws', async () => {
			beforeEach(async () => {
				accountRenBalBefore = await renBTC.balanceOf(account1);

				await cerc20.withdraw(id, oneRenBTC, {
					from: account1,
				});
			});

			it('should decrease the total collateral of the loan', async () => {
				loan = await state.getLoan(account1, id);

				const expectedCollateral = toUnit(2).sub(toUnit(1));

				assert.bnEqual(loan.collateral, expectedCollateral);
			});

			it('should transfer the withdrawn collateral to the borrower', async () => {
				const bal = await renBTC.balanceOf(account1);

				assert.bnEqual(bal, accountRenBalBefore.add(oneRenBTC));
			});
		});
	});

	describe('repayments', async () => {
		beforeEach(async () => {
			// make a loan here so we have a valid ID to pass to the blockers and reverts.
			tx = await cerc20.open(twoRenBTC, oneHundredsUSD, sUSD, {
				from: account1,
			});

			// to get past fee reclamation and settlement owing.
			await fastForwardAndUpdateRates(INTERACTION_DELAY);

			id = getid(tx);
		});

		describe('potential blocking conditions', async () => {
			['System', 'Issuance'].forEach(section => {
				describe(`when ${section} is suspended`, () => {
					beforeEach(async () => {
						await setStatus({ owner, systemStatus, section, suspend: true });
					});
					it('then calling repay() reverts', async () => {
						await assert.revert(
							cerc20.repay(account1, id, onesUSD, { from: account1 }),
							'Operation prohibited'
						);
					});
					describe(`when ${section} is resumed`, () => {
						beforeEach(async () => {
							await setStatus({ owner, systemStatus, section, suspend: false });
						});
						it('then calling repay() succeeds', async () => {
							await cerc20.repay(account1, id, onesUSD, { from: account1 });
						});
					});
				});
			});
		});

		describe('revert conditions', async () => {
			it('should revert if they try to repay 0', async () => {
				await assert.revert(
					cerc20.repay(account1, id, 0, { from: account1 }),
					'Payment must be above 0'
				);
			});

			// account 2 had no sUSD
			it('should revert if they have no sUSD', async () => {
				await assert.revert(
					cerc20.repay(account1, id, tensUSD, { from: account2 }),
					'Not enough balance'
				);
			});

			it('should revert if they try to pay more than the amount owing', async () => {
				await issuesUSDToAccount(toUnit(1000), account1);
				await assert.revert(
					cerc20.repay(account1, id, toUnit(1000), { from: account1 }),
					"VM Exception while processing transaction: reverted with reason string 'SafeMath: subtraction overflow'"
				);
			});
		});

		describe('should allow repayments on an sUSD loan', async () => {
			// I'm not testing interest here, just that payment reduces the amounts.
			const expectedString = '90000';

			beforeEach(async () => {
				await issuesUSDToAccount(oneHundredsUSD, account2);
				tx = await cerc20.repay(account1, id, tensUSD, { from: account2 });
				loan = await state.getLoan(account1, id);
			});

			it('should work reduce the repayers balance', async () => {
				const expectedBalance = toUnit(90);
				assert.bnEqual(await sUSDSynth.balanceOf(account2), expectedBalance);
			});

			it('should update the loan', async () => {
				assert.bnClose(loan.amount.substring(0, 5), expectedString);
			});

			xit('should emit the event properly', async () => {
				assert.eventEqual(tx, 'LoanRepaymentMade', {
					account: account1,
					repayer: account2,
					id: id,
					amountRepaid: tensUSD,
					amountAfter: parseInt(loan.amount),
				});
			});
		});

		describe('it should allow repayments on an sBTC loan', async () => {
			const expectedString = '10000';

			beforeEach(async () => {
				tx = await cerc20.open(fiveRenBTC, twoRenBTC, sBTC, {
					from: account1,
				});

				await fastForwardAndUpdateRates(INTERACTION_DELAY);

				id = getid(tx);

				await issuesBTCtoAccount(twoRenBTC, account2);

				tx = await cerc20.repay(account1, id, oneRenBTC, { from: account2 });

				loan = await state.getLoan(account1, id);
			});

			it('should work reduce the repayers balance', async () => {
				const expectedBalance = oneRenBTC;

				assert.bnEqual(await sBTCSynth.balanceOf(account2), expectedBalance);
			});

			it('should update the loan', async () => {
				assert.equal(loan.amount.substring(0, 5), expectedString);
			});

			xit('should emit the event properly', async () => {
				assert.eventEqual(tx, 'LoanRepaymentMade', {
					account: account1,
					repayer: account2,
					id: id,
					amountRepaid: oneRenBTC,
				});
			});
		});
	});

	describe('liquidations', async () => {
		beforeEach(async () => {
			// make a loan here so we have a valid ID to pass to the blockers and reverts.
			tx = await cerc20.open(oneRenBTC, toUnit(5000), sUSD, {
				from: account1,
			});

			await fastForwardAndUpdateRates(INTERACTION_DELAY);

			id = getid(tx);
		});

		describe('potential blocking conditions', async () => {
			['System', 'Issuance'].forEach(section => {
				describe(`when ${section} is suspended`, () => {
					beforeEach(async () => {
						await setStatus({ owner, systemStatus, section, suspend: true });
					});
					it('then calling repay() reverts', async () => {
						await assert.revert(
							cerc20.liquidate(account1, id, onesUSD, { from: account1 }),
							'Operation prohibited'
						);
					});
					describe(`when ${section} is resumed`, () => {
						beforeEach(async () => {
							await setStatus({ owner, systemStatus, section, suspend: false });
						});
						it('then calling liquidate() succeeds', async () => {
							// fast forward a long time to make sure the loan is underwater.
							await fastForwardAndUpdateRates(10 * YEAR);
							await cerc20.liquidate(account1, id, onesUSD, { from: account1 });
						});
					});
				});
			});
		});

		describe('revert conditions', async () => {
			it('should revert if they have no sUSD', async () => {
				await assert.revert(
					cerc20.liquidate(account1, id, onesUSD, { from: account2 }),
					'Not enough balance'
				);
			});

			it('should revert if they are not under collateralised', async () => {
				await issuesUSDToAccount(toUnit(100), account2);

				await assert.revert(
					cerc20.liquidate(account1, id, onesUSD, { from: account2 }),
					'Cratio above liq ratio'
				);
			});
		});

		describe('should allow liquidations on an undercollateralised sUSD loan', async () => {
			const renAmount = new BN('19642857');
			const internalAmount = new BN('196428571428571428');
			let liquidationAmount;
			let minCratio;
			let collateralKey;

			beforeEach(async () => {
				const timestamp = await currentTime();
				await exchangeRates.updateRates([sBTC], ['7000'].map(toUnit), timestamp, {
					from: oracle,
				});

				await issuesUSDToAccount(toUnit(5000), account2);

				loan = await state.getLoan(account1, id);
				minCratio = await cerc20.minCratio();
				collateralKey = await cerc20.collateralKey();

				liquidationAmount = await util.liquidationAmount(loan, minCratio, collateralKey);

				tx = await cerc20.liquidate(account1, id, liquidationAmount, {
					from: account2,
				});
			});

			it('should emit a liquidation event', async () => {
				assert.eventEqual(tx, 'LoanPartiallyLiquidated', {
					account: account1,
					id: id,
					liquidator: account2,
					amountLiquidated: liquidationAmount,
					collateralLiquidated: internalAmount,
				});
			});

			it('should reduce the liquidators synth amount', async () => {
				const liquidatorBalance = await sUSDSynth.balanceOf(account2);
				const expectedBalance = toUnit(5000).sub(liquidationAmount);

				assert.bnEqual(liquidatorBalance, expectedBalance);
			});

			it('should transfer the liquidated collateral to the liquidator', async () => {
				const bal = await renBTC.balanceOf(account2);

				assert.bnEqual(bal, renAmount);
			});

			it('should pay the interest to the fee pool', async () => {
				const balance = await sUSDSynth.balanceOf(FEE_ADDRESS);

				assert.bnGt(balance, toUnit(0));
			});

			it('should fix the collateralisation ratio of the loan', async () => {
				loan = await state.getLoan(account1, id);

				const ratio = await cerc20.collateralRatio(loan);

				// the loan is very close 150%, we are in 10^18 land.
				assert.bnClose(ratio, toUnit(1.5), '1000000000000');
			});
		});

		describe('when a loan needs to be completely liquidated', async () => {
			beforeEach(async () => {
				const timestamp = await currentTime();
				await exchangeRates.updateRates([sBTC], ['5000'].map(toUnit), timestamp, {
					from: oracle,
				});

				loan = await state.getLoan(account1, id);

				await issuesUSDToAccount(toUnit(10000), account2);

				tx = await cerc20.liquidate(account1, id, toUnit(10000), {
					from: account2,
				});
			});

			it('should emit the event', async () => {
				assert.eventEqual(tx, 'LoanClosedByLiquidation', {
					account: account1,
					id: id,
					liquidator: account2,
					amountLiquidated: loan.amount,
					collateralLiquidated: toUnit(1),
				});
			});

			it('should close the loan correctly', async () => {
				loan = await state.getLoan(account1, id);

				assert.equal(loan.amount, 0);
				assert.equal(loan.collateral, 0);
				assert.equal(loan.interestIndex, 0);
			});

			it('should transfer all the collateral to the liquidator', async () => {
				const bal = await renBTC.balanceOf(account2);

				assert.bnEqual(bal, oneRenBTC);
			});

			it('should reduce the liquidators synth balance', async () => {
				const liquidatorBalance = await sUSDSynth.balanceOf(account2);
				const expectedBalance = toUnit(10000).sub(toUnit(5000));

				assert.bnClose(liquidatorBalance, expectedBalance, '10000000000000000');
			});
		});
	});

	describe('closing', async () => {
		let accountRenBalBefore;

		beforeEach(async () => {
			accountRenBalBefore = await renBTC.balanceOf(account1);

			// make a loan here so we have a valid ID to pass to the blockers and reverts.
			tx = await cerc20.open(twoRenBTC, oneHundredsUSD, sUSD, {
				from: account1,
			});

			id = getid(tx);

			await fastForwardAndUpdateRates(INTERACTION_DELAY);
		});

		describe('potential blocking conditions', async () => {
			['System', 'Issuance'].forEach(section => {
				describe(`when ${section} is suspended`, () => {
					beforeEach(async () => {
						await setStatus({ owner, systemStatus, section, suspend: true });
					});
					it('then calling close() reverts', async () => {
						await assert.revert(cerc20.close(id, { from: account1 }), 'Operation prohibited');
					});
					describe(`when ${section} is resumed`, () => {
						beforeEach(async () => {
							await setStatus({ owner, systemStatus, section, suspend: false });
						});
						it('then calling close() succeeds', async () => {
							// Give them some more sUSD to make up for the fees.
							await issuesUSDToAccount(tensUSD, account1);
							await cerc20.close(id, { from: account1 });
						});
					});
				});
			});
		});

		describe('revert conditions', async () => {
			it('should revert if they have no sUSD', async () => {
				await assert.revert(cerc20.close(id, { from: account1 }), 'Not enough balance');
			});

			it('should revert if they are not the borrower', async () => {
				await assert.revert(cerc20.close(id, { from: account2 }), 'Loan does not exist');
			});
		});

		describe('when it works', async () => {
			beforeEach(async () => {
				// Give them some more sUSD to make up for the fees.
				await issuesUSDToAccount(tensUSD, account1);

				tx = await cerc20.close(id, { from: account1 });
			});

			it('should record the loan as closed', async () => {
				loan = await state.getLoan(account1, id);

				assert.equal(loan.amount, 0);
				assert.equal(loan.collateral, 0);
				assert.equal(loan.accruedInterest, 0);
				assert.equal(loan.interestIndex, 0);
			});

			it('should pay the fee pool', async () => {
				const balance = await sUSDSynth.balanceOf(FEE_ADDRESS);

				assert.bnGt(balance, toUnit(0));
			});

			it('should transfer the collateral back to the borrower', async () => {
				const bal = await renBTC.balanceOf(account1);
				assert.bnEqual(bal, accountRenBalBefore);
			});

			it('should emit the event', async () => {
				assert.eventEqual(tx, 'LoanClosed', {
					account: account1,
					id: id,
				});
			});
		});
	});

	describe('drawing', async () => {
		beforeEach(async () => {
			// make a loan here so we have a valid ID to pass to the blockers and reverts.
			tx = await cerc20.open(oneRenBTC, fiveThousandsUSD, sUSD, {
				from: account1,
			});

			id = getid(tx);

			await fastForwardAndUpdateRates(INTERACTION_DELAY);
		});

		describe('potential blocking conditions', async () => {
			['System', 'Issuance'].forEach(section => {
				describe(`when ${section} is suspended`, () => {
					beforeEach(async () => {
						await setStatus({ owner, systemStatus, section, suspend: true });
					});
					it('then calling draw() reverts', async () => {
						await assert.revert(
							cerc20.draw(id, onesUSD, { from: account1 }),
							'Operation prohibited'
						);
					});
					describe(`when ${section} is resumed`, () => {
						beforeEach(async () => {
							await setStatus({ owner, systemStatus, section, suspend: false });
						});
						it('then calling draw() succeeds', async () => {
							await cerc20.draw(id, onesUSD, {
								from: account1,
							});
						});
					});
				});
			});
			describe('when rates have gone stale', () => {
				beforeEach(async () => {
					await fastForward((await exchangeRates.rateStalePeriod()).add(web3.utils.toBN('300')));
				});
				it('then calling draw() reverts', async () => {
					await assert.revert(cerc20.draw(id, onesUSD, { from: account1 }), 'Invalid rate');
				});
				describe('when BTC gets a rate', () => {
					beforeEach(async () => {
						await updateRatesWithDefaults();
					});
					it('then calling draw() succeeds', async () => {
						await cerc20.draw(id, onesUSD, { from: account1 });
					});
				});
			});
		});

		describe('revert conditions', async () => {
			it('should revert if the draw would under collateralise the loan', async () => {
				await fastForwardAndUpdateRates(INTERACTION_DELAY);

				await assert.revert(
					cerc20.draw(id, toUnit(3000), { from: account1 }),
					'Cannot draw this much'
				);
			});
		});

		describe('should draw the loan down', async () => {
			beforeEach(async () => {
				tx = await cerc20.draw(id, oneThousandsUSD, { from: account1 });

				loan = await state.getLoan(account1, id);
			});

			it('should update the amount on the loan', async () => {
				assert.equal(loan.amount, toUnit(6000).toString());
			});
		});
	});
});
