const ethers = require('ethers');
const { resumeIssuance } = require('./status');
const { setSystemSetting } = require('./settings');

async function ensureIssuance({ ctx }) {
	if (ctx.fork) {
		// Ensure issuance is not suspended for any reason
		await resumeIssuance({ ctx });
		// Note: if issuance has been suspended for some time, the circuit breaker could kick in for issuance,
		// so up the ratio here
		await setSystemSetting({
			ctx,
			settingName: 'priceDeviationThresholdFactor',
			newValue: ethers.utils.parseEther('10'),
		});
	}
}

module.exports = {
	ensureIssuance,
};
