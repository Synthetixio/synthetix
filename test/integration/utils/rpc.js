async function sendDummyTx({ ctx }) {
	const tx = await ctx.owner.sendTransaction({
		to: '0x0000000000000000000000000000000000000001',
		value: 0,
	});

	await tx.wait();
}

async function wait({ seconds }) {
	return new Promise(resolve => {
		setTimeout(() => {
			resolve();
		}, seconds * 1000);
	});
}

module.exports = {
	sendDummyTx,
	wait,
};
