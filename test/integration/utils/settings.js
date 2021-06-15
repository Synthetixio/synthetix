const { toBytes32 } = require('../../..');

async function getSystemSetting({ ctx, settingName }) {
	const { SystemSettings } = ctx.contracts;

	return SystemSettings[settingName]();
}

async function setSystemSetting({ ctx, settingName, newValue }) {
	let { SystemSettings } = ctx.contracts;
	SystemSettings = SystemSettings.connect(ctx.users.owner);

	const tx = await SystemSettings[
		`set${settingName.charAt(0).toUpperCase()}${settingName.slice(1)}`
	](newValue);
	await tx.wait();
}

async function forceSetSystemSetting({ ctx, settingName, newValue }) {
	const { SystemSettings } = ctx.contracts;
	let { AddressResolver, FlexibleStorage } = ctx.contracts;

	const owner = ctx.users.owner;
	AddressResolver = AddressResolver.connect(owner);
	FlexibleStorage = FlexibleStorage.connect(owner);

	let tx;

	const settingsName = toBytes32('SystemSettings');
	const settingsAddress = await AddressResolver.getAddress(settingsName);

	tx = await AddressResolver.importAddresses([settingsName], [owner.address]);
	await tx.wait();
	tx = await AddressResolver.rebuildCaches([SystemSettings.address]);
	await tx.wait();

	tx = await FlexibleStorage.setUIntValue(settingsName, toBytes32(settingName), newValue);
	await tx.wait();

	tx = await AddressResolver.importAddresses([settingsName], [settingsAddress]);
	await tx.wait();
	tx = await AddressResolver.rebuildCaches([SystemSettings.address]);
	await tx.wait();
}

module.exports = {
	getSystemSetting,
	setSystemSetting,
	forceSetSystemSetting,
};
