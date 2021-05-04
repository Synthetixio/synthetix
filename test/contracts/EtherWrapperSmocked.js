// 'use strict';

// const { contract } = require('hardhat');

// const { assert, addSnapshotBeforeRestoreAfterEach } = require('./common');

// const { currentTime, toUnit } = require('../utils')();

// const {
// 	ensureOnlyExpectedMutativeFunctions,
// 	prepareSmocks,
// 	getDecodedLogs,
// 	decodedEventEqual,
// } = require('./helpers');

// const { setupAllContracts } = require('./setup');

// const { toBytes32 } = require('../..');
// const { toBN } = require('web3-utils');

// const { smockit } = require('@eth-optimism/smock');

// contract('EtherWrapperSmocked', async accounts => {
// 	const synths = ['sUSD', 'sETH', 'ETH', 'SNX'];
// 	const [sETH, ETH] = ['sETH', 'ETH'].map(toBytes32);

// 	const ONE = toBN('1');
// 	const NULL_ADDRESS = '0x' + '0'.repeat(40)

// 	const [, owner, oracle, , account1] = accounts;

// 	const calculateETHToUSD = async feesInETH => {
// 		// Ask the Depot how many sUSD I will get for this ETH
// 		const expectedFeesUSD = await depot.synthsReceivedForEther(feesInETH);
// 		return expectedFeesUSD;
// 	};

// 	const calculateMintFees = async amount => {
// 		const mintFee = await etherWrapper.calculateMintFee(amount);
// 		const expectedFeesUSD = await calculateETHToUSD(mintFee);
// 		return { mintFee, expectedFeesUSD };
// 	};

// 	const calculateBurnFees = async amount => {
// 		const burnFee = await etherWrapper.calculateBurnFee(amount);
// 		const expectedFeesUSD = await calculateETHToUSD(burnFee);
// 		return { burnFee, expectedFeesUSD };
// 	};

// 	let mocks,
// 		resolver,
// 		etherWrapper,
// 		weth

// 	addSnapshotBeforeRestoreAfterEach();

// 	beforeEach(async () => {
// 		({ mocks, resolver } = await prepareSmocks({
// 			contracts: [
// 				'WETH',
// 				'Synthetix',
// 				'SystemSettings',
// 				'FlexibleStorage',
// 				// 'SynthsETH',
// 				// 'SynthsUSD',
// 				'Issuer',
// 				'ExchangeRates',
// 				'FeePool',
// 			],
// 			accounts: accounts.slice(10),
// 		}));

// 		weth = mocks['WETH']

// 		mocks['SynthsETH'] = { address: NULL_ADDRESS }
// 		mocks['SynthsUSD'] = { address: NULL_ADDRESS }

// 		etherWrapper = await artifacts.require('EtherWrapper').new(
// 			owner,
// 			resolver.address,
// 			weth.address
// 		)

// 		await etherWrapper.rebuildCache({ from: owner });
// 	})

// 	it.only('tests the smockit library', async () => {
// 		mocks['WETH'].smocked.balanceOf.will.return.with((account) => '0')

// 		// smockEtherWrapper.smocked.maxETH.will.return.with(() => '0')
// 		// smockEtherWrapper.smocked.burn.will.revert.with("foobar champion")
// 		// await smockEtherWrapper.burn(toUnit('1'))

// 		assert.bnEqual(
// 			await etherWrapper.getReserves(),
// 			toBN('0')
// 		)

// 		console.log(etherWrapper.smocked.getReserves.calls[0])
// 	})

// 	describe('mint', async () => {
// 		describe('when amount is less than than capacity', () => {
// 			let amount;
// 			let initialCapacity;
// 			let mintFee;
// 			let expectedFeesUSD;
// 			let mintTx;

// 			beforeEach(async () => {
// 				initialCapacity = await etherWrapper.capacity();
// 				amount = initialCapacity.sub(toUnit('1.0'));

// 				({ mintFee, expectedFeesUSD } = await calculateMintFees(amount));

// 				// await weth.deposit({ from: account1, value: amount });
// 				// await weth.approve(etherWrapper.address, amount, { from: account1 });

// 				mintTx = await etherWrapper.mint(amount, { from: account1 });
// 			});

// 			it('locks `amount` WETH in the contract', async () => {
// 				const logs = await getDecodedLogs({
// 					hash: mintTx.tx,
// 					contracts: [weth],
// 				});

