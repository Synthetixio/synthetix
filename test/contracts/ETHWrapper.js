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
	multiplyDecimalRound,
	getEthBalance
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
const { GAS_PRICE } = require('../../hardhat.config');

const {
	toBytes32,
	defaults: { ISSUANCE_RATIO, FEE_PERIOD_DURATION, TARGET_THRESHOLD },
} = require('../..');
const { expect } = require('chai');

contract('ETHWrapper', async accounts => {
	const YEAR = 31536000;
	const INTERACTION_DELAY = 300;

	const [sUSD, sETH, ETH, SNX] = ['sUSD', 'sETH', 'ETH', 'SNX'].map(toBytes32);

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

	const [deployerAccount, owner, oracle, depotDepositor, account1, account2] = accounts;

	let cerc20,
		state,
		managerState,
		feePool,
		exchangeRates,
		addressResolver,
		depot,
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

	const issueSynthsUSD = async (issueAmount, receiver) => {
		// Set up the depositor with an amount of synths to deposit.
		await sUSDSynth.transfer(receiver, issueAmount, {
			from: owner,
		});
	};
	
	const depositUSDInDepot = async (synthsToDeposit, depositor) => {
		// Ensure Depot has latest rates
		// await updateRatesWithDefaults();

		// Get sUSD from Owner
		await issueSynthsUSD(synthsToDeposit, depositor);

		// Approve Transaction
		await sUSDSynth.approve(depot.address, synthsToDeposit, { from: depositor });

		// Deposit sUSD in Depot
		await depot.depositSynths(synthsToDeposit, {
			from: depositor,
		});
	};

	const calculateLoanFeesUSD = async feesInETH => {
		// Ask the Depot how many sUSD I will get for this ETH
		const expectedFeesUSD = await depot.synthsReceivedForEther(feesInETH);
		return expectedFeesUSD;
	};

	const calculateMintFees = async amount => {
		const mintFee = await ethWrapper.calculateMintFee(amount)
		const expectedFeesUSD = await calculateLoanFeesUSD(mintFee)
		return { mintFee, expectedFeesUSD }
	}

	before(async () => {
		[{ token: synthetix }, { token: sUSDSynth }, { token: sETHSynth }] = await Promise.all([
			mockToken({ accounts, name: 'Synthetix', symbol: 'SNX' }),
			mockToken({ accounts, synth: 'sUSD', name: 'Synthetic USD', symbol: 'sUSD' }),
			mockToken({ accounts, synth: 'sETH', name: 'Synthetic ETH', symbol: 'sETH' }),
		]);

		({
			SystemStatus: systemStatus,
			AddressResolver: addressResolver,
			Issuer: issuer,
			DebtCache: debtCache,
			FeePool: feePool,
			Depot: depot,
			ExchangeRates: exchangeRates,
			ETHWrapper: ethWrapper,
		} = await setupAllContracts({
			accounts,
			mocks: {
				SynthsUSD: sUSDSynth,
				SynthsETH: sETHSynth,
				Synthetix: synthetix,
			},
			contracts: [
				'Synthetix',
				'AddressResolver',
				'SystemStatus',
				'Issuer',
				'Depot',
				'ExchangeRates',
				'FeePool',
				'DebtCache',
				'ETHWrapper',
			],
		}));

		FEE_ADDRESS = await feePool.FEE_ADDRESS();
		timestamp = await currentTime();

		// Depot requires ETH rates
		await exchangeRates.updateRates(
			[sETH, ETH],
			['1500', '1500'].map(toUnit),
			timestamp,
			{
				from: oracle,
			}
		);
	});

	addSnapshotBeforeRestoreAfterEach();

	it.skip('should ensure only expected functions are mutative', async () => {
		// ensureOnlyExpectedMutativeFunctions({
		// 	abi: ceth.abi,
		// 	ignoreParents: ['Owned', 'Pausable', 'MixinResolver', 'Proxy', 'Collateral'],
		// 	expected: ['open', 'close', 'deposit', 'repay', 'withdraw', 'liquidate', 'claim', 'draw'],
		// });
	});

	it.skip('should access its dependencies via the address resolver', async () => {
		// assert.equal(await addressResolver.getAddress(toBytes32('SynthsUSD')), sUSDSynth.address);
		// assert.equal(await addressResolver.getAddress(toBytes32('FeePool')), feePool.address);
		// assert.equal(
		// 	await addressResolver.getAddress(toBytes32('ExchangeRates')),
		// 	exchangeRates.address
		// );
	});


	describe('On deployment of Contract', async () => {
		let instance;
		beforeEach(async () => {
			instance = ethWrapper;
		});
		
		describe('should have a default', async () => {
			const MAX_ETH = toUnit('5000');
			const FIFTY_BIPS = toUnit('0.005');

			it('maxETH of 5,000 ETH', async () => {
				assert.bnEqual(await ethWrapper.maxETH(), MAX_ETH);
			});
			it('capacity of 5,000 ETH', async () => {
				assert.bnEqual(await ethWrapper.capacity(), MAX_ETH);
			});
			it('mintFeeRate of 50 bps', async () => {
				assert.bnEqual(await ethWrapper.mintFeeRate(), FIFTY_BIPS);
			});
			it('burnFeeRate of 50 bps', async () => {
				assert.bnEqual(await ethWrapper.burnFeeRate(), FIFTY_BIPS);
			});
		});
	});

	describe('should allow owner to set', async () => {
		it('setMintFeeRate', async () => {
			const newMintFeeRate = toUnit('0.005');
			await ethWrapper.setMintFeeRate(newMintFeeRate, { from: owner });
			assert.bnEqual(await ethWrapper.mintFeeRate(), newMintFeeRate);
		})
		it('setBurnFeeRate', async () => {
			const newBurnFeeRate = toUnit('0.005');
			await ethWrapper.setBurnFeeRate(newBurnFeeRate, { from: owner });
			assert.bnEqual(await ethWrapper.burnFeeRate(), newBurnFeeRate);
		})
		it('setMaxETH', async () => {
			const newMaxETH = toUnit('100');
			await ethWrapper.setMaxETH(newMaxETH, { from: owner });
			assert.bnEqual(await ethWrapper.maxETH(), newMaxETH);
		})

		describe('then revert when', async () => {
			describe('non owner attempts to set', async () => {
				it('setMintFeeRate()', async () => {
					const newMintFeeRate = toUnit('0.005');
					await onlyGivenAddressCanInvoke({
						fnc: ethWrapper.setMintFeeRate,
						args: [newMintFeeRate],
						accounts,
						address: owner,
						reason: 'Only the contract owner may perform this action',
					});
				});
				it('setBurnFeeRate()', async () => {
					const newBurnFeeRate = toUnit('0.005');
					await onlyGivenAddressCanInvoke({
						fnc: ethWrapper.setBurnFeeRate,
						args: [newBurnFeeRate],
						accounts,
						address: owner,
						reason: 'Only the contract owner may perform this action',
					});
				});
				it('setMaxETH()', async () => {
					const newMaxETH = toUnit('100');
					await onlyGivenAddressCanInvoke({
						fnc: ethWrapper.setMaxETH,
						args: [newMaxETH],
						accounts,
						address: owner,
						reason: 'Only the contract owner may perform this action',
					});
				});
			})
		})
	})

	// describe.only('capacity', async () => {
	// 	before(async () => {

	// 	})

	// 	describe('after setting maxETH', async () => {
	// 		it('returns 0', async () => {
	// 			// Mint fees.
	// 			// const mintFeeRate = await ethWrapper.mintFeeRate()
	// 			// const mintFee = multiplyDecimalRound(amount, mintFeeRate)
	// 			// const expectedFeesUSD = await calculateLoanFeesUSD(mintFee)

	// 			await ethWrapper.setMaxETH(toUnit('1'), { from: owner })

	// 			const amount = toUnit('0.5')
	// 			await ethWrapper.mint({ from: owner, value: amount })
	// 			assert.bnEqual(await ethWrapper.getBalance(), amount.sub(mintFee))
	// 			assert.bnEqual(await ethWrapper.capacity(), amount.sub(mintFee))
				
	// 			await ethWrapper.setMaxETH(toUnit('1'), { from: owner })
				
	// 			assert.bnEqual(await ethWrapper.maxETH(), newMaxETH)
	// 		})
	// 	})
	// })

	describe.only('mint', async () => {
		before(async () => {
			// Deposit sUSD in Depot to allow fees to be bought with ETH
			await depositUSDInDepot(toUnit('5000000'), depotDepositor);

			// Mint fees.
			// const mintFeeRate = await ethWrapper.mintFeeRate()
			// mintFee = multiplyDecimalRound(amount, mintFeeRate)
			// expectedFeesUSD = await calculateLoanFeesUSD(mintFee)
		})

		describe("when eth is sent", () => {
			
			addSnapshotBeforeRestoreAfterEach();

			describe('amount is less than than capacity', () => {
			let amount = toUnit('1.0')
				let initialCapacity
			let mintFee
			let expectedFeesUSD

			beforeEach(async () => {
					initialCapacity = await ethWrapper.capacity();
					({ 
						mintFee, 
						expectedFeesUSD 
					} = await calculateMintFees(amount));

					await ethWrapper.mint({ from: account1, value: amount });
			});

				it('exchanges ETH for sETH', async () => {
					assert.bnEqual(await sETHSynth.balanceOf(account1), amount.sub(mintFee));
					assert.bnEqual(await ethWrapper.getBalance(), amount.sub(mintFee));
				})
				it('sends sETH to the fee pool', async () => {
					assert.bnEqual(await sUSDSynth.balanceOf(FEE_ADDRESS), expectedFeesUSD);
				})
				it('updates capacity', async () => {
					assert.bnEqual(await ethWrapper.capacity(), initialCapacity.sub(amount.sub(mintFee)))
				})
			})

			describe('amount is larger than or equal to capacity', () => {
				let amount = toUnit('5001')
				let initialCapacity
				let mintFee
				let expectedFeesUSD

				// Tracking of ETH refund.
				let mintTx
				let minterInitialBalance

				before(async () => {
					initialCapacity = await ethWrapper.capacity();

					// Calculate the mint fees on the capacity amount,
					// as this will be the ETH accepted by the contract.
					({ 
						mintFee, 
						expectedFeesUSD 
					} = await calculateMintFees(initialCapacity));
					
					minterInitialBalance = await getEthBalance(account1)
					mintTx = await ethWrapper.mint({ from: account1, value: amount });
				})

				it('exchanges `capacity` of ETH for sETH', async () => {
					assert.bnEqual(await sETHSynth.balanceOf(account1), initialCapacity.sub(mintFee));
					assert.bnEqual(await ethWrapper.getBalance(), initialCapacity.sub(mintFee));
				})
				it('refunds the remainder to the user', async () => {
					const gasPaid = web3.utils.toBN(mintTx.receipt.gasUsed * GAS_PRICE);
					const minterEndingBalance = await getEthBalance(account1);
					const depositAmount = initialCapacity

					assert.bnEqual(
						web3.utils
							.toBN(minterEndingBalance)
							.add(gasPaid)
							.add(depositAmount),
						web3.utils.toBN(minterInitialBalance)
					);
				})
				it('has a capacity of 0 after', async () => {
					assert.bnEqual(await ethWrapper.capacity(), mintFee)
				})
			})
		})
	});
});
