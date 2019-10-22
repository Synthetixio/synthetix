const BN = require('bn.js');
const { getWeb3 } = require('../utils/web3Helper');
const ExchangeRates = artifacts.require('ExchangeRates');
const FeePool = artifacts.require('FeePool');
const Synthetix = artifacts.require('Synthetix');
const Synth = artifacts.require('Synth');
const AtomicSynthetixUniswapConverter = artifacts.require('AtomicSynthetixUniswapConverter');
const MockUniswapExchange = artifacts.require('MockUniswapExchange');
const web3 = getWeb3();
const { currentTime, toUnit, ZERO_ADDRESS, getEthBalance } = require('../utils/testUtils');

const bigDeadline = web3.utils.toBN('999999999999999999999999999999999');

contract('AtomicSynthetixUniswapConverter', async accounts => {
	const [sAUD, sEUR, SNX, sBTC, iBTC, sETH] = ['sAUD', 'sEUR', 'SNX', 'sBTC', 'iBTC', 'sETH'].map(
		web3.utils.asciiToHex
	);

	const [deployerAccount, owner, account1, account2, account3, account4, account5] = accounts;

	let synthetix,
		atomicSynthetixUniswapConverter,
		mockUniswapExchange,
		exchangeRates,
		feePool,
		sEthContract,
		sAUDContract,
		sEURContract,
		sBTCContract,
		oracle,
		timestamp;

	beforeEach(async () => {
		// Save ourselves from having to await deployed() in every single test.
		// We do this in a beforeEach instead of before to ensure we isolate
		// contract interfaces to prevent test bleed.
		atomicSynthetixUniswapConverter = await AtomicSynthetixUniswapConverter.deployed();
		mockUniswapExchange = await MockUniswapExchange.deployed();
		exchangeRates = await ExchangeRates.deployed();
		feePool = await FeePool.deployed();

		synthetix = await Synthetix.deployed();
		sEthContract = await Synth.at(await synthetix.synths(sETH));
		sAUDContract = await Synth.at(await synthetix.synths(sAUD));
		sEURContract = await Synth.at(await synthetix.synths(sEUR));
		sBTCContract = await Synth.at(await synthetix.synths(sBTC));

		// Send a price update to guarantee we're not stale.
		oracle = await exchangeRates.oracle();
		timestamp = await currentTime();

		await exchangeRates.updateRates(
			[sAUD, sEUR, SNX, sBTC, iBTC, sETH],
			['0.5', '1.25', '0.1', '5000', '4000', '200'].map(toUnit),
			timestamp,
			{
				from: oracle,
			}
		);

		await atomicSynthetixUniswapConverter.setUniswapSethExchange(mockUniswapExchange.address, {
			from: owner,
		});
		await mockUniswapExchange.setSethAddress(sEthContract.address);

		// Give some sETH and Ethers to Mock Uniswap Exchange
		await synthetix.methods['transfer(address,uint256)'](account1, toUnit('1000000'), {
			from: owner,
		});
		// Issue
		const amountIssued = toUnit('50');
		await synthetix.issueSynths(sETH, amountIssued, { from: account1 });
		await sEthContract.methods['transfer(address,uint256)'](
			mockUniswapExchange.address,
			amountIssued,
			{
				from: account1,
			}
		);
		web3.eth.sendTransaction({
			from: owner,
			to: mockUniswapExchange.address,
			value: toUnit('50'),
		});
	});

	it('should set constructor params on deployment', async () => {
		const instance = await AtomicSynthetixUniswapConverter.new(account1, {
			from: deployerAccount,
		});
		await assert.equal(await instance.owner(), account1);
	});

	it('should set synthetix by owner', async () => {
		const instance = await AtomicSynthetixUniswapConverter.new(owner, {
			from: deployerAccount,
		});
		await instance.setSynthetix(synthetix.address, { from: owner });
		assert.equal(await instance.synthetix(), synthetix.address);
	});

	it('should not set synthetix by others', async () => {
		const instance = await AtomicSynthetixUniswapConverter.new(owner, {
			from: deployerAccount,
		});
		await assert.revert(instance.setSynthetix(synthetix.address, { from: account1 }));
	});

	it('should set synthetix echange rate by owner', async () => {
		const instance = await AtomicSynthetixUniswapConverter.new(owner, {
			from: deployerAccount,
		});
		await instance.setSynthsExchangeRates(exchangeRates.address, { from: owner });
		assert.equal(await instance.synRates(), exchangeRates.address);
	});

	it('should not set synthetix echange rate by others', async () => {
		const instance = await AtomicSynthetixUniswapConverter.new(owner, {
			from: deployerAccount,
		});
		await assert.revert(instance.setSynthsExchangeRates(exchangeRates.address, { from: account1 }));
	});

	it('should set Fee Pool by owner', async () => {
		const instance = await AtomicSynthetixUniswapConverter.new(owner, {
			from: deployerAccount,
		});
		await instance.setSynthsFeePool(feePool.address, { from: owner });
		assert.equal(await instance.synFeePool(), feePool.address);
	});

	it('should not set Fee Pool by others', async () => {
		const instance = await AtomicSynthetixUniswapConverter.new(owner, {
			from: deployerAccount,
		});
		await assert.revert(instance.setSynthsFeePool(feePool.address, { from: account1 }));
	});

	it('otherTokenToEthInput should work', async () => {
		await synthetix.methods['transfer(address,uint256)'](account5, toUnit('100000'), {
			from: owner,
		});
		// Issue
		const amountIssued = toUnit('200');
		await synthetix.issueSynths(sAUD, amountIssued, { from: account5 });
		assert.bnEqual(await sAUDContract.balanceOf(account5), amountIssued);
		const account2Balance = await getEthBalance(account2);

		await sAUDContract.approve(atomicSynthetixUniswapConverter.address, amountIssued, {
			from: account5,
		});
		const effectiveValue = await synthetix.effectiveValue(sAUD, amountIssued, sETH);
		const effectiveValueMinusFees = await feePool.amountReceivedFromExchange(effectiveValue);
		await atomicSynthetixUniswapConverter.otherTokenToEthInput(
			sAUD,
			toUnit('200'),
			toUnit('0.09'),
			bigDeadline,
			account2,
			{
				from: account5,
			}
		);
		assert.bnEqual(
			new BN(await getEthBalance(account2)),
			new BN(account2Balance).add(new BN(effectiveValueMinusFees))
		);
		assert.bnEqual(new BN(await sAUDContract.balanceOf(account5)), toUnit('0'));
	});

	it('otherTokenToEthInput to get too much output should fail', async () => {
		await synthetix.methods['transfer(address,uint256)'](account5, toUnit('100000'), {
			from: owner,
		});
		// Issue
		const amountIssued = toUnit('20');
		await synthetix.issueSynths(sAUD, amountIssued, { from: account5 });
		assert.bnEqual(await sAUDContract.balanceOf(account5), amountIssued);

		await sAUDContract.approve(atomicSynthetixUniswapConverter.address, amountIssued, {
			from: account5,
		});
		await assert.revert(
			atomicSynthetixUniswapConverter.otherTokenToEthInput(
				sAUD,
				toUnit('20'),
				toUnit('1'),
				bigDeadline,
				account2,
				{
					from: account5,
				}
			)
		);
	});

	it('otherTokenToEthOutput should work', async () => {
		await synthetix.methods['transfer(address,uint256)'](account5, toUnit('100000'), {
			from: owner,
		});
		// Issue
		const amountIssued = toUnit('200');
		await synthetix.issueSynths(sAUD, amountIssued, { from: account5 });
		assert.bnEqual(await sAUDContract.balanceOf(account5), amountIssued);
		const account2Balance = await getEthBalance(account2);

		await sAUDContract.approve(atomicSynthetixUniswapConverter.address, amountIssued, {
			from: account5,
		});

		await atomicSynthetixUniswapConverter.otherTokenToEthOutput(
			toUnit('0.05'),
			sAUD,
			toUnit('200'),
			bigDeadline,
			account2,
			{
				from: account5,
			}
		);
		// We cannot get exact ouput due to two decimal math round of exchange function in Synthetix.sol, we will get  exact output required by user plus some extra amount(in wei, which depend on the currency rates)
		assert(new BN(await getEthBalance(account2)).gte(new BN(account2Balance).add(toUnit('0.05'))));
	});

	it('otherTokenToEthOutput less token provided should fail', async () => {
		await synthetix.methods['transfer(address,uint256)'](account5, toUnit('100000'), {
			from: owner,
		});
		// Issue
		const amountIssued = toUnit('200');
		await synthetix.issueSynths(sAUD, amountIssued, { from: account5 });
		assert.bnEqual(await sAUDContract.balanceOf(account5), amountIssued);

		await sAUDContract.approve(atomicSynthetixUniswapConverter.address, amountIssued, {
			from: account5,
		});

		await assert.revert(
			atomicSynthetixUniswapConverter.otherTokenToEthOutput(
				toUnit('1'),
				sAUD,
				toUnit('200'),
				bigDeadline,
				account2,
				{
					from: account5,
				}
			)
		);
	});

	it('ethToSethInput to self should work', async () => {
		await atomicSynthetixUniswapConverter.methods['ethToSethInput(uint256,uint256,address)'](
			toUnit('1'),
			bigDeadline,
			ZERO_ADDRESS,
			{
				from: account1,
				value: toUnit('1'),
			}
		);
		await assert.bnEqual(await sEthContract.balanceOf(account1), toUnit('1'));
	});

	it('ethToSethInput to other should work', async () => {
		await atomicSynthetixUniswapConverter.methods['ethToSethInput(uint256,uint256,address)'](
			toUnit('1'),
			bigDeadline,
			account2,
			{
				from: account1,
				value: toUnit('1'),
			}
		);
		assert.bnEqual(await sEthContract.balanceOf(account2), toUnit('1'));
	});

	it('ethToSethInput to get two much sEth should fail', async () => {
		await assert.revert(
			atomicSynthetixUniswapConverter.methods['ethToSethInput(uint256,uint256,address)'](
				toUnit('2'),
				bigDeadline,
				ZERO_ADDRESS,
				{
					from: account1,
					value: toUnit('1'),
				}
			)
		);
		assert.bnEqual(await sEthContract.balanceOf(account1), toUnit('0'));
	});

	it('ethToSethInput to exceed deadline should fail', async () => {
		const zeroDeadline = web3.utils.toBN('0');
		await assert.revert(
			atomicSynthetixUniswapConverter.methods['ethToSethInput(uint256,uint256,address)'](
				toUnit('1'),
				zeroDeadline,
				ZERO_ADDRESS,
				{
					from: account1,
					value: toUnit('1'),
				}
			)
		);
		assert.bnEqual(await sEthContract.balanceOf(account1), toUnit('0'));
	});

	it('sEthToEthInput  to self should work', async () => {
		await synthetix.methods['transfer(address,uint256)'](account1, toUnit('100000'), {
			from: owner,
		});
		// Issue
		const amountIssued = toUnit('1');
		await synthetix.issueSynths(sETH, amountIssued, { from: account1 });
		assert.bnEqual(await sEthContract.balanceOf(account1), toUnit('1'));
		await sEthContract.approve(atomicSynthetixUniswapConverter.address, toUnit('1'), {
			from: account1,
		});
		await atomicSynthetixUniswapConverter.sEthToEthInput(
			toUnit('1'),
			toUnit('1'),
			bigDeadline,
			ZERO_ADDRESS,
			{
				from: account1,
			}
		);

		assert.bnEqual(await sEthContract.balanceOf(account1), toUnit('0'));
	});

	it('sEthToEthInput  to other should work', async () => {
		await synthetix.methods['transfer(address,uint256)'](account1, toUnit('100000'), {
			from: owner,
		});
		// Issue
		const amountIssued = toUnit('1');
		await synthetix.issueSynths(sETH, amountIssued, { from: account1 });
		assert.bnEqual(await sEthContract.balanceOf(account1), toUnit('1'));
		const account2Balance = await getEthBalance(account2);

		await sEthContract.approve(atomicSynthetixUniswapConverter.address, toUnit('1'), {
			from: account1,
		});
		await atomicSynthetixUniswapConverter.sEthToEthInput(
			toUnit('1'),
			toUnit('1'),
			bigDeadline,
			account2,
			{
				from: account1,
			}
		);

		assert.bnEqual(await sEthContract.balanceOf(account1), toUnit('0'));
		const newBalance = new BN(await getEthBalance(account2));
		assert.bnEqual(newBalance, toUnit('1').add(new BN(account2Balance)));
	});

	it('sEthToEthInput to get too much ETH should fail', async () => {
		await synthetix.methods['transfer(address,uint256)'](account1, toUnit('100000'), {
			from: owner,
		});
		// Issue
		const amountIssued = toUnit('1');
		await synthetix.issueSynths(sETH, amountIssued, { from: account1 });
		assert.bnEqual(await sEthContract.balanceOf(account1), toUnit('1'));
		await sEthContract.approve(atomicSynthetixUniswapConverter.address, toUnit('1'), {
			from: account1,
		});
		await assert.revert(
			atomicSynthetixUniswapConverter.sEthToEthInput(
				toUnit('1'),
				toUnit('2'),
				bigDeadline,
				ZERO_ADDRESS,
				{
					from: account1,
				}
			)
		);
		assert.bnEqual(await sEthContract.balanceOf(account1), toUnit('1'));
	});

	it('ethToSethOutput should work', async () => {
		await atomicSynthetixUniswapConverter.methods['ethToSethOutput(uint256,uint256,address)'](
			toUnit('1'),
			bigDeadline,
			ZERO_ADDRESS,
			{
				from: account3,
				value: toUnit('1'),
			}
		);
		assert.bnEqual(await sEthContract.balanceOf(account3), toUnit('1'));
	});

	it('ethToSethOutput less ETH should fail', async () => {
		await assert.revert(
			atomicSynthetixUniswapConverter.methods['ethToSethOutput(uint256,uint256,address)'](
				toUnit('1'),
				bigDeadline,
				ZERO_ADDRESS,
				{
					from: account4,
					value: toUnit('0.99'),
				}
			)
		);
	});

	it('sTokenToStokenInput should work', async () => {
		await synthetix.methods['transfer(address,uint256)'](account1, toUnit('100000'), {
			from: owner,
		});
		// Issue
		const amountIssued = toUnit('100');
		await synthetix.issueSynths(sAUD, amountIssued, { from: account1 });
		assert.bnEqual(await sAUDContract.balanceOf(account1), toUnit('100'));
		await sAUDContract.approve(atomicSynthetixUniswapConverter.address, toUnit('100'), {
			from: account1,
		});

		const effectiveValue = await synthetix.effectiveValue(sAUD, amountIssued, sBTC);
		const effectiveValueMinusFees = await feePool.amountReceivedFromExchange(effectiveValue);
		await atomicSynthetixUniswapConverter.sTokenToStokenInput(
			sAUD,
			toUnit('100'),
			sBTC,
			toUnit('0.009'),
			bigDeadline,
			ZERO_ADDRESS,
			{
				from: account1,
			}
		);
		assert.bnEqual(await sBTCContract.balanceOf(account1), effectiveValueMinusFees);
		assert.bnEqual(await sAUDContract.balanceOf(account1), toUnit('0'));
	});

	it('sTokenToStokenInput to get too much output should fail', async () => {
		await synthetix.methods['transfer(address,uint256)'](account1, toUnit('100000'), {
			from: owner,
		});
		// Issue
		const amountIssued = toUnit('100');
		await synthetix.issueSynths(sAUD, amountIssued, { from: account1 });
		assert.bnEqual(await sAUDContract.balanceOf(account1), toUnit('100'));
		await sAUDContract.approve(atomicSynthetixUniswapConverter.address, toUnit('100'), {
			from: account1,
		});
		await assert.revert(
			atomicSynthetixUniswapConverter.methods[
				'sTokenToStokenInput(bytes32,uint256,bytes32,uint256,uint256,address)'
			](sAUD, toUnit('100'), sBTC, toUnit('0.1'), bigDeadline, ZERO_ADDRESS, {
				from: account1,
			})
		);
	});

	it('sTokenToStokenOutput should work', async () => {
		await synthetix.methods['transfer(address,uint256)'](account1, toUnit('100000'), {
			from: owner,
		});
		// Issue
		const amountIssued = toUnit('100');
		await synthetix.issueSynths(sEUR, amountIssued, { from: account1 });
		assert.bnEqual(await sEURContract.balanceOf(account1), toUnit('100'));
		await sEURContract.approve(atomicSynthetixUniswapConverter.address, toUnit('100'), {
			from: account1,
		});

		await atomicSynthetixUniswapConverter.sTokenToStokenOutput(
			sEUR,
			toUnit('100'),
			sBTC,
			toUnit('0.005'),
			bigDeadline,
			ZERO_ADDRESS,
			{
				from: account1,
			}
		);
		// We cannot get exact ouput due to two decimal math round of exchange function in Synthetix.sol, we will get  exact output required by user plus some extra amount(in wei, which depend on the currency rates)
		assert(new BN(await sBTCContract.balanceOf(account1)).gte(toUnit('0.005')));
	});

	it('sTokenToStokenOutput less provided token should fail', async () => {
		await synthetix.methods['transfer(address,uint256)'](account1, toUnit('100000'), {
			from: owner,
		});
		// Issue
		const amountIssued = toUnit('100');
		await synthetix.issueSynths(sEUR, amountIssued, { from: account1 });
		assert.bnEqual(await sEURContract.balanceOf(account1), toUnit('100'));
		await sEURContract.approve(atomicSynthetixUniswapConverter.address, toUnit('100'), {
			from: account1,
		});

		await assert.revert(
			atomicSynthetixUniswapConverter.sTokenToStokenOutput(
				sEUR,
				toUnit('100'),
				sBTC,
				toUnit('0.5'),
				bigDeadline,
				ZERO_ADDRESS,
				{
					from: account1,
				}
			)
		);
	});

	it('ethToOtherTokenInput should work', async () => {
		await atomicSynthetixUniswapConverter.ethToOtherTokenInput(
			toUnit('100'),
			sEUR,
			bigDeadline,
			ZERO_ADDRESS,
			{
				from: account1,
				value: toUnit('1'),
			}
		);
		const effectiveValue = await synthetix.effectiveValue(sETH, toUnit('1'), sEUR);
		const effectiveValueMinusFees = await feePool.amountReceivedFromExchange(effectiveValue);

		assert.bnEqual(await sEURContract.balanceOf(account1), effectiveValueMinusFees);
	});

	it('ethToOtherTokenInput to get too much output should work', async () => {
		await assert.revert(
			atomicSynthetixUniswapConverter.ethToOtherTokenInput(
				toUnit('1000'),
				sEUR,
				bigDeadline,
				ZERO_ADDRESS,
				{
					from: account1,
					value: toUnit('1'),
				}
			)
		);
	});

	it('ethToOtherTokenOutput should work', async () => {
		await atomicSynthetixUniswapConverter.ethToOtherTokenOutput(
			toUnit('10'),
			sEUR,
			bigDeadline,
			ZERO_ADDRESS,
			{
				from: account5,
				value: toUnit('1'),
			}
		);
		// We cannot get exact ouput due to two decimal math round of exchange function in Synthetix.sol, we will get  exact output required by user plus some extra amount(in wei, which depend on the currency rates)
		assert(new BN(await sEURContract.balanceOf(account5)).gte(toUnit('10')));
	});

	it('ethToOtherTokenOutput less provided ETH should fail', async () => {
		await assert.revert(
			atomicSynthetixUniswapConverter.ethToOtherTokenOutput(
				toUnit('100'),
				sEUR,
				bigDeadline,
				ZERO_ADDRESS,
				{
					from: account5,
					value: toUnit('0.1'),
				}
			)
		);
	});
});
