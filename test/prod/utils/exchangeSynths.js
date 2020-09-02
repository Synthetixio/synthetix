const { toBytes32 } = require('../../../index.js');
const { connectContract, connectContracts } = require('./connectContract');
const { getDecodedLogs } = require('../../contracts/helpers');

async function getExchangeLogs({ network, exchangeTx }) {
	const { TradingRewards, Synthetix } = await connectContracts({
		network,
		requests: [{ contractName: 'TradingRewards' }, { contractName: 'Synthetix' }],
	});

	const logs = await getDecodedLogs({
		hash: exchangeTx.tx,
		contracts: [Synthetix, TradingRewards],
	});

	return logs.filter(log => log !== undefined);
}

async function exchangeSynths({ network, account, fromCurrency, toCurrency, amount }) {
	const Synthetix = await connectContract({
		network,
		contractName: 'ProxyERC20',
		abiName: 'Synthetix',
	});

	const exchangeTx = await Synthetix.exchange(
		toBytes32(fromCurrency),
		amount,
		toBytes32(toCurrency),
		{
			from: account,
		}
	);

	const exchangeLogs = await getExchangeLogs({ network, exchangeTx });

	return { exchangeTx, exchangeLogs };
}

module.exports = {
	exchangeSynths,
};
