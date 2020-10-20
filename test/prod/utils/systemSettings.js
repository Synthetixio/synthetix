const { connectContract } = require('./connectContract');

async function readSetting({ network, setting }) {
	const SystemSettings = await connectContract({
		network,
		contractName: 'SystemSettings',
	});

	return SystemSettings[setting]();
}

async function writeSetting({ network, setting, value, owner }) {
	const SystemSettings = await connectContract({
		network,
		contractName: 'SystemSettings',
	});

	await SystemSettings[setting](value, {
		from: owner,
	});
}

module.exports = {
	readSetting,
	writeSetting,
};
