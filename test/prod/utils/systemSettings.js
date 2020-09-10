const { connectContract } = require('./connectContract');

async function readSetting({ network, setting }) {
	const SystemSettings = await connectContract({
		network,
		contractName: 'SystemSettings',
	});

	return SystemSettings[setting]();
}

module.exports = {
	readSetting,
};
