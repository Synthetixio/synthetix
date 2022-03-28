const ethers = require('ethers');
const { resumeIssuance } = require('./status');
const { getMockAggregatorContract } = require('../../utils/index')();
const { toBytes32 } = require('../../..');

async function ensureIssuance({ ctx }) {
	if (ctx.fork) {
		// Ensure issuance is not suspended for any reason
		await resumeIssuance({ ctx });

		// Note: if issuance has been suspended for some time, the circuit breaker could kick in for issuance,
		// so refresh the lastDebtRatio by reading what's on mainnet

		const { AddressResolver } = ctx.contracts;

		const AggregatorDebtRatio = new ethers.Contract(
			await AddressResolver.getAddress(toBytes32('ext:AggregatorDebtRatio')),
			getMockAggregatorContract().abi,
			ctx.provider
		);

		const currentRatio = await AggregatorDebtRatio.latestAnswer();

		let { Issuer } = ctx.contracts;

		Issuer = Issuer.connect(ctx.users.owner);

		// TODO - once Issuer changes in an upcoming SIP, the below should change to updateLastDebtRatio()
		const tx = await Issuer.setLastDebtRatio(currentRatio);

		await tx.wait();
	}
}

module.exports = {
	ensureIssuance,
};
