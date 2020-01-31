require('.'); // import common test scaffolding

const ExchangeRates = artifacts.require('ExchangeRates');
const FeePool = artifacts.require('FeePool');
const Synthetix = artifacts.require('Synthetix');
const Synth = artifacts.require('Synth');
const MultiCollateralSynth = artifacts.require('MultiCollateralSynth');
const TokenState = artifacts.require('TokenState');
const Proxy = artifacts.require('Proxy');

const { currentTime, toUnit, multiplyDecimal, ZERO_ADDRESS } = require('../utils/testUtils');
const { toBytes32 } = require('../..');

contract('MultiCollateralSynth', accounts => {
	const [sETH] = ['sETH'].map(toBytes32);

	const [
		deployerAccount,
		owner, // Oracle next, is not needed
		,
		,
		account1,
		account2,
	] = accounts;

	let feePool,
		feePoolProxy,
		// FEE_ADDRESS,
		synthetix,
		synthetixProxy,
		exchangeRates,
		sUSDContract,
		oracle,
		timestamp;

	beforeEach(async () => {
		// Save ourselves from having to await deployed() in every single test.
		// We do this in a beforeEach instead of before to ensure we isolate
		// contract interfaces to prevent test bleed.
		exchangeRates = await ExchangeRates.deployed();
		feePool = await FeePool.deployed();
		// Deploy new proxy for feePool
		feePoolProxy = await Proxy.new(owner, { from: deployerAccount });

		synthetix = await Synthetix.deployed();
		// Deploy new proxy for Synthetix
		synthetixProxy = await Proxy.new(owner, { from: deployerAccount });

		// ensure synthetixProxy has target set to synthetix
		await feePool.setProxy(feePoolProxy.address, { from: owner });
		await synthetix.setProxy(synthetixProxy.address, { from: owner });
		// set new proxies on Synthetix and FeePool
		await synthetixProxy.setTarget(synthetix.address, { from: owner });
		await feePoolProxy.setTarget(feePool.address, { from: owner });

		oracle = await exchangeRates.oracle();
		timestamp = await currentTime();
	});

	const deploySynth = async ({ currencyKey, proxy, tokenState }) => {
		tokenState =
			tokenState ||
			(await TokenState.new(owner, ZERO_ADDRESS, {
				from: deployerAccount,
			}));

		proxy = proxy || (await Proxy.new(owner, { from: deployerAccount }));

		const synth = await MultiCollateralSynth.new(
			proxy.address,
			tokenState.address,
			synthetixProxy.address,
			feePoolProxy.address,
			`Synth ${currencyKey}`,
			currencyKey,
			owner,
			toBytes32(currencyKey),
			exchangeRates.address,
			web3.utils.toWei('0'),
			{
				from: deployerAccount,
			}
		);
		return { synth, tokenState, proxy };
	};

	const issueSynths = async ({ account, amount }) => {
		await synthetix.methods['transfer(address,uint256)'](account, toUnit(amount), {
			from: owner,
		});
		await synthetix.issueMaxSynths({ from: account });
	};

	describe('when a Purgeable synth is added and connected to Synthetix', () => {});
});
