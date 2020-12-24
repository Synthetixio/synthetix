const { connectContract } = require('./connectContract');

async function readSetting({ network, setting, deploymentPath }) {
	const SystemSettings = await connectContract({
		network,
		deploymentPath,
		contractName: 'SystemSettings',
	});

	return SystemSettings[setting]();
}

async function writeSetting({ network, deploymentPath, setting, value }) {
	const SystemSettings = await connectContract({
		network,
		deploymentPath,
		contractName: 'SystemSettings',
	});

	await SystemSettings[setting](value, {
		from: await SystemSettings.owner(),
	});
}

module.exports = {
	readSetting,
	writeSetting,
};
