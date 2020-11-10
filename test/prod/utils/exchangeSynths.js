const { toBytes32 } = require('../../..');
const { connectContract } = require('./connectContract');
const { getDecodedLogs } = require('../../contracts/helpers');

async function getExchangeLogs({ network, deploymentPath, exchangeTx }) {
	const Synthetix = await connectContract({
		network,
		deploymentPath,
		contractName: 'ProxyERC20',
		abiName: 'Synthetix',
	});

	const logs = await getDecodedLogs({
		hash: exchangeTx.tx,
		contracts: [Synthetix],
	});

	return logs.filter(log => log !== undefined);
}

async function exchangeSynths({
	network,
	deploymentPath,
	account,
	fromCurrency,
	toCurrency,
	amount,
}) {
	const Synthetix = await connectContract({
		network,
		deploymentPath,
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

	const exchangeLogs = await getExchangeLogs({ network, deploymentPath, exchangeTx });

	return { exchangeTx, exchangeLogs };
}

module.exports = {
	exchangeSynths,
};
