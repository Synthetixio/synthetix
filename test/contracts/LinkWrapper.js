'use strict';

const { contract } = require('hardhat');

const { assert, addSnapshotBeforeRestoreAfterEach } = require('./common');

const { currentTime, toUnit, multiplyDecimal } = require('../utils')();

const {
	ensureOnlyExpectedMutativeFunctions,
	getDecodedLogs,
	decodedEventEqual,
} = require('./helpers');

const { mockToken, setupAllContracts } = require('./setup');

const { toBytes32 } = require('../..');
const { toBN } = require('web3-utils');

contract('LinkWrapper', async accounts => {
	const synths = ['sUSD', 'sLINK', 'SNX'];
	const [sLINK, sUSD] = ['sLINK', 'sUSD'].map(toBytes32);

	const ONE = toBN('1');

	const [, owner, oracle, , account1] = accounts;

	let systemSettings,
		feePool,
		exchangeRates,
		addressResolver,
		issuer,
		FEE_ADDRESS,
		sUSDSynth,
		sLINKSynth,
		linkWrapper,
		linkToken,
		timestamp;

	const calculateLINKToUSD = async feesInAsset => {
		// how many sUSD I will get for this LINK
		const expectedFeesUSD = await exchangeRates.effectiveValue(sLINK, feesInAsset, sUSD);
		return expectedFeesUSD;
	};

	const calculateMintFees = async amount => {
		const mintFee = await linkWrapper.calculateMintFee(amount);
		const expectedFeesUSD = await calculateLINKToUSD(mintFee);
		return { mintFee, expectedFeesUSD };
	};

	const calculateBurnFees = async amount => {
		const burnFee = await linkWrapper.calculateBurnFee(amount);
		const expectedFeesUSD = await calculateLINKToUSD(burnFee);
		return { burnFee, expectedFeesUSD };
	};

	before(async () => {
		({
			SystemSettings: systemSettings,
			AddressResolver: addressResolver,
			Issuer: issuer,
			FeePool: feePool,
			ExchangeRates: exchangeRates,
			LinkWrapper: linkWrapper,
			SynthsUSD: sUSDSynth,
			SynthsLINK: sLINKSynth,
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
				'LinkWrapper',
				'CollateralManager',
			],
		}));

		({ token: linkToken } = await mockToken({
			accounts,
			name: 'Link Token',
			symbol: 'LINK',
		}));

		// set defaults for test - 50bps mint and burn fees
		await systemSettings.setLinkWrapperMintFeeRate(toUnit('0.005'), { from: owner });
		await systemSettings.setLinkWrapperBurnFeeRate(toUnit('0.005'), { from: owner });

		FEE_ADDRESS = await feePool.FEE_ADDRESS();
		timestamp = await currentTime();

		await exchangeRates.updateRates([sLINK], ['20'].map(toUnit), timestamp, {
			from: oracle,
		});
	});

	addSnapshotBeforeRestoreAfterEach();

	it('ensure only expected functions are mutative', () => {
		ensureOnlyExpectedMutativeFunctions({
			abi: linkWrapper.abi,
			hasFallback: true,
			ignoreParents: ['Owned', 'Pausable', 'MixinResolver', 'MixinSystemSettings'],
			expected: ['mint', 'burn', 'distributeFees'],
		});
	});

	describe('On deployment of Contract', async () => {
		let instance;
		beforeEach(async () => {
			instance = linkWrapper;
		});

		it('should set constructor params on deployment', async () => {
			assert.equal(await instance.resolver(), addressResolver.address);
		});

		it('should access its dependencies via the address resolver', async () => {
			assert.equal(await addressResolver.getAddress(toBytes32('SynthsLINK')), sLINKSynth.address);
			assert.equal(await addressResolver.getAddress(toBytes32('SynthsUSD')), sUSDSynth.address);
			assert.equal(
				await addressResolver.getAddress(toBytes32('ExchangeRates')),
				exchangeRates.address
			);
			assert.equal(await addressResolver.getAddress(toBytes32('Issuer')), issuer.address);
			assert.equal(await addressResolver.getAddress(toBytes32('FeePool')), feePool.address);
		});

		describe('should have a default', async () => {
			const MAX_LINK = toUnit('5000');
			const FIFTY_BIPS = toUnit('0.005');

			it('maxLink of 5,000 LINK', async () => {
				assert.bnEqual(await linkWrapper.maxLink(), MAX_LINK);
			});
			it('capacity of 5,000 LINK', async () => {
				assert.bnEqual(await linkWrapper.capacity(), MAX_LINK);
			});
			it('mintFeeRate of 50 bps', async () => {
				assert.bnEqual(await linkWrapper.mintFeeRate(), FIFTY_BIPS);
			});
			it('burnFeeRate of 50 bps', async () => {
				assert.bnEqual(await linkWrapper.burnFeeRate(), FIFTY_BIPS);
			});
			describe('totalIssuedSynths', async () => {
				it('sLINK = 0', async () => {
					assert.bnEqual(await linkWrapper.sLINKIssued(), toBN('0'));
				});
				it('sUSD = 0', async () => {
					assert.bnEqual(await linkWrapper.sUSDIssued(), toBN('0'));
				});
			});
		});
	});

	describe('totalIssuedSynths', async () => {
		describe('when mint(1 sLINK) is called', async () => {
			const mintAmount = toUnit('1.0');

			beforeEach(async () => {
				await linkToken.transfer(account1, toUnit('1000'), { from: owner });
				await linkToken.approve(linkWrapper.address, mintAmount, { from: account1 });
				await linkWrapper.mint(mintAmount, { from: account1 });
			});

			it('total issued sLINK = 1.0', async () => {
				assert.bnEqual(await linkWrapper.sLINKIssued(), toUnit('1.0'));
			});
			it('fees escrowed = 0.005', async () => {
				assert.bnEqual(await linkWrapper.feesEscrowed(), toUnit('0.005'));
			});

			describe('then burn(`reserves + fees` WETH) is called', async () => {
				const burnAmount = toUnit('1.0');

				beforeEach(async () => {
					const { burnFee } = await calculateBurnFees(burnAmount);
					const amountIn = burnAmount.add(burnFee);
					await sLINKSynth.issue(account1, amountIn);
					await sLINKSynth.approve(linkWrapper.address, amountIn, { from: account1 });
					await linkWrapper.burn(amountIn, { from: account1 });
				});

				it('total issued sLINK = 0.0', async () => {
					assert.bnEqual(await linkWrapper.sLINKIssued(), toUnit('0.0'));
				});
				it('fees escrowed = 0.01', async () => {
					assert.bnEqual(await linkWrapper.feesEscrowed(), toUnit('0.01'));
				});

				describe('then distributeFees is called', async () => {
					beforeEach(async () => {
						// await feePool.closeCurrentFeePeriod({ from: account1 });
						await linkWrapper.distributeFees();
					});

					it('total issued sUSD = $0.2', async () => {
						// 20*0.01 = 0.2
						assert.bnEqual(await linkWrapper.sUSDIssued(), toUnit('0.2'));
					});

					it('fees escrowed = 0.0', async () => {
						assert.bnEqual(await linkWrapper.feesEscrowed(), toUnit('0.0'));
					});
				});
			});
		});
	});

	describe('mint', async () => {
		describe('when amount is less than than capacity', () => {
			let amount;
			let initialCapacity;
			let mintFee;
			let mintTx;
			let feesEscrowed;

			beforeEach(async () => {
				initialCapacity = await linkWrapper.capacity();
				amount = initialCapacity.sub(toUnit('1.0'));

				({ mintFee } = await calculateMintFees(amount));

				feesEscrowed = await linkWrapper.feesEscrowed();

				await linkToken.approve(linkWrapper.address, amount, { from: account1 });
				mintTx = await linkWrapper.mint(amount, { from: account1 });
			});

			it('locks `amount` LINK in the contract', async () => {
				const logs = await getDecodedLogs({
					hash: mintTx.tx,
					contracts: [linkToken],
				});

				decodedEventEqual({
					event: 'Transfer',
					emittedFrom: linkToken.address,
					args: [account1, linkWrapper.address, amount],
					log: logs[0],
				});
			});
			it('mints amount(1-mintFeeRate) sLINK into the user’s wallet', async () => {
				assert.bnEqual(await sLINKSynth.balanceOf(account1), amount.sub(mintFee));
			});
			it('escrows `amount * mintFeeRate` worth of sLINK as fees', async () => {
				assert.bnEqual(await linkWrapper.feesEscrowed(), feesEscrowed.add(mintFee));
			});
			it('has a capacity of (capacity - amount) after', async () => {
				assert.bnEqual(await linkWrapper.capacity(), initialCapacity.sub(amount));
			});
			it('emits Minted event', async () => {
				const logs = await getDecodedLogs({
					hash: mintTx.tx,
					contracts: [linkWrapper],
				});

				decodedEventEqual({
					event: 'Minted',
					emittedFrom: linkWrapper.address,
					args: [account1, amount.sub(mintFee), mintFee],
					log: logs.filter(l => !!l).find(({ name }) => name === 'Minted'),
				});
			});
		});

		describe('amount is larger than or equal to capacity', () => {
			let amount;
			let initialCapacity;
			let mintFee;
			let mintTx;
			let feesEscrowed;

			beforeEach(async () => {
				initialCapacity = await linkWrapper.capacity();
				amount = initialCapacity.add(ONE);

				// Calculate the mint fees on the capacity amount,
				// as this will be the LINK accepted by the contract.
				({ mintFee } = await calculateMintFees(initialCapacity));

				feesEscrowed = await linkWrapper.feesEscrowed();

				await linkToken.approve(linkWrapper.address, amount, { from: account1 });
				mintTx = await linkWrapper.mint(amount, { from: account1 });
			});

			it('locks `capacity` LINK in the contract', async () => {
				const logs = await getDecodedLogs({
					hash: mintTx.tx,
					contracts: [linkToken],
				});

				decodedEventEqual({
					event: 'Transfer',
					emittedFrom: linkToken.address,
					args: [account1, linkWrapper.address, initialCapacity],
					log: logs[0],
				});
			});
			it('mints capacity(1-mintFeeRate) sLINK into the user’s wallet', async () => {
				assert.bnEqual(await sLINKSynth.balanceOf(account1), initialCapacity.sub(mintFee));
			});
			it('escrows `capacity * mintFeeRate` worth of sLINK as fees', async () => {
				assert.bnEqual(await linkWrapper.feesEscrowed(), feesEscrowed.add(mintFee));
			});
			it('has a capacity of 0 after', async () => {
				assert.bnEqual(await linkWrapper.capacity(), toBN('0'));
			});
		});

		describe('when capacity = 0', () => {
			beforeEach(async () => {
				await linkToken.transfer(account1, toUnit('1000'), { from: owner });
				await systemSettings.setLinkWrapperMaxLINK('0', { from: owner });
			});

			it('reverts', async () => {
				const amount = '1';
				await linkToken.approve(linkWrapper.address, amount, { from: account1 });

				await assert.revert(
					linkWrapper.mint(amount, { from: account1 }),
					'Contract has no spare capacity to mint'
				);
			});
		});
	});

	describe('burn', async () => {
		describe('when the contract has 0 LINK', async () => {
			it('reverts', async () => {
				await assert.revert(
					linkWrapper.burn('1', { from: account1 }),
					'Contract cannot burn sLINK for LINK, LINK balance is zero'
				);
			});
		});

		describe('when the contract has LINK reserves', async () => {
			let burnTx;

			beforeEach(async () => {
				const amount = toUnit('1');
				await linkToken.transfer(account1, toUnit('10'), { from: owner });
				await linkToken.approve(linkWrapper.address, amount, { from: account1 });
				await linkWrapper.mint(amount, { from: account1 });
			});

			describe('when amount is strictly lower than reserves(1+burnFeeRate)', async () => {
				const principal = toUnit('1.0');
				let amount;
				let burnFee;
				let initialCapacity;
				let feesEscrowed;

				beforeEach(async () => {
					initialCapacity = await linkWrapper.capacity();
					feesEscrowed = await linkWrapper.feesEscrowed();

					({ burnFee } = await calculateBurnFees(principal));
					amount = principal.add(burnFee);
					await sLINKSynth.issue(account1, amount);
					await sLINKSynth.approve(linkWrapper.address, amount, { from: account1 });

					burnTx = await linkWrapper.burn(amount, { from: account1 });
				});

				it('burns `amount` of sLINK from user', async () => {
					const logs = await getDecodedLogs({
						hash: burnTx.tx,
						contracts: [sLINKSynth],
					});

					decodedEventEqual({
						event: 'Burned',
						emittedFrom: sLINKSynth.address,
						args: [account1, amount],
						log: logs.filter(l => !!l).find(({ name }) => name === 'Burned'),
					});
				});
				it('sends amount(1-burnFeeRate) LINK to user', async () => {
					const logs = await getDecodedLogs({
						hash: burnTx.tx,
						contracts: [linkToken],
					});

					decodedEventEqual({
						event: 'Transfer',
						emittedFrom: linkToken.address,
						args: [linkWrapper.address, account1, amount.sub(burnFee)],
						log: logs
							.reverse()
							.filter(l => !!l)
							.find(({ name }) => name === 'Transfer'),
					});
				});
				it('escrows `amount * burnFeeRate` worth of sLINK as fees', async () => {
					assert.bnEqual(await linkWrapper.feesEscrowed(), feesEscrowed.add(burnFee));
				});
				it('increases capacity by `amount - fees` LINK', async () => {
					assert.bnEqual(await linkWrapper.capacity(), initialCapacity.add(amount.sub(burnFee)));
				});
				it('emits Burned event', async () => {
					const logs = await getDecodedLogs({
						hash: burnTx.tx,
						contracts: [linkWrapper],
					});

					decodedEventEqual({
						event: 'Burned',
						emittedFrom: linkWrapper.address,
						args: [account1, amount.sub(burnFee), burnFee],
						log: logs
							.reverse()
							.filter(l => !!l)
							.find(({ name }) => name === 'Burned'),
					});
				});
			});

			describe('when amount is larger than or equal to reserves(1+burnFeeRate)', async () => {
				let reserves;
				let amount;
				let burnFee;
				let feesEscrowed;

				beforeEach(async () => {
					reserves = await linkWrapper.getReserves();
					({ burnFee } = await calculateBurnFees(reserves));

					amount = reserves.add(burnFee).add(toBN('100000000'));
					feesEscrowed = await linkWrapper.feesEscrowed();

					await sLINKSynth.issue(account1, amount);
					await sLINKSynth.approve(linkWrapper.address, amount, { from: account1 });

					burnTx = await linkWrapper.burn(amount, { from: account1 });
				});

				it('burns `reserves(1+burnFeeRate)` amount of sLINK from user', async () => {
					const logs = await getDecodedLogs({
						hash: burnTx.tx,
						contracts: [sLINKSynth],
					});

					decodedEventEqual({
						event: 'Burned',
						emittedFrom: sLINKSynth.address,
						args: [account1, reserves.add(burnFee)],
						log: logs.filter(l => !!l).find(({ name }) => name === 'Burned'),
					});
				});
				it('sends `reserves` LINK to user', async () => {
					const logs = await getDecodedLogs({
						hash: burnTx.tx,
						contracts: [linkToken],
					});

					decodedEventEqual({
						event: 'Transfer',
						emittedFrom: linkToken.address,
						args: [linkWrapper.address, account1, reserves],
						log: logs
							.reverse()
							.filter(l => !!l)
							.find(({ name }) => name === 'Transfer'),
					});
				});
				it('escrows `amount * burnFeeRate` worth of sLINK as fees', async () => {
					assert.bnEqual(await linkWrapper.feesEscrowed(), feesEscrowed.add(burnFee));
				});
				it('has a max capacity after', async () => {
					assert.bnEqual(await linkWrapper.capacity(), await linkWrapper.maxLink());
				});
				it('is left with 0 reserves remaining', async () => {
					assert.equal(await linkWrapper.getReserves(), '0');
				});
			});

			describe('precision and rounding', async () => {
				let burnAmount;
				let burnTx;

				before(async () => {
					const amount = toUnit('1.2');
					await linkToken.deposit({ from: account1, value: amount });
					await linkToken.approve(linkWrapper.address, amount, { from: account1 });
					await linkWrapper.mint(amount, { from: account1 });

					burnAmount = toUnit('0.9');
					await sLINKSynth.issue(account1, burnAmount);
					await sLINKSynth.approve(linkWrapper.address, burnAmount, { from: account1 });
					burnTx = await linkWrapper.burn(burnAmount, { from: account1 });
				});
				it('emits a Burn event which burns 0.9 sLINK', async () => {
					const logs = await getDecodedLogs({
						hash: burnTx.tx,
						contracts: [sLINKSynth],
					});

					decodedEventEqual({
						event: 'Burned',
						emittedFrom: sLINKSynth.address,
						args: [account1, burnAmount],
						log: logs.filter(l => !!l).find(({ name }) => name === 'Burned'),
						bnCloseVariance: 0,
					});
				});
			});
		});
	});

	describe('distributeFees', async () => {
		let tx;
		let feesEscrowed;
		let sLINKIssued;

		before(async () => {
			const amount = toUnit('10');
			await linkToken.deposit({ from: account1, value: amount });
			await linkToken.approve(linkWrapper.address, amount, { from: account1 });
			await linkWrapper.mint(amount, { from: account1 });

			feesEscrowed = await linkWrapper.feesEscrowed();
			sLINKIssued = await linkWrapper.sLINKIssued();
			tx = await linkWrapper.distributeFees();
		});

		it('burns `feesEscrowed` sLINK', async () => {
			const logs = await getDecodedLogs({
				hash: tx.tx,
				contracts: [sLINKSynth],
			});

			decodedEventEqual({
				event: 'Burned',
				emittedFrom: sLINKSynth.address,
				args: [linkWrapper.address, feesEscrowed],
				log: logs.filter(l => !!l).find(({ name }) => name === 'Burned'),
			});
		});
		it('issues sUSD to the feepool', async () => {
			const logs = await getDecodedLogs({
				hash: tx.tx,
				contracts: [sUSDSynth],
			});
			const rate = await exchangeRates.rateForCurrency(sLINK);

			decodedEventEqual({
				event: 'Issued',
				emittedFrom: sUSDSynth.address,
				args: [FEE_ADDRESS, multiplyDecimal(feesEscrowed, rate)],
				log: logs
					.reverse()
					.filter(l => !!l)
					.find(({ name }) => name === 'Issued'),
			});
		});
		it('sLINKIssued is reduced by `feesEscrowed`', async () => {
			assert.bnEqual(await linkWrapper.sLINKIssued(), sLINKIssued.sub(feesEscrowed));
		});
		it('feesEscrowed = 0', async () => {
			assert.bnEqual(await linkWrapper.feesEscrowed(), toBN(0));
		});
	});
});
