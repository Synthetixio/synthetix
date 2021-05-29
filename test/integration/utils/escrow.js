const ethers = require('ethers');

async function appendEscrow({
	ctx,
	user,
	escrowBatches,
	numExtraEntries,
	escrowNum,
	escrowEntryAmount,
}) {
	const batchEscrowAmounts = [];
	const userEntryBatch = [];
	const extraEntries = [];
	const RewardEscrowV2 = ctx.contracts.RewardEscrowV2.connect(user);

	const DURATION = 60 * 60 * 1000; // 1h

	let currentId;
	let totalEscrowed = ethers.constants.Zero;
	let extraEscrowAmount = ethers.constants.Zero;

	for (let i = 0; i < escrowBatches; i++) {
		batchEscrowAmounts[i] = ethers.constants.Zero;
		const userEntries = [];
		for (let j = 0; j < escrowNum; j++) {
			currentId = await RewardEscrowV2.nextEntryId();
			const tx = await RewardEscrowV2.createEscrowEntry(user.address, escrowEntryAmount, DURATION);
			await tx.wait();
			userEntries[j] = currentId;
			batchEscrowAmounts[i] = batchEscrowAmounts[i].add(escrowEntryAmount);
		}
		userEntryBatch.push(userEntries);
	}

	totalEscrowed = batchEscrowAmounts.reduce((a, b) => a.add(b));

	// this loop creates entries [1-numExtraEntries], e.g. 1,2,3 if numExtraEntries = 3
	for (let i = 0; i < numExtraEntries; i++) {
		currentId = await RewardEscrowV2.nextEntryId();
		const tx = await RewardEscrowV2.createEscrowEntry(user.address, escrowEntryAmount, DURATION);
		await tx.wait();
		extraEscrowAmount = extraEscrowAmount.add(escrowEntryAmount);
		extraEntries.push(currentId);
	}
	totalEscrowed = totalEscrowed.add(extraEscrowAmount);

	return {
		batchEscrowAmounts,
		userEntryBatch,
		totalEscrowed,
		extraEntries,
		extraEscrowAmount,
	};
}

module.exports = {
	appendEscrow,
};
