const { fastForward } = require('../../utils')();
const { readSetting } = require('./systemSettings');

async function skipWaitingPeriod({ network }) {
	await fastForward(await readSetting({ network, setting: 'waitingPeriodSecs' }));
}

async function skipStakeTime({ network }) {
	await fastForward(await readSetting({ network, setting: 'minimumStakeTime' }));
}

module.exports = {
	skipWaitingPeriod,
	skipStakeTime,
};
