const { assert } = require('../../contracts/common');
const { bootstrapDual } = require('../utils/bootstrap');
const { finalizationOnL2 } = require('../utils/optimism');

describe('closeCurrentFeePeriod() integration tests (L1, L2)', () => {
	const ctx = this;
	bootstrapDual({ ctx });

	let owner;
	let FeePool;

	let prevFeePeriod;

	let closeReceipt;

	describe('when the owner deposits SNX', () => {
		before('target contracts and users', () => {
			({ FeePool } = ctx.l1.contracts);

			owner = ctx.l1.users.owner;
		});

		before('record current fee period', async () => {
			prevFeePeriod = await FeePool.recentFeePeriods(0);
		});

		before('close fee pool on L1', async () => {
			FeePool = FeePool.connect(owner);

			const tx = await FeePool.closeCurrentFeePeriod();
			closeReceipt = await tx.wait();
		});

		it('closes L1 fee period', async () => {
			const newFeePeriod = await FeePool.recentFeePeriods(0);

			assert.bnNotEqual(newFeePeriod.feePeriodId, prevFeePeriod.feePeriodId);
		});

		describe('when the message gets picked up in L2', () => {
			let FeePool;
			before('target contracts and users', () => {
				({ FeePool } = ctx.l2.contracts);

				owner = ctx.l2.users.owner;
			});

			before('record current fee period', async () => {
				prevFeePeriod = await FeePool.recentFeePeriods(0);
			});

			before('wait for close finalization', async () => {
				await finalizationOnL2({ ctx, transactionHash: closeReceipt.transactionHash });
			});

			it('increases the owner balance', async () => {
				const newFeePeriod = await FeePool.recentFeePeriods(0);
				assert.bnNotEqual(newFeePeriod.feePeriodId, prevFeePeriod.feePeriodId);
			});

			it('has correct params', async () => {});
		});
	});
});
