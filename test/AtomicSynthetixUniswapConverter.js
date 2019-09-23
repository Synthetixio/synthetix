const { getWeb3 } = require('../utils/web3Helper');
const ExchangeRates = artifacts.require('ExchangeRates');
const Escrow = artifacts.require('SynthetixEscrow');
const RewardEscrow = artifacts.require('RewardEscrow');
const RewardsDistribution = artifacts.require('RewardsDistribution');
const FeePool = artifacts.require('FeePool');
const SupplySchedule = artifacts.require('SupplySchedule');
const Synthetix = artifacts.require('Synthetix');
const SynthetixState = artifacts.require('SynthetixState');
const Synth = artifacts.require('Synth');
const AtomicSynthetixUniswapConverter = artifacts.require('AtomicSynthetixUniswapConverter');
const MockUniswapExchange = artifacts.require('MockUniswapExchange');
const web3 = getWeb3();
const {
	currentTime,
	toUnit,
	ZERO_ADDRESS,
	getEthBalance,
} = require('../utils/testUtils');

const bigDeadline = web3.utils.toBN('999999999999999999999999999999999');

contract('AtomicSynthetixUniswapConverter', async accounts => {
	const [sUSD, sAUD, sEUR, SNX, XDR, sBTC, iBTC, sETH] = [
		'sUSD',
		'sAUD',
		'sEUR',
		'SNX',
		'XDR',
		'sBTC',
		'iBTC',
		'sETH',
	].map(web3.utils.asciiToHex);

	const [deployerAccount, owner, account1, account2] = accounts;

	let synthetix,
		atomicSynthetixUniswapConverter,
		mockUniswapExchange,
		exchangeRates,
		feePool,
		sUSDContract,
		sAUDContract,
		sEURContract,
		sEthContract,
		oracle,
		timestamp;

	// Updates rates with defaults so they're not stale.
	const updateRatesWithDefaults = async () => {
		const timestamp = await currentTime();

		await exchangeRates.updateRates(
			[sAUD, sEUR, SNX, sBTC, iBTC, sETH],
			['0.5', '1.25', '0.1', '5000', '4000', '200'].map(toUnit),
			timestamp,
			{
				from: oracle,
			}
		);
	};

	beforeEach(async () => {
		// Save ourselves from having to await deployed() in every single test.
		// We do this in a beforeEach instead of before to ensure we isolate
		// contract interfaces to prevent test bleed.
		atomicSynthetixUniswapConverter = await AtomicSynthetixUniswapConverter.deployed();
		mockUniswapExchange = await MockUniswapExchange.deployed();
		exchangeRates = await ExchangeRates.deployed();
		feePool = await FeePool.deployed();
	//	supplySchedule = await SupplySchedule.deployed();
	//	escrow = await Escrow.deployed();
	//	rewardEscrow = await RewardEscrow.deployed();
	//	rewardsDistribution = await RewardsDistribution.deployed();

		synthetix = await Synthetix.deployed();
	//	synthetixState = await SynthetixState.at(await synthetix.synthetixState());
		sUSDContract = await Synth.at(await synthetix.synths(sUSD));
		sAUDContract = await Synth.at(await synthetix.synths(sAUD));
		sEURContract = await Synth.at(await synthetix.synths(sEUR));
		sEthContract = await Synth.at(await synthetix.synths(sETH));

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
		await synthetix.methods['transfer(address,uint256)'](account1, toUnit('200000'), {
			from: owner,
		});
		// Issue
		const amountIssued = toUnit('10');
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
			value: toUnit('10'),
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

	it('ethToSethInput to self should work', async () => {
		const bigDeadline = web3.utils.toBN('999999999999999999999999999999999');
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
		const bigDeadline = web3.utils.toBN('999999999999999999999999999999999');
		await atomicSynthetixUniswapConverter.methods['ethToSethInput(uint256,uint256,address)'](
			toUnit('1'),
			bigDeadline,
			account2,
			{
				from: account1,
				value: toUnit('1'),
			}
		);
		await assert.bnEqual(await sEthContract.balanceOf(account2), toUnit('1'));
	});

	it('ethToSethInput to get two much sEth should not work', async () => {
		
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
		await assert.bnEqual(await sEthContract.balanceOf(account1), toUnit('0'));
	});

	it('ethToSethInput to exceed deadline should not work', async () => {
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
		await assert.bnEqual(await sEthContract.balanceOf(account1), toUnit('0'));
	});

	it('sEthToEthInput  to self should work', async () => {
		await synthetix.methods['transfer(address,uint256)'](account1, toUnit('100000'), {
			from: owner,
		});
		// Issue
		const amountIssued = toUnit('1');
		await synthetix.issueSynths(sETH, amountIssued, { from: account1 });
		await assert.bnEqual(await sEthContract.balanceOf(account1), toUnit('1'));
		const originBalance = await  getEthBalance(account1);
		await sEthContract.approve(atomicSynthetixUniswapConverter.address, toUnit('1'), {
			from: account1,
		});
		await atomicSynthetixUniswapConverter.sEthToEthInput(toUnit('1'), toUnit('1'), bigDeadline, ZERO_ADDRESS, {
			from: account1,
		});
		
		await assert.bnEqual(await sEthContract.balanceOf(account1), toUnit('0'));
		await assert.bnEqual(await getEthBalance(account1), originBalance.add(toUnit('1')));
	});
});
