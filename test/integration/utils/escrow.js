const ethers = require('ethers');

async function appendEscrow({ ctx, user, escrowEntryAmount }) {
	const DURATION = 60 * 60 * 1000; // 1h

	const RewardEscrowV2 = ctx.contracts.RewardEscrowV2.connect(user);
	const currentId = await RewardEscrowV2.nextEntryId();
	const tx = await RewardEscrowV2.createEscrowEntry(user.address, escrowEntryAmount, DURATION);
	await tx.wait();
	return currentId;
}

async function appendEscrows({
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

	let totalEscrowed = ethers.constants.Zero;
	let extraEscrowAmount = ethers.constants.Zero;

	for (let i = 0; i < escrowBatches; i++) {
		batchEscrowAmounts[i] = ethers.constants.Zero;
		const userEntries = [];
		for (let j = 0; j < escrowNum; j++) {
			userEntries[j] = await appendEscrow({ ctx, user, escrowEntryAmount });
			batchEscrowAmounts[i] = batchEscrowAmounts[i].add(escrowEntryAmount);
		}
		userEntryBatch.push(userEntries);
	}

	totalEscrowed = batchEscrowAmounts.reduce((a, b) => a.add(b));

	// this loop creates entries [1-numExtraEntries], e.g. 1,2,3 if numExtraEntries = 3
	for (let i = 0; i < numExtraEntries; i++) {
		extraEntries.push(await appendEscrow({ ctx, user, escrowEntryAmount }));
		extraEscrowAmount = extraEscrowAmount.add(escrowEntryAmount);
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

async function retrieveEscrowParameters({ ctx }) {
	const RewardEscrowV2 = ctx.contracts.RewardEscrowV2;
	const user = ctx.users.owner;

	let numberOfEntries;
	if (!ctx.l1) {
		numberOfEntries = await RewardEscrowV2.nextEntryId();
	}
	const escrowedBalance = await RewardEscrowV2.totalEscrowedBalance();
	const userNumVestingEntries = await RewardEscrowV2.numVestingEntries(user.address);
	const userEscrowedBalance = await RewardEscrowV2.totalEscrowedAccountBalance(user.address);
	const userVestedAccountBalance = await RewardEscrowV2.totalVestedAccountBalance(user.address);

	return {
		numberOfEntries,
		escrowedBalance,
		userNumVestingEntries,
		userEscrowedBalance,
		userVestedAccountBalance,
	};
}

module.exports = {
	appendEscrow,
	appendEscrows,
	retrieveEscrowParameters,
};