// 				decodedEventEqual({
// 					event: 'Transfer',
// 					emittedFrom: weth.address,
// 					args: [account1, etherWrapper.address, amount],
// 					log: logs[0],
// 				});
// 			});
// 			it('mints amount(1-mintFeeRate) sETH into the user’s wallet', async () => {
// 				assert.bnEqual(await sETHSynth.balanceOf(account1), amount.sub(mintFee));
// 			});
// 			it('sends amount*mintFeeRate worth of sETH to the fee pool as sUSD', async () => {
// 				assert.bnEqual(await sUSDSynth.balanceOf(FEE_ADDRESS), expectedFeesUSD);
// 			});
// 			it('has a capacity of (capacity - amount - fees) after', async () => {
// 				assert.bnEqual(await etherWrapper.capacity(), initialCapacity.sub(amount).add(mintFee));
// 			});
// 			it('emits Minted event', async () => {
// 				const logs = await getDecodedLogs({
// 					hash: mintTx.tx,
// 					contracts: [etherWrapper],
// 				});

// 				decodedEventEqual({
// 					event: 'Minted',
// 					emittedFrom: etherWrapper.address,
// 					args: [account1, amount.sub(mintFee), mintFee],
// 					log: logs.filter(l => !!l).find(({ name }) => name === 'Minted'),
// 				});
// 			});
// 		});

// 		describe('amount is larger than or equal to capacity', () => {
// 			let amount;
// 			let initialCapacity;
// 			let mintFee;
// 			let expectedFeesUSD;
// 			let mintTx;

// 			beforeEach(async () => {
// 				initialCapacity = await etherWrapper.capacity();
// 				amount = initialCapacity.add(ONE);
// 				// console.log(`Mint amount: ${(amount).toString()}`)
// 				// console.log(`Initial capacity: ${(initialCapacity).toString()}`);

// 				// Calculate the mint fees on the capacity amount,
// 				// as this will be the ETH accepted by the contract.
// 				({ mintFee, expectedFeesUSD } = await calculateMintFees(initialCapacity));

// 				mocks['WETH'].smocked.balanceOf.will.return.with((account) => {
// 					if(account == etherWrapper.address) {
// 						return '0'
// 					}
// 				})
// 				mocks['WETH'].smocked.approval.will.return.with((account) => {
// 					return '1'+'0'.repeat(28)
// 				})

// 				await weth.deposit({ from: account1, value: amount });
// 				await weth.approve(etherWrapper.address, amount, { from: account1 });
// 				mintTx = await etherWrapper.mint(amount, { from: account1 });
// 			});

// 			it('locks `capacity` ETH in the contract', async () => {
// 				const logs = await getDecodedLogs({
// 					hash: mintTx.tx,
// 					contracts: [weth],
// 				});

// 				decodedEventEqual({
// 					event: 'Transfer',
// 					emittedFrom: weth.address,
// 					args: [account1, etherWrapper.address, initialCapacity],
// 					log: logs[0],
// 				});
// 			});
// 			it('mints capacity(1-mintFeeRate) sETH into the user’s wallet', async () => {
// 				assert.bnEqual(await sETHSynth.balanceOf(account1), initialCapacity.sub(mintFee));
// 			});
// 			it('sends capacity*mintFeeRate worth of sETH to the fee pool as sUSD', async () => {
// 				assert.bnEqual(await sUSDSynth.balanceOf(FEE_ADDRESS), expectedFeesUSD);
// 			});
// 			it('has a capacity of 0.5 bps after', async () => {
// 				// console.log(`End capacity: ${(await etherWrapper.capacity()).toString()}`)
// 				assert.bnEqual(await etherWrapper.capacity(), mintFee);
// 			});
// 		});

// 		describe('when capacity = 0', () => {
// 			beforeEach(async () => {
// 				await systemSettings.setEtherWrapperMaxETH('0', { from: owner });
// 			});

// 			it('reverts', async () => {
// 				const amount = '1';
// 				await weth.deposit({ from: account1, value: amount });
// 				await weth.approve(etherWrapper.address, amount, { from: account1 });

// 				await assert.revert(
// 					etherWrapper.mint(amount, { from: account1 }),
// 					'Contract has no spare capacity to mint'
// 				);
// 			});
// 		});
// 	});
// });
