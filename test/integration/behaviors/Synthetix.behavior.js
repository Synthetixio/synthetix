const { assert } = require('../../contracts/common');
const { toBytes32 } = require('../../../index');

function itBehavesLikeSynthetix({ ctx }) {
	it('reflects the correct owner', async () => {
		assert.equal(await ctx.contracts.Synthetix.owner(), ctx.owner.address);
	});

	it('has the expected resolver set', async () => {
		assert.equal(
			await ctx.contracts.Synthetix.resolver(),
			ctx.contracts.ReadProxyAddressResolver.address
		);
	});

	it('does not report any rate to be stale or invalid', async () => {
		assert.isFalse(await ctx.contracts.Synthetix.anySynthOrSNXRateIsInvalid());
	});

	it('reports matching totalIssuedSynths and debtLedger', async () => {
		const totalIssuedSynths = await ctx.contracts.Synthetix.totalIssuedSynths(toBytes32('sUSD'));
		const debtLedgerLength = await ctx.contracts.SynthetixState.debtLedgerLength();

		assert.isFalse(debtLedgerLength > 0 && totalIssuedSynths === 0);
	});
}

module.exports = {
	itBehavesLikeSynthetix,
};
