const { artifacts, contract, web3 } = require('@nomiclabs/buidler');
const { assert } = require('./common');
const { mockToken, setupAllContracts } = require('./setup');

const TradingRewards = artifacts.require('TradingRewards');

/*
 * This tests the TradingRewards contract's integration
 * with the rest of the Synthetix system.
 *
 * Inner workings of the contract are tested in TradingRewards.unit.js.
 **/
contract('TradingRewards (integration tests)', accounts => {
	let synthetix, tradingRewards;

	describe('when deploying the system', () => {
		before('deploy all contracts', async () => {
			({ Synthetix: synthetix, TradingRewards: tradingRewards } = await setupAllContracts({
				accounts,
				synths: ['sUSD', 'sETH'],
				contracts: ['Synthetix', 'TradingRewards', 'Exchanger'],
			}));
		});

		// TODO
		it('worked', async () => {});
	});
});
