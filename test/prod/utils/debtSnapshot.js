const { connectContract } = require('./connectContract');

async function takeDebtSnapshot({ network, deploymentPath }) {
	const DebtCache = await connectContract({
		network,
		deploymentPath,
		contractName: 'DebtCache',
	});

	const info = await DebtCache.cacheInfo();
	const needsUpdate = info.isInvalid || info.isStale;
	if (!needsUpdate) {
		return;
	}

	console.log('Taking debt snapshot...');

	await DebtCache.takeDebtSnapshot();
}

module.exports = {
	takeDebtSnapshot,
};
