const { fastForward } = require('../../utils')();
const { readSetting } = require('./systemSettings');

async function skipWaitingPeriod({ network, deploymentPath }) {
	await fastForward(await readSetting({ network, deploymentPath, setting: 'waitingPeriodSecs' }));
}

async function skipStakeTime({ network, deploymentPath }) {
	await fastForward(await readSetting({ network, deploymentPath, setting: 'minimumStakeTime' }));
}

module.exports = {
	skipWaitingPeriod,
	skipStakeTime,
};
