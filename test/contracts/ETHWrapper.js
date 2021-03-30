'use strict';

const { contract } = require('hardhat');

const { assert, addSnapshotBeforeRestoreAfterEach } = require('./common');

const { currentTime, toUnit } = require('../utils')();

const {
	ensureOnlyExpectedMutativeFunctions,
	getDecodedLogs,
	decodedEventEqual,
} = require('./helpers');

const { setupAllContracts } = require('./setup');

const { toBytes32 } = require('../..');
const { toBN } = require('web3-utils');

contract('ETHWrapper', async accounts => {
	const synths = ['sUSD', 'sETH', 'ETH', 'SNX'];
	const [sETH, ETH] = ['sETH', 'ETH'].map(toBytes32);

	const ONE = toBN('1');

	const [, owner, oracle, , account1] = accounts;

	let systemSettings,
		feePool,
		exchangeRates,
		addressResolver,
		depot,
		issuer,
		FEE_ADDRESS,
		sUSDSynth,
		sETHSynth,
		ethWrapper,
		weth,
		timestamp;

	const calculateLoanFeesUSD = async feesInETH => {
		// Ask the Depot how many sUSD I will get for this ETH
		const expectedFeesUSD = await depot.synthsReceivedForEther(feesInETH);
		return expectedFeesUSD;
	};

	const calculateMintFees = async amount => {
		const mintFee = await ethWrapper.calculateMintFee(amount);
		const expectedFeesUSD = await calculateLoanFeesUSD(mintFee);
		return { mintFee, expectedFeesUSD };
	};

	const calculateBurnFees = async amount => {
		const burnFee = await ethWrapper.calculateBurnFee(amount);
		const expectedFeesUSD = await calculateLoanFeesUSD(burnFee);
		return { burnFee, expectedFeesUSD };
	};

	before(async () => {
		// [{ token: synthetix }, { token: sUSDSynth }, { token: sETHSynth }] = await Promise.all([
		// 	mockToken({ accounts, name: 'Synthetix', symbol: 'SNX' }),
		// 	mockToken({ accounts, synth: 'sUSD', name: 'Synthetic USD', symbol: 'sUSD' }),
		// 	mockToken({ accounts, synth: 'sETH', name: 'Synthetic ETH', symbol: 'sETH' }),
		// ]);

		({
			SystemSettings: systemSettings,
			AddressResolver: addressResolver,
			Issuer: issuer,
			FeePool: feePool,
			Depot: depot,
			ExchangeRates: exchangeRates,
			ETHWrapper: ethWrapper,
			SynthsUSD: sUSDSynth,
			SynthsETH: sETHSynth,
			WETH: weth,
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
		await exchangeRates.updateRates([sETH, ETH], ['1500', '1500'].map(toUnit), timestamp, {
			from: oracle,
		});
	});

	addSnapshotBeforeRestoreAfterEach();

	it('ensure only expected functions are mutative', () => {
		ensureOnlyExpectedMutativeFunctions({
			abi: ethWrapper.abi,
			hasFallback: true,
			ignoreParents: ['Owned', 'Pausable', 'MixinResolver', 'MixinSystemSettings'],
			expected: ['mint', 'burn'],
		});
	});

	describe('On deployment of Contract', async () => {
		let instance;
		beforeEach(async () => {
			instance = ethWrapper;
		});

		it('should set constructor params on deployment', async () => {
			assert.equal(await instance.resolver(), addressResolver.address);
		});

		it('should access its dependencies via the address resolver', async () => {
			assert.equal(await addressResolver.getAddress(toBytes32('SynthsETH')), sETHSynth.address);
			assert.equal(await addressResolver.getAddress(toBytes32('SynthsUSD')), sUSDSynth.address);
			assert.equal(
				await addressResolver.getAddress(toBytes32('ExchangeRates')),
				exchangeRates.address
			);
			assert.equal(await addressResolver.getAddress(toBytes32('Issuer')), issuer.address);
			assert.equal(await addressResolver.getAddress(toBytes32('FeePool')), feePool.address);
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

	addSnapshotBeforeRestoreAfterEach();

	describe('mint', async () => {
		describe('when amount is less than than capacity', () => {
			let amount;
			let initialCapacity;
			let mintFee;
			let expectedFeesUSD;
			let mintTx;

			beforeEach(async () => {
				initialCapacity = await ethWrapper.capacity();
				amount = initialCapacity.sub(toUnit('1.0'));

				({ mintFee, expectedFeesUSD } = await calculateMintFees(amount));

				await weth.deposit({ from: account1, value: amount });
				await weth.approve(ethWrapper.address, amount, { from: account1 });
				mintTx = await ethWrapper.mint(amount, { from: account1 });
			});

			it('locks `amount` WETH in the contract', async () => {
				const logs = await getDecodedLogs({
					hash: mintTx.tx,
					contracts: [weth],
				});

				decodedEventEqual({
					event: 'Transfer',
					emittedFrom: weth.address,
					args: [account1, ethWrapper.address, amount],
					log: logs[0],
				});
			});
			it('mints amount(1-mintFeeRate) sETH into the user’s wallet', async () => {
				assert.bnEqual(await sETHSynth.balanceOf(account1), amount.sub(mintFee));
			});
			it('sends amount*mintFeeRate worth of sETH to the fee pool as sUSD', async () => {
				assert.bnEqual(await sUSDSynth.balanceOf(FEE_ADDRESS), expectedFeesUSD);
			});
			it('has a capacity of (capacity - amount - fees) after', async () => {
				assert.bnEqual(await ethWrapper.capacity(), initialCapacity.sub(amount).add(mintFee));
			});
		});

		describe('amount is larger than or equal to capacity', () => {
			let amount;
			let initialCapacity;
			let mintFee;
			let expectedFeesUSD;
			let mintTx;

			beforeEach(async () => {
				initialCapacity = await ethWrapper.capacity();
				amount = initialCapacity.add(ONE);
				// console.log(`Mint amount: ${(amount).toString()}`)
				// console.log(`Initial capacity: ${(initialCapacity).toString()}`);

				// Calculate the mint fees on the capacity amount,
				// as this will be the ETH accepted by the contract.
				({ mintFee, expectedFeesUSD } = await calculateMintFees(initialCapacity));

				await weth.deposit({ from: account1, value: amount });
				await weth.approve(ethWrapper.address, amount, { from: account1 });
				mintTx = await ethWrapper.mint(amount, { from: account1 });
			});

			it('locks `capacity` ETH in the contract', async () => {
				const logs = await getDecodedLogs({
					hash: mintTx.tx,
					contracts: [weth],
				});

				decodedEventEqual({
					event: 'Transfer',
					emittedFrom: weth.address,
					args: [account1, ethWrapper.address, initialCapacity],
					log: logs[0],
				});
			});
			it('mints capacity(1-mintFeeRate) sETH into the user’s wallet', async () => {
				assert.bnEqual(await sETHSynth.balanceOf(account1), initialCapacity.sub(mintFee));
			});
			it('sends capacity*mintFeeRate worth of sETH to the fee pool as sUSD', async () => {
				assert.bnEqual(await sUSDSynth.balanceOf(FEE_ADDRESS), expectedFeesUSD);
			});
			it('has a capacity of 0.5 bps after', async () => {
				// console.log(`End capacity: ${(await ethWrapper.capacity()).toString()}`)
				assert.bnEqual(await ethWrapper.capacity(), mintFee);
			});
		});

		describe('when capacity = 0', () => {
			beforeEach(async () => {
				await systemSettings.setETHWrapperMaxETH('0', { from: owner });
			});

			it('reverts', async () => {
				const amount = '1';
				await weth.deposit({ from: account1, value: amount });
				await weth.approve(ethWrapper.address, amount, { from: account1 });

				await assert.revert(
					ethWrapper.mint(amount, { from: account1 }),
					'Contract has no spare capacity to mint'
				);
			});
		});
	});

	describe('burn', async () => {
		describe('when the contract has 0 WETH', async () => {
			it('reverts', async () => {
				await assert.revert(
					ethWrapper.burn('1', { from: account1 }),
					'Contract cannot burn sETH for WETH, WETH balance is zero'
				);
			});
		});

		describe('when the contract has WETH reserves', async () => {
			let burnTx;

			beforeEach(async () => {
				const amount = toUnit('10');
				await weth.deposit({ from: account1, value: amount });
				await weth.approve(ethWrapper.address, amount, { from: account1 });
				await ethWrapper.mint(amount, { from: account1 });
			});

			describe('when amount is strictly lower than reserves(1+burnFeeRate)', async () => {
				const amount = toUnit('1.0');
				let burnFee;
				let expectedFeesUSD;
				let initialCapacity;

				beforeEach(async () => {
					initialCapacity = await ethWrapper.capacity();

					await sETHSynth.issue(account1, amount);
					await sETHSynth.approve(ethWrapper.address, amount, { from: account1 });

					({ burnFee, expectedFeesUSD } = await calculateBurnFees(amount));

					burnTx = await ethWrapper.burn(amount, { from: account1 });
				});

				it('burns `amount` of sETH', async () => {
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
				});
				it('sends amount(1-burnFeeRate) WETH to user', async () => {
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
				});
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
				});
				it('increases capacity by `amount` WETH', async () => {
					assert.bnEqual(await ethWrapper.capacity(), initialCapacity.add(amount));
				});
			});

			describe('when amount is larger than or equal to reserves(1+burnFeeRate)', async () => {
				let reserves;
				let amount;
				let burnFee;
				let expectedFeesUSD;
				let initialCapacity;

				beforeEach(async () => {
					reserves = await ethWrapper.getBalance();
					initialCapacity = await ethWrapper.capacity();

					const burnFeeRate = await ethWrapper.burnFeeRate();
					amount = reserves.mul(ONE.add(burnFeeRate)).add(ONE);

					await sETHSynth.issue(account1, amount);
					await sETHSynth.approve(ethWrapper.address, amount, { from: account1 });

					({ burnFee, expectedFeesUSD } = await calculateBurnFees(reserves));

					burnTx = await ethWrapper.burn(amount, { from: account1 });
				});

				it('burns `reserves` amount of sETH', async () => {
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
				});
				it('sends reserves(1-burnFeeRate) WETH to user', async () => {
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
				});
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
				});
				it('increases capacity by `reserves` WETH', async () => {
					assert.bnEqual(await ethWrapper.capacity(), initialCapacity.add(reserves));
				});
			});
		});
	});
});
