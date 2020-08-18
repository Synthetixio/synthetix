const { artifacts, contract, web3 } = require('@nomiclabs/buidler');
const { assert } = require('./common');
const { mockToken, setupAllContracts } = require('./setup');

const TradingRewards = artifacts.require('TradingRewards');

/*
 	* TradingRewards integration tests test the contract as it
 	* connects with the rest of the system, i.e. not caring much
 	* about the inner workings of the contract, but rather on how
 	* it works with the rest of the system.
 	* */
contract('TradingRewards (integration tests)', accounts => {
	let synthetix, tradingRewards;

	describe('when deploying the system', () => {
		before('deploy all contracts', async () => {
			({ Synthetix: synthetix, TradingRewards: tradingRewards } = await setupAllContracts({
				accounts,
				synths: ['sUSD', 'sETH'],
				contracts: ['Synthetix', 'TradingRewards']
			}));
		});

		// TODO
		it('worked', async () => {});
	});
});
