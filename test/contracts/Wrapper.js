'use strict';

const { contract, artifacts } = require('hardhat');

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

contract('Wrapper', async accounts => {
	const synths = ['sUSD', 'sETH', 'ETH', 'SNX'];
	const [sETH, sUSD, ETH] = ['sETH', 'sUSD', 'ETH'].map(toBytes32);

	const ONE = toBN('1');

	const [, owner, oracle, , account1] = accounts;

	let systemSettings,
		feePool,
		exchangeRates,
		addressResolver,
		depot,
		issuer,
		sUSDSynth,
		sETHSynth,
		wrapperFactory,
		etherWrapper,
		weth,
		timestamp;

	const calculateETHToUSD = async feesInETH => {
		// Ask the Depot how many sUSD I will get for this ETH
		const expectedFeesUSD = await depot.synthsReceivedForEther(feesInETH);
		return expectedFeesUSD;
	};

	const calculateMintFees = async amount => {
		const mintFee = await etherWrapper.calculateMintFee(amount);
		const expectedFeesUSD = await calculateETHToUSD(mintFee);
		return { mintFee, expectedFeesUSD };
	};

	const calculateBurnFees = async amount => {
		const burnFee = await etherWrapper.calculateBurnFee(amount);
		const expectedFeesUSD = await calculateETHToUSD(burnFee);
		return { burnFee, expectedFeesUSD };
	};

	before(async () => {
		({
			SystemSettings: systemSettings,
			AddressResolver: addressResolver,
			Issuer: issuer,
			FeePool: feePool,
			Depot: depot,
			ExchangeRates: exchangeRates,
			WrapperFactory: wrapperFactory,
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
				'WrapperFactory',
				'WETH',
				'CollateralManager',
			],
		}));

		// deploy an eth wrapper
		const etherWrapperCreateTx = await wrapperFactory.createWrapper(
			weth.address,
			sETH,
			toBytes32('SynthsETH'),
			{ from: owner }
		);

		// extract address from events
		const etherWrapperAddress = etherWrapperCreateTx.logs.find(l => l.event === 'WrapperCreated')
			.args.wrapperAddress;
		etherWrapper = await artifacts.require('Wrapper').at(etherWrapperAddress);

		// set defaults for test - 50bps mint and burn fees
		await systemSettings.setWrapperMaxTokenAmount(etherWrapperAddress, toUnit('5000'), {
			from: owner,
		});
		await systemSettings.setWrapperMintFeeRate(etherWrapperAddress, toUnit('0.005'), {
			from: owner,
		});
		await systemSettings.setWrapperBurnFeeRate(etherWrapperAddress, toUnit('0.005'), {
			from: owner,
		});

		timestamp = await currentTime();

		// Depot requires ETH rates
		await exchangeRates.updateRates([sETH, ETH], ['1500', '1500'].map(toUnit), timestamp, {
			from: oracle,
		});
	});

	addSnapshotBeforeRestoreAfterEach();

	it('ensure only expected functions are mutative', () => {
		ensureOnlyExpectedMutativeFunctions({
			abi: etherWrapper.abi,
			hasFallback: true,
			ignoreParents: ['Owned', 'Pausable', 'MixinResolver', 'MixinSystemSettings'],
			expected: ['mint', 'burn'],
		});
	});

	describe('On deployment of Contract', async () => {
		let instance;
		beforeEach(async () => {
			instance = etherWrapper;
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
			assert.equal(
				await addressResolver.getAddress(toBytes32('WrapperFactory')),
				wrapperFactory.address
			);
		});

		describe('should have a default', async () => {
			const MAX_ETH = toUnit('5000');
			const FIFTY_BIPS = toUnit('0.005');

			it('maxTokenAmount of 5,000 ETH', async () => {
				assert.bnEqual(await etherWrapper.maxTokenAmount(), MAX_ETH);
			});
			it('capacity of 5,000 ETH', async () => {
				assert.bnEqual(await etherWrapper.capacity(), MAX_ETH);
			});
			it('mintFeeRate of 50 bps', async () => {
				assert.bnEqual(await etherWrapper.mintFeeRate(), FIFTY_BIPS);
			});
			it('burnFeeRate of 50 bps', async () => {
				assert.bnEqual(await etherWrapper.burnFeeRate(), FIFTY_BIPS);
			});
			describe('totalIssuedSynths', async () => {
				it('synth = 0', async () => {
					assert.bnEqual(await etherWrapper.targetSynthIssued(), toBN('0'));
				});
			});
		});
	});

	describe('totalIssuedSynths', async () => {
		const mintAmount = toUnit('1.0');
		let feeAmount;

		before(async () => {
			feeAmount = await exchangeRates.effectiveValue(sETH, toUnit('0.005'), sUSD);
		});

		describe('when mint(1 sETH) is called', async () => {
			beforeEach(async () => {
				await weth.deposit({ from: account1, value: mintAmount });
				await weth.approve(etherWrapper.address, mintAmount, { from: account1 });
				await etherWrapper.mint(mintAmount, { from: account1 });
			});

			it('total issued sETH = 1.0', async () => {
				assert.bnEqual(await etherWrapper.targetSynthIssued(), toUnit('1.0'));
			});
			it('fees escrowed = 0.005', async () => {
				assert.bnEqual(await wrapperFactory.feesEscrowed(), feeAmount);
			});

			describe('then burn(`reserves + fees` WETH) is called', async () => {
				const burnAmount = toUnit('1.0');

				beforeEach(async () => {
					const { burnFee } = await calculateBurnFees(burnAmount);
					const amountIn = burnAmount.add(burnFee);
					await sETHSynth.issue(account1, amountIn);
					await sETHSynth.approve(etherWrapper.address, amountIn, { from: account1 });
					await etherWrapper.burn(amountIn, { from: account1 });
				});

				it('total issued sETH = 0.0', async () => {
					assert.bnEqual(await etherWrapper.targetSynthIssued(), toUnit('0.0'));
				});
				it('fees escrowed = 0.01', async () => {
					assert.bnEqual(await wrapperFactory.feesEscrowed(), feeAmount.mul(toBN(2)));
				});

				describe('then distributeFees is called', async () => {
					beforeEach(async () => {
						// await feePool.closeCurrentFeePeriod({ from: account1 });
						await wrapperFactory.distributeFees();
					});

					it('fees escrowed = 0.0', async () => {
						assert.bnEqual(await wrapperFactory.feesEscrowed(), toUnit('0.0'));
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
			let expectedFeesUSD;
			let mintTx;
			let feesEscrowed;

			beforeEach(async () => {
				initialCapacity = await etherWrapper.capacity();
				amount = initialCapacity.sub(toUnit('1.0'));

				({ mintFee, expectedFeesUSD } = await calculateMintFees(amount));

				feesEscrowed = await wrapperFactory.feesEscrowed();

				await weth.deposit({ from: account1, value: amount });
				await weth.approve(etherWrapper.address, amount, { from: account1 });
				mintTx = await etherWrapper.mint(amount, { from: account1 });
			});

			it('locks `amount` WETH in the contract', async () => {
				const logs = await getDecodedLogs({
					hash: mintTx.tx,
					contracts: [weth],
				});

				decodedEventEqual({
					event: 'Transfer',
					emittedFrom: weth.address,
					args: [account1, etherWrapper.address, amount],
					log: logs[0],
				});
			});
			it('mints amount(1-mintFeeRate) sETH into the user’s wallet', async () => {
				assert.bnEqual(await sETHSynth.balanceOf(account1), amount.sub(mintFee));
			});
			it('escrows `amount * mintFeeRate` worth of sUSD as fees', async () => {
				assert.bnEqual(await wrapperFactory.feesEscrowed(), feesEscrowed.add(expectedFeesUSD));
			});
			it('has a capacity of (capacity - amount) after', async () => {
				assert.bnEqual(await etherWrapper.capacity(), initialCapacity.sub(amount));
			});
			it('targetSynthIssued = sETH balance', async () => {
				assert.bnEqual(
					await etherWrapper.targetSynthIssued(),
					await weth.balanceOf(etherWrapper.address)
				);
			});
			it('emits Minted event', async () => {
				const logs = await getDecodedLogs({
					hash: mintTx.tx,
					contracts: [etherWrapper],
				});

				decodedEventEqual({
					event: 'Minted',
					emittedFrom: etherWrapper.address,
					args: [account1, amount.sub(mintFee), mintFee],
					log: logs.filter(l => !!l).find(({ name }) => name === 'Minted'),
				});
			});
		});

		describe('amount is larger than or equal to capacity', () => {
			let amount;
			let initialCapacity;
			let mintFee;
			let expectedFeesUSD;
			let mintTx;
			let feesEscrowed;

			beforeEach(async () => {
				initialCapacity = await etherWrapper.capacity();
				amount = initialCapacity.add(ONE);

				// Calculate the mint fees on the capacity amount,
				// as this will be the ETH accepted by the contract.
				({ mintFee, expectedFeesUSD } = await calculateMintFees(initialCapacity));

				feesEscrowed = await wrapperFactory.feesEscrowed();

				await weth.deposit({ from: account1, value: amount });
				await weth.approve(etherWrapper.address, amount, { from: account1 });
				mintTx = await etherWrapper.mint(amount, { from: account1 });
			});

			it('locks `capacity` ETH in the contract', async () => {
				const logs = await getDecodedLogs({
					hash: mintTx.tx,
					contracts: [weth],
				});

				decodedEventEqual({
					event: 'Transfer',
					emittedFrom: weth.address,
					args: [account1, etherWrapper.address, initialCapacity],
					log: logs[0],
				});
			});
			it('mints capacity(1-mintFeeRate) sETH into the user’s wallet', async () => {
				assert.bnEqual(await sETHSynth.balanceOf(account1), initialCapacity.sub(mintFee));
			});
			it('escrows `capacity * mintFeeRate` worth of sUSD as fees', async () => {
				assert.bnEqual(await wrapperFactory.feesEscrowed(), feesEscrowed.add(expectedFeesUSD));
			});
			it('has a capacity of 0 after', async () => {
				assert.bnEqual(await etherWrapper.capacity(), toBN('0'));
			});
			it('targetSynthIssued = sETH balance', async () => {
				assert.bnEqual(
					await etherWrapper.targetSynthIssued(),
					await weth.balanceOf(etherWrapper.address)
				);
			});
		});

		describe('when capacity = 0', () => {
			beforeEach(async () => {
				await systemSettings.setWrapperMaxTokenAmount(etherWrapper.address, '0', { from: owner });
			});

			it('reverts', async () => {
				const amount = '1';
				await weth.deposit({ from: account1, value: amount });
				await weth.approve(etherWrapper.address, amount, { from: account1 });

				await assert.revert(
					etherWrapper.mint(amount, { from: account1 }),
					'Contract has no spare capacity to mint'
				);
			});
		});
	});

	describe('burn', async () => {
		describe('when the contract has 0 WETH', async () => {
			it('reverts', async () => {
				await assert.revert(etherWrapper.burn('1', { from: account1 }), 'Balance is too low');
			});
		});

		describe('when the contract has WETH reserves', async () => {
			let burnTx;

			beforeEach(async () => {
				const amount = toUnit('2');
				await weth.deposit({ from: account1, value: amount });
				await weth.approve(etherWrapper.address, amount, { from: account1 });
				await etherWrapper.mint(amount, { from: account1 });
			});

			describe('when amount is strictly lower than reserves(1+burnFeeRate)', async () => {
				const principal = toUnit('1.0');
				let amount;
				let burnFee;
				let expectedFeesUSD;
				let initialCapacity;
				let feesEscrowed;

				beforeEach(async () => {
					initialCapacity = await etherWrapper.capacity();
					feesEscrowed = await wrapperFactory.feesEscrowed();

					({ burnFee, expectedFeesUSD } = await calculateBurnFees(principal));
					amount = principal.add(burnFee);
					await sETHSynth.issue(account1, amount);
					await sETHSynth.approve(etherWrapper.address, amount, { from: account1 });

					burnTx = await etherWrapper.burn(amount, { from: account1 });
				});

				it('burns `amount` of sETH from user', async () => {
					const logs = await getDecodedLogs({
						hash: burnTx.tx,
						contracts: [sETHSynth],
					});

					decodedEventEqual({
						event: 'Burned',
						emittedFrom: sETHSynth.address,
						args: [account1, amount],
						log: logs.filter(l => !!l).find(({ name }) => name === 'Burned'),
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
						args: [etherWrapper.address, account1, amount.sub(burnFee)],
						log: logs
							.reverse()
							.filter(l => !!l)
							.find(({ name }) => name === 'Transfer'),
					});
				});
				it('escrows `amount * burnFeeRate` worth of sETH as fees', async () => {
					assert.bnEqual(await wrapperFactory.feesEscrowed(), feesEscrowed.add(expectedFeesUSD));
				});
				it('increases capacity by `amount - fees` WETH', async () => {
					assert.bnEqual(await etherWrapper.capacity(), initialCapacity.add(amount.sub(burnFee)));
				});
				it('targetSynthIssued = sETH balance', async () => {
					assert.bnEqual(
						await etherWrapper.targetSynthIssued(),
						await weth.balanceOf(etherWrapper.address)
					);
				});
				it('emits Burned event', async () => {
					const logs = await getDecodedLogs({
						hash: burnTx.tx,
						contracts: [etherWrapper],
					});

					decodedEventEqual({
						event: 'Burned',
						emittedFrom: etherWrapper.address,
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
				let expectedFeesUSD;
				let feesEscrowed;

				beforeEach(async () => {
					reserves = await etherWrapper.targetSynthIssued();
					({ burnFee, expectedFeesUSD } = await calculateBurnFees(reserves));

					amount = reserves.add(burnFee).add(toBN('100000000'));
					feesEscrowed = await wrapperFactory.feesEscrowed();

					await sETHSynth.issue(account1, amount);
					await sETHSynth.approve(etherWrapper.address, amount, { from: account1 });

					burnTx = await etherWrapper.burn(amount, { from: account1 });
				});

				it('burns `reserves(1+burnFeeRate)` amount of sETH from user', async () => {
					const logs = await getDecodedLogs({
						hash: burnTx.tx,
						contracts: [sETHSynth],
					});

					decodedEventEqual({
						event: 'Burned',
						emittedFrom: sETHSynth.address,
						args: [account1, reserves.add(burnFee)],
						log: logs.filter(l => !!l).find(({ name }) => name === 'Burned'),
					});
				});
				it('sends `reserves` WETH to user', async () => {
					const logs = await getDecodedLogs({
						hash: burnTx.tx,
						contracts: [weth],
					});

					decodedEventEqual({
						event: 'Transfer',
						emittedFrom: weth.address,
						args: [etherWrapper.address, account1, reserves],
						log: logs
							.reverse()
							.filter(l => !!l)
							.find(({ name }) => name === 'Transfer'),
					});
				});
				it('escrows `amount * burnFeeRate` worth of sUSD as fees', async () => {
					assert.bnEqual(await wrapperFactory.feesEscrowed(), feesEscrowed.add(expectedFeesUSD));
				});
				it('has a max capacity after', async () => {
					assert.bnEqual(await etherWrapper.capacity(), await etherWrapper.maxTokenAmount());
				});
				it('is left with 0 synth issued remaining', async () => {
					assert.equal(await etherWrapper.targetSynthIssued(), '0');
				});
			});

			describe('precision and rounding', async () => {
				let burnAmount;
				let burnTx;

				before(async () => {
					const amount = toUnit('1.2');
					await weth.deposit({ from: account1, value: amount });
					await weth.approve(etherWrapper.address, amount, { from: account1 });
					await etherWrapper.mint(amount, { from: account1 });

					burnAmount = toUnit('0.9');
					await sETHSynth.issue(account1, burnAmount);
					await sETHSynth.approve(etherWrapper.address, burnAmount, { from: account1 });
					burnTx = await etherWrapper.burn(burnAmount, { from: account1 });
				});
				it('emits a Burn event which burns 0.9 sETH', async () => {
					const logs = await getDecodedLogs({
						hash: burnTx.tx,
						contracts: [sETHSynth],
					});

					decodedEventEqual({
						event: 'Burned',
						emittedFrom: sETHSynth.address,
						args: [account1, burnAmount],
						log: logs.filter(l => !!l).find(({ name }) => name === 'Burned'),
						bnCloseVariance: 0,
					});
				});
			});
		});
	});

	describe('transfer without mint', () => {
		let preTargetIssuedSynths;

		const extraTransferred = toUnit('2');

		before(async () => {
			const amount = toUnit('1');
			await weth.deposit({ from: account1, value: amount.add(extraTransferred) });
			await weth.approve(etherWrapper.address, amount, { from: account1 });
			await etherWrapper.mint(amount, { from: account1 });

			// wipe fees
			await wrapperFactory.distributeFees();

			preTargetIssuedSynths = await etherWrapper.targetSynthIssued();

			await weth.transfer(etherWrapper.address, extraTransferred, { from: account1 });
		});

		addSnapshotBeforeRestoreAfterEach();

		describe('before mint or burn', () => {
			it('totalIssuedSynths is unaffected', async () => {
				assert.bnEqual(await etherWrapper.targetSynthIssued(), preTargetIssuedSynths);
			});

			it('does not escrow extra', async () => {
				assert.bnEqual(await wrapperFactory.feesEscrowed(), toUnit(0));
			});
		});

		describe('mint after transfer without mint', () => {
			before(async () => {
				const amount = toUnit('1');
				await weth.deposit({ from: account1, value: amount });
				await weth.approve(etherWrapper.address, amount, { from: account1 });
				await etherWrapper.mint(amount, { from: account1 });
			});

			it('issues excess for fee pool', async () => {
				assert.bnGt(await wrapperFactory.feesEscrowed(), extraTransferred);
			});
			it('targetSynthIssued = sETH balance', async () => {
				assert.bnEqual(
					await etherWrapper.targetSynthIssued(),
					await weth.balanceOf(etherWrapper.address)
				);
			});
		});

		describe('burn after transfer without mint', () => {
			before(async () => {
				const amount = toUnit('1');
				await weth.deposit({ from: account1, value: amount });
				await weth.approve(etherWrapper.address, amount, { from: account1 });
				await etherWrapper.mint(amount, { from: account1 });
			});

			it('issues excess for fee pool', async () => {
				assert.bnGt(await wrapperFactory.feesEscrowed(), extraTransferred);
			});
			it('targetSynthIssued = sETH balance', async () => {
				assert.bnEqual(
					await etherWrapper.targetSynthIssued(),
					await weth.balanceOf(etherWrapper.address)
				);
			});
		});
	});
});
