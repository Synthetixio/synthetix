const { assert } = require('../../contracts/common');
const { bootstrapDual } = require('../utils/bootstrap');
const { finalizationOnL2 } = require('../utils/optimism');

const { skipFeePeriod } = require('../utils/skip');

describe('closeCurrentFeePeriod() integration tests (L1, L2)', () => {
	const ctx = this;
	bootstrapDual({ ctx });

	let owner;
	let FeePool;

	let prevFeePeriod;

	let closeReceipt;

	describe('when fee period is closed', () => {
		before('target contracts and users', () => {
			({ FeePool } = ctx.l1.contracts);

			owner = ctx.l1.users.owner;
		});

		before('record current fee period', async () => {
			prevFeePeriod = await FeePool.recentFeePeriods(0);
		});

		before('skip fee period', async () => {
			await skipFeePeriod({ ctx: ctx.l1 });
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

			it('has new fee period', async () => {
				const newFeePeriod = await FeePool.recentFeePeriods(0);
				assert.bnNotEqual(newFeePeriod.feePeriodId, prevFeePeriod.feePeriodId);
			});
		});
	});
});
