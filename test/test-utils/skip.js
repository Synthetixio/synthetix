const { fastForward } = require('./rpc');
const { wait } = require('./wait');

async function skipWaitingPeriod({ ctx }) {
	await _dualFastForward({
		ctx,
		seconds: await _getSetting({ ctx, name: 'waitingPeriodSecs' }),
	});
}

async function _getSetting({ ctx, name }) {
	const { SystemSettings } = ctx.contracts;
	return SystemSettings[name]();
}

/*
 * Fast forwards the L1 chain and waits for the
 * L2 chain to sync to the new timestamp.
 * The 5 second delay is chosen because this is the default time granularity
 * of the ops tool.
 * */
async function _dualFastForward({ ctx, seconds }) {
	const l1Ctx = ctx.l1mock || ctx;

	await fastForward({ seconds: parseInt(seconds), provider: l1Ctx.provider });

	await wait({ seconds: 5 });
}

module.exports = {
	skipWaitingPeriod,
};
