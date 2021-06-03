const ethers = require('ethers');
const { ensureBalance } = require('./balances');
const { forceSetSystemSetting } = require('./settings');
const { toBytes32 } = require('../../../index');
const { wait } = require('./wait');

function ignoreWaitingPeriod({ ctx }) {
	before('record and reduce waitingPeriodSecs', async () => {
		let { SystemSettings } = ctx.contracts;
		SystemSettings = SystemSettings.connect(ctx.users.owner);

		ctx.waitingPeriodSecs = await SystemSettings.waitingPeriodSecs();

		const tx = await SystemSettings.setWaitingPeriodSecs(0);
		await tx.wait();
	});

	after('restore waiting period', async () => {
		let { SystemSettings } = ctx.contracts;
		SystemSettings = SystemSettings.connect(ctx.users.owner);

		const tx = await SystemSettings.setWaitingPeriodSecs(ctx.waitingPeriodSecs);
		await tx.wait();
	});
}

async function exchangeSomething({ ctx }) {
	let { Synthetix } = ctx.contracts;
	Synthetix = Synthetix.connect(ctx.users.owner);

	const sUSDAmount = ethers.utils.parseEther('10');
	await ensureBalance({ ctx, symbol: 'sUSD', user: ctx.users.owner, balance: sUSDAmount });

	const tx = await Synthetix.exchange(toBytes32('sUSD'), sUSDAmount, toBytes32('sETH'));
	await tx.wait();
}

function ignoreFeePeriodDuration({ ctx }) {
	before('record and reduce feePeriodDuration', async () => {
		const { SystemSettings } = ctx.contracts;

		ctx.feePeriodDuration = await SystemSettings.feePeriodDuration();

		// SystemSettings.setFeePeriodDuration() enforces a minimum value of 1 day,
		// which is not ideal for tests.
		// Instead, we force it by writing to flexible storage directly.
		await forceSetSystemSetting({ ctx, settingName: 'feePeriodDuration', newValue: 5 });

		await wait({ seconds: 5 });
	});

	after('restore feePeriodDuration', async () => {
		let { SystemSettings } = ctx.contracts;
		SystemSettings = SystemSettings.connect(ctx.users.owner);

		const tx = await SystemSettings.setFeePeriodDuration(ctx.feePeriodDuration);
		await tx.wait();
	});
}

module.exports = {
	ignoreWaitingPeriod,
	exchangeSomething,
	ignoreFeePeriodDuration,
};
