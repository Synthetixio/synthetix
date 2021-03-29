'use strict';

const { artifacts, contract, web3 } = require('hardhat');

const { assert, addSnapshotBeforeRestoreAfterEach, addSnapshotBeforeRestoreAfter } = require('./common');

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
const { toBN } = require('web3-utils');

contract('ETHWrapper', async accounts => {
	const YEAR = 31536000;
	const INTERACTION_DELAY = 300;

	const synths = ['sUSD', 'sETH', 'ETH', 'SNX']
	const [sUSD, sETH, ETH, SNX] = ['sUSD', 'sETH', 'ETH', 'SNX'].map(toBytes32);

	const oneRenBTC = web3.utils.toBN('100000000');
	const twoRenBTC = web3.utils.toBN('200000000');
	const fiveRenBTC = web3.utils.toBN('500000000');

	const ONE = toBN('1')
	const zeroAddress = '0x0000000000000000000000000000000000000000';

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
		manager,
		issuer,
		debtCache,
		FEE_ADDRESS,
		synthetix,
		sUSDSynth,
		sETHSynth,
		ethWrapper,
		weth,
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

	const calculateBurnFees = async amount => {
		const burnFee = await ethWrapper.calculateBurnFee(amount)
		const expectedFeesUSD = await calculateLoanFeesUSD(burnFee)
		return { burnFee, expectedFeesUSD }
	}

	before(async () => {
		// [{ token: synthetix }, { token: sUSDSynth }, { token: sETHSynth }] = await Promise.all([
		// 	mockToken({ accounts, name: 'Synthetix', symbol: 'SNX' }),
		// 	mockToken({ accounts, synth: 'sUSD', name: 'Synthetic USD', symbol: 'sUSD' }),
		// 	mockToken({ accounts, synth: 'sETH', name: 'Synthetic ETH', symbol: 'sETH' }),
		// ]);

		({
			SystemStatus: systemStatus,
			AddressResolver: addressResolver,
			Issuer: issuer,
			DebtCache: debtCache,
			FeePool: feePool,
			Depot: depot,
			ExchangeRates: exchangeRates,
			ETHWrapper: ethWrapper,
			SynthsUSD: sUSDSynth,
			SynthsETH: sETHSynth,
			WETH: weth
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
				'FeePool',
				'FeePoolEternalStorage',
				'DebtCache',
				'Exchanger',
				'ETHWrapper',
				'WETH',
				'CollateralManager',
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

	addSnapshotBeforeRestoreAfterEach()

	describe('mint', async () => {
		describe('when amount is less than than capacity', () => {
			let amount
			let initialCapacity
			let mintFee
			let expectedFeesUSD
			let mintTx

			beforeEach(async () => {
				initialCapacity = await ethWrapper.capacity();
				amount = initialCapacity.sub(toUnit('1.0'));

				({ 
					mintFee, 
					expectedFeesUSD 
				} = await calculateMintFees(amount));
				
				await weth.deposit({ from: account1, value: amount })
				await weth.approve(ethWrapper.address, amount, { from: account1 })
				mintTx = await ethWrapper.mint(amount, { from: account1 });
			});
			
			it('locks `amount` ETH in the contract', async () => {
				const logs = await getDecodedLogs({
					hash: mintTx.tx,
					contracts: [weth],
				});

				decodedEventEqual({
					event: 'Transfer',
					emittedFrom: weth.address,
					args: [account1, ethWrapper.address, amount],
					log: logs[0]
				});
			})
			it('mints amount(1-mintFeeRate) sETH into the user’s wallet', async () => {
				assert.bnEqual(await sETHSynth.balanceOf(account1), amount.sub(mintFee));
			})
			it('sends amount*mintFeeRate worth of sETH to the fee pool as sUSD', async () => {
				assert.bnEqual(await sUSDSynth.balanceOf(FEE_ADDRESS), expectedFeesUSD);
			})
			it('has a capacity of (capacity - amount - fees) after', async () => {
				assert.bnEqual(await ethWrapper.capacity(), initialCapacity.sub(amount).add(mintFee))
			})
		})

		describe('amount is larger than or equal to capacity', () => {
			let amount
			let initialCapacity
			let mintFee
			let expectedFeesUSD
			let mintTx

			beforeEach(async () => {
				initialCapacity = await ethWrapper.capacity();
				amount = initialCapacity.add(ONE);
				// console.log(`Mint amount: ${(amount).toString()}`)
				// console.log(`Initial capacity: ${(initialCapacity).toString()}`);

				// Calculate the mint fees on the capacity amount,
				// as this will be the ETH accepted by the contract.
				({ 
					mintFee, 
					expectedFeesUSD 
				} = await calculateMintFees(initialCapacity));
				
				await weth.deposit({ from: account1, value: amount })
				await weth.approve(ethWrapper.address, amount, { from: account1 })
				mintTx = await ethWrapper.mint(amount, { from: account1 });
			})

			it('locks `capacity` ETH in the contract', async () => {
				const logs = await getDecodedLogs({
					hash: mintTx.tx,
					contracts: [weth],
				});

				decodedEventEqual({
					event: 'Transfer',
					emittedFrom: weth.address,
					args: [account1, ethWrapper.address, initialCapacity],
					log: logs[0]
				});
			})
			it('mints capacity(1-mintFeeRate) sETH into the user’s wallet', async () => {
				assert.bnEqual(await sETHSynth.balanceOf(account1), initialCapacity.sub(mintFee));
			})
			it('sends capacity*mintFeeRate worth of sETH to the fee pool as sUSD', async () => {
				assert.bnEqual(await sUSDSynth.balanceOf(FEE_ADDRESS), expectedFeesUSD);
			})
			it('has a capacity of 0.5 bps after', async () => {
				// console.log(`End capacity: ${(await ethWrapper.capacity()).toString()}`)
				assert.bnEqual(await ethWrapper.capacity(), mintFee)
			})
		})

		describe('capacity = 0', () => {
			beforeEach(async () => {
				await ethWrapper.setMaxETH('0', { from: owner });
			})

			it('reverts', async () => {
				const amount = '1'
				await weth.deposit({ from: account1, value: amount })
				await weth.approve(ethWrapper.address, amount, { from: account1 })

				await assert.revert(
					ethWrapper.mint(amount, { from: account1 }),
					'Contract has no spare capacity to mint'
				);
			})
		})
	});

	describe('burn', async () => {

		describe('when the contract has 0 ETH', async () => {
			it('reverts', async () => {
				await assert.revert(
					ethWrapper.burn('1', { from: account1 }),
					'Contract cannot burn sETH for ETH, ETH balance is zero'
				);
			})
		})

		describe('when the contract has ETH reserves', async () => {
			let burnTx

			beforeEach(async () => {
				const amount = toUnit('10')
				await weth.deposit({ from: account1, value: amount })
				await weth.approve(ethWrapper.address, amount, { from: account1 })
				await ethWrapper.mint(amount, { from: account1 })
			})

			describe('when amount is strictly lower than reserves(1+burnFeeRate)', async () => {
				let amount = toUnit('1.0')
				let reserves
				let burnFee
				let expectedFeesUSD
				let logs
				let initialCapacity

				beforeEach(async () => {
					reserves = await ethWrapper.getBalance()
					initialCapacity = await ethWrapper.capacity()

					await sETHSynth.issue(account1, amount)
					await sETHSynth.approve(ethWrapper.address, amount, { from: account1 });

					({ 
						burnFee, 
						expectedFeesUSD 
					} = await calculateBurnFees(amount));

					burnTx = await ethWrapper.burn(amount, { from: account1 })
				})

				it('burns amount of sETH', async () => {
					const logs = await getDecodedLogs({
						hash: burnTx.tx,
						contracts: [sETHSynth],
					});

					decodedEventEqual({
						event: 'Burned',
						emittedFrom: sETHSynth.address,
						args: [account1, amount],
						log: logs
							.reverse()
							.filter(l => !!l)
							.find(({ name }) => name === 'Burned'),
					});
				})
				it('sends amount(1-burnFeeRate) ETH to user', async () => {
					const logs = await getDecodedLogs({
						hash: burnTx.tx,
						contracts: [weth],
					});

					decodedEventEqual({
						event: 'Transfer',
						emittedFrom: weth.address,
						args: [ethWrapper.address, account1, amount.sub(burnFee)],
						log: logs
							.reverse()
							.filter(l => !!l)
							.find(({ name }) => name === 'Transfer'),
					});
				})
				it('sends fees as sUSD to the fee pool', async () => {
					const logs = await getDecodedLogs({
						hash: burnTx.tx,
						contracts: [sUSDSynth],
					});

					decodedEventEqual({
						event: 'Issued',
						emittedFrom: sUSDSynth.address,
						args: [FEE_ADDRESS, expectedFeesUSD],
						log: logs
							.reverse()
							.filter(l => !!l)
							.find(({ name }) => name === 'Issued'),
					});
				})
				it('updates capacity', async () => {
					assert.bnEqual(await ethWrapper.capacity(), initialCapacity.add(amount))
				})
			})

			describe('when amount is larger than or equal to reserves(1+burnFeeRate)', async () => {
				let reserves
				let amount
				let burnFee
				let expectedFeesUSD
				let initialCapacity

				beforeEach(async () => {
					reserves = await ethWrapper.getBalance()
					initialCapacity = await ethWrapper.capacity()

					const burnFeeRate = await ethWrapper.burnFeeRate()
					amount = (reserves.mul(ONE.add(burnFeeRate))).add(ONE)
					
					await sETHSynth.issue(account1, amount)
					await sETHSynth.approve(ethWrapper.address, amount, { from: account1 });

					({ 
						burnFee, 
						expectedFeesUSD 
					} = await calculateBurnFees(reserves));

					burnTx = await ethWrapper.burn(amount, { from: account1 })
				})

				it('burns reserves amount of sETH', async () => {
					const logs = await getDecodedLogs({
						hash: burnTx.tx,
						contracts: [sETHSynth],
					});

					decodedEventEqual({
						event: 'Burned',
						emittedFrom: sETHSynth.address,
						args: [account1, reserves],
						log: logs
							.reverse()
							.filter(l => !!l)
							.find(({ name }) => name === 'Burned'),
					});
				})
				it('sends reserves(1-burnFeeRate) ETH to user', async () => {
					const logs = await getDecodedLogs({
						hash: burnTx.tx,
						contracts: [weth],
					});

					decodedEventEqual({
						event: 'Transfer',
						emittedFrom: weth.address,
						args: [ethWrapper.address, account1, reserves.sub(burnFee)],
						log: logs
							.reverse()
							.filter(l => !!l)
							.find(({ name }) => name === 'Transfer'),
					});
				})
				it('sends fees as sUSD to the fee pool', async () => {
					const logs = await getDecodedLogs({
						hash: burnTx.tx,
						contracts: [sUSDSynth],
					});
					
					// TODO: I was going to check a Transfer event,
					// however there are none in the logs?
					decodedEventEqual({
						event: 'Issued',
						emittedFrom: sUSDSynth.address,
						args: [FEE_ADDRESS, expectedFeesUSD],
						log: logs
							.reverse()
							.filter(l => !!l)
							.find(({ name }) => name === 'Issued'),
					});
				})
				it('updates capacity', async () => {
					assert.bnEqual(await ethWrapper.capacity(), initialCapacity.add(reserves))
				})
			})

		})

		
	})
});
