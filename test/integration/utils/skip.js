const { fastForward } = require('../../test-utils/rpc');
const { wait } = require('../../test-utils/wait');
const { getSystemSetting } = require('./settings');
const { increaseStalePeriodAndCheckRatesAndCache } = require('./rates');

async function skipWaitingPeriod({ ctx }) {
	await _dualFastForward({
		ctx,
		seconds: await getSystemSetting({ ctx, settingName: 'waitingPeriodSecs' }),
	});
}

async function skipFeePeriod({ ctx }) {
	await _dualFastForward({
		ctx,
		seconds: await getSystemSetting({ ctx, settingName: 'feePeriodDuration' }),
	});
}

async function skipMinimumStakeTime({ ctx }) {
	await _dualFastForward({
		ctx,
		seconds: await getSystemSetting({ ctx, settingName: 'minimumStakeTime' }),
	});
}

async function skipLiquidationDelay({ ctx }) {
	await _dualFastForward({
		ctx,
		seconds: await getSystemSetting({ ctx, settingName: 'liquidationDelay' }),
	});
}

/*
 * Fast forwards the L1 chain and waits for the
 * L2 chain to sync to the new timestamp.
 * The delay is chosen because this is the default time granularity
 * of the ops tool, which is 5s.
 * */
async function _dualFastForward({ ctx, seconds }) {
	const l1Ctx = ctx.l1mock || ctx;

	await fastForward({ seconds: parseInt(seconds), provider: l1Ctx.provider });

	// this is needed for some reason, not sure why
	await wait({ seconds: 1 });

	await increaseStalePeriodAndCheckRatesAndCache({ ctx });
}

module.exports = {
	skipWaitingPeriod,
	skipFeePeriod,
	skipMinimumStakeTime,
	skipLiquidationDelay,
};
